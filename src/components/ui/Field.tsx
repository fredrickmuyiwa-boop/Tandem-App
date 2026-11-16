import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';
import { Check } from 'lucide-react';
import { cx } from '../../lib/utils';

export function Field({ label, error, hint, children, className, required, htmlFor }: { label?: ReactNode; error?: string; hint?: ReactNode; children: ReactNode; className?: string; required?: boolean; htmlFor?: string }) {
  return (
    <div className={className}>
      {label && <label htmlFor={htmlFor} className="label">{label}{required && <span className="text-bad-600"> *</span>}</label>}
      {children}
      {error ? <p role="alert" className="mt-1 text-[12px] font-medium text-bad-600">{error}</p> : hint ? <p className="mt-1 text-[12px] text-ink-500">{hint}</p> : null}
    </div>
  );
}

export const Input = ({ error, className, ...p }: { error?: string | boolean } & InputHTMLAttributes<HTMLInputElement>) => <input className={cx('input', error && 'input-error', className)} aria-invalid={!!error} {...p} />;
export const Textarea = ({ error, className, ...p }: { error?: string | boolean } & TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={cx('input min-h-[88px] resize-y', error && 'input-error', className)} aria-invalid={!!error} {...p} />;

export function Select<T extends string>({ options, labels, placeholder, error, className, ...p }: { options: readonly T[]; labels?: Partial<Record<T, string>>; placeholder?: string; error?: string | boolean } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx('input', error && 'input-error', className)} aria-invalid={!!error} {...p}>
      {placeholder != null && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}
    </select>
  );
}

/** Multi-select as toggle chips. */
export function ChipSelect<T extends string>({ options, value, onChange, labels, max, size = 'md' }: { options: readonly T[]; value: T[]; onChange: (v: T[]) => void; labels?: Partial<Record<T, string>>; max?: number; size?: 'sm' | 'md' }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group">
      {options.map((o) => {
        const on = value.includes(o);
        const disabled = !on && max != null && value.length >= max;
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            className={cx('inline-flex items-center gap-1 rounded-full border font-medium transition-colors disabled:opacity-40', size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[12.5px]', on ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-surface text-ink-700 hover:border-ink-300')}
          >
            {on && <Check className="size-3" />}
            {labels?.[o] ?? o}
          </button>
        );
      })}
    </div>
  );
}

export function Checkbox({ label, checked, onChange, description }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; description?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-accent-600" />
      <span>
        <span className="block text-[13.5px] font-medium text-ink-800">{label}</span>
        {description && <span className="block text-[12px] text-ink-500">{description}</span>}
      </span>
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={cx('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors', checked ? 'bg-accent-600' : 'bg-ink-300', disabled && 'opacity-50')}>
      <span className={cx('inline-block size-4 rounded-full bg-white shadow-sm transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  );
}
