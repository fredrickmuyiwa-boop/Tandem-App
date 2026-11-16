import { cx } from '../../lib/utils';

export default function Logo({ className, mark = false, inverted = false }: { className?: string; mark?: boolean; inverted?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-2', className)}>
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill={inverted ? '#ffffff' : '#17171c'} />
        <circle cx="12.5" cy="16" r="5.5" fill="none" stroke={inverted ? '#17171c' : '#ffffff'} strokeWidth="2.4" />
        <circle cx="19.5" cy="16" r="5.5" fill="none" stroke="#7d8cff" strokeWidth="2.4" />
      </svg>
      {!mark && <span className={cx('text-[17px] font-semibold tracking-tight', inverted ? 'text-white' : 'text-ink-900')}>Tandem</span>}
    </span>
  );
}
