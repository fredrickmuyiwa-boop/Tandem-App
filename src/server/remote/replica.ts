// Live mode (Supabase): the in-memory Database becomes a read replica of what
// Row Level Security lets the signed-in user see. Services run unchanged on it;
// every mutation is diffed and sent to the server as ONE atomic batch, where
// RLS and integrity triggers decide whether it is allowed. If the server says
// no, the replica is reloaded from the server and the error is shown.
import type { Database, PlatformSettings, Session } from '../../domain/types';
import { CATEGORIES, DEFAULT_PLANS, UPLOAD_TYPES } from '../../domain/constants';
import { AppError } from '../../lib/errors';
import { TABLES, byCollection, changedFields, fromRow, toRow, type Collection } from './mapping';

export interface Change { op: 'insert' | 'update' | 'delete'; table: string; id: string; row?: Record<string, unknown> }

/** How the replica talks to the server (Supabase in the browser, psql in tests). */
export interface Transport {
  /** `userId` is informational in the browser (the Supabase session decides who you are). */
  snapshot(userId: string): Promise<Record<string, unknown>>;
  apply(changes: Change[], userId: string): Promise<void>;
}

export const SESSION_PREFIX = 'sb:';
export const tokenFor = (userId: string) => `${SESSION_PREFIX}${userId}`;

export function defaultSettings(): PlatformSettings {
  return {
    platformFeePct: 8, defaultAgencyFeePct: 15,
    categories: CATEGORIES.map((c) => ({ id: c.id, label: c.label, enabled: true })),
    plans: DEFAULT_PLANS, maxUploadMb: 50, allowedUploadTypes: [...UPLOAD_TYPES],
  };
}

export function emptyDatabase(): Database {
  const d = { version: 1, seededAt: new Date().toISOString(), sessions: [], loginAttempts: {}, settings: defaultSettings() } as unknown as Database;
  for (const t of TABLES) (d as unknown as Record<string, unknown[]>)[t.collection] = [];
  return d;
}

/** Build a Database from an app_snapshot() payload. */
export function fromSnapshot(snap: Record<string, unknown>, activeOrgId?: string): Database {
  const d = emptyDatabase();
  const rows = d as unknown as Record<string, unknown[]>;
  for (const t of TABLES) {
    const list = (snap[t.table] as Record<string, unknown>[] | undefined) ?? [];
    rows[t.collection] = list.map((r) => fromRow(t, r));
  }
  // Fill app fields the server doesn't store.
  d.users = d.users.map((u) => Object.assign({ passwordHash: '', passwordSalt: '' }, u));
  const s = snap.platform_settings as Record<string, unknown> | null;
  if (s) {
    const st = fromRow({ collection: 'users', table: 'platform_settings', key: 'id' }, s) as unknown as PlatformSettings & { id?: boolean };
    delete st.id;
    const base = defaultSettings();
    d.settings = { ...base, ...st, plans: st.plans?.length ? st.plans : base.plans, categories: st.categories?.length ? st.categories : base.categories, allowedUploadTypes: st.allowedUploadTypes?.length ? st.allowedUploadTypes : base.allowedUploadTypes };
  }
  d.audit.sort((a, b) => b.at.localeCompare(a.at));
  d.notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const me = String(snap.me ?? '');
  if (me) {
    const session: Session = { token: tokenFor(me), userId: me, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString(), revoked: false, activeOrgId };
    d.sessions = [session];
  }
  return d;
}

const clone = <T,>(x: T): T => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

export function snapshotForDiff(d: Database): Database { return clone(d); }

/** Turn a before/after pair into the change batch the server applies. */
export function diff(before: Database, after: Database): Change[] {
  const updates: Change[] = []; const inserts: Change[] = []; const deletes: Change[] = [];
  const b = before as unknown as Record<Collection, Record<string, unknown>[]>;
  const a = after as unknown as Record<Collection, Record<string, unknown>[]>;
  for (const spec of TABLES) {
    const prev = new Map((b[spec.collection] ?? []).map((r) => [String(r[spec.key]), r]));
    const next = new Map((a[spec.collection] ?? []).map((r) => [String(r[spec.key]), r]));
    for (const [id, rec] of next) {
      const old = prev.get(id);
      if (!old) {
        if (spec.collection === 'users') continue; // profiles are created by sign-up on the server
        inserts.push({ op: 'insert', table: spec.table, id, row: toRow(spec, rec) });
      } else {
        const fields = changedFields(old, rec).filter((f) => !spec.omit?.includes(f));
        if (fields.length) {
          const patch: Record<string, unknown> = {};
          for (const f of fields) patch[f] = rec[f];
          updates.push({ op: 'update', table: spec.table, id, row: toRow(spec, patch) });
        }
      }
    }
    for (const id of prev.keys()) {
      if (next.has(id)) continue;
      // Trimming local lists (audit, notifications) is not a delete.
      if (spec.collection === 'audit' || spec.collection === 'notifications' && prev.size > 1900) continue;
      deletes.unshift({ op: 'delete', table: spec.table, id });
    }
  }
  const settingsFields = changedFields(before.settings as unknown as Record<string, unknown>, after.settings as unknown as Record<string, unknown>);
  if (settingsFields.length) {
    const patch: Record<string, unknown> = {};
    for (const f of settingsFields) patch[f] = (after.settings as unknown as Record<string, unknown>)[f];
    updates.push({ op: 'update', table: 'platform_settings', id: 'settings', row: toRow({ collection: 'users', table: 'platform_settings', key: 'id' }, patch) });
  }
  return [...updates, ...inserts, ...deletes];
}

/** Map a server/transport error to the app's error type. */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const err = e as { code?: string; message?: string };
  const msg = (err?.message ?? 'The server rejected this change.').replace(/^ERROR:\s*/, '');
  switch (err?.code) {
    case '42501': return new AppError('forbidden', /permission|can’t|cannot|only|suspended/i.test(msg) ? msg : 'You don’t have permission to do that.');
    case '23514': case '23505': case '23503': return new AppError('conflict', err.code === '23505' ? 'That already exists.' : msg);
    case '22023': case '22P02': case '23502': return new AppError('validation', msg);
    case 'PGRST301': case '401': return new AppError('unauthenticated', 'Your session has ended. Sign in again.');
    default: return new AppError('network', /fetch|network/i.test(msg) ? 'Can’t reach the server. Check your connection and try again.' : msg);
  }
}

export { byCollection };
