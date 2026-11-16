import type { Currency } from '../domain/types';
import { DEMO_FX_TO_USD } from '../domain/constants';

export const DAY = 86_400_000;

export function uid(prefix = 'id'): string {
  const rand = typeof crypto !== 'undefined' && 'getRandomValues' in crypto
    ? Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('')
    : Math.random().toString(16).slice(2, 18);
  return `${prefix}_${Date.now().toString(36)}${rand.slice(0, 10)}`;
}

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

export const nowIso = () => new Date().toISOString();

export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';

export const firstName = (name = '') => name.trim().split(/\s+/)[0] || 'there';

const CURRENCY_LOCALE: Record<Currency, string> = { NGN: 'en-NG', USD: 'en-US', GBP: 'en-GB', EUR: 'en-IE', KES: 'en-KE', GHS: 'en-GH', ZAR: 'en-ZA' };

export function money(amount: number | null | undefined, currency: Currency, opts: { compact?: boolean } = {}): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  return new Intl.NumberFormat(CURRENCY_LOCALE[currency], {
    style: 'currency',
    currency,
    maximumFractionDigits: opts.compact ? 1 : 0,
    notation: opts.compact ? 'compact' : 'standard',
  }).format(amount);
}

export function compact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export const pct = (n: number | null | undefined, digits = 1) => (n == null || Number.isNaN(n) ? '—' : `${n.toFixed(digits)}%`);

/** Convert using static demo reference rates. Always present results as an estimate. */
export function convert(amount: number, from: Currency, to: Currency): number {
  if (from === to) return amount;
  return (amount * DEMO_FX_TO_USD[from]) / DEMO_FX_TO_USD[to];
}

export function formatDate(value?: string | null, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...opts });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

export function timeAgo(value?: string | null): string {
  if (!value) return 'never';
  const diff = Date.now() - new Date(value).getTime();
  const future = diff < 0;
  const mins = Math.round(Math.abs(diff) / 60000);
  const fmt = (s: string) => (future ? `in ${s}` : `${s} ago`);
  if (mins < 1) return 'just now';
  if (mins < 60) return fmt(`${mins}m`);
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return fmt(`${hrs}h`);
  const days = Math.round(hrs / 24);
  if (days < 45) return fmt(`${days}d`);
  return formatDate(value);
}

export const daysUntil = (date: string) => Math.ceil((new Date(date).getTime() - Date.now()) / DAY);

export const isoDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function groupBy<T, K extends string>(xs: T[], key: (x: T) => K): Record<K, T[]> {
  return xs.reduce((acc, x) => {
    const k = key(x);
    (acc[k] ||= []).push(x);
    return acc;
  }, {} as Record<K, T[]>);
}

/** Deterministic PRNG for seed data so demos look the same every time. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
