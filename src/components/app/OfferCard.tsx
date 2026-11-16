import type { ReactNode } from 'react';
import type { Offer } from '../../domain/types';
import { formatLabel, platformLabel } from '../../domain/constants';
import { cx, formatDate, formatDateTime, money } from '../../lib/utils';
import { Pill } from '../ui/Badge';

const STATUS: Record<Offer['status'], { label: string; tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' }> = {
  open: { label: 'Open', tone: 'accent' }, accepted: { label: 'Accepted', tone: 'success' }, rejected: { label: 'Rejected', tone: 'danger' }, superseded: { label: 'Superseded', tone: 'neutral' }, withdrawn: { label: 'Withdrawn', tone: 'neutral' },
};

export default function OfferCard({ offer, fromLabel, actions }: { offer: Offer; fromLabel: string; actions?: ReactNode }) {
  const t = offer.terms;
  const s = STATUS[offer.status];
  return (
    <div className={cx('rounded-[12px] border bg-surface p-4', offer.status === 'open' ? 'border-accent-200 shadow-sm' : 'border-ink-200 opacity-90')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-ink-500"><span className="font-semibold text-ink-800">{fromLabel}</span> · {formatDateTime(offer.createdAt)}</p>
        <Pill tone={s.tone} dot>{s.label}</Pill>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="num text-[22px] font-semibold tracking-tight text-ink-900">{t.fee ? money(t.fee, t.currency) : 'Gifting'}</p>
        {t.bonus && <p className="text-[13px] text-ink-600">+ <span className="num font-semibold">{money(t.bonus.amount, t.currency)}</span> bonus if {t.bonus.condition.toLowerCase()}</p>}
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[12.5px] sm:grid-cols-2">
        <div className="flex justify-between gap-3"><dt className="text-ink-500">Deliverables</dt><dd className="text-right font-medium text-ink-800">{t.deliverables.map((d) => `${d.quantity}× ${formatLabel(d.format)} (${platformLabel(d.platform)})`).join(', ')}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-ink-500">Deadline</dt><dd className="font-medium text-ink-800">{formatDate(t.deadline)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-ink-500">Revisions</dt><dd className="font-medium text-ink-800">{t.revisionLimit} round{t.revisionLimit === 1 ? '' : 's'}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-ink-500">Usage rights</dt><dd className="text-right font-medium text-ink-800">{t.usageRights}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-ink-500">Exclusivity</dt><dd className="text-right font-medium text-ink-800">{t.exclusivity}</dd></div>
        {t.milestones && <div className="flex justify-between gap-3"><dt className="text-ink-500">Milestones</dt><dd className="text-right font-medium text-ink-800">{t.milestones.map((m) => `${m.label} ${m.pct}%`).join(' · ')}</dd></div>}
        {t.gifting && <div className="flex justify-between gap-3"><dt className="text-ink-500">Gifting</dt><dd className="text-right font-medium text-ink-800">{t.gifting}</dd></div>}
      </dl>
      {offer.message && <p className="mt-3 whitespace-pre-wrap rounded-[10px] bg-ink-50 p-3 text-[12.5px] leading-relaxed text-ink-700">{offer.message}</p>}
      {actions && <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-150 pt-3">{actions}</div>}
    </div>
  );
}
