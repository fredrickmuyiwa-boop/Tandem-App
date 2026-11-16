// Which backend the app runs on.
//   Demo mode: in-browser database with fictional sample data (default).
//   Live mode: Supabase, when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.
const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) ?? {};
const forced = (globalThis as { __TANDEM_LIVE__?: boolean }).__TANDEM_LIVE__;

// Accept common paste mistakes: trailing slash, or the REST endpoint instead of the project URL.
export const SUPABASE_URL = (env.VITE_SUPABASE_URL ?? '').trim().replace(/\/(rest|auth)\/v1\/?$/, '').replace(/\/+$/, '');
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY ?? '';
export const LIVE: boolean = forced ?? Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const IS_DEMO = !LIVE;

/** localStorage key for the signed-in marker read by app/session.tsx. */
export const SESSION_KEY = 'tandem.session';
