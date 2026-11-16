import type { Campaign, Collaboration, Database, Deliverable, Offer, PaymentRecord, Terms, User } from '../../domain/types';
import { getDb, mutate } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import { latency } from '../config';
import { requireCreator, requireOrg, type Ctx } from '../access';
import { cleanLine, cleanText } from '../../lib/sanitize';
import { DAY, isoDay, money, nowIso, uid } from '../../lib/utils';
import { assertFeature } from './orgs';
import { logActivity, toCreatorView } from './campaigns';
import { creatorUser, notify, orgRecipients } from '../notify';
import { toView } from './creators';

const RECRUITABLE: Campaign['status'][] = ['published', 'recruiting', 'active'];

function validateTerms(t: Terms, campaign: Campaign): Terms {
  if (!(t.fee >= 0)) throw new AppError('validation', 'Fee must be zero or more.', { fee: 'Enter a fee.' });
  if (t.fee === 0 && campaign.compensationModel !== 'gifting' && !t.gifting) throw new AppError('validation', 'Enter a fee, or describe the gifted product for a gifting deal.', { fee: 'Enter a fee.' });
  if (!t.deliverables?.length) throw new AppError('validation', 'Include at least one deliverable.');
  if (Number.isNaN(Date.parse(t.deadline))) throw new AppError('validation', 'Choose a deadline.', { deadline: 'Choose a deadline.' });
  if (new Date(t.deadline).getTime() < Date.now() - DAY) throw new AppError('validation', 'The deadline must be in the future.', { deadline: 'Pick a future date.' });
  if (!(t.revisionLimit >= 0 && t.revisionLimit <= 10)) throw new AppError('validation', 'Revision limit must be between 0 and 10.');
  if (t.bonus && !(t.bonus.amount > 0 && cleanLine(t.bonus.condition))) throw new AppError('validation', 'A bonus needs an amount and a clear condition.');
  if (t.milestones?.length && Math.round(t.milestones.reduce((s, m) => s + m.pct, 0)) !== 100) throw new AppError('validation', 'Milestone percentages must add up to 100%.');
  return {
    ...t,
    currency: campaign.currency,
    usageRights: cleanText(t.usageRights, 500) || 'Organic use on brand channels for 6 months',
    exclusivity: cleanText(t.exclusivity, 300) || 'None',
    gifting: cleanText(t.gifting, 200) || undefined,
    bonus: t.bonus ? { amount: Math.round(t.bonus.amount), condition: cleanLine(t.bonus.condition, 200) } : null,
    fee: Math.round(t.fee),
    deliverables: t.deliverables.map((x) => ({ ...x, id: x.id || uid('dlv') })),
  };
}

/** Money already promised in a campaign (accepted terms + open org offers excluding this thread). */
function committed(d: Database, campaignId: string, excludeCreatorId?: string) {
  const collabs = d.collaborations.filter((k) => k.campaignId === campaignId && k.status !== 'cancelled').reduce((s, k) => s + k.terms.fee + (k.terms.bonus?.amount ?? 0), 0);
  const open = d.offers.filter((o) => o.campaignId === campaignId && o.status === 'open' && o.from === 'org' && o.creatorId !== excludeCreatorId).reduce((s, o) => s + o.terms.fee + (o.terms.bonus?.amount ?? 0), 0);
  return collabs + open;
}

function assertBudget(d: Database, campaign: Campaign, creatorId: string, t: Terms) {
  const total = committed(d, campaign.id, creatorId) + t.fee + (t.bonus?.amount ?? 0);
  if (total > campaign.budget) {
    const left = campaign.budget - committed(d, campaign.id, creatorId);
    throw new AppError('conflict', `This offer would exceed the campaign budget. ${money(Math.max(left, 0), campaign.currency)} is uncommitted. Lower the fee or raise the budget first.`);
  }
}

function getCampaignInOrg(d: Database, orgId: string, campaignId: string) {
  const c = d.campaigns.find((x) => x.id === campaignId && x.orgId === orgId);
  if (!c) throw notFound('Campaign');
  return c;
}

function creatorOrThrow(d: Database, creatorId: string) {
  const c = d.creators.find((x) => x.id === creatorId);
  if (!c) throw notFound('Creator');
  return c;
}

function addSystemMessage(d: Database, o: { campaignId: string; orgId: string; creatorId: string }, body: string) {
  d.messages.push({ id: uid('msg'), ...o, from: 'system', senderName: 'Tandem', body, kind: 'system', createdAt: nowIso() });
}

// ---------------- Invitations ----------------
export async function sendInvitation(ctx: Ctx, orgId: string, campaignId: string, creatorId: string, input: { message: string; terms: Terms }) {
  await latency();
  const { user, org } = requireOrg(ctx, orgId, 'outreach.send');
  const d = getDb();
  const parent = org.parentOrgId ? d.organizations.find((o) => o.id === org.parentOrgId) : undefined;
  assertFeature(parent ?? org, 'outreach');
  const campaign = getCampaignInOrg(d, orgId, campaignId);
  if (!RECRUITABLE.includes(campaign.status)) throw new AppError('conflict', 'Publish the campaign before inviting creators.');
  const creator = creatorOrThrow(d, creatorId);
  const message = cleanText(input.message, 3000);
  if (message.length < 20) throw new AppError('validation', 'Write a short personal message (at least 20 characters).', { message: 'Add a personal message.' });
  const crm = d.crm.find((r) => r.orgId === orgId && r.creatorId === creatorId);
  if (crm?.status === 'do_not_contact') throw new AppError('conflict', 'This creator is marked “Do not contact” in your CRM.');
  if (d.invitations.some((i) => i.campaignId === campaignId && i.creatorId === creatorId && ['pending', 'accepted', 'countered'].includes(i.status))) throw new AppError('conflict', 'This creator already has an invitation to this campaign.');
  if (d.collaborations.some((k) => k.campaignId === campaignId && k.creatorId === creatorId && k.status !== 'cancelled')) throw new AppError('conflict', 'This creator is already collaborating on this campaign.');
  const terms = validateTerms(input.terms, campaign);
  assertBudget(d, campaign, creatorId, terms);
  return mutate((db) => {
    const inv = { id: uid('inv'), campaignId, orgId, creatorId, message, terms, status: 'pending' as const, createdBy: user.id, createdAt: nowIso() };
    db.invitations.push(inv);
    db.offers.push({ id: uid('ofr'), campaignId, orgId, creatorId, from: 'org', terms, message, status: 'open', createdBy: user.id, createdAt: nowIso() });
    db.messages.push({ id: uid('msg'), campaignId, orgId, creatorId, from: 'org', senderId: user.id, senderName: `${user.name} · ${org.name}`, body: message, kind: 'message', createdAt: nowIso() });
    upsertCrm(db, orgId, creatorId, 'contacted');
    logActivity(db, { orgId, campaignId, creatorId, actorId: user.id, actorName: user.name, action: `invited ${creator.displayName} with an offer of ${money(terms.fee, terms.currency)}` });
    notify(db, [creator.userId], 'invitation', `${org.name} invited you to “${campaign.name}”`, `Offer: ${money(terms.fee, terms.currency)}${terms.bonus ? ` + ${money(terms.bonus.amount, terms.currency)} bonus` : ''}.`, `/creator/deals/${campaignId}`);
    audit({ actorId: user.id, actorEmail: user.email, orgId, action: 'outreach.invitation_sent', target: creator.handle, severity: 'info' });
    return inv;
  });
}

export async function declineInvitation(ctx: Ctx, invitationId: string, reason?: string) {
  await latency();
  const { user, creator } = requireCreator(ctx);
  const d = getDb();
  const inv = d.invitations.find((i) => i.id === invitationId && i.creatorId === creator.id);
  if (!inv) throw notFound('Invitation');
  if (inv.status !== 'pending' && inv.status !== 'countered') throw new AppError('conflict', 'This invitation is no longer open.');
  mutate((db) => {
    inv.status = 'declined';
    inv.respondedAt = nowIso();
    db.offers.filter((o) => o.campaignId === inv.campaignId && o.creatorId === creator.id && o.status === 'open').forEach((o) => { o.status = 'rejected'; o.respondedAt = nowIso(); });
    addSystemMessage(db, inv, `${creator.displayName} declined the invitation${reason ? `: “${cleanLine(reason, 200)}”` : '.'}`);
    upsertCrm(db, inv.orgId, creator.id, 'prospect');
    logActivity(db, { orgId: inv.orgId, campaignId: inv.campaignId, creatorId: creator.id, actorId: user.id, actorName: creator.displayName, action: 'declined the invitation' });
    notify(db, orgRecipients(db, inv.orgId, 'outreach.send'), 'invitation', `${creator.displayName} declined your invitation`, reason ? cleanLine(reason, 200) : 'No reason given.', `/app/campaigns/${inv.campaignId}?tab=deals`);
  });
}

// ---------------- Applications ----------------
export async function applyToCampaign(ctx: Ctx, campaignId: string, input: { pitch: string; proposedFee: number }) {
  await latency();
  const { user, creator } = requireCreator(ctx);
  const d = getDb();
  const c = d.campaigns.find((x) => x.id === campaignId);
  if (!c || c.visibility !== 'public' || !['published', 'recruiting'].includes(c.status)) throw new AppError('conflict', 'This campaign isn’t accepting applications.');
  const pitch = cleanText(input.pitch, 2000);
  if (pitch.length < 40) throw new AppError('validation', 'Tell the brand why you’re a good fit (at least 40 characters).', { pitch: 'Add more detail.' });
  if (!(input.proposedFee >= 0)) throw new AppError('validation', 'Enter your proposed fee.', { proposedFee: 'Enter your proposed fee.' });
  if (d.applications.some((a) => a.campaignId === campaignId && a.creatorId === creator.id && a.status !== 'withdrawn')) throw new AppError('conflict', 'You’ve already applied to this campaign.');
  const recent = d.applications.filter((a) => a.creatorId === creator.id && Date.now() - new Date(a.createdAt).getTime() < 3_600_000).length;
  if (recent >= 10) throw new AppError('rate_limited', 'You’ve sent a lot of applications in the last hour. Try again later.');
  return mutate((db) => {
    const app = { id: uid('app'), campaignId, orgId: c.orgId, creatorId: creator.id, pitch, proposedFee: Math.round(input.proposedFee), currency: c.currency, status: 'submitted' as const, createdAt: nowIso() };
    db.applications.push(app);
    db.messages.push({ id: uid('msg'), campaignId, orgId: c.orgId, creatorId: creator.id, from: 'creator', senderId: user.id, senderName: creator.displayName, body: pitch, kind: 'message', createdAt: nowIso() });
    logActivity(db, { orgId: c.orgId, campaignId, creatorId: creator.id, actorId: user.id, actorName: creator.displayName, action: `applied, proposing ${money(app.proposedFee, c.currency)}` });
    notify(db, orgRecipients(db, c.orgId, 'outreach.send'), 'application', `New application for “${c.name}”`, `${creator.displayName} (@${creator.handle}) proposed ${money(app.proposedFee, c.currency)}.`, `/app/campaigns/${c.id}?tab=deals`);
    return app;
  });
}

export async function withdrawApplication(ctx: Ctx, applicationId: string) {
  const { creator } = requireCreator(ctx);
  const d = getDb();
  const app = d.applications.find((a) => a.id === applicationId && a.creatorId === creator.id);
  if (!app) throw notFound('Application');
  if (!['submitted', 'shortlisted'].includes(app.status)) throw new AppError('conflict', 'This application can no longer be withdrawn.');
  mutate((db) => { app.status = 'withdrawn'; addSystemMessage(db, app, `${creator.displayName} withdrew the application.`); });
}

export async function reviewApplication(ctx: Ctx, orgId: string, applicationId: string, decision: 'shortlisted' | 'rejected', note?: string) {
  await latency();
  const { user } = requireOrg(ctx, orgId, 'outreach.send');
  const d = getDb();
  const app = d.applications.find((a) => a.id === applicationId && a.orgId === orgId);
  if (!app) throw notFound('Application');
  if (!['submitted', 'shortlisted'].includes(app.status)) throw new AppError('conflict', 'This application has already been decided.');
  const campaign = d.campaigns.find((c) => c.id === app.campaignId)!;
  const creator = creatorOrThrow(d, app.creatorId);
  mutate((db) => {
    app.status = decision;
    app.reviewedAt = nowIso();
    logActivity(db, { orgId, campaignId: app.campaignId, creatorId: app.creatorId, actorId: user.id, actorName: user.name, action: `${decision === 'shortlisted' ? 'shortlisted' : 'declined'} ${creator.displayName}’s application` });
    if (decision === 'rejected') {
      addSystemMessage(db, app, `The brand decided not to move forward${note ? `: “${cleanLine(note, 200)}”` : '.'}`);
      notify(db, [creator.userId], 'application', `Update on “${campaign.name}”`, 'The brand decided not to move forward with your application this time.', `/creator/deals/${campaign.id}`);
    } else {
      upsertCrm(db, orgId, app.creatorId, 'contacted');
      notify(db, [creator.userId], 'application', `You were shortlisted for “${campaign.name}”`, 'The brand may send you an offer soon.', `/creator/deals/${campaign.id}`);
    }
  });
}

// ---------------- Offers ----------------
export async function makeOffer(ctx: Ctx, orgId: string, campaignId: string, creatorId: string, input: { terms: Terms; message: string }) {
  await latency();
  const { user, org } = requireOrg(ctx, orgId, 'outreach.send');
  const d = getDb();
  const parent = org.parentOrgId ? d.organizations.find((o) => o.id === org.parentOrgId) : undefined;
  assertFeature(parent ?? org, 'outreach');
  const campaign = getCampaignInOrg(d, orgId, campaignId);
  if (!RECRUITABLE.includes(campaign.status)) throw new AppError('conflict', 'This campaign isn’t open for new offers.');
  const creator = creatorOrThrow(d, creatorId);
  const hasThread = d.applications.some((a) => a.campaignId === campaignId && a.creatorId === creatorId && a.status !== 'withdrawn' && a.status !== 'rejected') || d.invitations.some((i) => i.campaignId === campaignId && i.creatorId === creatorId && ['pending', 'countered'].includes(i.status));
  if (!hasThread) throw new AppError('conflict', 'Invite this creator or wait for their application before sending an offer.');
  if (d.collaborations.some((k) => k.campaignId === campaignId && k.creatorId === creatorId && k.status !== 'cancelled')) throw new AppError('conflict', 'Terms are already agreed with this creator.');
  const terms = validateTerms(input.terms, campaign);
  assertBudget(d, campaign, creatorId, terms);
  return mutate((db) => {
    db.offers.filter((o) => o.campaignId === campaignId && o.creatorId === creatorId && o.status === 'open').forEach((o) => { o.status = 'superseded'; });
    const offer: Offer = { id: uid('ofr'), campaignId, orgId, creatorId, from: 'org', terms, message: cleanText(input.message, 2000), status: 'open', createdBy: user.id, createdAt: nowIso() };
    db.offers.push(offer);
    db.applications.filter((a) => a.campaignId === campaignId && a.creatorId === creatorId && ['submitted', 'shortlisted'].includes(a.status)).forEach((a) => { a.status = 'offered'; });
    db.invitations.filter((i) => i.campaignId === campaignId && i.creatorId === creatorId && i.status === 'countered').forEach((i) => { i.status = 'pending'; });
    if (offer.message) db.messages.push({ id: uid('msg'), campaignId, orgId, creatorId, from: 'org', senderId: user.id, senderName: `${user.name} · ${org.name}`, body: offer.message, kind: 'message', createdAt: nowIso() });
    upsertCrm(db, orgId, creatorId, 'negotiating');
    logActivity(db, { orgId, campaignId, creatorId, actorId: user.id, actorName: user.name, action: `sent ${creator.displayName} an offer of ${money(terms.fee, terms.currency)}` });
    notify(db, [creator.userId], 'offer', `New offer for “${campaign.name}”`, `${org.name} offered ${money(terms.fee, terms.currency)}${terms.bonus ? ` + ${money(terms.bonus.amount, terms.currency)} bonus` : ''}.`, `/creator/deals/${campaignId}`);
    return offer;
  });
}

export async function creatorRespond(ctx: Ctx, offerId: string, action: 'accept' | 'reject' | 'counter' | 'clarify', input: { terms?: Terms; message?: string } = {}) {
  await latency();
  const { user, creator } = requireCreator(ctx);
  const d = getDb();
  const offer = d.offers.find((o) => o.id === offerId && o.creatorId === creator.id);
  if (!offer) throw notFound('Offer');
  if (offer.status !== 'open' || offer.from !== 'org') throw new AppError('conflict', 'This offer is no longer open.');
  const campaign = d.campaigns.find((c) => c.id === offer.campaignId)!;
  const org = d.organizations.find((o) => o.id === offer.orgId)!;
  const message = cleanText(input.message, 2000);
  const link = `/app/campaigns/${campaign.id}?tab=deals&creator=${creator.id}`;
  if (action === 'clarify' && message.length < 5) throw new AppError('validation', 'Write your question.', { message: 'Write your question.' });
  if (action === 'counter') {
    if (!input.terms) throw new AppError('validation', 'Propose your terms.');
    validateTerms(input.terms, campaign);
  }
  return mutate((db) => {
    const thread = { campaignId: offer.campaignId, orgId: offer.orgId, creatorId: creator.id };
    if (action === 'accept') {
      offer.status = 'accepted';
      offer.respondedAt = nowIso();
      const collab = createCollaboration(db, offer, { id: user.id, name: creator.displayName });
      notify(db, orgRecipients(db, offer.orgId, 'outreach.send'), 'collaboration', `${creator.displayName} accepted your offer`, `“${campaign.name}” — collaboration workspace is ready.`, `/app/collaborations/${collab.id}`);
      return { collaborationId: collab.id };
    }
    if (action === 'reject') {
      offer.status = 'rejected';
      offer.respondedAt = nowIso();
      db.invitations.filter((i) => i.campaignId === offer.campaignId && i.creatorId === creator.id && i.status !== 'accepted').forEach((i) => { i.status = 'declined'; i.respondedAt = nowIso(); });
      addSystemMessage(db, thread, `${creator.displayName} rejected the offer${message ? `: “${message}”` : '.'}`);
      logActivity(db, { ...thread, actorId: user.id, actorName: creator.displayName, action: 'rejected the offer' });
      notify(db, orgRecipients(db, offer.orgId, 'outreach.send'), 'offer', `${creator.displayName} rejected your offer`, message || `For “${campaign.name}”.`, link);
      return {};
    }
    if (action === 'clarify') {
      db.messages.push({ id: uid('msg'), ...thread, from: 'creator', senderId: user.id, senderName: creator.displayName, body: message, kind: 'clarification', createdAt: nowIso() });
      logActivity(db, { ...thread, actorId: user.id, actorName: creator.displayName, action: 'asked for clarification' });
      notify(db, orgRecipients(db, offer.orgId, 'outreach.send'), 'offer', `${creator.displayName} has a question`, message.slice(0, 140), link);
      return {};
    }
    // counter
    offer.status = 'superseded';
    const terms = validateTerms(input.terms!, campaign);
    db.offers.push({ id: uid('ofr'), ...thread, from: 'creator', terms, message, status: 'open', createdBy: user.id, createdAt: nowIso() });
    db.invitations.filter((i) => i.campaignId === offer.campaignId && i.creatorId === creator.id && i.status === 'pending').forEach((i) => { i.status = 'countered'; });
    if (message) db.messages.push({ id: uid('msg'), ...thread, from: 'creator', senderId: user.id, senderName: creator.displayName, body: message, kind: 'message', createdAt: nowIso() });
    logActivity(db, { ...thread, actorId: user.id, actorName: creator.displayName, action: `countered at ${money(terms.fee, terms.currency)}` });
    notify(db, orgRecipients(db, offer.orgId, 'outreach.send'), 'offer', `${creator.displayName} sent a counteroffer`, `${money(terms.fee, terms.currency)} for “${campaign.name}” (${org.name}).`, link);
    return {};
  });
}

export async function orgRespond(ctx: Ctx, orgId: string, offerId: string, action: 'accept' | 'reject', message?: string) {
  await latency();
  const { user } = requireOrg(ctx, orgId, 'outreach.send');
  const d = getDb();
  const offer = d.offers.find((o) => o.id === offerId && o.orgId === orgId);
  if (!offer) throw notFound('Offer');
  if (offer.status !== 'open' || offer.from !== 'creator') throw new AppError('conflict', 'This counteroffer is no longer open.');
  const campaign = d.campaigns.find((c) => c.id === offer.campaignId)!;
  const creator = creatorOrThrow(d, offer.creatorId);
  if (action === 'accept') assertBudget(d, campaign, creator.id, offer.terms);
  return mutate((db) => {
    offer.status = action === 'accept' ? 'accepted' : 'rejected';
    offer.respondedAt = nowIso();
    if (action === 'accept') {
      const collab = createCollaboration(db, offer, { id: user.id, name: user.name });
      notify(db, [creator.userId], 'collaboration', `${campaign.name}: your counteroffer was accepted`, 'Your collaboration workspace is ready.', `/creator/collaborations/${collab.id}`);
      return { collaborationId: collab.id };
    }
    addSystemMessage(db, offer, `The brand declined the counteroffer${message ? `: “${cleanLine(message, 200)}”` : '.'}`);
    logActivity(db, { orgId, campaignId: offer.campaignId, creatorId: offer.creatorId, actorId: user.id, actorName: user.name, action: 'declined the counteroffer' });
    notify(db, [creator.userId], 'offer', `Counteroffer declined for “${campaign.name}”`, message ? cleanLine(message, 200) : 'The brand may send a new offer.', `/creator/deals/${campaign.id}`);
    return {};
  });
}

function upsertCrm(db: Database, orgId: string, creatorId: string, status: 'contacted' | 'negotiating' | 'active' | 'prospect') {
  const existing = db.crm.find((r) => r.orgId === orgId && r.creatorId === creatorId);
  const rank = ['prospect', 'contacted', 'negotiating', 'active', 'past'];
  if (existing) {
    if (existing.status !== 'do_not_contact' && (rank.indexOf(status) > rank.indexOf(existing.status) || status === 'active')) existing.status = status;
    existing.updatedAt = nowIso();
  } else db.crm.push({ id: uid('crm'), orgId, creatorId, status, tags: [], notes: [], reminders: [], updatedAt: nowIso() });
}

/** Accepted terms become the basis of the collaboration. */
export function createCollaboration(db: Database, offer: Offer, actor: { id: string; name: string }): Collaboration {
  const campaign = db.campaigns.find((c) => c.id === offer.campaignId)!;
  const creator = db.creators.find((c) => c.id === offer.creatorId)!;
  const collab: Collaboration = { id: uid('col'), campaignId: offer.campaignId, orgId: offer.orgId, creatorId: offer.creatorId, offerId: offer.id, terms: offer.terms, status: 'active', createdAt: nowIso() };
  db.collaborations.push(collab);
  const deliverables: Deliverable[] = offer.terms.deliverables.flatMap((spec) =>
    Array.from({ length: spec.quantity }, (_, i) => ({
      id: uid('del'), collaborationId: collab.id, orgId: offer.orgId, creatorId: offer.creatorId,
      title: `${spec.quantity > 1 ? `#${i + 1} ` : ''}${spec.notes ? cleanLine(spec.notes, 60) : `${spec.format.replace('_', ' ')} on ${spec.platform}`}`,
      platform: spec.platform, format: spec.format, dueDate: offer.terms.deadline, status: 'not_started' as const, revisionCount: 0,
    })),
  );
  db.deliverables.push(...deliverables);
  db.payments.push(...paymentSchedule(collab, campaign));
  db.invitations.filter((i) => i.campaignId === offer.campaignId && i.creatorId === offer.creatorId && i.status !== 'declined').forEach((i) => { i.status = 'accepted'; i.respondedAt = nowIso(); });
  db.offers.filter((o) => o.campaignId === offer.campaignId && o.creatorId === offer.creatorId && o.status === 'open').forEach((o) => { o.status = 'superseded'; });
  addSystemMessage(db, offer, `Terms agreed: ${money(offer.terms.fee, offer.terms.currency)}${offer.terms.bonus ? ` + ${money(offer.terms.bonus.amount, offer.terms.currency)} bonus` : ''}, ${deliverables.length} deliverable${deliverables.length > 1 ? 's' : ''}, due ${offer.terms.deadline}. This records the agreed commercial terms; it is not a signed legal contract.`);
  upsertCrm(db, offer.orgId, offer.creatorId, 'active');
  logActivity(db, { orgId: offer.orgId, campaignId: offer.campaignId, collaborationId: collab.id, creatorId: offer.creatorId, actorId: actor.id, actorName: actor.name, action: `agreed terms with ${creator.displayName} — collaboration started` });
  return collab;
}

function paymentSchedule(collab: Collaboration, campaign: Campaign): PaymentRecord[] {
  const t = collab.terms;
  const base = { orgId: collab.orgId, campaignId: collab.campaignId, collaborationId: collab.id, creatorId: collab.creatorId, currency: t.currency, status: 'scheduled' as const };
  const due = (offsetFromDeadline: number) => new Date(new Date(t.deadline).getTime() + offsetFromDeadline * DAY).toISOString().slice(0, 10);
  const out: PaymentRecord[] = [];
  if (campaign.compensationModel === 'gifting' || (t.fee === 0 && t.gifting)) {
    out.push({ ...base, id: uid('pay'), label: `Product gifting — ${t.gifting ?? 'gifted product'}`, kind: 'gifting', amount: 0, dueDate: isoDay(7) });
  } else if (t.milestones?.length) {
    t.milestones.forEach((m, i) => out.push({ ...base, id: uid('pay'), label: `${m.label} (${m.pct}%)`, kind: 'milestone', amount: Math.round((t.fee * m.pct) / 100), dueDate: i === t.milestones!.length - 1 ? due(14) : due(0) }));
  } else if (t.fee > 0) {
    out.push({ ...base, id: uid('pay'), label: 'Base fee (net 14 after deadline)', kind: 'base', amount: t.fee, dueDate: due(14) });
  }
  if (t.bonus) out.push({ ...base, id: uid('pay'), label: `Performance bonus — ${t.bonus.condition}`, kind: 'bonus', amount: t.bonus.amount, dueDate: due(30) });
  return out;
}

// ---------------- Messages & threads ----------------
export async function sendMessage(ctx: Ctx, side: { orgId: string } | 'creator', campaignId: string, creatorId: string, body: string) {
  await latency();
  const text = cleanText(body, 3000);
  if (!text) throw new AppError('validation', 'Write a message first.');
  const d = getDb();
  let sender: User;
  let orgId: string;
  let from: 'org' | 'creator';
  let senderName: string;
  if (side === 'creator') {
    const { user, creator } = requireCreator(ctx);
    if (creator.id !== creatorId) throw forbidden();
    const thread = d.offers.find((o) => o.campaignId === campaignId && o.creatorId === creatorId) ?? d.applications.find((a) => a.campaignId === campaignId && a.creatorId === creatorId) ?? d.invitations.find((i) => i.campaignId === campaignId && i.creatorId === creatorId);
    if (!thread) throw notFound('Conversation');
    sender = user; orgId = thread.orgId; from = 'creator'; senderName = creator.displayName;
  } else {
    const r = requireOrg(ctx, side.orgId, 'outreach.send');
    const campaign = getCampaignInOrg(d, side.orgId, campaignId);
    const hasThread = d.messages.some((m) => m.campaignId === campaign.id && m.creatorId === creatorId);
    if (!hasThread) throw new AppError('conflict', 'Start the conversation with an invitation first.');
    sender = r.user; orgId = side.orgId; from = 'org'; senderName = `${r.user.name} · ${r.org.name}`;
  }
  const recent = d.messages.filter((m) => m.senderId === sender.id && Date.now() - new Date(m.createdAt).getTime() < 60_000).length;
  if (recent >= 12) throw new AppError('rate_limited', 'You’re sending messages very quickly. Wait a moment and try again.');
  return mutate((db) => {
    const msg = { id: uid('msg'), campaignId, orgId, creatorId, from, senderId: sender.id, senderName, body: text, kind: 'message' as const, createdAt: nowIso() };
    db.messages.push(msg);
    const campaign = db.campaigns.find((c) => c.id === campaignId)!;
    if (from === 'org') notify(db, [creatorUser(db, creatorId)], 'collaboration', `New message about “${campaign.name}”`, text.slice(0, 140), `/creator/deals/${campaignId}`);
    else notify(db, orgRecipients(db, orgId, 'outreach.send'), 'collaboration', `${senderName} sent a message`, text.slice(0, 140), `/app/campaigns/${campaignId}?tab=deals&creator=${creatorId}`);
    return msg;
  });
}

function threadData(d: Database, campaignId: string, creatorId: string) {
  return {
    offers: d.offers.filter((o) => o.campaignId === campaignId && o.creatorId === creatorId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    messages: d.messages.filter((m) => m.campaignId === campaignId && m.creatorId === creatorId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    invitation: d.invitations.find((i) => i.campaignId === campaignId && i.creatorId === creatorId) ?? null,
    application: d.applications.find((a) => a.campaignId === campaignId && a.creatorId === creatorId) ?? null,
    collaboration: d.collaborations.find((k) => k.campaignId === campaignId && k.creatorId === creatorId && k.status !== 'cancelled') ?? null,
  };
}

export async function orgThread(ctx: Ctx, orgId: string, campaignId: string, creatorId: string) {
  await latency();
  requireOrg(ctx, orgId, 'campaign.view');
  const d = getDb();
  const campaign = getCampaignInOrg(d, orgId, campaignId);
  const creator = creatorOrThrow(d, creatorId);
  return { campaign, creator: toView(creator, true), ...threadData(d, campaignId, creatorId) };
}

export async function creatorThread(ctx: Ctx, campaignId: string) {
  await latency();
  const { creator } = requireCreator(ctx);
  const d = getDb();
  const t = threadData(d, campaignId, creator.id);
  const campaign = d.campaigns.find((c) => c.id === campaignId);
  if (!campaign || (!t.offers.length && !t.application && !t.invitation)) throw notFound('Conversation');
  return { campaign: toCreatorView(campaign), creatorId: creator.id, ...t };
}

/** Every negotiation thread in a campaign, for the org's pipeline view. */
export async function campaignPipeline(ctx: Ctx, orgId: string, campaignId: string) {
  await latency();
  requireOrg(ctx, orgId, 'campaign.view');
  const d = getDb();
  getCampaignInOrg(d, orgId, campaignId);
  const ids = new Set([...d.invitations, ...d.applications, ...d.offers].filter((x) => x.campaignId === campaignId).map((x) => x.creatorId));
  return [...ids].map((creatorId) => {
    const t = threadData(d, campaignId, creatorId);
    const c = d.creators.find((x) => x.id === creatorId);
    const latest = t.offers[t.offers.length - 1];
    const stage = t.collaboration ? 'agreed' : latest?.status === 'open' ? (latest.from === 'creator' ? 'creator_countered' : 'awaiting_creator') : t.application && ['submitted', 'shortlisted'].includes(t.application.status) ? 'application' : t.invitation?.status === 'declined' || latest?.status === 'rejected' || t.application?.status === 'rejected' ? 'closed' : 'open';
    const unanswered = t.messages.length && t.messages[t.messages.length - 1].from === 'creator' && t.messages[t.messages.length - 1].kind === 'clarification';
    return { creator: c ? toView(c, true) : null, stage, latestOffer: latest ?? null, application: t.application, invitation: t.invitation, collaboration: t.collaboration, lastActivity: t.messages[t.messages.length - 1]?.createdAt ?? latest?.createdAt, needsReply: !!unanswered || stage === 'creator_countered' || stage === 'application' };
  }).sort((a, b) => Number(b.needsReply) - Number(a.needsReply) || (b.lastActivity ?? '').localeCompare(a.lastActivity ?? ''));
}

export async function creatorDeals(ctx: Ctx) {
  await latency();
  const { creator } = requireCreator(ctx);
  const d = getDb();
  const ids = new Set([...d.invitations, ...d.applications, ...d.offers].filter((x) => x.creatorId === creator.id).map((x) => x.campaignId));
  return [...ids].map((campaignId) => {
    const t = threadData(d, campaignId, creator.id);
    const c = d.campaigns.find((x) => x.id === campaignId)!;
    const latest = t.offers[t.offers.length - 1];
    const stage = t.collaboration ? 'agreed' : latest?.status === 'open' ? (latest.from === 'org' ? 'offer_received' : 'awaiting_brand') : t.application?.status === 'submitted' || t.application?.status === 'shortlisted' ? 'applied' : 'closed';
    return { campaign: toCreatorView(c), stage, latestOffer: latest ?? null, application: t.application, invitation: t.invitation, collaboration: t.collaboration, lastActivity: t.messages[t.messages.length - 1]?.createdAt };
  }).sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? ''));
}
