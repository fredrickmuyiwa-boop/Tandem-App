import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx } from '../../lib/utils';

function useModalBehaviour(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const els = ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector<HTMLElement>('[autofocus], input, textarea, select, button')?.focus(), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      prevFocus?.focus?.();
    };
  }, [open, onClose]);
  return ref;
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const ref = useModalBehaviour(open, onClose);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink-950/35 animate-in" onClick={onClose} />
      <div ref={ref} className={cx('relative flex max-h-[92vh] w-full flex-col rounded-t-[16px] bg-surface shadow-lg animate-pop sm:rounded-[16px]', w)}>
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-ink-900">{title}</h2>
            {description && <div className="mt-0.5 text-[13px] text-ink-500">{description}</div>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-800" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="overflow-y-auto px-5 pb-5 scroll-thin">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-ink-150 bg-ink-50/70 px-5 py-3 sm:rounded-b-[16px]">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width = 'max-w-xl' }: { open: boolean; onClose: () => void; title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  const ref = useModalBehaviour(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink-950/25 animate-in" onClick={onClose} />
      <aside ref={ref} className={cx('absolute inset-y-0 right-0 flex w-full flex-col bg-surface shadow-lg animate-drawer', width)}>
        <div className="flex items-start justify-between gap-3 border-b border-ink-150 px-5 py-4">
          <div className="min-w-0"><h2 className="truncate text-[16px] font-semibold">{title}</h2>{subtitle && <div className="mt-0.5 text-[13px] text-ink-500">{subtitle}</div>}</div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-800" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 scroll-thin">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-ink-150 px-5 py-3">{footer}</div>}
      </aside>
    </div>
  );
}

export function Confirm({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', tone = 'danger', busy }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: ReactNode; confirmLabel?: string; tone?: 'danger' | 'primary'; busy?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={
      <>
        <button className="h-9 rounded-[10px] border border-ink-200 bg-surface px-3.5 text-[13.5px] font-medium text-ink-700 hover:bg-ink-50" onClick={onClose}>Cancel</button>
        <button disabled={busy} className={cx('h-9 rounded-[10px] px-3.5 text-[13.5px] font-medium text-white disabled:opacity-60', tone === 'danger' ? 'bg-bad-600 hover:bg-bad-600/90' : 'bg-accent-600 hover:bg-accent-700')} onClick={onConfirm}>{confirmLabel}</button>
      </>
    }>
      <div className="text-[13.5px] leading-relaxed text-ink-600">{message}</div>
    </Modal>
  );
}
