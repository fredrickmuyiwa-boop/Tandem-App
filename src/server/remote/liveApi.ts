// Live mode: the same `api` surface, backed by Supabase.
// - auth.* uses Supabase Auth (email confirmation, reset, sessions)
// - every other call runs the normal service on the replica, then waits for the
//   server to accept the resulting writes (or throws the server's reason).
import * as rawAuth from '../services/auth';
import type { AccountKind } from '../../domain/types';
import { AppError } from '../../lib/errors';
import { assertValid, rules } from '../../lib/validate';
import { cleanEmail, cleanLine } from '../../lib/sanitize';
import { audit } from '../audit';
import { getDb } from '../db';
import { requireUser, type Ctx } from '../access';
import { clearLive, drain, liveUser, loadUser, saveActiveOrg } from './live';
import { SESSION_PREFIX, tokenFor } from './replica';

/** What live mode needs from an auth backend (Supabase Auth in the browser, a stub in tests). */
export interface AuthProvider {
  signUp(input: { email: string; password: string; name: string; kind: AccountKind; redirectTo: string }): Promise<void>;
  signIn(email: string, password: string): Promise<string>;           // → user id
  signOut(scope?: 'local' | 'others'): Promise<void>;
  currentUserId(): Promise<string | null>;
  sendPasswordReset(email: string, redirectTo: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  rpc(fn: string, args: Record<string, unknown>): Promise<unknown>;
}

let provider: AuthProvider | null = null;
export const setAuthProvider = (p: AuthProvider) => { provider = p; };
const auth = () => { if (!provider) throw new AppError('network', 'Sign-in isn’t available right now.'); return provider; };
const origin = () => (typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '');

async function signInAndLoad(userId: string) {
  await loadUser(userId);
  const u = getDb().users.find((x) => x.id === userId);
  if (!u) throw new AppError('unauthenticated', 'Your account isn’t set up yet. Try again in a moment.');
  if (u.status === 'suspended') {
    await auth().signOut();
    clearLive();
    throw new AppError('suspended', 'This account is suspended. Contact support if you think this is a mistake.');
  }
  return { token: tokenFor(userId) };
}

export const liveAuth = {
  ...rawAuth,

  async register(input: { name: string; email: string; password: string; kind: AccountKind }) {
    const email = cleanEmail(input.email);
    const name = cleanLine(input.name, 80);
    assertValid({ name, email, password: input.password, kind: input.kind }, {
      name: [rules.required('Name'), rules.minLen('Name', 2)],
      email: [rules.required('Email'), rules.email()],
      password: [rules.password()],
      kind: [rules.oneOf('Account type', ['brand', 'agency', 'creator'] as const)],
    });
    await auth().signUp({ email, password: input.password, name, kind: input.kind, redirectTo: `${origin()}#/verify` });
    // Same response whether or not the address already has an account.
    return { status: 'verification_sent' as const, demoVerifyToken: '' };
  },

  /** The confirmation link signs the user in (Supabase exchanges the code on load). */
  async verifyEmail(_token: string) {
    const id = await auth().currentUserId();
    if (!id) throw new AppError('not_found', 'Open the link from your email on this device, or sign in if you’ve already confirmed.');
    return signInAndLoad(id);
  },

  async signIn(input: { email: string; password: string; userAgent?: string }) {
    const id = await auth().signIn(cleanEmail(input.email), input.password ?? '');
    return signInAndLoad(id);
  },

  async signOut(_ctx: Ctx) {
    try { await auth().signOut(); } finally { clearLive(); saveActiveOrg(undefined); }
  },

  async signOutOtherSessions(ctx: Ctx) {
    const user = requireUser(ctx);
    await auth().signOut('others');
    audit({ actorId: user.id, actorEmail: user.email, action: 'auth.sessions_revoked', severity: 'security' });
    await drain();
    return 1;
  },

  async listSessions(ctx: Ctx) {
    requireUser(ctx);
    // Supabase doesn't list other devices to the browser; "Sign out other sessions" still works.
    return [{ current: true, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString(), userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'This device' }];
  },

  async requestPasswordReset(emailRaw: string) {
    const email = cleanEmail(emailRaw);
    try { await auth().sendPasswordReset(email, `${origin()}#/reset`); } catch { /* same response either way */ }
    return { status: 'sent' as const, demoResetToken: '' };
  },

  /** After the reset link signs the user in, set the new password. */
  async resetPassword(_token: string, password: string) {
    assertValid({ password }, { password: [rules.password()] });
    if (!(await auth().currentUserId())) throw new AppError('not_found', 'This reset link is invalid or has expired. Request a new one.');
    await auth().updatePassword(password);
    // The reset link signed this browser in; sign out everywhere so the new password is used.
    await auth().signOut('others').catch(() => undefined);
    await auth().signOut().catch(() => undefined);
    clearLive();
    return { ok: true };
  },

  async changePassword(ctx: Ctx, current: string, next: string) {
    const user = requireUser(ctx);
    try { await auth().signIn(user.email, current); } catch { throw new AppError('validation', 'Current password is incorrect.', { current: 'Current password is incorrect.' }); }
    assertValid({ next }, { next: [rules.password()] });
    await auth().updatePassword(next);
    await auth().signOut('others').catch(() => undefined);
    audit({ actorId: user.id, actorEmail: user.email, action: 'auth.password_changed', severity: 'security' });
    await drain();
  },

  async switchOrg(ctx: Ctx, orgId: string) {
    await rawAuth.switchOrg(ctx, orgId);
    saveActiveOrg(orgId);
  },

  async deleteAccount(ctx: Ctx, confirmEmail: string) {
    const user = requireUser(ctx);
    if (cleanEmail(confirmEmail) !== user.email) throw new AppError('validation', 'Type your email address exactly to confirm.', { confirm: 'Email does not match.' });
    await auth().rpc('delete_my_account', { confirm_email: confirmEmail });
    await auth().signOut().catch(() => undefined);
    clearLive();
  },
};

type AnyFn = (...args: unknown[]) => unknown;

/** Wrap a service namespace so each call settles only after the server accepts its writes. */
function wrapNamespace<T extends Record<string, unknown>>(ns: T): T {
  const out: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(ns)) {
    if (typeof fn !== 'function') { out[name] = fn; continue; }
    out[name] = (...args: unknown[]) => {
      const ctx = args[0] as Ctx | undefined;
      const wanted = ctx && typeof ctx === 'object' && typeof ctx.token === 'string' && ctx.token.startsWith(SESSION_PREFIX) ? ctx.token.slice(SESSION_PREFIX.length) : null;
      const call = () => {
        const r = (fn as AnyFn)(...args);
        if (!(r instanceof Promise)) return r;
        return r.then(
          async (v) => { await drain(); return v; },
          async (e) => { await drain().catch(() => undefined); throw e; },
        );
      };
      // Tests act as several users in turn; in the browser this never triggers.
      if (wanted && wanted !== liveUser()) return loadUser(wanted).then(call);
      return call();
    };
  }
  return out as T;
}

export function liveApi<T extends Record<string, Record<string, unknown>>>(api: T): T {
  const out: Record<string, unknown> = {};
  for (const [ns, fns] of Object.entries(api)) out[ns] = wrapNamespace(ns === 'auth' ? (liveAuth as unknown as Record<string, unknown>) : fns);
  return out as T;
}
