import { useCallback, useEffect, useRef, useState } from 'react';
import { useDbVersion } from './session';
import { useToast } from '../components/ui/Toast';
import { AppError } from '../server/api';

/**
 * Load data from the backend. Re-runs when inputs change or the database
 * changes, keeping the previous data on screen while refreshing (no flicker).
 */
export function useQuery<T>(fn: () => Promise<T> | T, deps: unknown[]) {
  const version = useDbVersion();
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  const seq = useRef(0);
  const run = useCallback(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    Promise.resolve().then(fn).then(
      (data) => id === seq.current && setState({ data, loading: false }),
      (error: Error) => id === seq.current && setState({ error, loading: false }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(run, [run, version]);
  return { ...state, reload: run };
}

export function errorMessage(e: unknown): string {
  if (e instanceof AppError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}

/** Wrap a mutation: tracks busy state, shows errors as toasts, returns the result or undefined. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>, success?: { title: string; body?: string; action?: { label: string; onClick: () => void } }): Promise<T | undefined> => {
    setBusy(key);
    setFields({});
    try {
      const out = await fn();
      if (success) toast.success(success.title, success.body, success.action);
      // Void mutations resolve to `true` so callers can test success with `if (r)`.
      return (out ?? true) as T;
    } catch (e) {
      if (e instanceof AppError && e.fields) setFields(e.fields);
      const title = e instanceof AppError && e.code === 'plan_limit' ? 'Upgrade needed' : e instanceof AppError && e.code === 'forbidden' ? 'Not allowed' : 'Couldn’t complete that';
      toast.error(title, errorMessage(e));
      return undefined;
    } finally {
      setBusy(null);
    }
  }, [toast]);
  return { run, busy, fields, setFields };
}
