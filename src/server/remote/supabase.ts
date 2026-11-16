// Live mode bootstrap: Supabase client, auth provider and data transport.
// Loaded only when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../lib/errors';
import { SESSION_KEY, SUPABASE_ANON_KEY, SUPABASE_URL } from '../mode';
import { clearLive, ensureReady, loadUser, startAutoRefresh, startLive } from './live';
import { setAuthProvider, type AuthProvider } from './liveApi';
import { tokenFor, type Change, type Transport } from './replica';
import { setStorageBackend, type StorageBackend } from '../services/storage';

const writeToken = (t: string | null) => { try { if (t) localStorage.setItem(SESSION_KEY, t); else localStorage.removeItem(SESSION_KEY); } catch { /* blocked */ } };

function transport(client: SupabaseClient): Transport {
  return {
    async snapshot() {
      const { data, error } = await client.rpc('app_snapshot');
      if (error) throw error;
      return data as Record<string, unknown>;
    },
    async apply(changes: Change[]) {
      const { error } = await client.rpc('apply_changes', { changes });
      if (error) throw error;
    },
  };
}

function authError(e: { message?: string; status?: number; code?: string } | null): AppError {
  const msg = e?.message ?? '';
  if (e?.status === 429 || /rate limit/i.test(msg)) return new AppError('rate_limited', 'Too many attempts. Wait a few minutes and try again.');
  if (/not confirmed/i.test(msg)) return new AppError('forbidden', 'Verify your email address before signing in. Check your inbox for the link.');
  if (/invalid login|invalid credentials/i.test(msg)) return new AppError('unauthenticated', 'Email or password is incorrect.');
  if (/password/i.test(msg) && /(weak|short|characters|should)/i.test(msg)) return new AppError('validation', msg, { password: msg });
  if (/fetch|network/i.test(msg)) return new AppError('network', 'Can’t reach the server. Check your connection and try again.');
  return new AppError('validation', msg || 'Something went wrong. Try again.');
}

function provider(client: SupabaseClient): AuthProvider {
  return {
    async signUp({ email, password, name, kind, redirectTo }) {
      const { error } = await client.auth.signUp({ email, password, options: { data: { name, kind }, emailRedirectTo: redirectTo } });
      // An existing address returns no error (no account enumeration); real errors surface.
      if (error && !/already registered/i.test(error.message)) throw authError(error);
    },
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !data.user) throw authError(error);
      writeToken(tokenFor(data.user.id));
      return data.user.id;
    },
    async signOut(scope = 'local') {
      await client.auth.signOut({ scope });
      if (scope !== 'others') writeToken(null);
    },
    async currentUserId() {
      const { data } = await client.auth.getSession();
      return data.session?.user.id ?? null;
    },
    async sendPasswordReset(email, redirectTo) {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error && error.status === 429) throw authError(error);
    },
    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw authError(error);
    },
    async rpc(fn, args) {
      const { data, error } = await client.rpc(fn, args);
      if (error) throw new AppError(error.code === '23514' ? 'conflict' : error.code === '22023' ? 'validation' : 'forbidden', error.message);
      return data;
    },
  };
}

const BUCKET = 'submissions';

function storageBackend(client: SupabaseClient): StorageBackend {
  return {
    // Direct upload to the Storage REST endpoint so we can report progress (no extra dependency).
    async upload(path, file, contentType, onProgress) {
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new AppError('unauthenticated', 'Your session has ended. Sign in again.');
      const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
        xhr.setRequestHeader('authorization', `Bearer ${token}`);
        xhr.setRequestHeader('content-type', contentType);
        xhr.setRequestHeader('x-upsert', 'false');
        xhr.setRequestHeader('cache-control', 'max-age=3600');
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded); };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) return resolve();
          let msg = '';
          try { msg = JSON.parse(xhr.responseText)?.message ?? ''; } catch { /* not JSON */ }
          if (xhr.status === 413 || /exceeded|too large|maximum/i.test(msg)) return reject(new AppError('validation', 'That file is larger than this workspace allows (50 MB on the current Supabase plan).'));
          if (xhr.status === 401 || xhr.status === 403 || /row-level security|unauthorized/i.test(msg)) return reject(new AppError('forbidden', 'You can only upload to your own active collaborations.'));
          if (/mime|type/i.test(msg)) return reject(new AppError('validation', 'That file type isn’t allowed. Use JPG, PNG, WebP, MP4, MOV, WebM or PDF.'));
          reject(new AppError('network', msg || 'Upload failed. Try again.'));
        };
        xhr.onerror = () => reject(new AppError('network', 'Upload failed. Check your connection and try again.'));
        xhr.send(file);
      });
    },
    async signedUrl(path, expiresIn) {
      const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, expiresIn);
      if (error || !data?.signedUrl) throw new AppError('forbidden', 'This file isn’t available to you.');
      return data.signedUrl;
    },
  };
}

export async function initLive(): Promise<'restored'> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  setAuthProvider(provider(client));
  startLive(transport(client));
  setStorageBackend(storageBackend(client));
  ensureReady();
  // Email links come back with ?code=… which supabase-js exchanges for a session here.
  const { data } = await client.auth.getSession();
  if (typeof window !== 'undefined' && /[?&]code=/.test(window.location.search)) {
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
  }
  if (data.session) {
    try {
      await loadUser(data.session.user.id);
      writeToken(tokenFor(data.session.user.id));
    } catch {
      clearLive();
      writeToken(null);
    }
  } else writeToken(null);
  client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY' && typeof window !== 'undefined') window.location.hash = '#/reset';
    if (event === 'SIGNED_OUT') { clearLive(); writeToken(null); }
  });
  startAutoRefresh();
  return 'restored';
}
