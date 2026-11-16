import { Wallet } from 'lucide-react';
import { api } from '../../server/api';
import { useSession } from '../../app/session';
import { useQuery } from '../../app/hooks';
import { PAYMENT_STATUS } from '../../domain/constants';
import type { Currency } from '../../domain/types';
import { formatDate, money } from '../../lib/utils';
import { Pill } from '../../components/ui/Badge';
import { EmptyState, Notice, PageHeader, PageSkeleton, Stat } from '../../components/ui/misc';

export default function Earnings() {
  const { ctx } = useSession();
  const q = useQuery(() => api.money.creatorEarnings(ctx), [ctx]);
  if (!q.data) return <PageSkeleton />;
  const { rows, totals } = q.data;
  const currencies = Object.keys(totals) as Currency[];
  return (
    <div className="space-y-5">
      <PageHeader title="Earnings" description="Payments brands have scheduled or recorded for your collaborations." />
      <Notice tone="info">Tandem tracks payment status only. Money moves directly between you and the brand; Tandem never holds funds. If a payment marked “paid” hasn’t arrived, message the brand.</Notice>
      {currencies.map((cur) => (
        <div key={cur} className="grid gap-3 sm:grid-cols-3">
          <Stat label={`Paid (${cur})`} value={money(totals[cur]!.paid, cur)} />
          <Stat label={`Pending (${cur})`} value={money(totals[cur]!.pending, cur)} />
          <Stat label={`Scheduled (${cur})`} value={money(totals[cur]!.scheduled, cur)} />
        </div>
      ))}
      <div className="panel overflow-x-auto">
        {rows.length ? (
          <table className="w-full min-w-[640px] text-[13px]">
            <thead><tr className="border-b border-ink-150 text-left text-[11.5px] uppercase tracking-wide text-ink-500"><th className="px-4 py-2.5 font-medium">Item</th><th className="px-4 py-2.5 font-medium">Brand</th><th className="px-4 py-2.5 font-medium">Due</th><th className="px-4 py-2.5 text-right font-medium">Amount</th><th className="px-4 py-2.5 font-medium">Status</th></tr></thead>
            <tbody className="divide-y divide-ink-150">{rows.map(({ payment: p, campaignName, brandName }) => (
              <tr key={p.id}><td className="px-4 py-3"><span className="font-medium">{p.label}</span><span className="block text-[11.5px] text-ink-500">{campaignName}</span></td><td className="px-4 py-3 text-ink-600">{brandName}</td><td className="px-4 py-3 text-ink-600">{formatDate(p.dueDate)}{p.paidAt && <span className="block text-[11.5px]">paid {formatDate(p.paidAt)}</span>}</td><td className="num px-4 py-3 text-right font-semibold">{money(p.amount, p.currency)}</td><td className="px-4 py-3"><Pill tone={PAYMENT_STATUS[p.status].tone} dot>{PAYMENT_STATUS[p.status].label}</Pill>{p.reference && <span className="block text-[11px] text-ink-500">ref {p.reference}</span>}</td></tr>
            ))}</tbody>
          </table>
        ) : <EmptyState icon={Wallet} title="No payments yet" message="Payments appear once you agree terms with a brand." />}
      </div>
    </div>
  );
}
