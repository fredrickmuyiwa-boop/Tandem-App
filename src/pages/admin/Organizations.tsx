import { useState } from 'react';
import { api } from '../../server/api';
import { useSession } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import type { Organization } from '../../domain/types';
import { formatDate } from '../../lib/utils';
import Button from '../../components/ui/Button';
import { Pill } from '../../components/ui/Badge';
import { Field, Textarea } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { PageHeader, PageSkeleton } from '../../components/ui/misc';

export default function Organizations() {
  const { ctx } = useSession();
  const act = useAction();
  const q = useQuery(() => api.admin.listOrganizations(ctx), [ctx]);
  const [target, setTarget] = useState<Organization | null>(null);
  const [reason, setReason] = useState('');
  const close = () => { setTarget(null); setReason(''); };
  if (!q.data) return <PageSkeleton />;
  return (
    <div>
      <PageHeader title="Organisations" description="Brands, agencies and agency client workspaces." />
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead><tr className="border-b border-ink-150 text-left text-[11.5px] uppercase tracking-wide text-ink-500"><th className="px-4 py-2.5 font-medium">Name</th><th className="px-4 py-2.5 font-medium">Type</th><th className="px-4 py-2.5 font-medium">Plan</th><th className="px-4 py-2.5 text-right font-medium">Members</th><th className="px-4 py-2.5 text-right font-medium">Campaigns</th><th className="px-4 py-2.5 font-medium">Created</th><th className="px-4 py-2.5 font-medium">Status</th><th /></tr></thead>
          <tbody className="divide-y divide-ink-150">{q.data.map(({ org: o, members, campaigns, parent }) => (
            <tr key={o.id}>
              <td className="px-4 py-3"><span className="font-medium">{o.name}</span>{parent && <span className="block text-[12px] text-ink-500">client of {parent}</span>}</td>
              <td className="px-4 py-3 text-ink-600">{o.type}</td><td className="px-4 py-3 text-ink-600">{o.planId}</td>
              <td className="num px-4 py-3 text-right">{members}</td><td className="num px-4 py-3 text-right">{campaigns}</td>
              <td className="px-4 py-3 text-ink-600">{formatDate(o.createdAt)}</td>
              <td className="px-4 py-3"><Pill tone={o.status === 'active' ? 'success' : 'danger'} dot>{o.status}</Pill></td>
              <td className="px-4 py-3 text-right">{o.status === 'active' ? <Button size="sm" variant="danger" onClick={() => setTarget(o)}>Suspend</Button> : <Button size="sm" loading={act.busy === o.id} onClick={() => act.run(o.id, () => api.admin.setOrgStatus(ctx, o.id, 'active', 'Reinstated'), { title: 'Organisation reinstated' })}>Reinstate</Button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Modal open={!!target} onClose={close} size="sm" title={`Suspend ${target?.name ?? ''}?`} description="Members keep their accounts but can’t work in this organisation." footer={<><Button onClick={close}>Cancel</Button><Button variant="danger" loading={act.busy === 'sus'} onClick={async () => { const r = await act.run('sus', () => api.admin.setOrgStatus(ctx, target!.id, 'suspended', reason), { title: 'Organisation suspended' }); if (r) close(); }}>Suspend</Button></>}>
        <Field label="Reason" error={act.fields.reason}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} error={act.fields.reason} /></Field>
      </Modal>
    </div>
  );
}
