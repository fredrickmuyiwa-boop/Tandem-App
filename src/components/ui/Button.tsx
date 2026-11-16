import type { ButtonHTMLAttributes, ComponentType, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cx } from '../../lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark' | 'soft';
type Size = 'xs' | 'sm' | 'md' | 'lg';
type Icon = ComponentType<{ className?: string }>;

const V: Record<Variant, string> = {
  primary: 'bg-accent-600 text-white hover:bg-accent-700 active:bg-accent-800 disabled:bg-accent-300 shadow-xs',
  secondary: 'bg-surface text-ink-800 border border-ink-200 hover:border-ink-300 hover:bg-ink-50 disabled:text-ink-400 shadow-xs',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 disabled:text-ink-300',
  danger: 'bg-surface text-bad-600 border border-bad-600/25 hover:bg-bad-50 disabled:opacity-50',
  dark: 'bg-ink-900 text-white hover:bg-ink-800 disabled:bg-ink-400',
  soft: 'bg-accent-50 text-accent-700 hover:bg-accent-100 disabled:opacity-50',
};
const S: Record<Size, string> = {
  xs: 'h-7 px-2.5 text-[12px] gap-1.5 rounded-[8px]',
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-[9px]',
  md: 'h-9 px-3.5 text-[13.5px] gap-2 rounded-[10px]',
  lg: 'h-11 px-5 text-[14px] gap-2 rounded-[11px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: Size; icon?: Icon; iconRight?: Icon; loading?: boolean; children?: ReactNode }

export default function Button({ variant = 'secondary', size = 'md', icon: I, iconRight: IR, loading, className, children, type = 'button', disabled, ...rest }: ButtonProps) {
  return (
    <button type={type} disabled={disabled || loading} className={cx('inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed select-none', V[variant], S[size], className)} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : I ? <I className={size === 'xs' ? 'size-3.5' : 'size-4'} /> : null}
      {children}
      {IR && <IR className="size-4" />}
    </button>
  );
}

export function IconButton({ icon: I, label, className, size = 'md', ...rest }: { icon: Icon; label: string; size?: 'sm' | 'md' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('inline-flex items-center justify-center rounded-[9px] text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 disabled:opacity-40', size === 'sm' ? 'size-7' : 'size-9', className)} {...rest}>
      <I className="size-4" />
    </button>
  );
}
