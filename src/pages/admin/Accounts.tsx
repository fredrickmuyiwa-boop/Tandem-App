import { useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../../server/api';
import { useSession } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import type { PublicUser } from '../../server/services/auth';
import { formatDate } from '../../lib/utils';
import Button from '../../components/ui/Button';
import { Pill } from '../../components/ui/Badge';
import { Field, Textarea } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { PageHeader, PageSkeleton } from '../../components/ui/misc';

export default function Accounts() {
  const { ctx } = useSession();
  const act = useAction();
  const [q, setQ] = useState('');
  const res = useQuery(() => api.admin.listUsers(ctx, q), [ctx, q]);
  const [target, setTarget] = useState<PublicUser | null>(null);
  const [reason, setReason] = useState('');
  const close = () => { setTarget(null); setReason(''); };
  return (
    <div>
      <PageHeader title="Accounts" description="Suspending an account signs it out everywhere. Every action is recorded in the audit log." />
      <div className="relative mb-4 max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="input pl-9" aria-label="Search accounts" /></div>
      {!res.data ? <PageSkeleton /> : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead><tr className="border-b border-ink-150 text-left text-[11.5px] uppercase tracking-wide text-ink-500"><th className="px-4 py-2.5 font-medium">Account</th><th className="px-4 py-2.5 font-medium">Type</th><th className="px-4 py-2.5 font-medium">Organisations</th><th className="px-4 py-2.5 font-medium">Joined</th><th className="px-4 py-2.5 font-medium">Status</th><th /></tr></thead>
            <tbody className="divide-y divide-ink-150">{res.data.map(({ user: u, orgs }) => (
              <tr key={u.id}>
                <td className="px-4 py-3"><span className="font-medium">{u.name}</span><span className="block text-[12px] text-ink-500">{u.email}{!u.emailVerified && ' · unverified'}</span></td>
                <td className="px-4 py-3 text-ink-600">{u.platformRole === 'admin' ? 'Administrator' : u.kind}</td>
                <td className="px-4 py-3 text-ink-600">{orgs.join(', ') || '—'}</td>
                <td className="px-4 py-3 text-ink-600">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-3"><Pill tone={u.status === 'active' ? 'success' : 'danger'} dot>{u.status}</Pill></td>
                <td className="px-4 py-3 text-right">{u.platformRole !== 'admin' && (u.status === 'active'
                  ? <Button size="sm" variant="danger" onClick={() => setTarget(u)}>Suspend</Button>
                  : <Button size="sm" loading={act.busy === u.id} onClick={() => act.run(u.id, () => api.admin.setUserStatus(ctx, u.id, 'active', 'Reinstated'), { title: 'Account reinstated' })}>Reinstate</Button>)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Modal open={!!target} onClose={close} size="sm" title={`Suspend ${target?.name ?? ''}?`} description="They’ll be signed out and unable to sign in until reinstated." footer={<><Button onClick={close}>Cancel</Button><Button variant="danger" loading={act.busy === 'sus'} onClick={async () => { const r = await act.run('sus', () => api.admin.setUserStatus(ctx, target!.id, 'suspended', reason), { title: 'Account suspended' }); if (r) close(); }}>Suspend</Button></>}>
        <Field label="Reason (recorded in the audit log)" error={act.fields.reason}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} error={act.fields.reason} /></Field>
      </Modal>
    </div>
  );
}
