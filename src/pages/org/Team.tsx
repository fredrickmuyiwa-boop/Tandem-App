import { useState } from 'react';
import { UserPlus, Trash2 } from 'lucide-react';
import { api, IS_DEMO } from '../../server/api';
import { useOrg } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { ROLE_META } from '../../domain/constants';
import type { OrgRole } from '../../domain/types';
import { roleCan } from '../../server/access';
import { formatDate } from '../../lib/utils';
import Button, { IconButton } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { Avatar, Notice, PageHeader, PageSkeleton, Section } from '../../components/ui/misc';
import { Confirm } from '../../components/ui/Modal';

export default function Team() {
  const { ctx, orgId, org, me } = useOrg();
  const act = useAction();
  const q = useQuery(() => api.orgs.listTeam(ctx, orgId), [ctx, orgId]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>(org.type === 'client' ? 'client_reviewer' : 'member');
  const [remove, setRemove] = useState<string | null>(null);
  if (!q.data) return <PageSkeleton />;
  const manage = roleCan(q.data.myRole, 'team.manage');
  const roles: OrgRole[] = org.type === 'client' ? ['admin', 'manager', 'member', 'client_reviewer'] : ['admin', 'manager', 'member'];
  return (
    <div className="space-y-5">
      <PageHeader title="Team" description={org.type === 'client' ? 'People with access to this client workspace. Agency staff also have access through the agency.' : 'Who can access this workspace and what they can do.'} />
      {manage && (
        <Section title="Invite someone">
          <form className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end" onSubmit={async (e) => { e.preventDefault(); const r = await act.run('inv', () => api.orgs.inviteMember(ctx, orgId, email, role)); if (r && typeof r === 'object') { setEmail(''); } }}>
            <Field label="Email" error={act.fields.email}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={act.fields.email} placeholder="name@company.com" /></Field>
            <Field label="Role"><Select options={roles} labels={Object.fromEntries(roles.map((r) => [r, ROLE_META[r].label]))} value={role} onChange={(e) => setRole(e.target.value as OrgRole)} /></Field>
            <Button type="submit" variant="dark" icon={UserPlus} loading={act.busy === 'inv'}>Invite</Button>
          </form>
          <p className="mt-2 text-[12px] text-ink-500">{ROLE_META[role].description} Existing Tandem users are added straight away; others join automatically when they sign up with that email{IS_DEMO ? ' (no email is sent in Demo mode)' : ' — send them the sign-up link yourself, as invite emails aren’t connected yet'}.</p>
        </Section>
      )}
      <Section title={`Members (${q.data.members.length})`}>
        <ul className="divide-y divide-ink-150">
          {q.data.members.map((m) => (
            <li key={m.membershipId} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar name={m.name} size="sm" hue={210} />
              <span className="min-w-[180px] flex-1"><span className="block text-[13.5px] font-semibold">{m.name}{m.userId === me?.user.id && <span className="ml-1.5 text-[12px] font-normal text-ink-500">(you)</span>}</span><span className="block text-[12px] text-ink-500">{m.email} · since {formatDate(m.since)}</span></span>
              {manage && m.role !== 'owner' && m.userId !== me?.user.id ? (
                <>
                  <Select aria-label={`Role for ${m.name}`} className="w-48" options={roles} labels={Object.fromEntries(roles.map((r) => [r, ROLE_META[r].label]))} value={m.role} onChange={(e) => act.run('role', () => api.orgs.changeMemberRole(ctx, orgId, m.membershipId, e.target.value as OrgRole), { title: 'Role updated' })} />
                  <IconButton icon={Trash2} label={`Remove ${m.name}`} onClick={() => setRemove(m.membershipId)} />
                </>
              ) : <span className="rounded-md bg-ink-100 px-2 py-1 text-[12px] font-medium text-ink-700">{ROLE_META[m.role].label}</span>}
            </li>
          ))}
        </ul>
        {q.data.invites.length > 0 && (<><p className="eyebrow mb-2 mt-4">Pending invites</p><ul className="divide-y divide-ink-150">{q.data.invites.map((i) => <li key={i.id} className="flex items-center justify-between py-2 text-[13px]"><span>{i.email} · {ROLE_META[i.role].label}</span>{manage && <Button size="xs" variant="ghost" onClick={() => act.run('rv', () => api.orgs.revokeInvite(ctx, orgId, i.id), { title: 'Invite revoked' })}>Revoke</Button>}</li>)}</ul></>)}
      </Section>
      <Section title="What each role can do">
        <dl className="grid gap-3 sm:grid-cols-2">{(Object.keys(ROLE_META) as OrgRole[]).filter((r) => org.type === 'client' || r !== 'client_reviewer').map((r) => <div key={r} className="rounded-[12px] border border-ink-200 p-3"><dt className="text-[13px] font-semibold">{ROLE_META[r].label}</dt><dd className="mt-0.5 text-[12.5px] text-ink-600">{ROLE_META[r].description}</dd></div>)}</dl>
        {!manage && <Notice className="mt-3">Only owners and admins can change the team.</Notice>}
      </Section>
      <Confirm open={!!remove} onClose={() => setRemove(null)} title="Remove this member?" message="They’ll lose access to this workspace immediately." confirmLabel="Remove" onConfirm={async () => { const r = await act.run('rm', () => api.orgs.removeMember(ctx, orgId, remove!), { title: 'Member removed' }); if (r) setRemove(null); }} />
    </div>
  );
}
