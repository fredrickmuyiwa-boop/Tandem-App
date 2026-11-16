// Explainable creator ↔ campaign matching.
//
// Works only on what the creator has chosen to share (privacy-filtered views).
// Every point in the score is attributed to a named factor with a reason and
// the data source behind it. Missing data lowers confidence, it is never guessed.
import type { Category, Currency, DataSource } from '../domain/types';
import type { CreatorView } from '../server/services/creators';
import type { BriefCriteria } from './brief';
import { avgEngagement, statsSource, tier, totalFollowers, typicalRate } from '../domain/creatorStats';
import { categoryLabel, formatLabel, platformLabel } from '../domain/constants';
import { clamp, compact, money } from '../lib/utils';

export interface Factor {
  key: 'niche' | 'geography' | 'demographics' | 'engagement' | 'budget' | 'platform' | 'language';
  label: string;
  weight: number;
  points: number;
  status: 'strong' | 'partial' | 'weak' | 'unknown' | 'not_requested';
  reason: string;
  source?: DataSource;
}

export interface MatchResult {
  creatorId: string;
  score: number;
  confidence: 'high' | 'medium' | 'limited';
  factors: Factor[];
  reasons: string[];
  concerns: string[];
  budgetFit: 'within' | 'stretch' | 'over' | 'unknown';
  estimatedFee: { amount: number; currency: Currency; converted: boolean } | null;
  suggestedRole: { title: string; why: string };
  attributes: { label: string; value: string; source?: DataSource }[];
}

/** Tandem reference engagement benchmarks by tier. Assumptions, shown as such in the UI. */
export const ER_BENCHMARK: Record<string, number> = { nano: 4.0, micro: 3.0, mid: 2.0, macro: 1.4, unknown: 3.0 };

const ADJACENT: Partial<Record<Category, Category[]>> = {
  beauty: ['fashion', 'lifestyle'], fashion: ['beauty', 'lifestyle'], lifestyle: ['beauty', 'fashion', 'travel', 'food', 'parenting', 'fitness'],
  food: ['lifestyle', 'travel', 'fitness'], fitness: ['lifestyle', 'food'], tech: ['gaming', 'education', 'finance'],
  travel: ['lifestyle', 'food'], education: ['tech', 'finance', 'parenting'], entertainment: ['lifestyle', 'gaming'],
  parenting: ['lifestyle', 'education', 'food'], finance: ['tech', 'education'], gaming: ['tech', 'entertainment'],
};

const W = { niche: 25, geography: 18, demographics: 14, engagement: 14, budget: 14, platform: 10, language: 5 };

export function matchCreator(c: CreatorView, q: BriefCriteria): MatchResult {
  const factors: Factor[] = [];
  const concerns: string[] = [];
  const followers = totalFollowers(c);
  const er = avgEngagement(c);
  const t = tier(followers);
  const src = statsSource(c) ?? undefined;

  // 1. Niche
  if (!q.categories.length) factors.push({ key: 'niche', label: 'Content niche', weight: W.niche, points: W.niche * 0.6, status: 'not_requested', reason: 'No category specified in the brief.' });
  else {
    const direct = c.categories.filter((x) => q.categories.includes(x));
    const adjacent = c.categories.filter((x) => q.categories.some((qc) => ADJACENT[qc]?.includes(x)));
    if (direct.length) factors.push({ key: 'niche', label: 'Content niche', weight: W.niche, points: direct.includes(q.categories[0]) ? W.niche : W.niche * 0.85, status: 'strong', reason: `Creates ${direct.map(categoryLabel).join(' and ').toLowerCase()} content.` });
    else if (adjacent.length) factors.push({ key: 'niche', label: 'Content niche', weight: W.niche, points: W.niche * 0.45, status: 'partial', reason: `Adjacent niche (${adjacent.map(categoryLabel).join(', ').toLowerCase()}) rather than ${q.categories.map(categoryLabel).join(', ').toLowerCase()}.` });
    else { factors.push({ key: 'niche', label: 'Content niche', weight: W.niche, points: 0, status: 'weak', reason: `Focuses on ${c.categories.map(categoryLabel).join(', ').toLowerCase()}, outside the brief’s categories.` }); concerns.push('Content niche is outside the brief.'); }
  }

  // 2. Geography — audience location first, then creator location.
  if (!q.countries.length) factors.push({ key: 'geography', label: 'Geographic relevance', weight: W.geography, points: W.geography * 0.6, status: 'not_requested', reason: 'No target market specified.' });
  else if (c.audience?.topCountries?.length) {
    const share = c.audience.topCountries.filter((x) => q.countries.includes(x.country)).reduce((s, x) => s + x.pct, 0);
    const pts = W.geography * clamp(share / 60, 0, 1);
    factors.push({ key: 'geography', label: 'Geographic relevance', weight: W.geography, points: pts, status: share >= 45 ? 'strong' : share >= 20 ? 'partial' : 'weak', reason: share ? `${Math.round(share)}% of audience in ${q.countries.join(' / ')}.` : `Audience is mainly in ${c.audience.topCountries.slice(0, 2).map((x) => x.country).join(' and ')}.`, source: c.audience.source });
    if (share < 20) concerns.push(`Little of the audience is in ${q.countries.join(' / ')}.`);
  } else if (c.country !== 'Location hidden') {
    const local = q.countries.includes(c.country);
    factors.push({ key: 'geography', label: 'Geographic relevance', weight: W.geography, points: local ? W.geography * 0.65 : W.geography * 0.15, status: local ? 'partial' : 'weak', reason: local ? `Based in ${c.country}. Audience location not shared, so this is based on the creator’s own location.` : `Based in ${c.country}; audience location not shared.`, source: 'creator_submitted' });
    if (!local) concerns.push(`Based outside ${q.countries.join(' / ')} and audience location isn’t shared.`);
  } else {
    factors.push({ key: 'geography', label: 'Geographic relevance', weight: W.geography, points: W.geography * 0.3, status: 'unknown', reason: 'Creator keeps location and audience private.' });
    concerns.push('Location and audience are private, so market fit can’t be checked.');
  }

  // 3. Demographics
  const wantsGender = q.gender && q.gender !== 'all';
  const wantsAge = q.ageMin != null || q.ageMax != null;
  if (!wantsGender && !wantsAge) factors.push({ key: 'demographics', label: 'Audience demographics', weight: W.demographics, points: W.demographics * 0.6, status: 'not_requested', reason: 'No age or gender target specified.' });
  else if (!c.audience || (c.audience.female == null && !c.audience.ageBands?.length)) {
    factors.push({ key: 'demographics', label: 'Audience demographics', weight: W.demographics, points: W.demographics * 0.3, status: 'unknown', reason: c.audience ? 'Creator hasn’t provided audience demographics.' : 'Creator keeps audience demographics private.' });
    concerns.push('Audience demographics unavailable — ask the creator for a recent insights screenshot.');
  } else {
    let pts = 0; let possible = 0; const bits: string[] = [];
    if (wantsGender && c.audience.female != null) {
      possible += 7;
      const share = q.gender === 'female' ? c.audience.female : c.audience.male ?? 100 - c.audience.female;
      pts += 7 * clamp((share - 35) / 40, 0, 1);
      bits.push(`${Math.round(share)}% ${q.gender}`);
    }
    if (wantsAge && c.audience.ageBands?.length) {
      possible += 7;
      const lo = q.ageMin ?? 13; const hi = q.ageMax ?? 80;
      const overlap = c.audience.ageBands.filter((b) => { const [a, z] = b.band.split(/[–-]/).map((x) => parseInt(x, 10)); return (z || 99) >= lo && a <= hi; }).reduce((s, b) => s + b.pct, 0);
      pts += 7 * clamp(overlap / 65, 0, 1);
      bits.push(`${Math.round(overlap)}% aged ${q.ageMin ?? ''}–${q.ageMax ?? ''}`);
    }
    const ratio = possible ? pts / possible : 0.5;
    factors.push({ key: 'demographics', label: 'Audience demographics', weight: W.demographics, points: W.demographics * ratio, status: ratio >= 0.7 ? 'strong' : ratio >= 0.4 ? 'partial' : 'weak', reason: bits.length ? `Audience: ${bits.join(', ')}.` : 'Partial demographic data only.', source: c.audience.source });
    if (ratio < 0.4) concerns.push('Audience demographics are a weak fit for the target.');
  }

  // 4. Engagement vs tier benchmark
  if (er == null) {
    factors.push({ key: 'engagement', label: 'Engagement quality', weight: W.engagement, points: W.engagement * 0.3, status: 'unknown', reason: 'No engagement rate provided.' });
    concerns.push('No engagement data to judge audience quality.');
  } else {
    const bench = ER_BENCHMARK[t.id];
    const ratio = er / bench;
    factors.push({ key: 'engagement', label: 'Engagement quality', weight: W.engagement, points: W.engagement * clamp(ratio / 1.4, 0, 1), status: ratio >= 1.1 ? 'strong' : ratio >= 0.7 ? 'partial' : 'weak', reason: `${er.toFixed(1)}% engagement vs a ${bench}% reference for ${t.label.toLowerCase()} creators.`, source: src });
    if (er > 18) concerns.push(`Engagement of ${er.toFixed(1)}% is unusually high — confirm with platform insights before committing.`);
    if (ratio < 0.7) concerns.push('Engagement is below the reference for this audience size.');
  }
  if (src === 'creator_submitted') concerns.push('Audience figures are self-reported, not verified.');
  if (q.followersMin != null && followers != null && followers < q.followersMin) concerns.push(`Below the requested ${compact(q.followersMin)} follower minimum.`);
  if (q.followersMax != null && followers != null && followers > q.followersMax) concerns.push(`Above the requested ${compact(q.followersMax)} follower maximum.`);

  // 5. Budget
  let budgetFit: MatchResult['budgetFit'] = 'unknown';
  let estimatedFee: MatchResult['estimatedFee'] = null;
  if (!q.budget) factors.push({ key: 'budget', label: 'Budget compatibility', weight: W.budget, points: W.budget * 0.6, status: 'not_requested', reason: 'No budget given.' });
  else if (!c.rates || !c.rates.length) {
    factors.push({ key: 'budget', label: 'Budget compatibility', weight: W.budget, points: W.budget * 0.4, status: 'unknown', reason: c.rates ? 'No indicative rates on profile.' : 'Rates available on request.' });
  } else {
    const fee = typicalRate(c, q.budget.currency)!;
    const converted = c.rates.some((r) => r.currency !== q.budget!.currency);
    estimatedFee = { amount: Math.round(fee), currency: q.budget.currency, converted };
    const ceiling = q.creatorCount ? q.budget.amount / q.creatorCount : q.budget.amount * 0.25;
    const ratio = fee / ceiling;
    budgetFit = ratio <= 1 ? 'within' : ratio <= 1.5 ? 'stretch' : 'over';
    factors.push({
      key: 'budget', label: 'Budget compatibility', weight: W.budget,
      points: budgetFit === 'within' ? W.budget : budgetFit === 'stretch' ? W.budget * 0.45 : 0,
      status: budgetFit === 'within' ? 'strong' : budgetFit === 'stretch' ? 'partial' : 'weak',
      reason: `Typical rate ≈ ${money(fee, q.budget.currency)}${converted ? ' (converted at reference rates)' : ''} vs ${money(ceiling, q.budget.currency)} per creator${q.creatorCount ? ` for ${q.creatorCount} creators` : ' (25% of budget cap)'}.`,
      source: converted ? 'estimate' : 'creator_submitted',
    });
    if (budgetFit === 'over') concerns.push('Typical rate is well above the per-creator budget.');
  }

  // 6. Platforms & formats
  const plats = c.socials.map((s) => s.platform);
  if (!q.platforms.length && !q.formats.length) factors.push({ key: 'platform', label: 'Platform & format', weight: W.platform, points: W.platform * 0.6, status: 'not_requested', reason: 'No platform or format specified.' });
  else {
    const pOk = q.platforms.length ? q.platforms.filter((p) => plats.includes(p)) : [];
    const fOk = q.formats.length ? q.formats.filter((f) => c.formats.includes(f)) : [];
    const pScore = q.platforms.length ? pOk.length / q.platforms.length : 0.6;
    const fScore = q.formats.length ? fOk.length / q.formats.length : 0.6;
    const ratio = pScore * 0.65 + fScore * 0.35;
    factors.push({ key: 'platform', label: 'Platform & format', weight: W.platform, points: W.platform * ratio, status: ratio >= 0.75 ? 'strong' : ratio >= 0.35 ? 'partial' : 'weak', reason: [pOk.length ? `Active on ${pOk.map(platformLabel).join(', ')}` : q.platforms.length ? `Not active on ${q.platforms.map(platformLabel).join(', ')}` : '', fOk.length ? `makes ${fOk.map(formatLabel).join(', ').toLowerCase()}` : ''].filter(Boolean).join('; ') + '.' });
    if (q.platforms.length && !pOk.length) concerns.push(`Not on ${q.platforms.map(platformLabel).join(' / ')}.`);
  }

  // 7. Language
  if (!q.languages.length) factors.push({ key: 'language', label: 'Language', weight: W.language, points: W.language * 0.6, status: 'not_requested', reason: 'No language specified.' });
  else {
    const ok = c.languages.filter((l) => q.languages.includes(l));
    factors.push({ key: 'language', label: 'Language', weight: W.language, points: ok.length ? W.language : 0, status: ok.length ? 'strong' : 'weak', reason: ok.length ? `Creates in ${ok.join(', ')}.` : `Doesn’t list ${q.languages.join(' / ')}.`, source: 'creator_submitted' });
  }

  if (c.availability === 'limited') concerns.push('Creator has limited availability.');
  if (c.availability === 'unavailable') concerns.push('Creator is currently unavailable.');

  const unknown = factors.filter((f) => f.status === 'unknown').length;
  const confidence: MatchResult['confidence'] = unknown >= 2 ? 'limited' : unknown === 1 || src === 'creator_submitted' ? 'medium' : 'high';
  const score = Math.round(factors.reduce((s, f) => s + f.points, 0));
  const reasons = factors.filter((f) => f.status === 'strong').sort((a, b) => b.weight - a.weight).map((f) => f.reason).slice(0, 4);

  const attributes: MatchResult['attributes'] = [
    { label: 'Audience size', value: followers != null ? `${compact(followers)} · ${t.label}` : 'Not provided', source: src },
    { label: 'Engagement', value: er != null ? `${er.toFixed(1)}%` : 'Not provided', source: src },
    ...(c.audience?.topCountries?.length ? [{ label: 'Top audience market', value: `${c.audience.topCountries[0].country} (${c.audience.topCountries[0].pct}%)`, source: c.audience.source }] : []),
    ...(estimatedFee ? [{ label: 'Typical rate', value: money(estimatedFee.amount, estimatedFee.currency), source: (estimatedFee.converted ? 'estimate' : 'creator_submitted') as DataSource }] : []),
  ];

  return { creatorId: c.id, score: Math.min(100, score), confidence, factors, reasons, concerns: [...new Set(concerns)].slice(0, 5), budgetFit, estimatedFee, suggestedRole: role(c, followers, er, q), attributes };
}

function role(c: CreatorView, followers: number | null, er: number | null, q: BriefCriteria): MatchResult['suggestedRole'] {
  const t = tier(followers).id;
  if (c.formats.includes('ugc_asset') && (q.objective === 'sales' || q.objective === 'traffic' || q.objective === 'app_downloads')) return { title: 'UGC asset producer', why: 'Makes content you can reuse in paid ads and product pages.' };
  if (t === 'macro' || t === 'mid') return { title: 'Hero creator', why: 'Larger audience suited to the headline moment of the campaign.' };
  if (t === 'micro' && (er ?? 0) >= 3) return { title: 'Core storyteller', why: 'Engaged mid-sized audience — good for reviews, tutorials and honest recommendations.' };
  if (t === 'micro') return { title: 'Reach driver', why: 'Solid audience size to extend reach across the target market.' };
  if (t === 'nano') return { title: 'Community amplifier', why: 'Small, close-knit audience — strong for trust and word of mouth in volume.' };
  return { title: 'To be confirmed', why: 'Not enough audience data to suggest a role yet.' };
}

export function rankCreators(creators: CreatorView[], q: BriefCriteria, opts: { includeUnavailable?: boolean; limit?: number } = {}): MatchResult[] {
  return creators
    .filter((c) => opts.includeUnavailable || c.availability !== 'unavailable')
    .map((c) => matchCreator(c, q))
    .sort((a, b) => b.score - a.score || (a.confidence === 'high' ? -1 : 1))
    .slice(0, opts.limit ?? 50);
}

/** Build matching criteria from a saved campaign. */
export function criteriaFromCampaign(c: { name: string; categories: Category[]; locations: string[]; languages: string[]; audience: { ageMin?: number; ageMax?: number; genders: string[]; interests: string[] }; budget: number; currency: Currency; platforms: BriefCriteria['platforms']; deliverables: { format: BriefCriteria['formats'][number] }[]; objective: BriefCriteria['objective'] }, creatorCount?: number): BriefCriteria {
  const g = c.audience.genders;
  return {
    summary: c.name, categories: c.categories, countries: c.locations, languages: c.languages,
    gender: g.includes('all') || g.length !== 1 ? null : (g[0] as 'female' | 'male'),
    ageMin: c.audience.ageMin ?? null, ageMax: c.audience.ageMax ?? null,
    budget: { amount: c.budget, currency: c.currency }, creatorCount: creatorCount ?? null, followersMin: null, followersMax: null,
    objective: c.objective, platforms: c.platforms, formats: [...new Set(c.deliverables.map((d) => d.format))], interests: c.audience.interests,
  };
}
