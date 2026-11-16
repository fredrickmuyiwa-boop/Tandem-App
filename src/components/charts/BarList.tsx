import type { ReactNode } from 'react';

export default function BarList({ rows, format = (n) => n.toLocaleString(), color = 'var(--color-accent-500)' }: { rows: { label: ReactNode; value: number | null; hint?: ReactNode }[]; format?: (n: number) => string; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={i}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-medium text-ink-800">{r.label}</span>
            <span className="num shrink-0 text-ink-600">{r.value == null ? '—' : format(r.value)}{r.hint && <span className="ml-1.5 text-ink-400">{r.hint}</span>}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${((r.value ?? 0) / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
