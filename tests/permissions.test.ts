import { describe, it, expect, beforeEach } from 'vitest';
import { api } from '../src/server/api';
import { getDb } from '../src/server/db';
import { fresh, login, errorCode, future } from './helpers';

describe('organisation isolation and roles', () => {
  beforeEach(fresh);

  it('a brand cannot read another brand’s campaigns, CRM, collections, budget or analytics', async () => {
    const sable = await login('sable@tandem.demo');
    expect(await errorCode(api.campaigns.getCampaign(sable, 'org_lumi', 'cmp_glow'))).toBe('not_found');
    expect(await errorCode(api.campaigns.getCampaign(sable, 'org_sable', 'cmp_glow'))).toBe('not_found');
    expect(await errorCode(api.crm.listCrm(sable, 'org_lumi'))).toBe('not_found');
    expect(await errorCode(api.crm.getCollection(sable, 'org_sable', 'coll_lumi'))).toBe('not_found');
    expect(await errorCode(api.money.budgetOverview(sable, 'org_lumi'))).toBe('not_found');
    expect(await errorCode(api.analytics.campaignAnalytics(sable, 'org_lumi', 'cmp_glow'))).toBe('not_found');
    expect(await errorCode(api.collaborations.orgCollaboration(sable, 'org_sable', 'col_glow_tomi'))).toBe('not_found');
    expect(await errorCode(api.ai.strategistContext(sable, 'org_lumi', 'cmp_glow'))).toBe('not_found');
    // Sable's own CRM never contains Lumi's notes
    const own = await api.crm.listCrm(sable, 'org_sable');
    expect(own.every((r) => r.record.orgId === 'org_sable')).toBe(true);
    expect(getDb().audit.some((a) => a.action === 'permission.denied' && a.actorEmail === 'sable@tandem.demo')).toBe(true);
  });

  it('a member can discover and take notes but not send offers, approve or record payments', async () => {
    const kemi = await login('kemi@tandem.demo');
    const page = await api.creators.discover(kemi, 'org_lumi', { categories: ['beauty'] });
    expect(page.items.length).toBeGreaterThan(0);
    await api.crm.addCrmNote(kemi, 'org_lumi', 'cr_tomi', 'Members can add notes.');
    const terms = { fee: 100000, currency: 'NGN' as const, deliverables: [{ id: 'x', platform: 'instagram' as const, format: 'short_video' as const, quantity: 1 }], deadline: future(20), usageRights: '', exclusivity: '', revisionLimit: 2 };
    expect(await errorCode(api.deals.sendInvitation(kemi, 'org_lumi', 'cmp_harmattan', 'cr_ife', { message: 'Hello there, we would love to work with you!', terms }))).toBe('forbidden');
    expect(await errorCode(api.collaborations.reviewSubmission(kemi, 'org_lumi', 'sub_t2', 'approved', ''))).toBe('forbidden');
    expect(await errorCode(api.money.updatePayment(kemi, 'org_lumi', 'pay_col_glow_tomi_base', 'pending'))).toBe('forbidden');
    expect(await errorCode(api.orgs.inviteMember(kemi, 'org_lumi', 'x@example.com', 'admin'))).toBe('forbidden');
  });

  it('agency staff reach every client workspace; client reviewers only their own, with limited rights', async () => {
    const dami = await login('dami@tandem.demo');
    expect((await api.campaigns.listCampaigns(dami, 'org_kora')).length).toBeGreaterThan(0);
    expect((await api.campaigns.listCampaigns(dami, 'org_velo')).length).toBeGreaterThan(0);
    expect(await errorCode(api.campaigns.listCampaigns(dami, 'org_lumi'))).toBe('not_found');

    const kwame = await login('client@tandem.demo');
    expect((await api.campaigns.listCampaigns(kwame, 'org_kora')).length).toBeGreaterThan(0);
    expect(await errorCode(api.campaigns.listCampaigns(kwame, 'org_velo'))).toBe('not_found');
    expect(await errorCode(api.campaigns.listCampaigns(kwame, 'org_northbeam'))).toBe('not_found');
    expect(await errorCode(api.creators.discover(kwame, 'org_kora', {}))).toBe('forbidden');
    expect(await errorCode(api.money.budgetOverview(kwame, 'org_kora'))).toBe('forbidden');
    const collab = await api.collaborations.orgCollaboration(kwame, 'org_kora', 'col_kora_ama');
    expect(collab.payments).toHaveLength(0);
    expect(collab.messages).toHaveLength(0);
    // Only shared collections are visible to the client; the agency database is not.
    const cols = await api.crm.listCollections(kwame, 'org_kora');
    expect(cols.map((c) => c.collection.id)).toEqual(['coll_kora']);
  });

  it('two-stage approval: agency cannot give client sign-off; the client can', async () => {
    const dami = await login('dami@tandem.demo');
    expect(await errorCode(api.collaborations.reviewSubmission(dami, 'org_kora', 'sub_a1', 'approved', 'ok'))).toBe('forbidden');
    const kwame = await login('client@tandem.demo');
    await api.collaborations.reviewSubmission(kwame, 'org_kora', 'sub_a1', 'approved', 'Looks delicious.');
    expect(getDb().deliverables.find((d) => d.id === 'col_kora_ama_d0')!.status).toBe('approved');
    // client reviewers can't act on the internal stage
    expect(await errorCode(api.collaborations.reviewSubmission(kwame, 'org_lumi', 'sub_t2', 'approved', ''))).toBe('not_found');
  });

  it('creators only see their own deals and never the brand’s full budget', async () => {
    const ife = await login('creator@tandem.demo');
    expect(await errorCode(api.collaborations.creatorCollaboration(ife, 'col_glow_tomi'))).toBe('not_found');
    expect(await errorCode(api.campaigns.listCampaigns(ife, 'org_lumi'))).toBe('not_found');
    expect(await errorCode(api.deals.creatorRespond(ife, 'ofr_h2', 'accept'))).toBe('not_found');
    const mine = await api.collaborations.creatorCollaboration(ife, 'col_velo_ife');
    expect('campaign' in mine).toBe(false);
    expect(JSON.stringify(mine.campaignView)).not.toContain('"budget"');
    expect(await errorCode(api.campaigns.campaignForCreator(ife, 'cmp_sable'))).toBe('not_found'); // invite-only, not involved
  });

  it('applies creator privacy choices on the server', async () => {
    const ada = await login('brand@tandem.demo');
    const hidden = getDb().creators.find((c) => c.sample && !c.visibility.showRates)!;
    const { creator } = await api.creators.getCreatorForOrg(ada, 'org_lumi', hidden.id);
    expect(creator.rates).toBeNull();
    expect('userId' in creator).toBe(false);
    const unlisted = getDb().creators.find((c) => !c.visibility.listed)!;
    const all = await api.creators.discover(ada, 'org_lumi', { pageSize: 48, page: 1 });
    const pages = Array.from({ length: all.pages }, (_, i) => i + 1);
    const ids = new Set<string>();
    for (const p of pages) (await api.creators.discover(ada, 'org_lumi', { pageSize: 48, page: p })).items.forEach((c) => ids.add(c.id));
    expect(ids.has(unlisted.id)).toBe(false);
    expect(await errorCode(api.creators.getCreatorForOrg(ada, 'org_lumi', unlisted.id))).toBe('not_found');
  });

  it('plan limits gate premium features', async () => {
    const sable = await login('sable@tandem.demo'); // Starter plan
    expect(await errorCode(api.ai.matchForCampaign(sable, 'org_sable', 'cmp_sable'))).toBe('plan_limit');
    expect(await errorCode(api.analytics.campaignAnalytics(sable, 'org_sable', 'cmp_sable'))).toBe('plan_limit');
  });

  it('private files are only readable by their owners and the collaborating org', async () => {
    const ife = await login('creator@tandem.demo');
    // Ife has an active-looking deliverable? Use a fresh portfolio upload instead (public), then a private file.
    const f = await api.creators.storeFile(ife, { name: 'draft.jpg', type: 'image/jpeg', size: 1000, dataUrl: 'data:image/jpeg;base64,AAAA' }, { orgId: 'org_velo', creatorId: 'cr_ife', visibility: 'private' });
    const sable = await login('sable@tandem.demo');
    expect(await errorCode(() => api.creators.readFile(sable, f.id))).toBe('forbidden');
    const zainab = await login('agency@tandem.demo');
    expect(api.creators.readFile(zainab, f.id).id).toBe(f.id);
  });
});
