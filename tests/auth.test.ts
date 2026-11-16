import { describe, it, expect, beforeEach } from 'vitest';
import { api } from '../src/server/api';
import { getDb } from '../src/server/db';
import { fresh, errorCode } from './helpers';
import { DEMO_PASSWORD } from '../src/data/seed';

describe('authentication', () => {
  beforeEach(fresh);

  it('does not reveal whether an email is registered', async () => {
    const a = await api.auth.register({ name: 'New Person', email: 'new@example.com', password: 'longpassword1', kind: 'brand' });
    const b = await api.auth.register({ name: 'Someone', email: 'brand@tandem.demo', password: 'longpassword1', kind: 'brand' });
    expect(a.status).toBe(b.status);
    expect(getDb().users.filter((u) => u.email === 'brand@tandem.demo')).toHaveLength(1);
  });

  it('rejects weak passwords and invalid emails', async () => {
    expect(await errorCode(api.auth.register({ name: 'X Y', email: 'bad', password: 'longpassword1', kind: 'brand' }))).toBe('validation');
    expect(await errorCode(api.auth.register({ name: 'X Y', email: 'a@b.co', password: 'short1', kind: 'brand' }))).toBe('validation');
    expect(await errorCode(api.auth.register({ name: 'X Y', email: 'a@b.co', password: 'onlyletterslong', kind: 'brand' }))).toBe('validation');
  });

  it('requires email verification before sign-in', async () => {
    const r = await api.auth.register({ name: 'Verify Me', email: 'verify@example.com', password: 'longpassword1', kind: 'creator' });
    expect(await errorCode(api.auth.signIn({ email: 'verify@example.com', password: 'longpassword1' }))).toBe('forbidden');
    const { token } = await api.auth.verifyEmail(r.demoVerifyToken);
    expect(api.auth.me({ token }).user.emailVerified).toBe(true);
    expect(await errorCode(api.auth.verifyEmail(r.demoVerifyToken))).toBe('not_found');
  });

  it('uses one generic error for unknown email and wrong password', async () => {
    let m1 = '', m2 = '';
    try { await api.auth.signIn({ email: 'nobody@example.com', password: 'x' }); } catch (e) { m1 = (e as Error).message; }
    try { await api.auth.signIn({ email: 'brand@tandem.demo', password: 'wrong-password-1' }); } catch (e) { m2 = (e as Error).message; }
    expect(m1).toBe(m2);
  });

  it('locks an email after repeated failures, even with the right password', async () => {
    for (let i = 0; i < 5; i++) await errorCode(api.auth.signIn({ email: 'brand@tandem.demo', password: 'wrong-password-1' }));
    expect(await errorCode(api.auth.signIn({ email: 'brand@tandem.demo', password: DEMO_PASSWORD }))).toBe('rate_limited');
    expect(getDb().audit.some((a) => a.action === 'auth.lockout')).toBe(true);
  });

  it('expires and revokes sessions', async () => {
    const { token } = await api.auth.signIn({ email: 'brand@tandem.demo', password: DEMO_PASSWORD });
    const s = getDb().sessions.find((x) => x.token === token)!;
    s.expiresAt = new Date(Date.now() - 1000).toISOString();
    expect(await errorCode(() => api.auth.me({ token }))).toBe('unauthenticated');
    const second = await api.auth.signIn({ email: 'brand@tandem.demo', password: DEMO_PASSWORD });
    await api.auth.signOut(second);
    expect(await errorCode(() => api.auth.me(second))).toBe('unauthenticated');
  });

  it('password reset responds identically and revokes sessions', async () => {
    const a = await api.auth.requestPasswordReset('nobody@example.com');
    const b = await api.auth.requestPasswordReset('brand@tandem.demo');
    expect(a.status).toBe(b.status);
    const live = await api.auth.signIn({ email: 'brand@tandem.demo', password: DEMO_PASSWORD });
    await api.auth.resetPassword(b.demoResetToken, 'brand-new-pass-9');
    expect(await errorCode(() => api.auth.me(live))).toBe('unauthenticated');
    expect(await errorCode(api.auth.resetPassword(a.demoResetToken, 'another-pass-9'))).toBe('not_found');
  });

  it('blocks suspended accounts and admin-only actions', async () => {
    const admin = await api.auth.signIn({ email: 'admin@tandem.demo', password: DEMO_PASSWORD });
    const brand = await api.auth.signIn({ email: 'brand@tandem.demo', password: DEMO_PASSWORD });
    expect(await errorCode(api.admin.listUsers(brand))).toBe('forbidden');
    const seun = getDb().users.find((u) => u.email === 'seun@tandem.demo')!;
    await api.admin.setUserStatus(admin, seun.id, 'suspended', 'Repeated fake engagement reports');
    expect(await errorCode(api.auth.signIn({ email: 'seun@tandem.demo', password: DEMO_PASSWORD }))).toBe('suspended');
  });

  it('deletes an account and its personal data on request', async () => {
    const r = await api.auth.register({ name: 'Short Lived', email: 'gone@example.com', password: 'longpassword1', kind: 'creator' });
    const ctx = await api.auth.verifyEmail(r.demoVerifyToken);
    await api.orgs.onboardCreator(ctx, { displayName: 'Short Lived', handle: 'shortlived', country: 'Kenya', bio: '', categories: ['tech'], languages: ['English'], formats: ['short_video'] });
    expect(await errorCode(api.auth.deleteAccount(ctx, 'wrong@example.com'))).toBe('validation');
    await api.auth.deleteAccount(ctx, 'gone@example.com');
    expect(getDb().users.some((u) => u.email === 'gone@example.com')).toBe(false);
    expect(getDb().creators.some((c) => c.handle === 'shortlived')).toBe(false);
  });
});
