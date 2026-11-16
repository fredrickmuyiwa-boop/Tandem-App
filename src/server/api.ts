// Public surface of the backend. The UI imports ONLY from here.
// In production each function maps to a Supabase query/RPC protected by RLS
// (see supabase/migrations) or a server route; the signatures stay the same.
import * as auth from './services/auth';
import * as orgs from './services/orgs';
import * as creators from './services/creators';
import * as campaigns from './services/campaigns';
import * as deals from './services/deals';
import * as collaborations from './services/collaborations';
import * as money from './services/money';
import * as analytics from './services/analytics';
import * as crm from './services/crm';
import * as notifications from './services/notifications';
import * as admin from './services/admin';
import * as ai from './services/ai';
import * as dashboard from './services/dashboard';
import { buildSeed } from '../data/seed';
import { clearPersisted, isReady, loadPersisted, setDb, flush } from './db';

export const api = { auth, orgs, creators, campaigns, deals, collaborations, money, analytics, crm, notifications, admin, ai, dashboard };

export async function initBackend(): Promise<'restored' | 'seeded'> {
  if (isReady()) return 'restored';
  const saved = loadPersisted();
  if (saved) {
    setDb(saved);
    return 'restored';
  }
  setDb(await buildSeed());
  return 'seeded';
}

export async function resetDemo() {
  clearPersisted();
  setDb(await buildSeed());
  flush();
}

export { AppError } from './errors';
export type { Ctx } from './access';
export { subscribe, getVersion, storageWarning } from './db';
