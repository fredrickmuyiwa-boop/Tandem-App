import { api } from '../../server/api';
import { useOrg } from '../../app/session';
import { useQuery } from '../../app/hooks';
import { money } from '../../lib/utils';
import { KeyValue, Meter } from '../ui/misc';
import { SourceTag } from '../ui/Badge';
import PaymentsTable from './PaymentsTable';

export default function CampaignBudget({ campaignId }: { campaignId: string }) {
  const { ctx, orgId } = useOrg();
  const q = useQuery(() => api.money.getCampaignBudget(ctx, orgId, campaignId), [ctx, orgId, campaignId]);
  if (!q.data) return <div className="skeleton h-60" />;
  const b = q.data;
  const m = (n: number) => money(n, b.currency);
  const used = b.committed + b.platformFee + b.agencyFee;
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="panel p-5">
          <p className="text-[12px] text-ink-500">Total budget</p>
          <p className="num text-[26px] font-semibold tracking-tight">{m(b.total)}</p>
          <Meter value={used} max={b.total} tone={used > b.total ? 'bad' : 'accent'} className="mt-3 h-2" />
          <p className="num mt-2 text-[12.5px] text-ink-600">{m(used)} committed incl. fees · <span className={b.remaining < 0 ? 'font-semibold text-bad-600' : 'font-semibold text-ink-900'}>{m(b.remaining)} uncommitted</span></p>
          <div className="mt-4"><KeyValue items={[
            ['Creator fees agreed', m(b.guaranteed)],
            ['Performance bonuses (if earned)', m(b.committed - b.guaranteed)],
            [`Platform fee (${b.platformFeePct}%)`, m(b.platformFee)],
            ...(b.agencyFeePct ? [[`Agency fee (${b.agencyFeePct}%)`, m(b.agencyFee)] as [string, string]] : []),
            ['Open offers awaiting reply', m(b.outstandingOffers)],
            ['Projected total if open offers are accepted', <span className="flex items-center justify-end gap-1.5">{m(b.projected)}<SourceTag source="estimate" /></span>],
          ]} /></div>
        </div>
        <div className="panel p-5">
          <p className="text-[13px] font-semibold">Spend status</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-[12px] bg-ok-50 p-3"><p className="text-[12px] text-ok-600">Paid (recorded)</p><p className="num mt-0.5 text-[18px] font-semibold text-ok-600">{m(b.approvedSpend)}</p></div>
            <div className="rounded-[12px] bg-warn-50 p-3"><p className="text-[12px] text-warn-600">Pending payment</p><p className="num mt-0.5 text-[18px] font-semibold text-warn-600">{m(b.pendingPayments)}</p></div>
          </div>
          <p className="mt-4 text-[13px] font-semibold">Allocations by creator</p>
          <ul className="mt-2 space-y-2">{b.allocations.map((a) => <li key={a.collaborationId} className="text-[12.5px]"><div className="flex justify-between"><span className="font-medium">{a.creatorName}</span><span className="num">{m(a.fee)}{a.bonus ? ` + ${m(a.bonus)} bonus` : ''}</span></div><Meter value={a.fee + a.bonus} max={b.total} className="mt-1" tone="ink" /></li>)}</ul>
          {!b.allocations.length && <p className="mt-2 text-[12.5px] text-ink-500">No agreed collaborations yet.</p>}
        </div>
      </div>
      <PaymentsTable campaignId={campaignId} />
      <p className="text-[12px] text-ink-500">Tandem records payment status only. Money is moved through your bank or a licensed payment provider. Results are never guaranteed.</p>
    </div>
  );
}
