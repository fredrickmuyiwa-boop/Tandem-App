// In-browser database for Demo mode. Persisted to localStorage, with an
// in-memory fallback (tests, private windows). Only the service layer in
// src/server/services may import this module.
import type { Database } from '../domain/types';

const KEY = 'tandem.db.v1';
let db: Database | null = null;
let version = 0;
const listeners = new Set<() => void>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;
export let storageWarning: string | null = null;

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadPersisted(): Database | null {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Database;
    return parsed && parsed.version === 1 && Array.isArray(parsed.users) ? parsed : null;
  } catch {
    return null;
  }
}

function persistNow() {
  const s = storage();
  if (!s || !db) return;
  try {
    s.setItem(KEY, JSON.stringify(db));
    storageWarning = null;
  } catch {
    storageWarning = 'Browser storage is full. Recent changes are kept for this session only. Remove large uploads or reset the demo.';
  }
}

export function setDb(next: Database) {
  db = next;
  version++;
  persistNow();
  listeners.forEach((l) => l());
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialised');
  return db;
}

export const isReady = () => db != null;

/** Apply a mutation. Services mutate the draft in place; listeners are notified once. */
export function mutate<T>(fn: (d: Database) => T): T {
  const d = getDb();
  const out = fn(d);
  version++;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 60);
  listeners.forEach((l) => l());
  return out;
}

/** Persist without notifying listeners (used by audit logging during reads). */
export function persistSoon() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 60);
}

export function flush() {
  if (persistTimer) clearTimeout(persistTimer);
  persistNow();
}

export const getVersion = () => version;

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function clearPersisted() {
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
