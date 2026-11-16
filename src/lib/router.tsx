// Hash router: deep links work on any static host (Vercel, previews) with no rewrites.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode, type AnchorHTMLAttributes } from 'react';

interface Location { path: string; query: Record<string, string> }
interface RouterValue extends Location { navigate: (to: string, opts?: { replace?: boolean }) => void }

const RouterContext = createContext<RouterValue | null>(null);

function parse(): Location {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs)) };
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState<Location>(parse);
  useEffect(() => {
    const on = () => setLoc(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const navigate = useCallback((to: string, opts: { replace?: boolean } = {}) => {
    const target = to.startsWith('#') ? to : `#${to}`;
    if (opts.replace) {
      window.history.replaceState(null, '', target);
      setLoc(parse());
    } else if (window.location.hash === target) setLoc(parse());
    else window.location.hash = target;
    window.scrollTo({ top: 0 });
  }, []);
  const value = useMemo(() => ({ ...loc, navigate }), [loc, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter outside RouterProvider');
  return ctx;
}

export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

export function Link({ to, children, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a href={`#${to}`} {...rest}>{children}</a>;
}
