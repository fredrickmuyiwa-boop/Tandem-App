// Public surface of the backend. The UI imports ONLY from here.
// Demo mode runs the services on an in-browser database. Live mode (Supabase
// configured) runs the same services on a replica of what RLS lets the user
// see, and sends every write to the server (see server/remote/).
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
import { signedUrl, storageConnected, uploadSubmissionFiles } from './services/storage';

const storage = { uploadSubmissionFiles, signedUrl, storageConnected };
import { buildSeed } from '../data/seed';
import { clearPersisted, isReady, loadPersisted, setDb, flush } from './db';
import { LIVE, IS_DEMO } from './mode';
import { liveApi } from './remote/liveApi';

const services = { auth, orgs, creators, campaigns, deals, collaborations, money, analytics, crm, notifications, admin, ai, dashboard, storage };

/** Demo mode: the services above on an in-browser database. Live mode: the same services on a Supabase replica. */
export const api: typeof services = LIVE ? liveApi(services) : services;
export { LIVE, IS_DEMO };

export async function initBackend(): Promise<'restored' | 'seeded'> {
  if (LIVE) {
    const { initLive } = await import('./remote/supabase');
    return initLive();
  }
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
  if (LIVE) return;
  clearPersisted();
  setDb(await buildSeed());
  flush();
}

export { AppError } from './errors';
export type { Ctx } from './access';
export { subscribe, getVersion, storageWarning } from './db';
