import type { CreatorProfile, Currency, DataSource, Platform, RateCard } from './types';
import { convert } from '../lib/utils';

export function totalFollowers(c: Pick<CreatorProfile, 'socials'>): number | null {
  const xs = c.socials.map((s) => s.followers).filter((n): n is number => n != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) : null;
}

/** Follower-weighted engagement rate across accounts that report one. */
export function avgEngagement(c: Pick<CreatorProfile, 'socials'>): number | null {
  const xs = c.socials.filter((s) => s.engagementRate != null && s.followers != null && s.followers > 0);
  if (!xs.length) return null;
  const w = xs.reduce((a, s) => a + (s.followers as number), 0);
  return xs.reduce((a, s) => a + (s.engagementRate as number) * (s.followers as number), 0) / w;
}

export function tier(followers: number | null): { id: string; label: string } {
  if (followers == null) return { id: 'unknown', label: 'Audience size not provided' };
  if (followers < 10_000) return { id: 'nano', label: 'Nano (under 10K)' };
  if (followers < 50_000) return { id: 'micro', label: 'Micro (10K–50K)' };
  if (followers < 250_000) return { id: 'mid', label: 'Mid-tier (50K–250K)' };
  return { id: 'macro', label: 'Macro (250K+)' };
}

/** Lowest typical rate in a target currency (static demo FX, so an estimate). */
export function minRate(c: { rates: RateCard[] | null }, currency: Currency, platform?: Platform): number | null {
  const rates = (c.rates ?? []).filter((r) => !platform || r.platform === platform);
  if (!rates.length) return null;
  return Math.min(...rates.map((r) => convert(r.min, r.currency, currency)));
}

export function typicalRate(c: { rates: RateCard[] | null }, currency: Currency): number | null {
  if (!c.rates?.length) return null;
  const mids = c.rates.map((r) => convert((r.min + r.max) / 2, r.currency, currency)).sort((a, b) => a - b);
  return mids[Math.floor(mids.length / 2)];
}

/** Weakest source among the creator's audience-size figures. */
export function statsSource(c: Pick<CreatorProfile, 'socials'>): DataSource | null {
  const order: DataSource[] = ['estimate', 'creator_submitted', 'manual', 'imported', 'verified'];
  const srcs = c.socials.filter((s) => s.followers != null).map((s) => s.source);
  if (!srcs.length) return null;
  return srcs.sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
}

/** 0–1: how much of the information matching relies on is present. */
export function completeness(c: CreatorProfile): { score: number; missing: string[] } {
  const checks: [boolean, string][] = [
    [c.bio.trim().length >= 40, 'biography'],
    [c.categories.length > 0, 'content categories'],
    [c.socials.length > 0, 'social accounts'],
    [c.socials.some((s) => s.followers != null), 'audience size'],
    [c.socials.some((s) => s.engagementRate != null), 'engagement rate'],
    [!!(c.audience.topCountries?.length), 'audience locations'],
    [c.audience.female != null || !!c.audience.ageBands?.length, 'audience demographics'],
    [c.rates.length > 0, 'indicative rates'],
    [c.portfolio.length > 0, 'portfolio samples'],
    [c.languages.length > 0, 'languages'],
  ];
  const missing = checks.filter(([ok]) => !ok).map(([, l]) => l);
  return { score: (checks.length - missing.length) / checks.length, missing };
}
