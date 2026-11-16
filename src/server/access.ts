// Authentication context and authorisation checks. This is the demo-mode
// equivalent of Supabase Row Level Security: every service calls these
// before reading or writing, so the UI can never bypass them.
import type { CreatorProfile, Database, Organization, OrgRole, User } from '../domain/types';
import { getDb } from './db';
import { AppError, forbidden, notFound } from './errors';
import { audit } from './audit';

export interface Ctx { token: string | null }

export type Permission =
  | 'org.view' | 'campaign.view' | 'campaign.edit' | 'discover' | 'collections.edit' | 'crm.view' | 'crm.edit'
  | 'outreach.send' | 'content.review.internal' | 'content.review.client' | 'budget.view' | 'payments.edit'
  | 'results.edit' | 'team.manage' | 'settings.manage' | 'clients.manage' | 'strategist';

const MATRIX: Record<OrgRole, Permission[]> = {
  owner: ['org.view', 'campaign.view', 'campaign.edit', 'discover', 'collections.edit', 'crm.view', 'crm.edit', 'outreach.send', 'content.review.internal', 'budget.view', 'payments.edit', 'results.edit', 'team.manage', 'settings.manage', 'clients.manage', 'strategist'],
  admin: ['org.view', 'campaign.view', 'campaign.edit', 'discover', 'collections.edit', 'crm.view', 'crm.edit', 'outreach.send', 'content.review.internal', 'budget.view', 'payments.edit', 'results.edit', 'team.manage', 'settings.manage', 'clients.manage', 'strategist'],
  manager: ['org.view', 'campaign.view', 'campaign.edit', 'discover', 'collections.edit', 'crm.view', 'crm.edit', 'outreach.send', 'content.review.internal', 'budget.view', 'payments.edit', 'results.edit', 'strategist'],
  member: ['org.view', 'campaign.view', 'discover', 'collections.edit', 'crm.view', 'crm.edit', 'budget.view', 'strategist'],
  client_reviewer: ['org.view', 'campaign.view', 'content.review.client'],
};

export const roleCan = (role: OrgRole, p: Permission) => MATRIX[role].includes(p);

export function sessionUser(ctx: Ctx, d: Database = getDb()): User | null {
  if (!ctx.token) return null;
  const s = d.sessions.find((x) => x.token === ctx.token);
  if (!s || s.revoked || new Date(s.expiresAt).getTime() < Date.now()) return null;
  const u = d.users.find((x) => x.id === s.userId);
  return u ?? null;
}

export function requireUser(ctx: Ctx): User {
  const u = sessionUser(ctx);
  if (!u) throw new AppError('unauthenticated', 'Your session has ended. Sign in again.');
  if (u.status === 'suspended') throw new AppError('suspended', 'This account is suspended. Contact support.');
  return u;
}

export function requireAdmin(ctx: Ctx): User {
  const u = requireUser(ctx);
  if (u.platformRole !== 'admin') {
    deny(u, 'admin area');
    throw forbidden('Administrator access required.');
  }
  return u;
}

export function requireCreator(ctx: Ctx): { user: User; creator: CreatorProfile } {
  const u = requireUser(ctx);
  const creator = getDb().creators.find((c) => c.userId === u.id);
  if (!creator) throw forbidden('Only creator accounts can do this.');
  return { user: u, creator };
}

/** Effective role in an org. Agency staff inherit their agency role in client workspaces. */
export function effectiveRole(userId: string, orgId: string, d: Database = getDb()): OrgRole | null {
  const direct = d.memberships.find((m) => m.userId === userId && m.orgId === orgId);
  if (direct) return direct.role;
  const org = d.organizations.find((o) => o.id === orgId);
  if (org?.type === 'client' && org.parentOrgId) {
    const agency = d.memberships.find((m) => m.userId === userId && m.orgId === org.parentOrgId);
    if (agency && agency.role !== 'client_reviewer') return agency.role;
  }
  return null;
}

function deny(u: User, target: string, orgId?: string) {
  audit({ actorId: u.id, actorEmail: u.email, orgId, action: 'permission.denied', target, severity: 'security' });
}

export function requireOrg(ctx: Ctx, orgId: string, perm: Permission): { user: User; org: Organization; role: OrgRole } {
  const user = requireUser(ctx);
  const d = getDb();
  const org = d.organizations.find((o) => o.id === orgId);
  if (!org) throw notFound('Workspace');
  const role = effectiveRole(user.id, orgId, d);
  if (!role) {
    deny(user, `org:${orgId}`, orgId);
    throw notFound('Workspace'); // do not reveal existence of other orgs
  }
  if (org.status === 'suspended') throw new AppError('suspended', 'This workspace is suspended.');
  if (!roleCan(role, perm)) {
    deny(user, `${perm} in ${org.name}`, orgId);
    throw forbidden(`Your role (${role.replace('_', ' ')}) can’t do this.`);
  }
  return { user, org, role };
}

/** All orgs the user can enter, including agency client workspaces. */
export function accessibleOrgIds(userId: string, d: Database = getDb()): string[] {
  const ids = new Set<string>();
  for (const m of d.memberships.filter((x) => x.userId === userId)) {
    ids.add(m.orgId);
    if (m.role !== 'client_reviewer') d.organizations.filter((o) => o.parentOrgId === m.orgId).forEach((o) => ids.add(o.id));
  }
  return [...ids];
}
