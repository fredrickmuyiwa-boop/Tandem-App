import { useState } from 'react';
import { Plus, ArrowRight, UserPlus, Building2 } from 'lucide-react';
import { api } from '../../server/api';
import { useOrg } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { roleCan } from '../../server/access';
import { COUNTRIES } from '../../domain/constants';
import Button from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { EmptyState, PageHeader, PageSkeleton } from '../../components/ui/misc';
import { Pill } from '../../components/ui/Badge';

export default function Clients() {
  const { ctx, orgId, role, switchOrg } = useOrg();
  const { navigate } = useRouter();
  const act = useAction();
  const q = useQuery(() => api.orgs.listClients(ctx, orgId), [ctx, orgId]);
  const [creating, setCreating] = useState(false);
  const [v, setV] = useState({ name: '', country: 'Nigeria', industry: '', website: '' });
  const [inviteFor, setInviteFor] = useState<{ id: string; name: string } | null>(null);
  const [email, setEmail] = useState('');
  if (!q.data) return <PageSkeleton />;
  const manage = roleCan(role, 'clients.manage');
  return (
    <div>
      <PageHeader title="Clients" description="Each client gets a private workspace. Invite client reviewers so they can follow progress and approve content — they never see your other clients, fees or negotiations." actions={manage && <Button variant="dark" icon={Plus} onClick={() => setCreating(true)}>New client</Button>} />
      {q.data.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {q.data.map((c) => (
            <div key={c.org.id} className="panel p-5">
              <div className="flex items-start justify-between gap-3"><div><p className="text-[15px] font-semibold">{c.org.name}</p><p className="text-[12.5px] text-ink-500">{c.org.industry ?? 'Client'} · {c.org.country}</p></div>{c.pendingApprovals > 0 && <Pill tone="warning">{c.pendingApprovals} to review</Pill>}</div>
              <p className="num mt-3 text-[12.5px] text-ink-600">{c.campaigns} campaigns · {c.active} live · {c.reviewers} client reviewer{c.reviewers === 1 ? '' : 's'}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="dark" iconRight={ArrowRight} onClick={async () => { await switchOrg(c.org.id); navigate('/app/dashboard'); }}>Open workspace</Button>
                {manage && <Button size="sm" icon={UserPlus} onClick={() => { setInviteFor({ id: c.org.id, name: c.org.name }); setEmail(''); }}>Invite client reviewer</Button>}
              </div>
            </div>
          ))}
        </div>
      ) : <div className="panel"><EmptyState icon={Building2} title="No clients yet" action={manage && <Button variant="dark" onClick={() => setCreating(true)}>New client</Button>} /></div>}
      <Modal open={creating} onClose={() => setCreating(false)} title="New client workspace" footer={<><Button onClick={() => setCreating(false)}>Cancel</Button><Button variant="dark" loading={act.busy === 'c'} onClick={async () => { const r = await act.run('c', () => api.orgs.createClient(ctx, orgId, v), { title: 'Client workspace created' }); if (r) { setCreating(false); setV({ name: '', country: 'Nigeria', industry: '', website: '' }); } }}>Create</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Client name" required error={act.fields.name} className="sm:col-span-2"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={act.fields.name} /></Field>
          <Field label="Country"><Select options={COUNTRIES} value={v.country} onChange={(e) => setV({ ...v, country: e.target.value })} /></Field>
          <Field label="Industry"><Input value={v.industry} onChange={(e) => setV({ ...v, industry: e.target.value })} /></Field>
        </div>
      </Modal>
      <Modal open={!!inviteFor} onClose={() => setInviteFor(null)} size="sm" title={`Invite a reviewer to ${inviteFor?.name ?? ''}`} description="Client reviewers can view this client’s campaigns and give final approval on content." footer={<><Button onClick={() => setInviteFor(null)}>Cancel</Button><Button variant="dark" loading={act.busy === 'i'} onClick={async () => { const r = await act.run('i', () => api.orgs.inviteMember(ctx, inviteFor!.id, email, 'client_reviewer'), { title: 'Reviewer invited', body: 'No email is sent in Demo mode.' }); if (r) setInviteFor(null); }}>Invite</Button></>}>
        <Field label="Email" error={act.fields.email}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={act.fields.email} /></Field>
      </Modal>
    </div>
  );
}
