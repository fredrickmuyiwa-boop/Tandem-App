import { describe, it, expect, beforeEach } from 'vitest';
import { api } from '../src/server/api';
import { getDb } from '../src/server/db';
import { fresh, login, errorCode, future } from './helpers';
import type { CampaignInput } from '../src/server/services/campaigns';

const brief = (): CampaignInput => ({
  name: 'Lumi Night Repair — Lagos', description: 'Introduce Night Repair cream to women in Lagos with honest evening-routine content.', productId: 'prd_glow',
  objective: 'launch', audience: { genders: ['female'], ageMin: 20, ageMax: 35, interests: [] }, locations: ['Nigeria'], languages: ['English'],
  platforms: ['instagram', 'tiktok'], categories: ['beauty'], budget: 2_000_000, currency: 'NGN', startDate: future(5), endDate: future(35),
  deliverables: [{ id: 'dx', platform: 'instagram', format: 'short_video', quantity: 1, notes: 'Evening routine Reel' }], requirements: 'Disclose the partnership.', guidelines: 'No medical claims.',
  approval: { internal: true, client: false }, compensationModel: 'fixed_plus_bonus', performanceTargets: '1,000 link clicks', visibility: 'public',
});

describe('end-to-end campaign workflow', () => {
  beforeEach(fresh);

  it('brand → match → invite → counteroffer → collaboration → submit → revise → approve → pay → results', async () => {
    const ada = await login('brand@tandem.demo');
    const ife = await login('creator@tandem.demo');

    const c = await api.campaigns.createCampaign(ada, 'org_lumi', brief());
    expect(c.status).toBe('draft');
    expect(await errorCode(api.deals.sendInvitation(ada, 'org_lumi', c.id, 'cr_ife', { message: 'x'.repeat(30), terms: { fee: 1, currency: 'NGN', deliverables: c.deliverables, deadline: future(20), usageRights: '', exclusivity: '', revisionLimit: 2 } }))).toBe('conflict');
    await api.campaigns.transitionCampaign(ada, 'org_lumi', c.id, 'recruiting');
    expect(await errorCode(api.campaigns.updateCampaign(ada, 'org_lumi', c.id, { budget: 9_000_000 }))).toBe('conflict'); // commercial terms locked

    const matches = await api.ai.matchForCampaign(ada, 'org_lumi', c.id, { limit: 10 });
    const ifeMatch = matches.find((m) => m.creator.id === 'cr_ife');
    expect(ifeMatch).toBeTruthy();
    expect(ifeMatch!.match.factors.length).toBe(7);
    expect(ifeMatch!.match.reasons.length).toBeGreaterThan(0);

    const terms = { fee: 400_000, currency: 'NGN' as const, bonus: { amount: 50_000, condition: '2% engagement on the Reel' }, deliverables: c.deliverables, deadline: future(25), usageRights: 'Organic, 6 months', exclusivity: 'None', revisionLimit: 1 };
    // Budget guard
    expect(await errorCode(api.deals.sendInvitation(ada, 'org_lumi', c.id, 'cr_ife', { message: 'We would love to work with you on this launch!', terms: { ...terms, fee: 5_000_000 } }))).toBe('conflict');
    await api.deals.sendInvitation(ada, 'org_lumi', c.id, 'cr_ife', { message: 'We would love to work with you on this launch!', terms });
    expect(getDb().notifications.some((n) => n.userId === 'usr_ife' && n.type === 'invitation')).toBe(true);

    // Creator counters
    const thread = await api.deals.creatorThread(ife, c.id);
    const open = thread.offers.find((o) => o.status === 'open')!;
    await api.deals.creatorRespond(ife, open.id, 'clarify', { message: 'Can I film at night?' });
    await api.deals.creatorRespond(ife, open.id, 'counter', { terms: { ...terms, fee: 450_000 }, message: 'Could we do ₦450k?' });
    expect(await errorCode(api.deals.creatorRespond(ife, open.id, 'accept'))).toBe('conflict'); // superseded

    // Brand accepts counter → collaboration
    const counter = (await api.deals.orgThread(ada, 'org_lumi', c.id, 'cr_ife')).offers.find((o) => o.status === 'open' && o.from === 'creator')!;
    const { collaborationId } = await api.deals.orgRespond(ada, 'org_lumi', counter.id, 'accept') as { collaborationId: string };
    const collab = await api.collaborations.creatorCollaboration(ife, collaborationId);
    expect(collab.collab.terms.fee).toBe(450_000);
    expect(collab.deliverables).toHaveLength(1);
    expect(collab.payments.map((p) => p.kind).sort()).toEqual(['base', 'bonus']);
    expect(getDb().crm.find((r) => r.orgId === 'org_lumi' && r.creatorId === 'cr_ife')!.status).toBe('active');

    // Submit → revision → resubmit → approve
    const del = collab.deliverables[0];
    expect(await errorCode(api.collaborations.submitContent(ife, del.id, { caption: '', links: ['javascript:alert(1)'], note: '', files: [] }))).toBe('validation');
    expect(await errorCode(api.collaborations.submitContent(ife, del.id, { caption: 'x', links: [], note: '', files: [{ name: 'evil.exe', type: 'application/x-msdownload', size: 10 }] }))).toBe('validation');
    await api.collaborations.submitContent(ife, del.id, { caption: 'My evening routine with Night Repair #ad', links: ['https://example.com/draft'], note: '', files: [{ name: 'cover.jpg', type: 'image/jpeg', size: 1200, dataUrl: 'data:image/jpeg;base64,AAAA' }] });
    const s1 = getDb().submissions.filter((s) => s.deliverableId === del.id)[0];
    expect(await errorCode(api.collaborations.reviewSubmission(ada, 'org_lumi', s1.id, 'revision_requested', 'short'))).toBe('validation');
    await api.collaborations.reviewSubmission(ada, 'org_lumi', s1.id, 'revision_requested', 'Please show the product label clearly in the first seconds.');
    await api.collaborations.submitContent(ife, del.id, { caption: 'Updated #ad', links: ['https://example.com/draft-v2'], note: 'Label is now visible.', files: [] });
    const s2 = getDb().submissions.filter((s) => s.deliverableId === del.id).find((s) => s.version === 2)!;
    // revision limit 1 reached
    expect(await errorCode(api.collaborations.reviewSubmission(ada, 'org_lumi', s2.id, 'revision_requested', 'One more change please, sorry.'))).toBe('conflict');
    await api.collaborations.reviewSubmission(ada, 'org_lumi', s2.id, 'approved', 'Perfect.');
    const after = await api.collaborations.orgCollaboration(ada, 'org_lumi', collaborationId);
    expect(after.deliverables[0].status).toBe('approved');
    const base = after.payments.find((p) => p.kind === 'base')!;
    expect(base.status).toBe('pending');

    // Payment tracking
    expect(await errorCode(api.money.updatePayment(ada, 'org_lumi', base.id, 'paid'))).toBe('validation');
    await api.money.updatePayment(ada, 'org_lumi', base.id, 'paid', 'GTB-778812');
    const earnings = await api.money.creatorEarnings(ife);
    expect(earnings.totals.NGN!.paid).toBe(450_000);

    // Results + analytics with sources
    await api.campaigns.transitionCampaign(ada, 'org_lumi', c.id, 'active');
    await api.analytics.addResult(ada, 'org_lumi', { campaignId: c.id, creatorId: 'cr_ife', date: future(0), platform: 'instagram', reach: 12000, impressions: 15000, engagements: 600, clicks: 120, conversions: 9 });
    expect(await errorCode(api.analytics.addResult(ada, 'org_lumi', { campaignId: c.id, creatorId: 'cr_tomi', date: future(0), platform: 'instagram', reach: 1, impressions: 1, engagements: 1, clicks: 1, conversions: 1 }))).toBe('validation');
    const a = await api.analytics.campaignAnalytics(ada, 'org_lumi', c.id);
    expect(a.totals.engagements).toBe(600);
    expect(a.derived.engagementRate).toBe(4);
    expect(a.sources).toEqual(['manual']);

    // Budget reflects commitments and fees
    const b = await api.money.getCampaignBudget(ada, 'org_lumi', c.id);
    expect(b.committed).toBe(500_000);
    expect(b.platformFee).toBe(40_000);
    expect(b.remaining).toBe(2_000_000 - 500_000 - 40_000);

    await api.campaigns.transitionCampaign(ada, 'org_lumi', c.id, 'completed');
    expect(getDb().collaborations.find((k) => k.id === collaborationId)!.status).toBe('completed');
  });

  it('application path: creator applies, brand shortlists and offers, creator accepts', async () => {
    const ada = await login('brand@tandem.demo');
    const ife = await login('creator@tandem.demo');
    const market = await api.campaigns.marketplace(ife);
    expect(market.some((m) => m.campaign.id === 'cmp_harmattan')).toBe(true);
    expect(market.some((m) => m.campaign.id === 'cmp_sable')).toBe(false); // invite-only
    expect(JSON.stringify(market)).not.toContain('"budget"');
    await api.deals.applyToCampaign(ife, 'cmp_harmattan', { pitch: 'Harmattan wrecks my skin every year and my audience asks me about it daily.', proposedFee: 320_000 });
    expect(await errorCode(api.deals.applyToCampaign(ife, 'cmp_harmattan', { pitch: 'Again '.repeat(10), proposedFee: 1 }))).toBe('conflict');
    const app = getDb().applications.find((a) => a.creatorId === 'cr_ife' && a.campaignId === 'cmp_harmattan')!;
    await api.deals.reviewApplication(ada, 'org_lumi', app.id, 'shortlisted');
    const c = getDb().campaigns.find((x) => x.id === 'cmp_harmattan')!;
    await api.deals.makeOffer(ada, 'org_lumi', c.id, 'cr_ife', { terms: { fee: 300_000, currency: 'NGN', deliverables: c.deliverables, deadline: future(40), usageRights: '', exclusivity: '', revisionLimit: 2 }, message: 'Happy to go ahead at ₦300k.' });
    const offer = getDb().offers.find((o) => o.creatorId === 'cr_ife' && o.campaignId === c.id && o.status === 'open')!;
    const r = await api.deals.creatorRespond(ife, offer.id, 'accept') as { collaborationId: string };
    expect(r.collaborationId).toBeTruthy();
    expect(getDb().deliverables.filter((d) => d.collaborationId === r.collaborationId)).toHaveLength(4); // 1 reel + 3 stories
  });

  it('respects campaign lifecycle rules', async () => {
    const ada = await login('brand@tandem.demo');
    expect(await errorCode(api.campaigns.transitionCampaign(ada, 'org_lumi', 'cmp_glow', 'draft'))).toBe('conflict');
    expect(await errorCode(api.campaigns.transitionCampaign(ada, 'org_lumi', 'cmp_glow', 'completed'))).toBe('conflict'); // unapproved deliverables
    await api.campaigns.transitionCampaign(ada, 'org_lumi', 'cmp_glow', 'paused');
    await api.campaigns.updateCampaign(ada, 'org_lumi', 'cmp_glow', { guidelines: 'Updated guidance for creators.' });
    expect(await errorCode(api.campaigns.updateCampaign(ada, 'org_lumi', 'cmp_glow', { name: 'Renamed' }))).toBe('conflict');
    const bad = brief();
    bad.endDate = future(1); bad.startDate = future(10);
    expect(await errorCode(api.campaigns.createCampaign(ada, 'org_lumi', bad))).toBe('validation');
  });

  it('agency creates a client workspace and runs a campaign in it', async () => {
    const zainab = await login('agency@tandem.demo');
    const client = await api.orgs.createClient(zainab, 'org_northbeam', { name: 'Savanna Coffee', country: 'Kenya', industry: 'Food & beverage' });
    const c = await api.campaigns.createCampaign(zainab, client.id, { ...brief(), name: 'Savanna morning ritual', currency: 'KES', budget: 400_000, locations: ['Kenya'], categories: ['food'] }, { publish: true });
    expect(c.status).toBe('recruiting');
    const portfolio = await api.analytics.portfolioAnalytics(zainab, 'org_northbeam');
    expect(portfolio.some((p) => p.org.id === client.id)).toBe(true);
    const sable = await login('sable@tandem.demo');
    expect(await errorCode(api.campaigns.getCampaign(sable, client.id, c.id))).toBe('not_found');
  });
});
