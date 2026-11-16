import type { Category, ContentFormat, CreatorProfile, Organization, OrgRole, Plan, Product } from '../../domain/types';
import { getDb, mutate } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import { latency } from '../config';
import { accessibleOrgIds, effectiveRole, requireOrg, requireUser, type Ctx } from '../access';
import { assertValid, rules } from '../../lib/validate';
import { cleanEmail, cleanLine, cleanText, safeUrl } from '../../lib/sanitize';
import { nowIso, uid } from '../../lib/utils';
import { notify } from '../notify';

export function planFor(org: Pick<Organization, 'planId'>): Plan {
  const d = getDb();
  return d.settings.plans.find((p) => p.id === org.planId) ?? d.settings.plans[0];
}

export function assertFeature(org: Organization, feature: 'aiMatching' | 'analytics' | 'outreach') {
  const plan = planFor(org);
  if (!plan.limits[feature]) {
    const names = { aiMatching: 'AI matching', analytics: 'Campaign analytics', outreach: 'Outreach tools' };
    throw new AppError('plan_limit', `${names[feature]} isn’t included in the ${plan.name} plan. Upgrade in Settings → Plan.`);
  }
}

// ---------------- Onboarding ----------------
export async function onboardOrganization(ctx: Ctx, input: { name: string; country: string; industry?: string; website?: string; description?: string }) {
  await latency();
  const user = requireUser(ctx);
  if (user.kind !== 'brand' && user.kind !== 'agency') throw forbidden('Only brand and agency accounts create organisations.');
  const name = cleanLine(input.name, 100);
  assertValid({ name, country: input.country }, { name: [rules.required('Organisation name'), rules.minLen('Organisation name', 2)], country: [rules.required('Country')] });
  const website = input.website ? safeUrl(input.website) : undefined;
  if (input.website && !website) throw new AppError('validation', 'Enter a valid website address.', { website: 'Enter a valid website address.' });
  return mutate((d) => {
    const org: Organization = {
      id: uid('org'), name, type: user.kind === 'agency' ? 'agency' : 'brand', country: input.country,
      industry: cleanLine(input.industry, 80) || undefined, website: website ?? undefined, description: cleanText(input.description, 800) || undefined,
      planId: user.kind === 'agency' ? 'agency_studio' : 'brand_growth', status: 'active', createdAt: nowIso(), products: [],
      agencyFeePct: user.kind === 'agency' ? d.settings.defaultAgencyFeePct : undefined,
    };
    d.organizations.push(org);
    d.memberships.push({ id: uid('mem'), orgId: org.id, userId: user.id, role: 'owner', createdAt: nowIso() });
    user.onboarded = true;
    const s = d.sessions.find((x) => x.token === ctx.token);
    if (s) s.activeOrgId = org.id;
    // Accept pending team invites for this email.
    audit({ actorId: user.id, actorEmail: user.email, orgId: org.id, action: 'org.created', target: org.name, severity: 'info' });
    return org;
  });
}

export async function onboardCreator(ctx: Ctx, input: { displayName: string; handle: string; country: string; city?: string; bio: string; categories: Category[]; languages: string[]; formats: ContentFormat[] }) {
  await latency();
  const user = requireUser(ctx);
  if (user.kind !== 'creator') throw forbidden('Only creator accounts can create a creator profile.');
  const d0 = getDb();
  if (d0.creators.some((c) => c.userId === user.id)) throw new AppError('conflict', 'You already have a creator profile.');
  const handle = cleanLine(input.handle, 40).replace(/^@/, '').toLowerCase();
  assertValid({ ...input, handle }, {
    displayName: [rules.required('Display name')],
    handle: [rules.required('Handle'), (v) => (/^[a-z0-9._]{2,40}$/.test(String(v)) ? null : 'Use letters, numbers, dots or underscores.')],
    country: [rules.required('Country')],
    categories: [rules.required('At least one category')],
  });
  if (d0.creators.some((c) => c.handle === handle)) throw new AppError('validation', 'That handle is taken.', { handle: 'That handle is taken.' });
  return mutate((d) => {
    const c: CreatorProfile = {
      id: uid('cr'), userId: user.id, displayName: cleanLine(input.displayName, 80), handle, bio: cleanText(input.bio, 1200),
      country: input.country, city: cleanLine(input.city, 60) || undefined, languages: input.languages.slice(0, 8), categories: input.categories.slice(0, 5),
      formats: input.formats.slice(0, 8), socials: [], audience: { source: 'creator_submitted' }, rates: [], portfolio: [], preferredCollabs: [],
      availability: 'available', identityVerification: 'unverified',
      visibility: { listed: true, showLocation: true, showRates: true, showAudience: true, showCollabHistory: false },
      avatarHue: Math.floor(Math.random() * 360), sample: false, createdAt: nowIso(), updatedAt: nowIso(),
    };
    d.creators.push(c);
    user.onboarded = true;
    audit({ actorId: user.id, actorEmail: user.email, action: 'creator.profile_created', target: c.handle, severity: 'info' });
    return c;
  });
}

// ---------------- Organisation profile ----------------
export async function getOrg(ctx: Ctx, orgId: string) {
  const { org, role } = requireOrg(ctx, orgId, 'org.view');
  const d = getDb();
  const parent = org.parentOrgId ? d.organizations.find((o) => o.id === org.parentOrgId) : undefined;
  return { org, role, plan: planFor(parent ?? org), parentName: parent?.name };
}

export async function updateOrg(ctx: Ctx, orgId: string, patch: Partial<Pick<Organization, 'name' | 'country' | 'industry' | 'website' | 'description' | 'agencyFeePct'>>) {
  await latency();
  const { user, org } = requireOrg(ctx, orgId, 'settings.manage');
  const name = patch.name != null ? cleanLine(patch.name, 100) : org.name;
  if (!name) throw new AppError('validation', 'Organisation name is required.', { name: 'Organisation name is required.' });
  const website = patch.website ? safeUrl(patch.website) : patch.website === '' ? undefined : org.website;
  if (patch.website && !website) throw new AppError('validation', 'Enter a valid website address.', { website: 'Enter a valid website address.' });
  if (patch.agencyFeePct != null && (patch.agencyFeePct < 0 || patch.agencyFeePct > 40)) throw new AppError('validation', 'Agency fee must be between 0% and 40%.');
  return mutate(() => {
    Object.assign(org, {
      name, website, country: patch.country ?? org.country, industry: patch.industry != null ? cleanLine(patch.industry, 80) : org.industry,
      description: patch.description != null ? cleanText(patch.description, 800) : org.description,
      agencyFeePct: org.type === 'agency' && patch.agencyFeePct != null ? patch.agencyFeePct : org.agencyFeePct,
    });
    audit({ actorId: user.id, actorEmail: user.email, orgId, action: 'org.updated', severity: 'info' });
    return org;
  });
}

export async function saveProduct(ctx: Ctx, orgId: string, input: Partial<Product> & { name: string; description: string }) {
  await latency();
  const { org } = requireOrg(ctx, orgId, 'campaign.edit');
  const name = cleanLine(input.name, 100);
  if (!name) throw new AppError('validation', 'Product name is required.', { name: 'Product name is required.' });
  return mutate(() => {
    const existing = input.id ? org.products.find((p) => p.id === input.id) : undefined;
    const record: Product = { id: existing?.id ?? uid('prd'), name, description: cleanText(input.description, 600), priceHint: cleanLine(input.priceHint, 60) || undefined };
    if (existing) Object.assign(existing, record);
    else org.products.push(record);
    return record;
  });
}

export async function deleteProduct(ctx: Ctx, orgId: string, productId: string) {
  const { org } = requireOrg(ctx, orgId, 'campaign.edit');
  mutate(() => { org.products = org.products.filter((p) => p.id !== productId); });
}

// ---------------- Team ----------------
export async function listTeam(ctx: Ctx, orgId: string) {
  const { role } = requireOrg(ctx, orgId, 'org.view');
  const d = getDb();
  const members = d.memberships.filter((m) => m.orgId === orgId).map((m) => {
    const u = d.users.find((x) => x.id === m.userId);
    return { membershipId: m.id, userId: m.userId, name: u?.name ?? 'Removed user', email: u?.email ?? '', role: m.role, since: m.createdAt, status: u?.status ?? 'active' };
  });
  const invites = d.teamInvites.filter((i) => i.orgId === orgId && i.status === 'pending');
  return { members, invites, myRole: role };
}

const ASSIGNABLE: OrgRole[] = ['admin', 'manager', 'member', 'client_reviewer'];

export async function inviteMember(ctx: Ctx, orgId: string, emailRaw: string, role: OrgRole) {
  await latency();
  const { user, org } = requireOrg(ctx, orgId, 'team.manage');
  const email = cleanEmail(emailRaw);
  assertValid({ email, role }, { email: [rules.required('Email'), rules.email()], role: [rules.oneOf('Role', ASSIGNABLE)] });
  if (role === 'client_reviewer' && org.type !== 'client') throw new AppError('validation', 'Client reviewers can only be added to client workspaces.');
  const d = getDb();
  const existingUser = d.users.find((u) => u.email === email);
  if (existingUser && d.memberships.some((m) => m.orgId === orgId && m.userId === existingUser.id)) throw new AppError('conflict', 'That person is already in this workspace.');
  return mutate((db) => {
    if (existingUser && existingUser.kind !== 'creator') {
      db.memberships.push({ id: uid('mem'), orgId, userId: existingUser.id, role, createdAt: nowIso() });
      notify(db, [existingUser.id], 'team', `You were added to ${org.name}`, `${user.name} added you as ${role.replace('_', ' ')}.`, '/app/dashboard');
      audit({ actorId: user.id, actorEmail: user.email, orgId, action: 'team.member_added', target: email, severity: 'info' });
      return { added: true, emailSent: false };
    }
    db.teamInvites.push({ id: uid('inv'), orgId, email, role, invitedBy: user.id, createdAt: nowIso(), status: 'pending' });
    audit({ actorId: user.id, actorEmail: user.email, orgId, action: 'team.invited', target: email, severity: 'info' });
    return { added: false, emailSent: false };
  });
}

export async function changeMemberRole(ctx: Ctx, orgId: string, membershipId: string, role: OrgRole) {
  await latency();
  const { user } = requireOrg(ctx, orgId, 'team.manage');
  const d = getDb();
  const m = d.memberships.find((x) => x.id === membershipId && x.orgId === orgId);
  if (!m) throw notFound('Member');
  if (m.role === 'owner') throw new AppError('conflict', 'The owner’s role can’t be changed here.');
  if (!ASSIGNABLE.includes(role)) throw new AppError('validation', 'Choose a valid role.');
  mutate(() => {
    m.role = role;
    audit({ actorId: user.id, actorEmail: user.email, orgId, action: 'team.role_changed', target: `${m.userId} → ${role}`, severity: 'warning' });
  });
}

export async function removeMember(ctx: Ctx, orgId: string, membershipId: string) {
  await latency();
  const { user } = requireOrg(ctx, orgId, 'team.manage');
  const d = getDb();
  const m = d.memberships.find((x) => x.id === membershipId && x.orgId === orgId);
  if (!m) throw notFound('Member');
  if (m.role === 'owner') throw new AppError('conflict', 'The owner can’t be removed.');
  if (m.userId === user.id) throw new AppError('conflict', 'You can’t remove yourself.');
  mutate((db) => {
    db.memberships = db.memberships.filter((x) => x.id !== membershipId);
    audit({ actorId: user.id, actorEmail: user.email, orgId, action: 'team.member_removed', target: m.userId, severity: 'warning' });
  });
}

export async function revokeInvite(ctx: Ctx, orgId: string, inviteId: string) {
  requireOrg(ctx, orgId, 'team.manage');
  mutate((db) => {
    const inv = db.teamInvites.find((i) => i.id === inviteId && i.orgId === orgId);
    if (inv) inv.status = 'revoked';
  });
}

// ---------------- Agency clients ----------------
export async function listClients(ctx: Ctx, agencyId: string) {
  const { org } = requireOrg(ctx, agencyId, 'org.view');
  if (org.type !== 'agency') throw forbidden('Only agencies have client workspaces.');
  const d = getDb();
  return d.organizations.filter((o) => o.parentOrgId === agencyId).map((o) => {
    const campaigns = d.campaigns.filter((c) => c.orgId === o.id);
    return {
      org: o,
      campaigns: campaigns.length,
      active: campaigns.filter((c) => c.status === 'active').length,
      reviewers: d.memberships.filter((m) => m.orgId === o.id && m.role === 'client_reviewer').length,
      pendingApprovals: d.deliverables.filter((x) => x.orgId === o.id && (x.status === 'in_review' || x.status === 'awaiting_client')).length,
    };
  });
}

export async function createClient(ctx: Ctx, agencyId: string, input: { name: string; country: string; industry?: string; website?: string }) {
  await latency();
  const { user, org } = requireOrg(ctx, agencyId, 'clients.manage');
  if (org.type !== 'agency') throw forbidden('Only agencies can create client workspaces.');
  const d = getDb();
  const limit = planFor(org).limits.clientWorkspaces;
  const count = d.organizations.filter((o) => o.parentOrgId === agencyId).length;
  if (limit != null && count >= limit) throw new AppError('plan_limit', `Your plan includes ${limit} client workspaces. Upgrade to add more.`);
  const name = cleanLine(input.name, 100);
  assertValid({ name, country: input.country }, { name: [rules.required('Client name')], country: [rules.required('Country')] });
  return mutate((db) => {
    const client: Organization = {
      id: uid('org'), name, type: 'client', parentOrgId: agencyId, country: input.country, industry: cleanLine(input.industry, 80) || undefined,
      website: input.website ? safeUrl(input.website) ?? undefined : undefined, planId: org.planId, status: 'active', createdAt: nowIso(), products: [],
    };
    db.organizations.push(client);
    audit({ actorId: user.id, actorEmail: user.email, orgId: agencyId, action: 'agency.client_created', target: name, severity: 'info' });
    return client;
  });
}

export async function changePlan(ctx: Ctx, orgId: string, planId: string) {
  await latency();
  const { user, org } = requireOrg(ctx, orgId, 'settings.manage');
  const d = getDb();
  const plan = d.settings.plans.find((p) => p.id === planId);
  if (!plan || plan.audience !== (org.type === 'agency' ? 'agency' : 'brand')) throw new AppError('validation', 'That plan isn’t available for this workspace.');
  if (plan.priceMonthly == null) throw new AppError('conflict', `${plan.name} is arranged with our sales team.`);
  mutate(() => {
    org.planId = planId;
    audit({ actorId: user.id, actorEmail: user.email, orgId, action: 'billing.plan_changed', target: plan.name, severity: 'warning', detail: 'Demo: no payment provider connected, no charge made.' });
  });
  return plan;
}

export function orgsForUser(userId: string) {
  const d = getDb();
  return accessibleOrgIds(userId, d).map((id) => ({ org: d.organizations.find((o) => o.id === id)!, role: effectiveRole(userId, id, d)! }));
}

/** Plans are configured by admins; the pricing page reads them here. */
export function publicPlans() {
  return getDb().settings.plans;
}
