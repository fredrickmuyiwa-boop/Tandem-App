import { useState } from 'react';
import { api } from '../../server/api';
import { useOrg } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { roleCan } from '../../server/access';
import { PAYMENT_STATUS } from '../../domain/constants';
import type { PaymentStatus } from '../../domain/types';
import { formatDate, money } from '../../lib/utils';
import Button from '../ui/Button';
import { Pill } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { Field, Input } from '../ui/Field';
import { EmptyState } from '../ui/misc';

export default function PaymentsTable({ campaignId, collaborationId, title = 'Payments' }: { campaignId?: string; collaborationId?: string; title?: string }) {
  const { ctx, orgId, role } = useOrg();
  const act = useAction();
  const q = useQuery(() => api.money.listPayments(ctx, orgId, campaignId), [ctx, orgId, campaignId]);
  const [paying, setPaying] = useState<string | null>(null);
  const [ref, setRef] = useState('');
  const can = roleCan(role, 'payments.edit');
  const update = (id: string, s: PaymentStatus, reference?: string) => act.run(`${id}${s}`, () => api.money.updatePayment(ctx, orgId, id, s, reference), { title: s === 'paid' ? 'Recorded as paid' : `Marked ${PAYMENT_STATUS[s].label.toLowerCase()}` });
  if (!q.data) return <div className="skeleton h-40" />;
  const rows = collaborationId ? q.data.filter((x) => x.payment.collaborationId === collaborationId) : q.data;
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4"><h3 className="text-[14px] font-semibold">{title}</h3><span className="text-[12px] text-ink-500">Tracking only · no money moves through Tandem</span></div>
      {rows.length ? (
        <div className="overflow-x-auto p-2">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead><tr className="text-[11.5px] text-ink-500"><th className="px-3 py-2 font-medium">Creator</th><th className="font-medium">Item</th><th className="font-medium">Due</th><th className="font-medium text-right">Amount</th><th className="pl-4 font-medium">Status</th><th /></tr></thead>
            <tbody className="divide-y divide-ink-150">
              {rows.map(({ payment: p, creatorName, campaignName }) => (
                <tr key={p.id}>
                  <td className="px-3 py-2.5"><p className="font-medium">{creatorName}</p>{!campaignId && <p className="text-[11.5px] text-ink-500">{campaignName}</p>}</td>
                  <td className="text-ink-600">{p.label}</td>
                  <td className="text-ink-600">{formatDate(p.dueDate, { year: undefined })}</td>
                  <td className="num text-right font-medium">{p.kind === 'gifting' ? 'Gift' : money(p.amount, p.currency)}</td>
                  <td className="pl-4"><Pill tone={PAYMENT_STATUS[p.status].tone} dot>{PAYMENT_STATUS[p.status].label}</Pill>{p.reference && <p className="mt-0.5 text-[11px] text-ink-400">Ref {p.reference}</p>}</td>
                  <td className="pr-3 text-right">
                    {can && p.status === 'scheduled' && <Button size="xs" onClick={() => update(p.id, 'pending')}>Mark pending</Button>}
                    {can && p.status === 'pending' && <Button size="xs" variant="dark" onClick={() => { setPaying(p.id); setRef(''); }}>Record payment</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="No payments yet" message="Payment schedules are created when terms are agreed." className="py-6" />}
      <Modal open={!!paying} onClose={() => setPaying(null)} size="sm" title="Record a payment" description="Record a payment you made through your bank or payment provider. Tandem does not transfer money." footer={<><Button onClick={() => setPaying(null)}>Cancel</Button><Button variant="dark" loading={!!act.busy} onClick={async () => { const r = await update(paying!, 'paid', ref); if (r) setPaying(null); }}>Mark as paid</Button></>}>
        <Field label="Payment reference" error={act.fields.reference} hint="From your bank transfer or provider receipt"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. TRF-2026-0193" error={act.fields.reference} /></Field>
      </Modal>
    </div>
  );
}
