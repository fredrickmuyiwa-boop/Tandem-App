import type { AccountKind, Session, User } from '../../domain/types';
import { getDb, mutate } from '../db';
import { AppError } from '../errors';
import { audit } from '../audit';
import { config, latency } from '../config';
import { accessibleOrgIds, effectiveRole, requireUser, type Ctx } from '../access';
import { hashPassword, newToken, verifyPassword } from '../../lib/crypto';
import { assertValid, rules } from '../../lib/validate';
import { cleanEmail, cleanLine } from '../../lib/sanitize';
import { uid, nowIso } from '../../lib/utils';
import { defaultPrefs, notify } from '../notify';

const GENERIC_LOGIN_ERROR = 'Email or password is incorrect.';

export type PublicUser = Omit<User, 'passwordHash' | 'passwordSalt' | 'emailVerifyToken' | 'passwordResetToken' | 'passwordResetExpires'>;
export const toPublicUser = ({ passwordHash: _h, passwordSalt: _s, emailVerifyToken: _v, passwordResetToken: _r, passwordResetExpires: _e, ...rest }: User): PublicUser => rest;

function createSession(user: User, userAgent?: string): Session {
  const d = getDb();
  const orgIds = accessibleOrgIds(user.id, d);
  const s: Session = {
    token: newToken(),
    userId: user.id,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + config.sessionHours * 3_600_000).toISOString(),
    revoked: false,
    userAgent,
    activeOrgId: orgIds[0],
  };
  d.sessions.push(s);
  // keep the session table small
  const cutoff = Date.now() - 7 * 86_400_000;
  d.sessions = d.sessions.filter((x) => new Date(x.expiresAt).getTime() > cutoff);
  return s;
}

export async function register(input: { name: string; email: string; password: string; kind: AccountKind }) {
  await latency();
  const email = cleanEmail(input.email);
  const name = cleanLine(input.name, 80);
  assertValid({ name, email, password: input.password, kind: input.kind }, {
    name: [rules.required('Name'), rules.minLen('Name', 2)],
    email: [rules.required('Email'), rules.email()],
    password: [rules.password()],
    kind: [rules.oneOf('Account type', ['brand', 'agency', 'creator'] as const)],
  });
  const d = getDb();
  const existing = d.users.find((u) => u.email === email);
  // Same response either way, so the form cannot be used to discover accounts.
  if (existing) {
    audit({ action: 'auth.register.duplicate', target: email, severity: 'warning' });
    return { status: 'verification_sent' as const, demoVerifyToken: newToken() };
  }
  const { hash, salt } = await hashPassword(input.password);
  const token = newToken();
  return mutate((db) => {
    const user: User = {
      id: uid('usr'), email, name, kind: input.kind, platformRole: 'user', status: 'active', emailVerified: false,
      passwordHash: hash, passwordSalt: salt, mfaEnabled: false, createdAt: nowIso(), onboarded: false, emailVerifyToken: token,
    };
    db.users.push(user);
    db.notificationPrefs.push(defaultPrefs(user.id));
    audit({ actorId: user.id, actorEmail: email, action: 'auth.register', severity: 'info' });
    return { status: 'verification_sent' as const, demoVerifyToken: token };
  });
}

export async function verifyEmail(token: string) {
  await latency();
  const d = getDb();
  const user = token ? d.users.find((u) => u.emailVerifyToken === token) : undefined;
  if (!user) throw new AppError('not_found', 'This verification link is invalid or has already been used.');
  return mutate(() => {
    user.emailVerified = true;
    user.emailVerifyToken = undefined;
    audit({ actorId: user.id, actorEmail: user.email, action: 'auth.email_verified', severity: 'info' });
    const s = createSession(user);
    return { token: s.token };
  });
}

export async function signIn(input: { email: string; password: string; userAgent?: string }) {
  await latency();
  const email = cleanEmail(input.email);
  const d = getDb();
  const att = d.loginAttempts[email];
  if (att?.lockedUntil && att.lockedUntil > Date.now()) {
    const mins = Math.ceil((att.lockedUntil - Date.now()) / 60000);
    throw new AppError('rate_limited', `Too many attempts. Try again in ${mins} minute${mins > 1 ? 's' : ''}.`);
  }
  const user = d.users.find((u) => u.email === email);
  // Hash even when the user doesn't exist so timing doesn't reveal accounts.
  const ok = user ? await verifyPassword(input.password ?? '', user.passwordHash, user.passwordSalt) : (await hashPassword(input.password ?? '', '00'.repeat(16)), false);
  if (!user || !ok) {
    mutate((db) => {
      const a = db.loginAttempts[email] ?? { count: 0, firstAt: Date.now() };
      if (Date.now() - a.firstAt > 15 * 60_000) { a.count = 0; a.firstAt = Date.now(); }
      a.count += 1;
      if (a.count >= config.maxLoginFailures) {
        a.lockedUntil = Date.now() + config.lockMinutes * 60_000;
        audit({ actorEmail: email, action: 'auth.lockout', severity: 'security', detail: `${a.count} failed attempts` });
      } else audit({ actorEmail: email, action: 'auth.login_failed', severity: 'warning' });
      db.loginAttempts[email] = a;
    });
    throw new AppError('unauthenticated', GENERIC_LOGIN_ERROR);
  }
  if (user.status === 'suspended') throw new AppError('suspended', 'This account is suspended. Contact support if you think this is a mistake.');
  if (!user.emailVerified) throw new AppError('forbidden', 'Verify your email address before signing in.');
  return mutate((db) => {
    delete db.loginAttempts[email];
    user.lastLoginAt = nowIso();
    const s = createSession(user, input.userAgent);
    audit({ actorId: user.id, actorEmail: email, action: 'auth.login', severity: 'info' });
    return { token: s.token };
  });
}

export async function signOut(ctx: Ctx) {
  const d = getDb();
  const s = d.sessions.find((x) => x.token === ctx.token);
  if (s) mutate(() => { s.revoked = true; });
}

export async function signOutOtherSessions(ctx: Ctx) {
  await latency();
  const user = requireUser(ctx);
  return mutate((db) => {
    let n = 0;
    db.sessions.forEach((s) => { if (s.userId === user.id && s.token !== ctx.token && !s.revoked) { s.revoked = true; n++; } });
    audit({ actorId: user.id, actorEmail: user.email, action: 'auth.sessions_revoked', severity: 'security', detail: `${n} sessions` });
    return n;
  });
}

export async function listSessions(ctx: Ctx) {
  const user = requireUser(ctx);
  return getDb().sessions
    .filter((s) => s.userId === user.id && !s.revoked && new Date(s.expiresAt).getTime() > Date.now())
    .map((s) => ({ current: s.token === ctx.token, createdAt: s.createdAt, expiresAt: s.expiresAt, userAgent: s.userAgent ?? 'Unknown device' }));
}

export async function requestPasswordReset(emailRaw: string) {
  await latency();
  const email = cleanEmail(emailRaw);
  const d = getDb();
  const user = d.users.find((u) => u.email === email);
  const token = newToken();
  if (user) mutate(() => {
    user.passwordResetToken = token;
    user.passwordResetExpires = Date.now() + 30 * 60_000;
    audit({ actorId: user.id, actorEmail: email, action: 'auth.reset_requested', severity: 'warning' });
  });
  // Identical response whether or not the account exists.
  return { status: 'sent' as const, demoResetToken: token };
}

export async function resetPassword(token: string, password: string) {
  await latency();
  assertValid({ password }, { password: [rules.password()] });
  const d = getDb();
  const user = token ? d.users.find((u) => u.passwordResetToken === token && (u.passwordResetExpires ?? 0) > Date.now()) : undefined;
  if (!user) throw new AppError('not_found', 'This reset link is invalid or has expired. Request a new one.');
  const { hash, salt } = await hashPassword(password);
  return mutate((db) => {
    user.passwordHash = hash;
    user.passwordSalt = salt;
    user.passwordResetToken = undefined;
    user.emailVerified = true;
    db.sessions.forEach((s) => { if (s.userId === user.id) s.revoked = true; });
    audit({ actorId: user.id, actorEmail: user.email, action: 'auth.password_reset', severity: 'security' });
    notify(db, [user.id], 'system', 'Your password was changed', 'All other sessions were signed out. If this wasn’t you, contact support.');
    return { ok: true };
  });
}

export async function changePassword(ctx: Ctx, current: string, next: string) {
  await latency();
  const user = requireUser(ctx);
  if (!(await verifyPassword(current, user.passwordHash, user.passwordSalt))) throw new AppError('validation', 'Current password is incorrect.', { current: 'Current password is incorrect.' });
  assertValid({ next }, { next: [rules.password()] });
  const { hash, salt } = await hashPassword(next);
  return mutate((db) => {
    user.passwordHash = hash;
    user.passwordSalt = salt;
    db.sessions.forEach((s) => { if (s.userId === user.id && s.token !== ctx.token) s.revoked = true; });
    audit({ actorId: user.id, actorEmail: user.email, action: 'auth.password_changed', severity: 'security' });
  });
}

export function me(ctx: Ctx) {
  const d = getDb();
  const user = requireUser(ctx);
  const session = d.sessions.find((s) => s.token === ctx.token)!;
  const orgIds = accessibleOrgIds(user.id, d);
  const orgs = d.organizations
    .filter((o) => orgIds.includes(o.id))
    .map((o) => ({ id: o.id, name: o.name, type: o.type, parentOrgId: o.parentOrgId, planId: o.planId, role: effectiveRole(user.id, o.id, d)! }));
  let activeOrgId = session.activeOrgId && orgIds.includes(session.activeOrgId) ? session.activeOrgId : orgs[0]?.id;
  const creator = d.creators.find((c) => c.userId === user.id);
  const unread = d.notifications.filter((n) => n.userId === user.id && !n.read).length;
  return { user: toPublicUser(user), orgs, activeOrgId, creatorId: creator?.id, unread, sessionExpiresAt: session.expiresAt };
}

export async function switchOrg(ctx: Ctx, orgId: string) {
  const user = requireUser(ctx);
  const d = getDb();
  if (!accessibleOrgIds(user.id, d).includes(orgId)) throw new AppError('not_found', 'Workspace not found.');
  mutate((db) => {
    const s = db.sessions.find((x) => x.token === ctx.token);
    if (s) s.activeOrgId = orgId;
  });
}

export async function exportMyData(ctx: Ctx) {
  const user = requireUser(ctx);
  const d = getDb();
  const creator = d.creators.find((c) => c.userId === user.id);
  return {
    exportedAt: nowIso(),
    account: toPublicUser(user),
    memberships: d.memberships.filter((m) => m.userId === user.id),
    creatorProfile: creator ?? null,
    applications: creator ? d.applications.filter((a) => a.creatorId === creator.id) : [],
    collaborations: creator ? d.collaborations.filter((c) => c.creatorId === creator.id) : [],
    payments: creator ? d.payments.filter((p) => p.creatorId === creator.id) : [],
    notifications: d.notifications.filter((n) => n.userId === user.id),
  };
}

export async function deleteAccount(ctx: Ctx, confirmEmail: string) {
  await latency();
  const user = requireUser(ctx);
  if (cleanEmail(confirmEmail) !== user.email) throw new AppError('validation', 'Type your email address exactly to confirm.', { confirm: 'Email does not match.' });
  const d = getDb();
  const soleOwner = d.memberships.filter((m) => m.userId === user.id && m.role === 'owner').find((m) => d.memberships.filter((x) => x.orgId === m.orgId && x.role === 'owner').length === 1 && d.memberships.filter((x) => x.orgId === m.orgId).length > 1);
  if (soleOwner) throw new AppError('conflict', 'Transfer ownership of your workspace to another member before deleting your account.');
  mutate((db) => {
    const creator = db.creators.find((c) => c.userId === user.id);
    if (creator) {
      // Keep collaboration records for counterparties, but remove the profile itself.
      const active = db.collaborations.some((c) => c.creatorId === creator.id && c.status === 'active');
      if (active) throw new AppError('conflict', 'Finish or cancel your active collaborations before deleting your account.');
      db.creators = db.creators.filter((c) => c.id !== creator.id);
      db.crm = db.crm.filter((r) => r.creatorId !== creator.id);
      db.collections.forEach((c) => { c.creatorIds = c.creatorIds.filter((x) => x !== creator.id); });
    }
    const ownedSoloOrgs = db.memberships.filter((m) => m.userId === user.id && m.role === 'owner').map((m) => m.orgId).filter((orgId) => db.memberships.filter((x) => x.orgId === orgId).length === 1);
    db.organizations = db.organizations.filter((o) => !ownedSoloOrgs.includes(o.id));
    db.memberships = db.memberships.filter((m) => m.userId !== user.id && !ownedSoloOrgs.includes(m.orgId));
    db.notifications = db.notifications.filter((n) => n.userId !== user.id);
    db.notificationPrefs = db.notificationPrefs.filter((n) => n.userId !== user.id);
    db.sessions = db.sessions.filter((s) => s.userId !== user.id);
    db.users = db.users.filter((u) => u.id !== user.id);
    audit({ actorEmail: user.email, action: 'account.deleted', severity: 'security' });
  });
}
