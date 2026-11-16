import type { ReactNode } from 'react';
import { BadgeCheck, CircleDashed, FileInput, PenLine, UserRound } from 'lucide-react';
import type { DataSource } from '../../domain/types';
import { SOURCE_META, type Tone } from '../../domain/constants';
import { cx } from '../../lib/utils';

const TONES: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  accent: 'bg-accent-50 text-accent-700',
  success: 'bg-ok-50 text-ok-600',
  warning: 'bg-warn-50 text-warn-600',
  danger: 'bg-bad-50 text-bad-600',
};
const DOTS: Record<Tone, string> = { neutral: 'bg-ink-400', accent: 'bg-accent-500', success: 'bg-ok-600', warning: 'bg-warn-600', danger: 'bg-bad-600' };

export function Pill({ tone = 'neutral', children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex h-[22px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[11.5px] font-medium', TONES[tone], className)}>
      {dot && <span className={cx('size-1.5 rounded-full', DOTS[tone])} />}
      {children}
    </span>
  );
}

const SRC_STYLE: Record<DataSource, { cls: string; Icon: typeof BadgeCheck }> = {
  verified: { cls: 'text-sage-700 bg-sage-50 border-sage-100', Icon: BadgeCheck },
  creator_submitted: { cls: 'text-ink-600 bg-surface border-ink-200', Icon: UserRound },
  imported: { cls: 'text-accent-700 bg-accent-50 border-accent-100', Icon: FileInput },
  estimate: { cls: 'text-ink-600 bg-surface border-ink-300 border-dashed', Icon: CircleDashed },
  manual: { cls: 'text-clay-700 bg-clay-50 border-clay-100', Icon: PenLine },
};

/** Every metric in Tandem is shown with where it came from. */
export function SourceTag({ source, compact }: { source?: DataSource | null; compact?: boolean }) {
  if (!source) return null;
  const s = SRC_STYLE[source];
  const meta = SOURCE_META[source];
  return (
    <span title={`${meta.label}: ${meta.description}`} className={cx('inline-flex h-[18px] shrink-0 items-center gap-1 rounded-[5px] border px-1.5 text-[10.5px] font-medium whitespace-nowrap', s.cls)}>
      <s.Icon className="size-3" />
      {!compact && meta.short}
    </span>
  );
}

export function SampleTag() {
  return <span title="Fictional profile in the demo workspace" className="inline-flex h-[18px] items-center rounded-[5px] border border-dashed border-clay-600/40 px-1.5 text-[10.5px] font-medium text-clay-700">Sample</span>;
}

export function VerifiedIdentity() {
  return (
    <span title="Identity verified by Tandem. This confirms who the creator is — not their audience figures." className="inline-flex items-center gap-1 text-[11.5px] font-medium text-sage-700">
      <BadgeCheck className="size-3.5" /> ID verified
    </span>
  );
}
