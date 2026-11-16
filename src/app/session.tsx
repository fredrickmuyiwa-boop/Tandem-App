// Client session: holds the token, exposes the signed-in user and active workspace.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, subscribe, getVersion, type Ctx } from '../server/api';
import { SESSION_KEY as KEY } from '../server/mode';
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (v: string | null) => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch { /* storage blocked: session lasts for this tab */ } };

type Me = ReturnType<typeof api.auth.me>;
interface SessionValue {
  ctx: Ctx;
  me: Me | null;
  setToken: (t: string | null) => void;
  signOut: () => Promise<void>;
  activeOrg: Me['orgs'][number] | null;
  switchOrg: (id: string) => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useDbVersion(): number {
  const [v, setV] = useState(getVersion);
  useEffect(() => subscribe(() => setV(getVersion())), []);
  return v;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(read);
  const version = useDbVersion();
  const ctx = useMemo(() => ({ token }), [token]);
  const me = useMemo<Me | null>(() => {
    if (!token) return null;
    try { return api.auth.me(ctx); } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, version]);
  useEffect(() => { if (token && !me) { write(null); setTokenState(null); } }, [token, me]);
  const setToken = useCallback((t: string | null) => { write(t); setTokenState(t); }, []);
  const signOut = useCallback(async () => { await api.auth.signOut(ctx); setToken(null); window.location.hash = '#/signin'; }, [ctx, setToken]);
  const switchOrg = useCallback(async (id: string) => { await api.auth.switchOrg(ctx, id); }, [ctx]);
  const activeOrg = me?.orgs.find((o) => o.id === me.activeOrgId) ?? null;
  const value = useMemo(() => ({ ctx, me, setToken, signOut, activeOrg, switchOrg }), [ctx, me, setToken, signOut, activeOrg, switchOrg]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession outside provider');
  return s;
}

/** For pages inside an org workspace: the active org is guaranteed. */
export function useOrg() {
  const s = useSession();
  if (!s.activeOrg) throw new Error('No active workspace');
  return { ...s, org: s.activeOrg, orgId: s.activeOrg.id, role: s.activeOrg.role };
}
