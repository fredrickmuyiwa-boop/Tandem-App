import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';
import { cx } from '../../lib/utils';

type Kind = 'success' | 'error' | 'warning' | 'info';
interface T { id: number; kind: Kind; title: string; body?: string; action?: { label: string; onClick: () => void } }
interface Api { success(t: string, b?: string, a?: T['action']): void; error(t: string, b?: string): void; warning(t: string, b?: string): void; info(t: string, b?: string, a?: T['action']): void }

const Ctx = createContext<Api | null>(null);
const ICON = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };
const TONE = { success: 'text-ok-600', error: 'text-bad-600', warning: 'text-warn-600', info: 'text-accent-600' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<T[]>([]);
  const n = useRef(0);
  const dismiss = useCallback((id: number) => setList((l) => l.filter((x) => x.id !== id)), []);
  const push = useCallback((kind: Kind, title: string, body?: string, action?: T['action']) => {
    const id = ++n.current;
    setList((l) => [...l.slice(-3), { id, kind, title, body, action }]);
    setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4500);
  }, [dismiss]);
  const api = useMemo<Api>(() => ({ success: (t, b, a) => push('success', t, b, a), error: (t, b) => push('error', t, b), warning: (t, b) => push('warning', t, b), info: (t, b, a) => push('info', t, b, a) }), [push]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[80] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2 sm:left-auto sm:right-4 sm:translate-x-0" aria-live="polite">
        {list.map((t) => {
          const I = ICON[t.kind];
          return (
            <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex items-start gap-3 rounded-[12px] border border-ink-200 bg-surface p-3.5 shadow-md animate-up">
              <I className={cx('mt-0.5 size-[18px] shrink-0', TONE[t.kind])} />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-ink-900">{t.title}</p>
                {t.body && <p className="mt-0.5 text-[12.5px] leading-snug text-ink-500">{t.body}</p>}
                {t.action && <button className="mt-1.5 text-[12.5px] font-semibold text-accent-600 hover:text-accent-700" onClick={() => { t.action!.onClick(); dismiss(t.id); }}>{t.action.label} →</button>}
              </div>
              <button onClick={() => dismiss(t.id)} className="text-ink-300 hover:text-ink-600" aria-label="Dismiss"><X className="size-4" /></button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): Api {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast outside provider');
  return c;
}
