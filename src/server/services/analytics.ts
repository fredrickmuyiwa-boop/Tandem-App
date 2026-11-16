import type { DataSource, Platform, ResultEntry } from '../../domain/types';
import { getDb, mutate } from '../db';
import { AppError, notFound } from '../errors';
import { latency } from '../config';
import { requireOrg, type Ctx } from '../access';
import { cleanLine } from '../../lib/sanitize';
import { nowIso, sum, uid } from '../../lib/utils';
import { assertFeature } from './orgs';
import { logActivity } from './campaigns';
import { PLATFORMS } from '../../domain/constants';

export interface ResultInput { campaignId: string; creatorId: string; date: string; platform: Platform; reach: number | null; impressions: number | null; engagements: number | null; clicks: number | null; conversions: number | null; note?: string }

function validateResult(r: ResultInput) {
  const nums = [r.reach, r.impressions, r.engagements, r.clicks, r.conversions];
  if (nums.every((n) => n == null)) throw new AppError('validation', 'Enter at least one metric.');
  if (nums.some((n) => n != null && (!(n >= 0) || n > 1e10 || !Number.isFinite(n)))) throw new AppError('validation', 'Metrics must be zero or positive whole numbers.');
  if (Number.isNaN(Date.parse(r.date))) throw new AppError('validation', 'Choose the date these results are for.', { date: 'Choose a date.' });
  if (new Date(r.date).getTime() > Date.now() + 86_400_000) throw new AppError('validation', 'Results can’t be in the future.', { date: 'Results can’t be in the future.' });
  if (!PLATFORMS.some((p) => p.id === r.platform)) throw new AppError('validation', 'Choose a platform.');
  if (r.engagements != null && r.impressions != null && r.engagements > r.impressions) throw new AppError('validation', 'Engagements can’t be higher than impressions.');
}

function orgFeature(orgId: string) {
  const d = getDb();
  const org = d.organizations.find((o) => o.id === orgId)!;
  const parent = org.parentOrgId ? d.organizations.find((o) => o.id === org.parentOrgId) : undefined;
  assertFeature(parent ?? org, 'analytics');
}

export async function addResult(ctx: Ctx, orgId: string, input: ResultInput, source: Extract<DataSource, 'manual' | 'imported'> = 'manual') {
  await latency();
  const { user } = requireOrg(ctx, orgId, 'results.edit');
  orgFeature(orgId);
  validateResult(input);
  const d = getDb();
  if (!d.campaigns.some((c) => c.id === input.campaignId && c.orgId === orgId)) throw notFound('Campaign');
  const collab = d.collaborations.find((k) => k.campaignId === input.campaignId && k.creatorId === input.creatorId);
  if (!collab) throw new AppError('validation', 'Results can only be recorded for creators collaborating on this campaign.');
  return mutate((db) => {
    const r: ResultEntry = { id: uid('res'), orgId, ...input, collaborationId: collab.id, note: cleanLine(input.note, 200) || undefined, source, enteredBy: user.id, createdAt: nowIso() };
    db.results.push(r);
    logActivity(db, { orgId, campaignId: input.campaignId, creatorId: input.creatorId, actorId: user.id, actorName: user.name, action: `recorded ${source} results for ${input.date}` });
    return r;
  });
}

/** CSV columns: date,creator_handle,platform,reach,impressions,engagements,clicks,conversions */
export async function importResultsCsv(ctx: Ctx, orgId: string, campaignId: string, csv: string) {
  requireOrg(ctx, orgId, 'results.edit');
  const d = getDb();
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new AppError('validation', 'The file needs a header row and at least one data row.');
  const head = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const need = ['date', 'creator_handle', 'platform'];
  const missing = need.filter((n) => !head.includes(n));
  if (missing.length) throw new AppError('validation', `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
  const errors: string[] = [];
  let imported = 0;
  for (const [i, line] of lines.slice(1, 501).entries()) {
    const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const row = Object.fromEntries(head.map((h, j) => [h, cells[j]]));
    const creator = d.creators.find((c) => c.handle === String(row.creator_handle).replace(/^@/, '').toLowerCase());
    const num = (k: string) => (row[k] === undefined || row[k] === '' ? null : Number(row[k]));
    try {
      if (!creator) throw new AppError('validation', `unknown creator “${row.creator_handle}”`);
      await addResult(ctx, orgId, { campaignId, creatorId: creator.id, date: row.date, platform: row.platform as Platform, reach: num('reach'), impressions: num('impressions'), engagements: num('engagements'), clicks: num('clicks'), conversions: num('conversions'), note: 'CSV import' }, 'imported');
      imported++;
    } catch (e) {
      errors.push(`Row ${i + 2}: ${(e as Error).message}`);
    }
  }
  return { imported, errors };
}

export async function deleteResult(ctx: Ctx, orgId: string, resultId: string) {
  requireOrg(ctx, orgId, 'results.edit');
  mutate((d) => { d.results = d.results.filter((r) => !(r.id === resultId && r.orgId === orgId)); });
}

type Totals = { reach: number | null; impressions: number | null; engagements: number | null; clicks: number | null; conversions: number | null };

function totals(rows: ResultEntry[]): Totals {
  const t = (k: keyof Totals) => { const xs = rows.map((r) => r[k]).filter((n): n is number => n != null); return xs.length ? sum(xs) : null; };
  return { reach: t('reach'), impressions: t('impressions'), engagements: t('engagements'), clicks: t('clicks'), conversions: t('conversions') };
}

function derived(t: Totals, spend: number) {
  const div = (a: number | null, b: number | null) => (a != null && b ? a / b : null);
  return {
    engagementRate: t.engagements != null && t.impressions ? (t.engagements / t.impressions) * 100 : null,
    cpe: div(spend, t.engagements), cpc: div(spend, t.clicks), cpa: div(spend, t.conversions),
  };
}

export async function campaignAnalytics(ctx: Ctx, orgId: string, campaignId: string, range: { from?: string; to?: string } = {}) {
  await latency();
  requireOrg(ctx, orgId, 'campaign.view');
  orgFeature(orgId);
  const d = getDb();
  const c = d.campaigns.find((x) => x.id === campaignId && x.orgId === orgId);
  if (!c) throw notFound('Campaign');
  const rows = d.results.filter((r) => r.campaignId === campaignId && (!range.from || r.date >= range.from) && (!range.to || r.date <= range.to)).sort((a, b) => a.date.localeCompare(b.date));
  const collabs = d.collaborations.filter((k) => k.campaignId === campaignId && k.status !== 'cancelled');
  const spend = sum(collabs.map((k) => k.terms.fee));
  const t = totals(rows);
  const byCreator = collabs.map((k) => {
    const mine = rows.filter((r) => r.creatorId === k.creatorId);
    const ct = totals(mine);
    return { creatorId: k.creatorId, name: d.creators.find((x) => x.id === k.creatorId)?.displayName ?? 'Creator', fee: k.terms.fee, ...ct, ...derived(ct, k.terms.fee), entries: mine.length, sources: [...new Set(mine.map((m) => m.source))] };
  });
  const days = [...new Set(rows.map((r) => r.date))].sort();
  const series = days.map((day) => ({ date: day, ...totals(rows.filter((r) => r.date === day)) }));
  return { campaign: c, rows, totals: t, derived: derived(t, spend), spend, byCreator, series, sources: [...new Set(rows.map((r) => r.source))], sample: rows.some((r) => r.sample) };
}

/** Agency-wide (or brand-wide) rollup. Only the caller's own and client orgs. */
export async function portfolioAnalytics(ctx: Ctx, orgId: string) {
  await latency();
  const { org } = requireOrg(ctx, orgId, 'org.view');
  const d = getDb();
  const orgIds = org.type === 'agency' ? [orgId, ...d.organizations.filter((o) => o.parentOrgId === orgId).map((o) => o.id)] : [orgId];
  return orgIds.map((id) => {
    const o = d.organizations.find((x) => x.id === id)!;
    const camps = d.campaigns.filter((c) => c.orgId === id);
    const rows = d.results.filter((r) => r.orgId === id);
    const collabs = d.collaborations.filter((k) => k.orgId === id && k.status !== 'cancelled');
    return { org: o, campaigns: camps.length, live: camps.filter((c) => ['recruiting', 'active', 'published'].includes(c.status)).length, collaborations: collabs.length, ...totals(rows), currencySpend: camps.reduce<Record<string, number>>((acc, c) => { acc[c.currency] = (acc[c.currency] ?? 0) + sum(collabs.filter((k) => k.campaignId === c.id).map((k) => k.terms.fee)); return acc; }, {}) };
  }).filter((r) => r.org.type !== 'agency' || r.campaigns > 0);
}
