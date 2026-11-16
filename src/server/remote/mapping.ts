// Mapping between the app's in-memory Database (camelCase, src/domain/types.ts)
// and Supabase tables (snake_case columns, see supabase/migrations/0001_init.sql).
// Only TOP-LEVEL keys are renamed; nested jsonb keeps the app's camelCase.
import type { Database } from '../../domain/types';

export type Collection = Exclude<keyof Database, 'version' | 'seededAt' | 'sessions' | 'loginAttempts' | 'settings'>;

export interface TableSpec {
  collection: Collection;
  table: string;
  key: string;                    // primary key field (camelCase)
  renames?: Record<string, string>; // camelField → column
  omit?: string[];                // app-only fields never sent to the server
  keepNull?: string[];            // fields where null is meaningful
}

// Order matters: inserts are applied in this order (parents before children),
// deletes in reverse.
export const TABLES: TableSpec[] = [
  { collection: 'users', table: 'profiles', key: 'id', omit: ['passwordHash', 'passwordSalt', 'emailVerifyToken', 'passwordResetToken', 'passwordResetExpires'] },
  { collection: 'notificationPrefs', table: 'notification_prefs', key: 'userId' },
  { collection: 'organizations', table: 'organizations', key: 'id' },
  { collection: 'memberships', table: 'memberships', key: 'id' },
  { collection: 'teamInvites', table: 'team_invites', key: 'id' },
  { collection: 'creators', table: 'creator_profiles', key: 'id' },
  { collection: 'files', table: 'files', key: 'id' },
  { collection: 'campaigns', table: 'campaigns', key: 'id' },
  { collection: 'invitations', table: 'invitations', key: 'id' },
  { collection: 'applications', table: 'applications', key: 'id' },
  { collection: 'offers', table: 'offers', key: 'id', renames: { from: 'from_side' } },
  { collection: 'messages', table: 'messages', key: 'id', renames: { from: 'from_side' } },
  { collection: 'collaborations', table: 'collaborations', key: 'id' },
  { collection: 'deliverables', table: 'deliverables', key: 'id' },
  { collection: 'submissions', table: 'submissions', key: 'id' },
  { collection: 'payments', table: 'payments', key: 'id' },
  { collection: 'results', table: 'results', key: 'id', keepNull: ['reach', 'impressions', 'engagements', 'clicks', 'conversions'] },
  { collection: 'activity', table: 'campaign_activity', key: 'id' },
  { collection: 'collections', table: 'collections', key: 'id' },
  { collection: 'crm', table: 'crm_records', key: 'id' },
  { collection: 'verificationRequests', table: 'verification_requests', key: 'id' },
  { collection: 'reports', table: 'reports', key: 'id' },
  { collection: 'notifications', table: 'notifications', key: 'id' },
  { collection: 'audit', table: 'audit_log', key: 'id' },
];

export const byCollection = new Map(TABLES.map((t) => [t.collection, t]));

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const ISO_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?\+00:00$/;

/** App record → row for the server. `undefined` becomes null so cleared fields are cleared. */
export function toRow(spec: TableSpec, rec: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (spec.omit?.includes(k)) continue;
    out[spec.renames?.[k] ?? snake(k)] = v === undefined ? null : v;
  }
  return out;
}

/** Server row → app record. Nulls become absent (optional) unless meaningful. */
export function fromRow(spec: TableSpec, row: Record<string, unknown>): Record<string, unknown> {
  const reverse = Object.fromEntries(Object.entries(spec.renames ?? {}).map(([a, b]) => [b, a]));
  const out: Record<string, unknown> = {};
  for (const [col, v] of Object.entries(row)) {
    const k = reverse[col] ?? camel(col);
    if (v === null && !spec.keepNull?.includes(k)) continue;
    // Postgres numerics arrive as numbers; timestamps as "...+00:00" — normalise to the app's "...Z".
    out[k] = typeof v === 'string' && ISO_OFFSET.test(v) ? new Date(v).toISOString() : v;
  }
  return out;
}

/** Columns that differ between two versions of a record (top level, deep compare). */
export function changedFields(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}
