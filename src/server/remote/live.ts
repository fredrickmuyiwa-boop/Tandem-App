// Live-mode runtime: keeps the replica in sync with the server.
import type { AuditEvent, Database } from '../../domain/types';
import { getDb, isReady, setDb, setPersistence, setWriteHook } from '../db';
import { AppError } from '../../lib/errors';
import { byCollection, toRow } from './mapping';
import { diff, emptyDatabase, fromSnapshot, snapshotForDiff, toAppError, type Change, type Transport } from './replica';

let transport: Transport | null = null;
let currentUser: string | null = null;
let before: Database | null = null;
let depth = 0;
let queue: Promise<void> = Promise.resolve();
let pending = 0;
let failure: AppError | null = null;

const ORG_KEY = 'tandem.activeOrg';
export function savedActiveOrg(): string | undefined { try { return localStorage.getItem(ORG_KEY) ?? undefined; } catch { return undefined; } }
export function saveActiveOrg(id: string | undefined) { try { if (id) localStorage.setItem(ORG_KEY, id); else localStorage.removeItem(ORG_KEY); } catch { /* blocked */ } }

function enqueue(changes: Change[]) {
  if (!transport || !changes.length) return;
  const t = transport;
  const user = currentUser ?? '';
  pending++;
  queue = queue
    .then(() => (failure ? undefined : t.apply(changes, user)))
    .catch((e) => { failure = failure ?? toAppError(e); })
    .finally(() => { pending--; });
}

export function startLive(t: Transport) {
  transport = t;
  setPersistence(false);
  setWriteHook({
    before() { if (depth++ === 0) before = snapshotForDiff(getDb()); },
    after() {
      if (--depth > 0 || !before) return;
      const changes = diff(before, getDb());
      before = null;
      enqueue(changes);
    },
    abort() {
      if (--depth > 0 || !before) return;
      const restore = before;
      before = null;
      setDb(restore);
    },
    outsideMutation(_kind, entry) {
      const e = entry as AuditEvent;
      enqueue([{ op: 'insert', table: 'audit_log', id: e.id, row: toRow(byCollection.get('audit')!, e as unknown as Record<string, unknown>) }]);
    },
  });
}

export const liveUser = () => currentUser;
export const hasPendingWrites = () => pending > 0;

/** Load (or reload) everything the user may see. */
export async function reload(userId = currentUser) {
  if (!transport || !userId) return;
  const snap = await transport.snapshot(userId);
  currentUser = String(snap.me ?? userId);
  const active = savedActiveOrg();
  setDb(fromSnapshot(snap, active));
}

export async function loadUser(userId: string) {
  currentUser = userId;
  await reload(userId);
}

export function clearLive() {
  currentUser = null;
  failure = null;
  setDb(emptyDatabase());
}

/** Wait for queued writes. If the server rejected any, resync and throw its error. */
export async function drain(): Promise<void> {
  await queue;
  if (failure) {
    const f = failure;
    failure = null;
    try { await reload(); } catch { /* keep the local copy; the next refresh will retry */ }
    throw f;
  }
}

/** Keep the replica fresh while the app is open. */
export function startAutoRefresh(intervalMs = 30_000) {
  if (typeof window === 'undefined') return;
  const tick = () => {
    if (!currentUser || pending || depth || document.visibilityState !== 'visible') return;
    reload().catch(() => { /* offline: try again later */ });
  };
  window.setInterval(tick, intervalMs);
  window.addEventListener('focus', tick);
}

export const ensureReady = () => { if (!isReady()) setDb(emptyDatabase()); };
