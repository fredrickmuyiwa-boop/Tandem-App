// Live mode against real Postgres + the Supabase migrations.
// Run: LIVE_TEST_DATABASE_URL=postgresql://postgres@localhost:5432/postgres npm run test:live
import './live-flag';
import { describe, it, expect, beforeAll } from 'vitest';
import { api } from '../../src/server/api';
import { getDb } from '../../src/server/db';
import { startLive } from '../../src/server/remote/live';
import { setAuthProvider } from '../../src/server/remote/liveApi';
import { DEMO_PASSWORD } from '../../src/data/seed';
import { AppError } from '../../src/server/errors';
import type { Terms } from '../../src/domain/types';
import { authProvider, idMap, setupDatabase, sqlAsOwner, storageBackend, transport, actAs, PgError } from './harness';
import { setStorageBackend } from '../../src/server/services/storage';

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const login = async (email: string) => ({ token: (await api.auth.signIn({ email, password: DEMO_PASSWORD })).token });
async function errorCode(p: Promise<unknown>) {
  try { await p; return null; } catch (e) { return e instanceof AppError ? e.code : `non-app:${(e as Error).message}`; }
}
/** Call apply_changes directly as a user, bypassing the app (what an attacker with a valid session could do). */
const SEED_USER: Record<string, string> = { 'brand@tandem.demo': 'usr_ada', 'creator@tandem.demo': 'usr_ife', 'sable@tandem.demo': 'usr_oliver', 'client@tandem.demo': 'usr_kwame' };
async function raw(userEmail: string, changes: unknown[]) {
  const id = idMap.get(SEED_USER[userEmail]) ?? '';
  if (!id) throw new Error(`no seed user for ${userEmail}`);
  try { await transport.apply(changes as never, id); return 'ok'; } catch (e) { return (e as PgError).code; }
}
const one = (sql: string) => sqlAsOwner(sql);

describe('live mode (Supabase schema, RLS, replica sync)', () => {
  beforeAll(async () => {
    await setupDatabase();
    setAuthProvider(authProvider);
    startLive(transport);
    setStorageBackend(storageBackend);
  });

  it('signs in and sees only what RLS allows', async () => {
    expect(await errorCode(api.auth.signIn({ email: 'brand@tandem.demo', password: 'wrong-password-1' }))).toBe('unauthenticated');
    const ada = await login('brand@tandem.demo');
    const me = api.auth.me(ada);
    expect(me.user.email).toBe('brand@tandem.demo');
    expect(me.orgs.map((o) => o.id)).toEqual(['org_lumi']);
    const d = getDb();
    expect(d.campaigns.filter((c) => c.orgId !== 'org_lumi')).toHaveLength(0);       // no other brands' campaigns
    expect(d.payments.every((p) => p.orgId === 'org_lumi')).toBe(true);
    const ife = d.creators.find((c) => c.id === 'cr_ife')!;
    expect(ife.userId).toBe('claimed');                                               // real user id hidden
    expect(d.users.every((u) => !('passwordHash' in u) || u.passwordHash === '')).toBe(true);

    const kwame = await login('client@tandem.demo');
    const dk = getDb();
    expect(api.auth.me(kwame).orgs.map((o) => o.id)).toEqual(['org_kora']);
    expect(dk.payments).toHaveLength(0);                                              // client reviewers: no money
    expect(dk.offers).toHaveLength(0);
    expect(dk.campaigns.every((c) => c.orgId === 'org_kora')).toBe(true);

    const zainab = await login('agency@tandem.demo');
    expect(api.auth.me(zainab).orgs.map((o) => o.id).sort()).toEqual(['org_kora', 'org_northbeam', 'org_velo']); // agency inherits clients
  });

  it('runs the full campaign workflow across brand and creator', async () => {
    const ada = await login('brand@tandem.demo');
    const c = await api.campaigns.createCampaign(ada, 'org_lumi', {
      name: 'Lumi Night Repair — Lagos', description: 'Introduce Night Repair cream with honest evening-routine content.', productId: 'prd_glow',
      objective: 'launch', audience: { genders: ['female'], ageMin: 20, ageMax: 35, interests: [] }, locations: ['Nigeria'], languages: ['English'],
      platforms: ['instagram'], categories: ['beauty'], budget: 2_000_000, currency: 'NGN', startDate: future(5), endDate: future(35),
      deliverables: [{ id: 'dx', platform: 'instagram', format: 'short_video', quantity: 1, notes: 'Evening routine Reel' }], requirements: 'Disclose the partnership.', guidelines: 'No medical claims.',
      approval: { internal: true, client: false }, compensationModel: 'fixed_plus_bonus', performanceTargets: '1,000 link clicks', visibility: 'public',
    });
    expect(one(`select status from campaigns where id = '${c.id}'`)).toBe('draft');
    await api.campaigns.transitionCampaign(ada, 'org_lumi', c.id, 'recruiting');
    expect(await errorCode(api.campaigns.updateCampaign(ada, 'org_lumi', c.id, { budget: 9_000_000 }))).toBe('conflict');

    const matches = await api.ai.matchForCampaign(ada, 'org_lumi', c.id, { limit: 20 });
    expect(matches.some((m) => m.creator.id === 'cr_ife')).toBe(true);

    const terms: Terms = { fee: 400_000, currency: 'NGN', bonus: { amount: 50_000, condition: '2% engagement on the Reel' }, deliverables: c.deliverables, deadline: future(25), usageRights: 'Organic, 6 months', exclusivity: 'None', revisionLimit: 1 };
    await api.deals.sendInvitation(ada, 'org_lumi', c.id, 'cr_ife', { message: 'We would love to work with you on this launch!', terms });
    const ifeUser = idMap.get('usr_ife')!;
    expect(Number(one(`select count(*) from notifications where user_id = '${ifeUser}' and type = 'invitation'`))).toBeGreaterThan(0); // delivered server-side

    // Creator: sees the campaign without its budget, counters.
    const ife = await login('creator@tandem.demo');
    const view = getDb().campaigns.find((x) => x.id === c.id)!;
    expect(view.budget ?? null).toBeNull();
    const thread = await api.deals.creatorThread(ife, c.id);
    const open = thread.offers.find((o) => o.status === 'open')!;
    await api.deals.creatorRespond(ife, open.id, 'counter', { terms: { ...terms, fee: 450_000 }, message: 'Could we do ₦450k?' });
    expect(one(`select status from offers where id = '${open.id}'`)).toBe('superseded');
    const adaUser = idMap.get('usr_ada')!;
    expect(Number(one(`select count(*) from notifications where user_id = '${adaUser}' and title like '%counteroffer%'`))).toBeGreaterThan(0);

    // A creator can't accept their own counteroffer, even calling the API directly.
    const counterId = one(`select id from offers where campaign_id = '${c.id}' and status = 'open'`);
    expect(await raw('creator@tandem.demo', [{ op: 'update', table: 'offers', id: counterId, row: { status: 'accepted' } }])).toBe('42501');

    // Brand accepts → collaboration, deliverables, payments, CRM.
    const { collaborationId } = await api.deals.orgRespond(ada, 'org_lumi', counterId, 'accept') as { collaborationId: string };
    expect(one(`select terms->>'fee' from collaborations where id = '${collaborationId}'`)).toBe('450000');
    expect(one(`select count(*) from deliverables where collaboration_id = '${collaborationId}'`)).toBe('1');
    expect(one(`select string_agg(kind, ',' order by kind) from payments where collaboration_id = '${collaborationId}'`)).toBe('base,bonus');
    expect(one(`select status from crm_records where org_id = 'org_lumi' and creator_id = 'cr_ife'`)).toBe('active');

    // Creator submits; brand requests a revision; creator resubmits; brand approves.
    const ife2 = await login('creator@tandem.demo');
    const collab = await api.collaborations.creatorCollaboration(ife2, collaborationId);
    const del = collab.deliverables[0];
    await api.collaborations.submitContent(ife2, del.id, { caption: 'My evening routine with Night Repair #ad', links: ['https://example.com/draft'], note: '', files: [{ name: 'cover.jpg', type: 'image/jpeg', size: 1200, dataUrl: 'data:image/jpeg;base64,AAAA' }] });
    expect(one(`select status from deliverables where id = '${del.id}'`)).toBe('in_review');
    // …but can't approve it themselves.
    expect(await raw('creator@tandem.demo', [{ op: 'update', table: 'deliverables', id: del.id, row: { status: 'approved' } }])).toBe('42501');

    await login('brand@tandem.demo');
    const s1 = one(`select id from submissions where deliverable_id = '${del.id}' and version = 1`);
    await api.collaborations.reviewSubmission(ada, 'org_lumi', s1, 'revision_requested', 'Please show the product label clearly in the first seconds.');
    expect(one(`select status from deliverables where id = '${del.id}'`)).toBe('revision_requested');
    await api.collaborations.submitContent(ife2, del.id, { caption: 'Updated #ad', links: ['https://example.com/draft-v2'], note: 'Label is now visible.', files: [] });
    const s2 = one(`select id from submissions where deliverable_id = '${del.id}' and version = 2`);
    await api.collaborations.reviewSubmission(ada, 'org_lumi', s2, 'approved', 'Perfect.');
    expect(one(`select status from deliverables where id = '${del.id}'`)).toBe('approved');

    // Payment tracking; creator can't mark it paid.
    const base = one(`select id from payments where collaboration_id = '${collaborationId}' and kind = 'base'`);
    expect(await raw('creator@tandem.demo', [{ op: 'update', table: 'payments', id: base, row: { status: 'paid' } }])).toBe('42501');
    await api.money.updatePayment(ada, 'org_lumi', base, 'paid', 'GTB-778812');
    expect(one(`select status || ' ' || reference from payments where id = '${base}'`)).toBe('paid GTB-778812');
    const earnings = await api.money.creatorEarnings(ife2);
    expect(earnings.totals.NGN!.paid).toBe(450_000);

    // Results and completion.
    await api.campaigns.transitionCampaign(ada, 'org_lumi', c.id, 'active');
    await api.analytics.addResult(ada, 'org_lumi', { campaignId: c.id, creatorId: 'cr_ife', date: future(0), platform: 'instagram', reach: 12000, impressions: 15000, engagements: 600, clicks: 120, conversions: 9 });
    const a = await api.analytics.campaignAnalytics(ada, 'org_lumi', c.id);
    expect(a.totals.engagements).toBe(600);
    await api.campaigns.transitionCampaign(ada, 'org_lumi', c.id, 'completed');
    expect(one(`select status from collaborations where id = '${collaborationId}'`)).toBe('completed');
    expect(Number(one(`select count(*) from audit_log where actor_id = '${adaUser}'`))).toBeGreaterThan(0);
  });

  it('application path: creator applies, brand shortlists and offers, creator accepts', async () => {
    const ife = await login('creator@tandem.demo');
    const market = await api.campaigns.marketplace(ife);
    expect(market.some((m) => m.campaign.id === 'cmp_harmattan')).toBe(true);
    expect(JSON.stringify(market)).not.toContain('"budget"');
    await api.deals.applyToCampaign(ife, 'cmp_harmattan', { pitch: 'Harmattan wrecks my skin every year and my audience asks me about it daily.', proposedFee: 320_000 });
    const appId = one(`select id from applications where creator_id = 'cr_ife' and campaign_id = 'cmp_harmattan' and status = 'submitted'`);
    expect(appId).toBeTruthy();

    const ada = await login('brand@tandem.demo');
    await api.deals.reviewApplication(ada, 'org_lumi', appId, 'shortlisted');
    const c = getDb().campaigns.find((x) => x.id === 'cmp_harmattan')!;
    await api.deals.makeOffer(ada, 'org_lumi', c.id, 'cr_ife', { terms: { fee: 300_000, currency: 'NGN', deliverables: c.deliverables, deadline: future(40), usageRights: '', exclusivity: '', revisionLimit: 2 }, message: 'Happy to go ahead at ₦300k.' });
    const offerId = one(`select id from offers where creator_id = 'cr_ife' and campaign_id = 'cmp_harmattan' and status = 'open'`);

    const ife2 = await login('creator@tandem.demo');
    const r = await api.deals.creatorRespond(ife2, offerId, 'accept') as { collaborationId: string };
    expect(one(`select count(*) from deliverables where collaboration_id = '${r.collaborationId}'`)).toBe('4');
    expect(one(`select count(*) from payments where collaboration_id = '${r.collaborationId}'`)).toBe('1');
    expect(one(`select status from crm_records where org_id = 'org_lumi' and creator_id = 'cr_ife'`)).toBe('active'); // set by trigger
  });

  it('blocks forged writes that skip the app', async () => {
    const ife = idMap.get('usr_ife')!;
    actAs(ife);
    // Fabricate a collaboration without an accepted offer.
    const anyOffer = one(`select id from offers where creator_id = 'cr_ife' and status = 'superseded' limit 1`);
    expect(await raw('creator@tandem.demo', [{ op: 'insert', table: 'collaborations', id: 'col_fake', row: { id: 'col_fake', campaign_id: 'cmp_harmattan', org_id: 'org_lumi', creator_id: 'cr_ife', offer_id: anyOffer, terms: { fee: 9_999_999 } } }])).toBe('23514');
    // Add a payment to an existing collaboration.
    const [collab, cOrg, cCamp] = one(`select id || '|' || org_id || '|' || campaign_id from collaborations where creator_id = 'cr_ife' and status = 'active' limit 1`).split('|');
    expect(await raw('creator@tandem.demo', [{ op: 'insert', table: 'payments', id: 'pay_fake', row: { id: 'pay_fake', org_id: cOrg, campaign_id: cCamp, collaboration_id: collab, creator_id: 'cr_ife', label: 'Bonus', kind: 'bonus', amount: 1, currency: 'NGN', due_date: future(3) } }])).toBe('42501');
    // Mark themselves verified, or label figures verified.
    expect(await raw('creator@tandem.demo', [{ op: 'update', table: 'creator_profiles', id: 'cr_ife', row: { identity_verification: 'verified' } }])).toBe('42501');
    expect(await raw('creator@tandem.demo', [{ op: 'update', table: 'creator_profiles', id: 'cr_ife', row: { socials: [{ id: 'x', platform: 'instagram', handle: 'ifeglows', followers: 9_000_000, engagementRate: 9, source: 'verified', updatedAt: '2026-01-01' }] } }])).toBe('42501');
    // Edit another brand's campaign / read it via an update.
    expect(await raw('sable@tandem.demo', [{ op: 'update', table: 'campaigns', id: 'cmp_glow', row: { name: 'Hijacked' } }])).toBe('42501');
    // Upgrade own plan for free.
    expect(await raw('brand@tandem.demo', [{ op: 'update', table: 'organizations', id: 'org_lumi', row: { plan_id: 'brand_enterprise' } }])).toBe('23514');
    // Make yourself an admin.
    expect(await raw('brand@tandem.demo', [{ op: 'update', table: 'profiles', id: idMap.get('usr_ada')!, row: { platform_role: 'admin' } }])).toBe('42501');
    // Spoof the audit log.
    expect(await raw('brand@tandem.demo', [{ op: 'insert', table: 'audit_log', id: 'aud_x', row: { action: 'fake', actor_email: 'admin@tandem.demo' } }])).toBe('ok');
    expect(one(`select actor_email from audit_log where action = 'fake'`)).toBe('brand@tandem.demo');  // actor is always the caller
    // Notify a stranger.
    const oliver = idMap.get('usr_oliver')!;
    expect(await raw('creator@tandem.demo', [{ op: 'insert', table: 'notifications', id: 'ntf_x', row: { user_id: oliver, type: 'system', title: 'Phish', body: 'click', link: '/x' } }])).toBe('ok');
    expect(one(`select count(*) from notifications where user_id = '${oliver}' and title = 'Phish'`)).toBe('0');
    // Batches are atomic: a bad change rolls back the good one before it.
    expect(await raw('brand@tandem.demo', [
      { op: 'update', table: 'campaigns', id: 'cmp_glow', row: { guidelines: 'should roll back' } },
      { op: 'update', table: 'campaigns', id: 'cmp_sable', row: { name: 'nope' } },
    ])).toBe('42501');
    expect(one(`select guidelines from campaigns where id = 'cmp_glow'`)).not.toBe('should roll back');
  });

  it('rejected writes roll the replica back and surface the reason', async () => {
    const ada = await login('brand@tandem.demo');
    expect(await errorCode(api.orgs.changePlan(ada, 'org_lumi', 'brand_starter'))).toBe('conflict');
    expect(getDb().organizations.find((o) => o.id === 'org_lumi')!.planId).toBe('brand_growth');   // reloaded from server
  });

  it('onboards a new brand and a new creator', async () => {
    await api.auth.register({ name: 'Bola Ade', email: 'bola@newbrand.test', password: 'Strong-pass-123', kind: 'brand' });
    const bola = await login2('bola@newbrand.test', 'Strong-pass-123');
    const org = await api.orgs.onboardOrganization(bola, { name: 'Bola Beverages', country: 'Nigeria', industry: 'Food & beverage' });
    expect(one(`select role from memberships where org_id = '${org.id}'`)).toBe('owner');
    expect(one(`select plan_id from organizations where id = '${org.id}'`)).toBe('brand_growth');
    expect(api.auth.me(bola).orgs[0].id).toBe(org.id);
    // A second "owner" can't join someone else's new workspace.
    expect(await raw('sable@tandem.demo', [{ op: 'insert', table: 'memberships', id: 'mem_x', row: { id: 'mem_x', org_id: org.id, user_id: idMap.get('usr_oliver'), role: 'owner' } }])).toBe('42501');

    await api.auth.register({ name: 'Tolu', email: 'tolu@creator.test', password: 'Strong-pass-123', kind: 'creator' });
    const tolu = await login2('tolu@creator.test', 'Strong-pass-123');
    const profile = await api.orgs.onboardCreator(tolu, { displayName: 'Tolu Creates', handle: 'tolucreates', country: 'Nigeria', bio: 'Food and street style in Lagos.', categories: ['food'], languages: ['English'], formats: ['short_video'] });
    expect(one(`select sample::text || identity_verification from creator_profiles where id = '${profile.id}'`)).toBe('falseunverified');
    // A creator account can't create a brand workspace.
    expect(await errorCode(api.orgs.onboardOrganization(tolu, { name: 'Sneaky', country: 'Nigeria' }))).toBe('forbidden');
  });

  it('uploads draft video to storage and shares it only with the brand', async () => {
    // The collaboration agreed in the application-path scenario above.
    const ada = await login('brand@tandem.demo');
    const collabId = one(`select id from collaborations where campaign_id = 'cmp_harmattan' and creator_id = 'cr_ife' and status = 'active' limit 1`);
    const ife = await login('creator@tandem.demo');
    const del = (await api.collaborations.creatorCollaboration(ife, collabId)).deliverables.find((d) => ['not_started', 'revision_requested'].includes(d.status))!;
    const video = new Blob([new Uint8Array(2048)], { type: 'video/mp4' });
    const progress: number[] = [];
    const uploaded = await api.storage.uploadSubmissionFiles(ife, collabId, [{ name: 'Glow Reel draft (v1).mp4', type: 'video/mp4', size: video.size, file: video }], (f) => progress.push(f));
    expect(uploaded[0].storagePath).toMatch(new RegExp(`^${collabId}/[a-z0-9]+-Glow Reel draft \\(v1\\)\\.mp4$`));
    expect(progress.at(-1)).toBe(1);
    await api.collaborations.submitContent(ife, del.id, { caption: 'Draft for review #ad', links: [], note: '', files: uploaded });
    const path = uploaded[0].storagePath!;
    expect(one(`select storage_path from files where storage_path = ${"'"}${path}${"'"}`)).toBe(path);
    // The brand can open it…
    await login('brand@tandem.demo');
    const view = await api.collaborations.orgCollaboration(ada, 'org_lumi', collabId);
    const file = view.submissions.flatMap((x) => x.files).find((f) => f.storagePath === path)!;
    expect(await api.storage.signedUrl(ada, file.storagePath!)).toContain('signed');
    // …another brand can't, and a creator can't upload into someone else's collaboration.
    const oliver = await login('sable@tandem.demo');
    expect(await errorCode(api.storage.signedUrl(oliver, path))).toBe('forbidden');
    const otherCollab = one(`select id from collaborations where creator_id <> 'cr_ife' and status = 'active' limit 1`);
    const ife2 = await login('creator@tandem.demo');
    getDb().collaborations.push({ ...getDb().collaborations[0], id: otherCollab, status: 'active' }); // pretend the app thinks it's ours
    expect(await errorCode(api.storage.uploadSubmissionFiles(ife2, otherCollab, [{ name: 'x.mp4', type: 'video/mp4', size: 10, file: new Blob([new Uint8Array(10)]) }]))).toBe('forbidden');
  });

  it('deletes an account', async () => {
    await api.auth.register({ name: 'Temp', email: 'temp@x.test', password: 'Strong-pass-123', kind: 'brand' });
    const t = await login2('temp@x.test', 'Strong-pass-123');
    await api.orgs.onboardOrganization(t, { name: 'Temp Co', country: 'Nigeria' });
    await api.auth.deleteAccount(t, 'temp@x.test');
    expect(one(`select count(*) from auth.users where email = 'temp@x.test'`)).toBe('0');
    expect(one(`select count(*) from organizations where name = 'Temp Co'`)).toBe('0');
  });
});

async function login2(email: string, password: string) {
  return { token: (await api.auth.signIn({ email, password })).token };
}
