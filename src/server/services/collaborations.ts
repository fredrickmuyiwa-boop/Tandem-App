import type { Database, Review, StoredFile, Submission } from '../../domain/types';
import { getDb, mutate } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import { latency } from '../config';
import { requireCreator, requireOrg, requireUser, effectiveRole, roleCan, type Ctx } from '../access';
import { cleanText, safeUrl } from '../../lib/sanitize';
import { nowIso, uid } from '../../lib/utils';
import { INLINE_IMAGE_LIMIT } from '../../domain/constants';
import { logActivity, toCreatorView } from './campaigns';
import { creatorUser, notify, orgRecipients } from '../notify';
import { toView, validateUpload } from './creators';

type FileView = Pick<StoredFile, 'id' | 'name' | 'type' | 'size'> & { previewUrl?: string };
const fileView = (f: StoredFile): FileView => ({ id: f.id, name: f.name, type: f.type, size: f.size, previewUrl: f.dataUrl });

function bundle(d: Database, collabId: string) {
  const collab = d.collaborations.find((k) => k.id === collabId)!;
  const deliverables = d.deliverables.filter((x) => x.collaborationId === collabId);
  const submissions = d.submissions
    .filter((s) => s.collaborationId === collabId)
    .sort((a, b) => b.version - a.version)
    .map((s) => ({ ...s, files: s.fileIds.map((id) => d.files.find((f) => f.id === id)).filter((f): f is StoredFile => !!f).map(fileView) }));
  const payments = d.payments.filter((p) => p.collaborationId === collabId);
  const messages = d.messages.filter((m) => m.campaignId === collab.campaignId && m.creatorId === collab.creatorId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const activity = d.activity.filter((a) => a.collaborationId === collabId || (a.campaignId === collab.campaignId && a.creatorId === collab.creatorId)).slice(0, 50);
  const campaign = d.campaigns.find((c) => c.id === collab.campaignId)!;
  const org = d.organizations.find((o) => o.id === collab.orgId)!;
  return { collab, deliverables, submissions, payments, messages, activity, campaign, orgName: org.name };
}

export async function orgCollaboration(ctx: Ctx, orgId: string, collabId: string) {
  await latency();
  const { role } = requireOrg(ctx, orgId, 'campaign.view');
  const d = getDb();
  const k = d.collaborations.find((x) => x.id === collabId && x.orgId === orgId);
  if (!k) throw notFound('Collaboration');
  const b = bundle(d, collabId);
  const creator = d.creators.find((c) => c.id === k.creatorId)!;
  // Client reviewers see deliverables and approvals, not money or negotiation.
  const restricted = role === 'client_reviewer';
  return { ...b, payments: restricted ? [] : b.payments, messages: restricted ? [] : b.messages, creator: toView(creator, true), role };
}

export async function creatorCollaboration(ctx: Ctx, collabId: string) {
  await latency();
  const { creator } = requireCreator(ctx);
  const d = getDb();
  const k = d.collaborations.find((x) => x.id === collabId && x.creatorId === creator.id);
  if (!k) throw notFound('Collaboration');
  // Creators never receive the brand's full campaign record (e.g. total budget).
  const { campaign, ...rest } = bundle(d, collabId);
  return { ...rest, campaignView: toCreatorView(campaign), creatorId: creator.id };
}

export async function listOrgCollaborations(ctx: Ctx, orgId: string) {
  await latency();
  requireOrg(ctx, orgId, 'campaign.view');
  const d = getDb();
  return d.collaborations.filter((k) => k.orgId === orgId).map((k) => {
    const dels = d.deliverables.filter((x) => x.collaborationId === k.id);
    const c = d.creators.find((x) => x.id === k.creatorId);
    return { collab: k, campaign: d.campaigns.find((x) => x.id === k.campaignId)!, creator: c ? toView(c, true) : null, total: dels.length, approved: dels.filter((x) => x.status === 'approved').length, toReview: dels.filter((x) => x.status === 'in_review' || x.status === 'awaiting_client').length, nextDue: dels.filter((x) => x.status !== 'approved').map((x) => x.dueDate).sort()[0] };
  }).sort((a, b) => b.toReview - a.toReview || (a.nextDue ?? '9').localeCompare(b.nextDue ?? '9'));
}

export async function listCreatorCollaborations(ctx: Ctx) {
  await latency();
  const { creator } = requireCreator(ctx);
  const d = getDb();
  return d.collaborations.filter((k) => k.creatorId === creator.id).map((k) => {
    const dels = d.deliverables.filter((x) => x.collaborationId === k.id);
    const c = d.campaigns.find((x) => x.id === k.campaignId)!;
    return { collab: k, campaign: toCreatorView(c), total: dels.length, approved: dels.filter((x) => x.status === 'approved').length, revisions: dels.filter((x) => x.status === 'revision_requested').length, nextDue: dels.filter((x) => x.status !== 'approved').map((x) => x.dueDate).sort()[0] };
  });
}

/** Approval queue across all collaborations in an org, for the stage this user can act on. */
export async function approvalQueue(ctx: Ctx, orgId: string) {
  await latency();
  const { role } = requireOrg(ctx, orgId, 'campaign.view');
  const d = getDb();
  const wanted = roleCan(role, 'content.review.internal') ? ['in_review', 'awaiting_client'] : roleCan(role, 'content.review.client') ? ['awaiting_client'] : [];
  return d.submissions
    .filter((s) => s.orgId === orgId && wanted.includes(s.status))
    .map((s) => {
      const del = d.deliverables.find((x) => x.id === s.deliverableId)!;
      const k = d.collaborations.find((x) => x.id === s.collaborationId)!;
      const c = d.creators.find((x) => x.id === s.creatorId);
      return { submission: s, deliverable: del, campaign: d.campaigns.find((x) => x.id === k.campaignId)!, creatorName: c?.displayName ?? 'Creator', canAct: s.status === 'in_review' ? roleCan(role, 'content.review.internal') : roleCan(role, 'content.review.client') };
    })
    .sort((a, b) => a.submission.submittedAt.localeCompare(b.submission.submittedAt));
}

export interface UploadInput { name: string; type: string; size: number; dataUrl?: string }

export async function submitContent(ctx: Ctx, deliverableId: string, input: { caption: string; links: string[]; note: string; files: UploadInput[] }) {
  await latency();
  const { user, creator } = requireCreator(ctx);
  const d = getDb();
  const del = d.deliverables.find((x) => x.id === deliverableId && x.creatorId === creator.id);
  if (!del) throw notFound('Deliverable');
  const collab = d.collaborations.find((k) => k.id === del.collaborationId)!;
  if (collab.status !== 'active') throw new AppError('conflict', 'This collaboration isn’t active.');
  if (!['not_started', 'revision_requested'].includes(del.status)) throw new AppError('conflict', del.status === 'approved' ? 'This deliverable is already approved.' : 'A submission is already under review.');
  const links = input.links.map((l) => l.trim()).filter(Boolean);
  const safe = links.map(safeUrl);
  if (safe.some((l) => !l)) throw new AppError('validation', 'Links must start with https:// and be valid web addresses.', { links: 'Check your links.' });
  if (!input.files.length && !safe.length && cleanText(input.caption).length < 5) throw new AppError('validation', 'Add a file, a link or your caption before submitting.');
  if (input.files.length > 6) throw new AppError('validation', 'Attach up to 6 files per submission.');
  input.files.forEach(validateUpload);
  const campaign = d.campaigns.find((c) => c.id === collab.campaignId)!;
  return mutate((db) => {
    const fileIds = input.files.map((f) => {
      const rec: StoredFile = { id: uid('file'), ownerUserId: user.id, orgId: collab.orgId, creatorId: creator.id, name: f.name.slice(0, 120), type: f.type, size: f.size, dataUrl: f.type.startsWith('image/') && f.size <= INLINE_IMAGE_LIMIT && f.dataUrl?.startsWith('data:image/') ? f.dataUrl : undefined, visibility: 'private', createdAt: nowIso() };
      db.files.push(rec);
      return rec.id;
    });
    const version = db.submissions.filter((s) => s.deliverableId === deliverableId).length + 1;
    const sub: Submission = { id: uid('sub'), deliverableId, collaborationId: collab.id, orgId: collab.orgId, creatorId: creator.id, version, caption: cleanText(input.caption, 2200), links: safe as string[], fileIds, note: cleanText(input.note, 1000), status: 'in_review', submittedAt: nowIso(), reviews: [] };
    db.submissions.push(sub);
    del.status = 'in_review';
    logActivity(db, { orgId: collab.orgId, campaignId: collab.campaignId, collaborationId: collab.id, creatorId: creator.id, actorId: user.id, actorName: creator.displayName, action: `submitted “${del.title}” (version ${version})` });
    notify(db, orgRecipients(db, collab.orgId, 'content.review.internal'), 'submission', `${creator.displayName} submitted content`, `“${del.title}” for ${campaign.name} — version ${version}.`, `/app/collaborations/${collab.id}`);
    return sub;
  });
}

export async function reviewSubmission(ctx: Ctx, orgId: string, submissionId: string, decision: Review['decision'], commentRaw: string) {
  await latency();
  const user = requireUser(ctx);
  const d = getDb();
  const sub = d.submissions.find((s) => s.id === submissionId && s.orgId === orgId);
  if (!sub) {
    requireOrg(ctx, orgId, 'campaign.view'); // reveals nothing but logs cross-org attempts
    throw notFound('Submission');
  }
  const stage: Review['stage'] = sub.status === 'awaiting_client' ? 'client' : 'internal';
  const { org } = requireOrg(ctx, orgId, stage === 'client' ? 'content.review.client' : 'content.review.internal');
  if (!['in_review', 'awaiting_client'].includes(sub.status)) throw new AppError('conflict', 'This submission has already been reviewed.');
  const comment = cleanText(commentRaw, 2000);
  if ((decision === 'revision_requested' || decision === 'rejected') && comment.length < 10) throw new AppError('validation', 'Explain what needs to change (at least 10 characters).', { comment: 'Add feedback for the creator.' });
  const del = d.deliverables.find((x) => x.id === sub.deliverableId)!;
  const collab = d.collaborations.find((k) => k.id === sub.collaborationId)!;
  const campaign = d.campaigns.find((c) => c.id === collab.campaignId)!;
  if (decision === 'revision_requested' && del.revisionCount >= collab.terms.revisionLimit) throw new AppError('conflict', `The agreed revision limit (${collab.terms.revisionLimit}) has been reached. Approve, reject, or agree extra revisions with the creator first.`);
  const creatorUserId = creatorUser(d, sub.creatorId);
  return mutate((db) => {
    const review: Review = { id: uid('rev'), reviewerId: user.id, reviewerName: `${user.name}${stage === 'client' ? ` · ${org.name}` : ''}`, stage, decision, comment, at: nowIso() };
    sub.reviews.push(review);
    if (decision === 'comment') return sub;
    const link = `/creator/collaborations/${collab.id}`;
    if (decision === 'approved') {
      if (stage === 'internal' && campaign.approval.client) {
        sub.status = 'awaiting_client';
        del.status = 'awaiting_client';
        notify(db, db.memberships.filter((m) => m.orgId === orgId && m.role === 'client_reviewer').map((m) => m.userId), 'review', 'Content is ready for your approval', `“${del.title}” by the creator for ${campaign.name}.`, `/app/approvals`);
        logActivity(db, { orgId, campaignId: campaign.id, collaborationId: collab.id, creatorId: sub.creatorId, actorId: user.id, actorName: user.name, action: `approved “${del.title}” internally and sent it for client approval` });
      } else {
        sub.status = 'approved';
        del.status = 'approved';
        notify(db, [creatorUserId], 'review', `Approved: “${del.title}”`, comment || `${campaign.name}`, link);
        logActivity(db, { orgId, campaignId: campaign.id, collaborationId: collab.id, creatorId: sub.creatorId, actorId: user.id, actorName: user.name, action: `gave final approval for “${del.title}” (v${sub.version})` });
        const all = db.deliverables.filter((x) => x.collaborationId === collab.id);
        if (all.every((x) => x.status === 'approved')) {
          db.payments.filter((p) => p.collaborationId === collab.id && p.kind !== 'bonus' && p.status === 'scheduled').forEach((p) => { p.status = 'pending'; });
          notify(db, orgRecipients(db, orgId, 'payments.edit'), 'payment', `All deliverables approved for ${db.creators.find((c) => c.id === collab.creatorId)?.displayName}`, 'Payments are now marked pending. Record them once paid.', `/app/collaborations/${collab.id}`);
        }
      }
    } else if (decision === 'revision_requested') {
      sub.status = 'revision_requested';
      del.status = 'revision_requested';
      del.revisionCount += 1;
      notify(db, [creatorUserId], 'revision', `Revision requested: “${del.title}”`, comment.slice(0, 160), link);
      logActivity(db, { orgId, campaignId: campaign.id, collaborationId: collab.id, creatorId: sub.creatorId, actorId: user.id, actorName: user.name, action: `requested revision ${del.revisionCount} of ${collab.terms.revisionLimit} on “${del.title}”` });
    } else {
      sub.status = 'rejected';
      del.status = 'rejected';
      notify(db, [creatorUserId], 'review', `Not approved: “${del.title}”`, comment.slice(0, 160), link);
      logActivity(db, { orgId, campaignId: campaign.id, collaborationId: collab.id, creatorId: sub.creatorId, actorId: user.id, actorName: user.name, action: `rejected “${del.title}”` });
    }
    audit({ actorId: user.id, actorEmail: user.email, orgId, action: `content.${decision}`, target: sub.id, severity: 'info' });
    return sub;
  });
}

/** Re-open a rejected deliverable so the creator can try again (by agreement). */
export async function reopenDeliverable(ctx: Ctx, orgId: string, deliverableId: string) {
  const { user } = requireOrg(ctx, orgId, 'content.review.internal');
  const d = getDb();
  const del = d.deliverables.find((x) => x.id === deliverableId && x.orgId === orgId);
  if (!del) throw notFound('Deliverable');
  if (del.status !== 'rejected') throw new AppError('conflict', 'Only rejected deliverables can be reopened.');
  mutate((db) => {
    del.status = 'revision_requested';
    logActivity(db, { orgId, collaborationId: del.collaborationId, creatorId: del.creatorId, actorId: user.id, actorName: user.name, action: `reopened “${del.title}” for a new submission` });
    notify(db, [creatorUser(db, del.creatorId)], 'revision', `“${del.title}” was reopened`, 'You can submit a new version.', `/creator/collaborations/${del.collaborationId}`);
  });
}

export async function completeCollaboration(ctx: Ctx, orgId: string, collabId: string) {
  await latency();
  const { user } = requireOrg(ctx, orgId, 'campaign.edit');
  const d = getDb();
  const k = d.collaborations.find((x) => x.id === collabId && x.orgId === orgId);
  if (!k) throw notFound('Collaboration');
  const open = d.deliverables.filter((x) => x.collaborationId === collabId && x.status !== 'approved');
  if (open.length) throw new AppError('conflict', `${open.length} deliverable${open.length > 1 ? 's are' : ' is'} not approved yet.`);
  mutate((db) => {
    k.status = 'completed';
    const crm = db.crm.find((r) => r.orgId === orgId && r.creatorId === k.creatorId);
    if (crm) crm.status = 'past';
    logActivity(db, { orgId, campaignId: k.campaignId, collaborationId: k.id, creatorId: k.creatorId, actorId: user.id, actorName: user.name, action: 'marked the collaboration complete' });
    notify(db, [creatorUser(db, k.creatorId)], 'collaboration', 'Collaboration completed', 'Thank you! Payment status is tracked on your Earnings page.', `/creator/collaborations/${k.id}`);
  });
}

export function fileForViewer(ctx: Ctx, fileId: string) {
  const user = requireUser(ctx);
  const d = getDb();
  const f = d.files.find((x) => x.id === fileId);
  if (!f) throw notFound('File');
  const creatorOwns = f.creatorId && d.creators.find((c) => c.id === f.creatorId)?.userId === user.id;
  const inOrg = f.orgId && effectiveRole(user.id, f.orgId, d);
  if (f.visibility !== 'public' && !creatorOwns && !inOrg && user.platformRole !== 'admin') throw forbidden('You don’t have access to this file.');
  return fileView(f);
}
