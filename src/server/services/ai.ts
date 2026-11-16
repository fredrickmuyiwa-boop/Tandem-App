import { getDb } from '../db';
import { notFound } from '../errors';
import { latency } from '../config';
import { requireOrg, type Ctx } from '../access';
import { assertFeature } from './orgs';
import { toView } from './creators';
import { criteriaFromCampaign, rankCreators } from '../../ai/matching';
import type { BriefCriteria } from '../../ai/brief';
import { campaignBudget, compareScenarios } from './money';
import { campaignAnalytics } from './analytics';
import { draftInvitation } from '../../ai/outreach';
import type { StrategistContext } from '../../ai/strategist';

function featureOrg(orgId: string) {
  const d = getDb();
  const org = d.organizations.find((o) => o.id === orgId)!;
  return org.parentOrgId ? d.organizations.find((o) => o.id === org.parentOrgId)! : org;
}

/** Rank listed creators. Uses privacy-filtered views, so hidden data is never used. */
export async function matchCreators(ctx: Ctx, orgId: string, criteria: BriefCriteria, opts: { limit?: number; includeUnavailable?: boolean } = {}) {
  await latency();
  requireOrg(ctx, orgId, 'discover');
  assertFeature(featureOrg(orgId), 'aiMatching');
  const d = getDb();
  const pool = d.creators.filter((c) => c.visibility.listed).map((c) => toView(c));
  const byId = new Map(pool.map((c) => [c.id, c]));
  return rankCreators(pool, criteria, opts).map((m) => ({ match: m, creator: byId.get(m.creatorId)! }));
}

export async function matchForCampaign(ctx: Ctx, orgId: string, campaignId: string, opts: { limit?: number } = {}) {
  const d = getDb();
  requireOrg(ctx, orgId, 'campaign.view');
  const c = d.campaigns.find((x) => x.id === campaignId && x.orgId === orgId);
  if (!c) throw notFound('Campaign');
  const results = await matchCreators(ctx, orgId, criteriaFromCampaign(c), opts);
  const engaged = new Set([...d.invitations, ...d.applications, ...d.collaborations].filter((x) => x.campaignId === campaignId).map((x) => x.creatorId));
  return results.map((r) => ({ ...r, alreadyEngaged: engaged.has(r.creator.id) }));
}

/** Org-scoped snapshot for the strategist. Never includes another organisation’s data. */
export async function strategistContext(ctx: Ctx, orgId: string, campaignId?: string): Promise<StrategistContext> {
  const { user, org } = requireOrg(ctx, orgId, 'strategist');
  const d = getDb();
  const base: StrategistContext = { org: { name: org.name, type: org.type, country: org.country, industry: org.industry, products: org.products.map((p) => ({ name: p.name, description: p.description })) }, senderName: user.name };
  if (!campaignId) return base;
  const c = d.campaigns.find((x) => x.id === campaignId && x.orgId === orgId);
  if (!c) throw notFound('Campaign');
  const b = campaignBudget(c.id);
  const threads = new Set([...d.invitations, ...d.applications, ...d.offers].filter((x) => x.campaignId === c.id).map((x) => x.creatorId));
  const collabs = d.collaborations.filter((k) => k.campaignId === c.id && k.status !== 'cancelled');
  const dels = d.deliverables.filter((x) => collabs.some((k) => k.id === x.collaborationId));
  let topMatches: StrategistContext['topMatches'] = [];
  let draftInvite: string | undefined;
  let tierStats: StrategistContext['tierStats'];
  try {
    const m = (await matchForCampaign(ctx, orgId, c.id, { limit: 6 })).filter((x) => !x.alreadyEngaged);
    topMatches = m.map((x) => ({ name: x.creator.displayName, handle: x.creator.handle, score: x.match.score, confidence: x.match.confidence, role: x.match.suggestedRole.title, reasons: x.match.reasons, concerns: x.match.concerns, fee: x.match.estimatedFee ? `${x.match.estimatedFee.currency} ${x.match.estimatedFee.amount.toLocaleString()}` : undefined, budgetFit: x.match.budgetFit }));
    if (m[0]) draftInvite = draftInvitation({ creator: m[0].creator, campaign: c, orgName: org.name, senderName: user.name, productName: org.products.find((p) => p.id === c.productId)?.name, reasons: m[0].match.reasons });
  } catch { /* plan without AI matching: strategist still works without matches */ }
  try {
    tierStats = (await compareScenarios(ctx, orgId, { budget: c.budget, currency: c.currency, scenarios: [] })).tierStats;
  } catch { tierStats = undefined; }
  let analytics: StrategistContext['analytics'] = null;
  try {
    const a = await campaignAnalytics(ctx, orgId, c.id);
    analytics = { ...a.totals, engagementRate: a.derived.engagementRate, cpe: a.derived.cpe, cpc: a.derived.cpc, sources: a.sources, sample: a.sample, spend: a.spend };
  } catch { analytics = null; }
  const pipelineStatus = [...threads].map((cid) => {
    if (collabs.some((k) => k.creatorId === cid)) return 'agreed';
    if (d.invitations.some((i) => i.campaignId === c.id && i.creatorId === cid && i.status === 'declined')) return 'declined';
    if (d.offers.some((o) => o.campaignId === c.id && o.creatorId === cid && o.status === 'open')) return 'negotiating';
    if (d.applications.some((a) => a.campaignId === c.id && a.creatorId === cid)) return 'applied';
    return 'invited';
  });
  const count = (s: string) => pipelineStatus.filter((x) => x === s).length;
  return {
    ...base, campaign: c, topMatches, draftInvite, tierStats, analytics,
    budget: { total: b.total, committed: b.committed, platformFee: b.platformFee, agencyFee: b.agencyFee, remaining: b.remaining, currency: b.currency, allocations: b.allocations.map((x) => ({ creatorName: x.creatorName, fee: x.fee, bonus: x.bonus })) },
    pipeline: { invited: count('invited'), applied: count('applied'), negotiating: count('negotiating'), agreed: count('agreed'), declined: count('declined') },
    deliverables: { total: dels.length, approved: dels.filter((x) => x.status === 'approved').length, inReview: dels.filter((x) => x.status === 'in_review' || x.status === 'awaiting_client').length, revisions: dels.filter((x) => x.status === 'revision_requested').length, overdue: dels.filter((x) => x.status !== 'approved' && new Date(x.dueDate).getTime() < Date.now() - 86_400_000).length },
  };
}

/**
 * Landing-page preview. Runs the real matching engine, but ONLY over fictional
 * sample profiles, and returns no rates or audience details.
 */
export async function publicDemoMatch(criteria: BriefCriteria) {
  await latency();
  const d = getDb();
  const pool = d.creators.filter((c) => c.sample && c.visibility.listed).map((c) => toView(c));
  return rankCreators(pool, criteria, { limit: 3 }).map((m) => {
    const c = pool.find((x) => x.id === m.creatorId)!;
    return { name: c.displayName, handle: c.handle, hue: c.avatarHue, country: c.country, categories: c.categories, score: m.score, confidence: m.confidence, reasons: m.reasons.slice(0, 2), concern: m.concerns[0] ?? null, role: m.suggestedRole.title };
  });
}
