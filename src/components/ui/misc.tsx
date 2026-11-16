import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { cx, initials } from '../../lib/utils';

type Icon = ComponentType<{ className?: string }>;

export function PageHeader({ title, description, actions, eyebrow, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6">
      {back && <div className="mb-3">{back}</div>}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
          <h1 className="text-[24px] font-semibold tracking-tight text-ink-900">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Section({ title, action, children, className, description }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string; description?: ReactNode }) {
  return (
    <section className={cx('panel', className)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-[14px] font-semibold text-ink-900">{title}</h2>
          {description && <p className="mt-0.5 text-[12.5px] text-ink-500">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-5 pt-3">{children}</div>
    </section>
  );
}

export function EmptyState({ icon: I, title, message, action, className }: { icon?: Icon; title: string; message?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center px-6 py-10 text-center', className)}>
      {I && <span className="mb-3 grid size-11 place-items-center rounded-[12px] border border-ink-200 bg-ink-50 text-ink-500"><I className="size-5" /></span>}
      <p className="text-[14px] font-semibold text-ink-900">{title}</p>
      {message && <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden="true" />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-72" /><Skeleton className="h-4 w-96 max-w-full" /></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-72" />
    </div>
  );
}

export function Avatar({ name, hue = 230, url, size = 'md', className }: { name: string; hue?: number; url?: string; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const dims = { xs: 'size-6 text-[10px]', sm: 'size-8 text-[11px]', md: 'size-10 text-[13px]', lg: 'size-14 text-[17px]', xl: 'size-20 text-[22px]' }[size];
  if (url) return <img src={url} alt="" loading="lazy" className={cx('shrink-0 rounded-full object-cover', dims, className)} />;
  return (
    <span aria-hidden="true" className={cx('grid shrink-0 place-items-center rounded-full font-semibold', dims, className)} style={{ background: `hsl(${hue} 45% 92%)`, color: `hsl(${hue} 40% 30%)` }}>
      {initials(name)}
    </span>
  );
}

export function Stat({ label, value, sub, source, tone }: { label: string; value: ReactNode; sub?: ReactNode; source?: ReactNode; tone?: 'default' | 'warn' }) {
  return (
    <div className="panel px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-ink-500">{label}</p>
        {source}
      </div>
      <p className={cx('num mt-1 text-[22px] font-semibold tracking-tight', tone === 'warn' ? 'text-warn-600' : 'text-ink-900')}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-[12px] text-ink-500">{sub}</p>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-ink-200 scroll-thin" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={cx('-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors', value === t.id ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-800')}>
          {t.label}
          {t.count ? <span className={cx('num rounded-full px-1.5 text-[11px]', value === t.id ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600')}>{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Menu({ trigger, children, align = 'right', width = 'w-56' }: { trigger: (p: { open: boolean; toggle: () => void }) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; width?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div role="menu" className={cx('absolute z-40 mt-1.5 overflow-hidden rounded-[12px] border border-ink-200 bg-surface p-1 shadow-md animate-pop', width, align === 'right' ? 'right-0' : 'left-0')}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon: I, children, onClick, danger, active }: { icon?: Icon; children: ReactNode; onClick: () => void; danger?: boolean; active?: boolean }) {
  return (
    <button role="menuitem" onClick={onClick} className={cx('flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px] transition-colors', danger ? 'text-bad-600 hover:bg-bad-50' : 'text-ink-700 hover:bg-ink-50', active && 'bg-ink-50 font-medium text-ink-900')}>
      {I && <I className="size-4 shrink-0 text-ink-400" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="divide-y divide-ink-150 text-[13px]">
      {items.map(([k, v], i) => (
        <div key={i} className="flex items-start justify-between gap-4 py-2">
          <dt className="shrink-0 text-ink-500">{k}</dt>
          <dd className="min-w-0 text-right font-medium text-ink-800">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Meter({ value, max = 100, tone = 'accent', className }: { value: number; max?: number; tone?: 'accent' | 'ok' | 'warn' | 'bad' | 'ink'; className?: string }) {
  const c = { accent: 'bg-accent-500', ok: 'bg-ok-600', warn: 'bg-warn-600', bad: 'bg-bad-600', ink: 'bg-ink-800' }[tone];
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-ink-100', className)} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className={cx('h-full rounded-full transition-[width] duration-500', c)} style={{ width: `${Math.min(100, Math.max(0, (value / max) * 100))}%` }} />
    </div>
  );
}

export function Notice({ tone = 'neutral', icon: I, children, className }: { tone?: 'neutral' | 'warn' | 'info' | 'bad' | 'ok'; icon?: Icon; children: ReactNode; className?: string }) {
  const t = { neutral: 'border-ink-200 bg-ink-50 text-ink-700', warn: 'border-warn-600/20 bg-warn-50 text-warn-600', info: 'border-accent-100 bg-accent-50 text-accent-800', bad: 'border-bad-600/20 bg-bad-50 text-bad-600', ok: 'border-ok-600/20 bg-ok-50 text-ok-600' }[tone];
  return (
    <div className={cx('flex items-start gap-2.5 rounded-[11px] border px-3.5 py-2.5 text-[12.5px] leading-relaxed', t, className)}>
      {I && <I className="mt-0.5 size-4 shrink-0" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
