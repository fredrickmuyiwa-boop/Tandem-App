import { getDb } from '../db';
import { latency } from '../config';
import { requireCreator, requireOrg, roleCan, type Ctx } from '../access';
import { campaignBudget } from './money';
import { toCreatorView } from './campaigns';
import { completeness } from '../../domain/creatorStats';
import { toView } from './creators';
import type { Currency } from '../../domain/types';

export async function orgDashboard(ctx: Ctx, orgId: string) {
  await latency();
  const { role, org } = requireOrg(ctx, orgId, 'org.view');
  const d = getDb();
  const campaigns = d.campaigns.filter((c) => c.orgId === orgId);
  const live = campaigns.filter((c) => ['published', 'recruiting', 'active', 'paused', 'under_review'].includes(c.status));
  const collabs = d.collaborations.filter((k) => k.orgId === orgId && k.status === 'active');
  const deliverables = d.deliverables.filter((x) => collabs.some((k) => k.id === x.collaborationId));
  const canMoney = roleCan(role, 'budget.view');
  const spend: Partial<Record<Currency, { budget: number; committed: number; paid: number }>> = {};
  if (canMoney) for (const c of live) {
    const b = campaignBudget(c.id);
    const s = (spend[c.currency] ||= { budget: 0, committed: 0, paid: 0 });
    s.budget += b.total; s.committed += b.committed + b.platformFee + b.agencyFee; s.paid += b.approvedSpend;
  }
  const creatorName = (id: string) => d.creators.find((c) => c.id === id)?.displayName ?? 'Creator';
  const campaignName = (id: string) => d.campaigns.find((c) => c.id === id)?.name ?? '';
  const attention: { kind: string; title: string; detail: string; link: string; at: string }[] = [];
  if (roleCan(role, 'outreach.send')) {
    d.offers.filter((o) => o.orgId === orgId && o.status === 'open' && o.from === 'creator').forEach((o) => attention.push({ kind: 'Counteroffer', title: `${creatorName(o.creatorId)} countered`, detail: campaignName(o.campaignId), link: `/app/campaigns/${o.campaignId}?tab=deals&creator=${o.creatorId}`, at: o.createdAt }));
    d.applications.filter((a) => a.orgId === orgId && a.status === 'submitted').forEach((a) => attention.push({ kind: 'Application', title: `${creatorName(a.creatorId)} applied`, detail: campaignName(a.campaignId), link: `/app/campaigns/${a.campaignId}?tab=deals&creator=${a.creatorId}`, at: a.createdAt }));
    const lastByThread = new Map<string, (typeof d.messages)[number]>();
    d.messages.filter((m) => m.orgId === orgId).forEach((m) => lastByThread.set(`${m.campaignId}|${m.creatorId}`, m));
    [...lastByThread.values()].filter((m) => m.kind === 'clarification').forEach((m) => attention.push({ kind: 'Question', title: `${creatorName(m.creatorId)} asked a question`, detail: m.body.slice(0, 80), link: `/app/campaigns/${m.campaignId}?tab=deals&creator=${m.creatorId}`, at: m.createdAt }));
  }
  d.submissions.filter((s) => s.orgId === orgId && ((s.status === 'in_review' && roleCan(role, 'content.review.internal')) || (s.status === 'awaiting_client' && roleCan(role, 'content.review.client')))).forEach((s) => attention.push({ kind: 'Review', title: `${creatorName(s.creatorId)} submitted content`, detail: `${d.deliverables.find((x) => x.id === s.deliverableId)?.title ?? ''} · v${s.version}`, link: `/app/collaborations/${s.collaborationId}`, at: s.submittedAt }));
  if (roleCan(role, 'payments.edit')) d.payments.filter((p) => p.orgId === orgId && p.status === 'pending').forEach((p) => attention.push({ kind: 'Payment', title: `Payment ready for ${creatorName(p.creatorId)}`, detail: p.label, link: `/app/collaborations/${p.collaborationId}`, at: p.dueDate }));
  attention.sort((a, b) => b.at.localeCompare(a.at));
  const deadlines = deliverables.filter((x) => x.status !== 'approved').map((x) => ({ id: x.id, title: x.title, due: x.dueDate, status: x.status, creator: creatorName(x.creatorId), collaborationId: x.collaborationId })).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 6);
  const recruiting = campaigns.filter((c) => c.status === 'recruiting' || c.status === 'published').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return {
    org, role,
    counts: { live: live.length, drafts: campaigns.filter((c) => c.status === 'draft').length, activeCollabs: collabs.length, toReview: d.submissions.filter((s) => s.orgId === orgId && ['in_review', 'awaiting_client'].includes(s.status)).length, applications: d.applications.filter((a) => a.orgId === orgId && a.status === 'submitted').length },
    spend: canMoney ? spend : null,
    attention: attention.slice(0, 8),
    deadlines,
    campaigns: live.slice(0, 5).map((c) => {
      const ks = d.collaborations.filter((k) => k.campaignId === c.id && k.status !== 'cancelled');
      const dels = d.deliverables.filter((x) => ks.some((k) => k.id === x.collaborationId));
      return { campaign: c, creators: ks.length, approved: dels.filter((x) => x.status === 'approved').length, total: dels.length };
    }),
    recruitingCampaignId: recruiting?.id ?? null,
    activity: d.activity.filter((a) => a.orgId === orgId).slice(0, 8),
  };
}

export async function creatorDashboard(ctx: Ctx) {
  await latency();
  const { creator } = requireCreator(ctx);
  const d = getDb();
  const collabs = d.collaborations.filter((k) => k.creatorId === creator.id);
  const active = collabs.filter((k) => k.status === 'active');
  const dels = d.deliverables.filter((x) => active.some((k) => k.id === x.collaborationId));
  const pays = d.payments.filter((p) => p.creatorId === creator.id && p.status !== 'cancelled');
  const totals: Partial<Record<Currency, { paid: number; upcoming: number }>> = {};
  pays.forEach((p) => { const t = (totals[p.currency] ||= { paid: 0, upcoming: 0 }); if (p.status === 'paid') t.paid += p.amount; else t.upcoming += p.amount; });
  const offers = d.offers.filter((o) => o.creatorId === creator.id && o.status === 'open' && o.from === 'org');
  const openCampaigns = d.campaigns.filter((c) => c.visibility === 'public' && ['published', 'recruiting'].includes(c.status));
  const applied = new Set(d.applications.filter((a) => a.creatorId === creator.id).map((a) => a.campaignId));
  const recommended = openCampaigns.filter((c) => !applied.has(c.id)).map((c) => ({ c, fit: c.categories.filter((x) => creator.categories.includes(x)).length * 2 + c.platforms.filter((p) => creator.socials.some((s) => s.platform === p)).length + (c.locations.includes(creator.country) ? 2 : 0) })).filter((x) => x.fit > 0).sort((a, b) => b.fit - a.fit).slice(0, 3).map((x) => toCreatorView(x.c));
  return {
    creator: toView(creator, true),
    completeness: completeness(creator),
    offers: offers.map((o) => ({ offer: o, campaign: toCreatorView(d.campaigns.find((c) => c.id === o.campaignId)!) })),
    applications: d.applications.filter((a) => a.creatorId === creator.id && ['submitted', 'shortlisted'].includes(a.status)).map((a) => ({ application: a, campaign: toCreatorView(d.campaigns.find((c) => c.id === a.campaignId)!) })),
    active: active.map((k) => ({ collab: k, campaign: toCreatorView(d.campaigns.find((c) => c.id === k.campaignId)!), deliverables: dels.filter((x) => x.collaborationId === k.id) })),
    deadlines: dels.filter((x) => x.status !== 'approved').sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5),
    reviewStatus: { inReview: dels.filter((x) => x.status === 'in_review' || x.status === 'awaiting_client').length, revisions: dels.filter((x) => x.status === 'revision_requested').length, approved: d.deliverables.filter((x) => x.creatorId === creator.id && x.status === 'approved').length },
    earnings: totals,
    recommended,
    completed: collabs.filter((k) => k.status === 'completed').length,
  };
}
