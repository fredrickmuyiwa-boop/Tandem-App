import type { Currency, PaymentStatus } from '../../domain/types';
import { getDb, mutate } from '../db';
import { AppError, notFound } from '../errors';
import { audit } from '../audit';
import { latency } from '../config';
import { requireCreator, requireOrg, type Ctx } from '../access';
import { cleanLine } from '../../lib/sanitize';
import { nowIso, sum } from '../../lib/utils';
import { logActivity } from './campaigns';
import { creatorUser, notify } from '../notify';
import { typicalRate, totalFollowers, tier } from '../../domain/creatorStats';

export function campaignBudget(campaignId: string) {
  const d = getDb();
  const c = d.campaigns.find((x) => x.id === campaignId)!;
  const org = d.organizations.find((o) => o.id === c.orgId)!;
  const agency = org.parentOrgId ? d.organizations.find((o) => o.id === org.parentOrgId) : undefined;
  const collabs = d.collaborations.filter((k) => k.campaignId === campaignId && k.status !== 'cancelled');
  const allocations = collabs.map((k) => {
    const creator = d.creators.find((x) => x.id === k.creatorId);
    const pays = d.payments.filter((p) => p.collaborationId === k.id);
    return {
      collaborationId: k.id, creatorId: k.creatorId, creatorName: creator?.displayName ?? 'Creator',
      fee: k.terms.fee, bonus: k.terms.bonus?.amount ?? 0,
      paid: sum(pays.filter((p) => p.status === 'paid').map((p) => p.amount)),
      pending: sum(pays.filter((p) => p.status === 'pending').map((p) => p.amount)),
    };
  });
  const openOffers = d.offers.filter((o) => o.campaignId === campaignId && o.status === 'open' && o.from === 'org');
  const committed = sum(allocations.map((a) => a.fee + a.bonus));
  const guaranteed = sum(allocations.map((a) => a.fee));
  const platformFeePct = d.settings.platformFeePct;
  const agencyFeePct = agency?.agencyFeePct ?? 0;
  const platformFee = Math.round((committed * platformFeePct) / 100);
  const agencyFee = Math.round((committed * agencyFeePct) / 100);
  const outstanding = sum(openOffers.map((o) => o.terms.fee + (o.terms.bonus?.amount ?? 0)));
  const paid = sum(allocations.map((a) => a.paid));
  const pending = sum(allocations.map((a) => a.pending));
  const projected = committed + platformFee + agencyFee + outstanding + Math.round((outstanding * (platformFeePct + agencyFeePct)) / 100);
  return {
    campaignId, name: c.name, currency: c.currency, total: c.budget, allocations, committed, guaranteed, platformFeePct, platformFee, agencyFeePct, agencyFee,
    outstandingOffers: outstanding, approvedSpend: paid, pendingPayments: pending, remaining: c.budget - committed - platformFee - agencyFee, projected,
  };
}

export async function budgetOverview(ctx: Ctx, orgId: string) {
  await latency();
  requireOrg(ctx, orgId, 'budget.view');
  const d = getDb();
  const campaigns = d.campaigns.filter((c) => c.orgId === orgId && c.status !== 'cancelled');
  const rows = campaigns.map((c) => campaignBudget(c.id));
  const byCurrency: Partial<Record<Currency, { total: number; committed: number; paid: number; pending: number; remaining: number }>> = {};
  for (const r of rows) {
    const b = (byCurrency[r.currency] ||= { total: 0, committed: 0, paid: 0, pending: 0, remaining: 0 });
    b.total += r.total; b.committed += r.committed + r.platformFee + r.agencyFee; b.paid += r.approvedSpend; b.pending += r.pendingPayments; b.remaining += r.remaining;
  }
  return { rows, byCurrency };
}

export async function getCampaignBudget(ctx: Ctx, orgId: string, campaignId: string) {
  requireOrg(ctx, orgId, 'budget.view');
  const d = getDb();
  if (!d.campaigns.some((c) => c.id === campaignId && c.orgId === orgId)) throw notFound('Campaign');
  return campaignBudget(campaignId);
}

export async function listPayments(ctx: Ctx, orgId: string, campaignId?: string) {
  await latency();
  requireOrg(ctx, orgId, 'budget.view');
  const d = getDb();
  return d.payments.filter((p) => p.orgId === orgId && (!campaignId || p.campaignId === campaignId)).map((p) => ({
    payment: p, creatorName: d.creators.find((c) => c.id === p.creatorId)?.displayName ?? 'Creator', campaignName: d.campaigns.find((c) => c.id === p.campaignId)?.name ?? '',
  })).sort((a, b) => a.payment.dueDate.localeCompare(b.payment.dueDate));
}

const PAY_FLOW: Record<PaymentStatus, PaymentStatus[]> = { scheduled: ['pending', 'cancelled'], pending: ['paid', 'scheduled', 'cancelled'], paid: [], cancelled: ['scheduled'] };

/** Payment *tracking*. Tandem records status; it never moves money. */
export async function updatePayment(ctx: Ctx, orgId: string, paymentId: string, status: PaymentStatus, reference?: string) {
  await latency();
  const { user } = requireOrg(ctx, orgId, 'payments.edit');
  const d = getDb();
  const p = d.payments.find((x) => x.id === paymentId && x.orgId === orgId);
  if (!p) throw notFound('Payment');
  if (!PAY_FLOW[p.status].includes(status)) throw new AppError('conflict', `A ${p.status} payment can’t be marked ${status}.`);
  if (status === 'paid' && !cleanLine(reference)) throw new AppError('validation', 'Add the payment reference from your bank or payment provider.', { reference: 'Add a reference.' });
  return mutate((db) => {
    p.status = status;
    p.reference = status === 'paid' ? cleanLine(reference, 80) : p.reference;
    p.paidAt = status === 'paid' ? nowIso() : undefined;
    p.updatedBy = user.id;
    logActivity(db, { orgId, campaignId: p.campaignId, collaborationId: p.collaborationId, creatorId: p.creatorId, actorId: user.id, actorName: user.name, action: `marked “${p.label}” as ${status}` });
    notify(db, [creatorUser(db, p.creatorId)], 'payment', status === 'paid' ? 'A payment was recorded as paid' : `Payment update: ${p.label}`, status === 'paid' ? `Reference ${p.reference}. Check your account for the transfer.` : `Status: ${status}.`, '/creator/earnings');
    audit({ actorId: user.id, actorEmail: user.email, orgId, action: `payment.${status}`, target: p.id, severity: 'warning' });
    return p;
  });
}

export async function creatorEarnings(ctx: Ctx) {
  await latency();
  const { creator } = requireCreator(ctx);
  const d = getDb();
  const rows = d.payments.filter((p) => p.creatorId === creator.id).map((p) => ({
    payment: p, campaignName: d.campaigns.find((c) => c.id === p.campaignId)?.name ?? '', brandName: d.organizations.find((o) => o.id === p.orgId)?.name ?? '',
  })).sort((a, b) => b.payment.dueDate.localeCompare(a.payment.dueDate));
  const totals: Partial<Record<Currency, { paid: number; pending: number; scheduled: number }>> = {};
  for (const r of rows) {
    if (r.payment.status === 'cancelled') continue;
    const t = (totals[r.payment.currency] ||= { paid: 0, pending: 0, scheduled: 0 });
    t[r.payment.status as 'paid' | 'pending' | 'scheduled'] += r.payment.amount;
  }
  return { rows, totals };
}

export interface ScenarioMix { tier: 'nano' | 'micro' | 'mid' | 'macro'; count: number }

/**
 * Compare budget allocation scenarios using the indicative rates that listed
 * creators chose to share. Cost and coverage only — never outcome promises.
 */
export async function compareScenarios(ctx: Ctx, orgId: string, input: { budget: number; currency: Currency; scenarios: { name: string; mix: ScenarioMix[] }[] }) {
  await latency();
  requireOrg(ctx, orgId, 'budget.view');
  const d = getDb();
  const pool = d.creators.filter((c) => c.visibility.listed && c.visibility.showRates);
  const tierStats = (['nano', 'micro', 'mid', 'macro'] as const).map((t) => {
    const members = pool.filter((c) => tier(totalFollowers(c)).id === t);
    const rates = members.map((c) => typicalRate(c, input.currency)).filter((r): r is number => r != null).sort((a, b) => a - b);
    const followers = members.map((c) => totalFollowers(c) ?? 0).sort((a, b) => a - b);
    return { tier: t, sampleSize: rates.length, medianRate: rates.length ? rates[Math.floor(rates.length / 2)] : null, medianFollowers: followers.length ? followers[Math.floor(followers.length / 2)] : null };
  });
  const fees = (d.settings.platformFeePct) / 100;
  return {
    tierStats,
    scenarios: input.scenarios.map((s) => {
      const lines = s.mix.filter((m) => m.count > 0).map((m) => {
        const st = tierStats.find((t) => t.tier === m.tier)!;
        return { ...m, unit: st.medianRate, cost: st.medianRate != null ? st.medianRate * m.count : null, followers: st.medianFollowers != null ? st.medianFollowers * m.count : null, sampleSize: st.sampleSize };
      });
      const creatorCost = sum(lines.map((l) => l.cost ?? 0));
      const total = Math.round(creatorCost * (1 + fees));
      return { name: s.name, lines, creators: sum(lines.map((l) => l.count)), creatorCost: Math.round(creatorCost), platformFee: Math.round(creatorCost * fees), total, combinedFollowers: sum(lines.map((l) => l.followers ?? 0)), withinBudget: total <= input.budget, incomplete: lines.some((l) => l.unit == null) };
    }),
  };
}
