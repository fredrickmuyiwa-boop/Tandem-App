import type { Campaign, CampaignStatus, Category, Currency, DeliverableSpec, Objective, Platform } from '../../domain/types';
import { CAMPAIGN_STATUS, CAMPAIGN_TRANSITIONS, CURRENCIES, EDITABLE_WHEN, OBJECTIVES, COMPENSATION } from '../../domain/constants';
import { getDb, mutate } from '../db';
import { AppError, notFound } from '../errors';
import { audit } from '../audit';
import { latency } from '../config';
import { requireCreator, requireOrg, type Ctx } from '../access';
import { assertValid, rules } from '../../lib/validate';
import { cleanLine, cleanText } from '../../lib/sanitize';
import { nowIso, uid } from '../../lib/utils';
import { planFor } from './orgs';
import { creatorUser, notify, orgRecipients } from '../notify';

export type CampaignInput = Omit<Campaign, 'id' | 'orgId' | 'status' | 'createdBy' | 'createdAt' | 'updatedAt' | 'sample'>;

export function logActivity(d: ReturnType<typeof getDb>, e: { orgId?: string; campaignId?: string; collaborationId?: string; creatorId?: string; actorId: string; actorName: string; action: string }) {
  d.activity.unshift({ id: uid('act'), at: nowIso(), ...e });
  if (d.activity.length > 3000) d.activity.length = 3000;
}

function validateCampaign(input: CampaignInput) {
  assertValid(input as unknown as Record<string, unknown>, {
    name: [rules.required('Campaign name'), rules.minLen('Campaign name', 3), rules.maxLen('Campaign name', 120)],
    description: [rules.required('Description'), rules.minLen('Description', 20)],
    objective: [rules.oneOf('Objective', OBJECTIVES.map((o) => o.id))],
    currency: [rules.oneOf('Currency', CURRENCIES)],
    budget: [rules.min('Budget', 1)],
    startDate: [rules.date('Start date')],
    endDate: [rules.date('End date')],
    platforms: [rules.required('At least one platform')],
    deliverables: [rules.required('At least one deliverable')],
    compensationModel: [rules.oneOf('Compensation model', COMPENSATION.map((c) => c.id))],
  });
  if (new Date(input.endDate) < new Date(input.startDate)) throw new AppError('validation', 'End date must be after the start date.', { endDate: 'End date must be after the start date.' });
  if (input.audience.ageMin != null && input.audience.ageMax != null && input.audience.ageMin > input.audience.ageMax) throw new AppError('validation', 'Minimum age must be lower than maximum age.', { ageMin: 'Check the age range.' });
  for (const d of input.deliverables) if (!(d.quantity >= 1 && d.quantity <= 50)) throw new AppError('validation', 'Each deliverable needs a quantity between 1 and 50.');
}

function clean(input: CampaignInput): CampaignInput {
  return {
    ...input,
    name: cleanLine(input.name, 120),
    description: cleanText(input.description, 3000),
    requirements: cleanText(input.requirements, 3000),
    guidelines: cleanText(input.guidelines, 3000),
    performanceTargets: cleanText(input.performanceTargets, 1000),
    locations: input.locations.map((l) => cleanLine(l, 60)).filter(Boolean).slice(0, 10),
    languages: input.languages.map((l) => cleanLine(l, 30)).filter(Boolean).slice(0, 8),
    audience: { ...input.audience, interests: input.audience.interests.map((i) => cleanLine(i, 40)).filter(Boolean).slice(0, 10) },
    deliverables: input.deliverables.map((d) => ({ ...d, id: d.id || uid('dlv'), notes: cleanText(d.notes, 300) || undefined })),
    budget: Math.round(input.budget),
  };
}

export async function listCampaigns(ctx: Ctx, orgId: string) {
  await latency();
  requireOrg(ctx, orgId, 'campaign.view');
  const d = getDb();
  return d.campaigns.filter((c) => c.orgId === orgId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((c) => withCounts(c));
}

function withCounts(c: Campaign) {
  const d = getDb();
  const collabs = d.collaborations.filter((x) => x.campaignId === c.id && x.status !== 'cancelled');
  const committed = collabs.reduce((s, x) => s + x.terms.fee + (x.terms.bonus?.amount ?? 0), 0);
  return {
    campaign: c,
    collaborations: collabs.length,
    applications: d.applications.filter((a) => a.campaignId === c.id && a.status === 'submitted').length,
    invitations: d.invitations.filter((i) => i.campaignId === c.id && i.status === 'pending').length,
    pendingReviews: d.deliverables.filter((x) => collabs.some((k) => k.id === x.collaborationId) && (x.status === 'in_review' || x.status === 'awaiting_client')).length,
    committed,
  };
}

export async function getCampaign(ctx: Ctx, orgId: string, campaignId: string) {
  await latency();
  const { role } = requireOrg(ctx, orgId, 'campaign.view');
  const d = getDb();
  const c = d.campaigns.find((x) => x.id === campaignId && x.orgId === orgId);
  if (!c) throw notFound('Campaign');
  const org = d.organizations.find((o) => o.id === orgId)!;
  return { ...withCounts(c), role, product: org.products.find((p) => p.id === c.productId), activity: d.activity.filter((a) => a.campaignId === c.id).slice(0, 60) };
}

export async function createCampaign(ctx: Ctx, orgId: string, input: CampaignInput, opts: { publish?: boolean } = {}) {
  await latency();
  const { user, org } = requireOrg(ctx, orgId, 'campaign.edit');
  const data = clean(input);
  validateCampaign(data);
  const d = getDb();
  const parent = org.parentOrgId ? d.organizations.find((o) => o.id === org.parentOrgId) : undefined;
  const limit = planFor(parent ?? org).limits.activeCampaigns;
  const live = d.campaigns.filter((c) => (c.orgId === orgId || (parent && d.organizations.find((o) => o.id === c.orgId)?.parentOrgId === parent.id)) && ['published', 'recruiting', 'active', 'paused', 'under_review'].includes(c.status)).length;
  if (opts.publish && limit != null && live >= limit) throw new AppError('plan_limit', `Your plan allows ${limit} live campaigns. Complete one or upgrade to publish another.`);
  return mutate((db) => {
    const c: Campaign = { ...data, id: uid('cmp'), orgId, status: opts.publish ? 'recruiting' : 'draft', createdBy: user.id, createdAt: nowIso(), updatedAt: nowIso() };
    db.campaigns.push(c);
    logActivity(db, { orgId, campaignId: c.id, actorId: user.id, actorName: user.name, action: opts.publish ? 'created and published the campaign' : 'created the campaign as a draft' });
    audit({ actorId: user.id, actorEmail: user.email, orgId, action: 'campaign.created', target: c.name, severity: 'info' });
    return c;
  });
}

const BRIEF_FIELDS: (keyof CampaignInput)[] = ['description', 'requirements', 'guidelines', 'performanceTargets', 'endDate', 'approval', 'visibility'];

export async function updateCampaign(ctx: Ctx, orgId: string, campaignId: string, patch: Partial<CampaignInput>) {
  await latency();
  const { user } = requireOrg(ctx, orgId, 'campaign.edit');
  const d = getDb();
  const c = d.campaigns.find((x) => x.id === campaignId && x.orgId === orgId);
  if (!c) throw notFound('Campaign');
  const keys = Object.keys(patch) as (keyof CampaignInput)[];
  if (EDITABLE_WHEN.none.includes(c.status)) throw new AppError('conflict', `A ${CAMPAIGN_STATUS[c.status].label.toLowerCase()} campaign can’t be edited. Pause it first to change the brief.`);
  if (EDITABLE_WHEN.brief.includes(c.status)) {
    const locked = keys.filter((k) => !BRIEF_FIELDS.includes(k));
    if (locked.length) throw new AppError('conflict', `Once published, only the brief, guidelines, end date and approval settings can change. Locked: ${locked.join(', ')}.`);
  }
  const merged = clean({ ...c, ...patch } as CampaignInput);
  validateCampaign(merged);
  return mutate((db) => {
    Object.assign(c, merged, { updatedAt: nowIso() });
    logActivity(db, { orgId, campaignId, actorId: user.id, actorName: user.name, action: `updated ${keys.length > 3 ? 'the campaign' : keys.join(', ')}` });
    return c;
  });
}

export async function transitionCampaign(ctx: Ctx, orgId: string, campaignId: string, to: CampaignStatus, reason?: string) {
  await latency();
  const { user, org } = requireOrg(ctx, orgId, 'campaign.edit');
  const d = getDb();
  const c = d.campaigns.find((x) => x.id === campaignId && x.orgId === orgId);
  if (!c) throw notFound('Campaign');
  if (!CAMPAIGN_TRANSITIONS[c.status].includes(to)) throw new AppError('conflict', `A campaign can’t move from ${CAMPAIGN_STATUS[c.status].label} to ${CAMPAIGN_STATUS[to].label}.`);
  if (to === 'completed') {
    const open = d.deliverables.filter((x) => d.collaborations.some((k) => k.id === x.collaborationId && k.campaignId === c.id && k.status === 'active') && x.status !== 'approved');
    if (open.length) throw new AppError('conflict', `${open.length} deliverable${open.length > 1 ? 's are' : ' is'} not approved yet. Approve or cancel them before completing the campaign.`);
  }
  if (['published', 'recruiting', 'active'].includes(to) && c.status === 'draft') {
    const parent = org.parentOrgId ? d.organizations.find((o) => o.id === org.parentOrgId) : undefined;
    const limit = planFor(parent ?? org).limits.activeCampaigns;
    const live = d.campaigns.filter((x) => x.orgId === orgId && ['published', 'recruiting', 'active', 'paused', 'under_review'].includes(x.status)).length;
    if (limit != null && live >= limit) throw new AppError('plan_limit', `Your plan allows ${limit} live campaigns. Upgrade to publish another.`);
  }
  return mutate((db) => {
    const from = c.status;
    c.status = to;
    c.updatedAt = nowIso();
    if (to === 'completed' || to === 'cancelled') {
      db.collaborations.filter((k) => k.campaignId === c.id && k.status === 'active').forEach((k) => { k.status = to === 'completed' ? 'completed' : 'cancelled'; });
      db.invitations.filter((i) => i.campaignId === c.id && i.status === 'pending').forEach((i) => { i.status = 'withdrawn'; });
      db.offers.filter((o) => o.campaignId === c.id && o.status === 'open').forEach((o) => { o.status = 'withdrawn'; });
      if (to === 'cancelled') db.payments.filter((p) => p.campaignId === c.id && p.status === 'scheduled').forEach((p) => { p.status = 'cancelled'; });
    }
    logActivity(db, { orgId, campaignId, actorId: user.id, actorName: user.name, action: `moved the campaign from ${CAMPAIGN_STATUS[from].label} to ${CAMPAIGN_STATUS[to].label}${reason ? ` — “${cleanLine(reason, 140)}”` : ''}` });
    const creators = [...new Set(db.collaborations.filter((k) => k.campaignId === c.id).map((k) => creatorUser(db, k.creatorId)))];
    if (['paused', 'cancelled', 'completed'].includes(to)) notify(db, creators, 'campaign', `${c.name} is now ${CAMPAIGN_STATUS[to].label.toLowerCase()}`, `The brand updated the campaign status.`, '/creator/dashboard');
    notify(db, orgRecipients(db, orgId, 'campaign.edit').filter((id) => id !== user.id), 'campaign', `${c.name}: ${CAMPAIGN_STATUS[to].label}`, `${user.name} changed the status.`, `/app/campaigns/${c.id}`);
    return c;
  });
}

export async function duplicateCampaign(ctx: Ctx, orgId: string, campaignId: string) {
  const { campaign } = await getCampaign(ctx, orgId, campaignId);
  const { id: _i, orgId: _o, status: _s, createdBy: _c, createdAt: _ca, updatedAt: _u, sample: _sa, ...rest } = campaign;
  return createCampaign(ctx, orgId, { ...rest, name: `${campaign.name} (copy)`.slice(0, 120) });
}

// ---------------- Creator-facing marketplace ----------------
export type CampaignForCreator = Pick<Campaign, 'id' | 'name' | 'description' | 'objective' | 'locations' | 'languages' | 'platforms' | 'categories' | 'currency' | 'startDate' | 'endDate' | 'deliverables' | 'requirements' | 'guidelines' | 'compensationModel' | 'audience' | 'status'> & {
  brandName: string;
  brandCountry: string;
  productName?: string;
  /** Creators see an indicative per-creator range, never the full budget. */
  feeGuide: string;
};

export function toCreatorView(c: Campaign): CampaignForCreator {
  const d = getDb();
  const org = d.organizations.find((o) => o.id === c.orgId)!;
  const deliverableCount = c.deliverables.reduce((s, x) => s + x.quantity, 0);
  const feeGuide = c.compensationModel === 'gifting' ? 'Product gifting' : c.compensationModel === 'negotiated' ? 'Fee negotiated per creator' : `Fixed fee per creator${c.compensationModel === 'fixed_plus_bonus' ? ' + performance bonus' : c.compensationModel === 'milestone' ? ' in milestones' : ''}`;
  return {
    id: c.id, name: c.name, description: c.description, objective: c.objective, locations: c.locations, languages: c.languages, platforms: c.platforms, categories: c.categories,
    currency: c.currency, startDate: c.startDate, endDate: c.endDate, deliverables: c.deliverables, requirements: c.requirements, guidelines: c.guidelines,
    compensationModel: c.compensationModel, audience: c.audience, status: c.status, brandName: org.name, brandCountry: org.country,
    productName: org.products.find((p) => p.id === c.productId)?.name, feeGuide: `${feeGuide} · ${deliverableCount} deliverable${deliverableCount > 1 ? 's' : ''}`,
  };
}

export async function marketplace(ctx: Ctx, q: { q?: string; category?: Category; platform?: Platform; objective?: Objective; currency?: Currency } = {}) {
  await latency();
  const { creator } = requireCreator(ctx);
  const d = getDb();
  const term = cleanLine(q.q, 80).toLowerCase();
  const applied = new Set(d.applications.filter((a) => a.creatorId === creator.id && a.status !== 'withdrawn').map((a) => a.campaignId));
  const invited = new Set(d.invitations.filter((i) => i.creatorId === creator.id).map((i) => i.campaignId));
  return d.campaigns
    .filter((c) => c.visibility === 'public' && ['published', 'recruiting'].includes(c.status))
    .filter((c) => d.organizations.find((o) => o.id === c.orgId)?.status === 'active')
    .filter((c) => !term || `${c.name} ${c.description}`.toLowerCase().includes(term))
    .filter((c) => !q.category || c.categories.includes(q.category))
    .filter((c) => !q.platform || c.platforms.includes(q.platform))
    .filter((c) => !q.objective || c.objective === q.objective)
    .map((c) => {
      const fit = c.categories.filter((x) => creator.categories.includes(x)).length + c.platforms.filter((p) => creator.socials.some((s) => s.platform === p)).length;
      return { campaign: toCreatorView(c), fit, applied: applied.has(c.id), invited: invited.has(c.id) };
    })
    .sort((a, b) => b.fit - a.fit);
}

export async function campaignForCreator(ctx: Ctx, campaignId: string) {
  await latency();
  const { creator } = requireCreator(ctx);
  const d = getDb();
  const c = d.campaigns.find((x) => x.id === campaignId);
  const involved = d.invitations.some((i) => i.campaignId === campaignId && i.creatorId === creator.id) || d.applications.some((a) => a.campaignId === campaignId && a.creatorId === creator.id) || d.collaborations.some((k) => k.campaignId === campaignId && k.creatorId === creator.id);
  const isPublic = c && c.visibility === 'public' && ['published', 'recruiting'].includes(c.status);
  if (!c || (!isPublic && !involved)) throw notFound('Opportunity');
  return {
    campaign: toCreatorView(c),
    application: d.applications.find((a) => a.campaignId === campaignId && a.creatorId === creator.id) ?? null,
    invitation: d.invitations.find((i) => i.campaignId === campaignId && i.creatorId === creator.id) ?? null,
    canApply: !!isPublic && !d.applications.some((a) => a.campaignId === campaignId && a.creatorId === creator.id && a.status !== 'withdrawn') && !d.collaborations.some((k) => k.campaignId === campaignId && k.creatorId === creator.id),
  };
}

export const emptyDeliverable = (platform: Platform = 'instagram'): DeliverableSpec => ({ id: uid('dlv'), platform, format: 'short_video', quantity: 1 });
