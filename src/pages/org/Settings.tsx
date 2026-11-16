import { useEffect, useState } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import { api } from '../../server/api';
import { useOrg } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { roleCan } from '../../server/access';
import { COUNTRIES } from '../../domain/constants';
import { cx, money } from '../../lib/utils';
import Button, { IconButton } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Notice, PageHeader, PageSkeleton, Section, Tabs } from '../../components/ui/misc';
import { NotificationPrefsPanel, SecurityPanel, DataPanel } from '../../components/app/AccountPanels';

type Tab = 'workspace' | 'products' | 'plan' | 'notifications' | 'security' | 'data';

function Workspace() {
  const { ctx, orgId, role } = useOrg();
  const act = useAction();
  const q = useQuery(() => api.orgs.getOrg(ctx, orgId), [ctx, orgId]);
  const [v, setV] = useState<{ name: string; country: string; industry: string; website: string; description: string; agencyFeePct: number } | null>(null);
  useEffect(() => { if (q.data && !v) setV({ name: q.data.org.name, country: q.data.org.country, industry: q.data.org.industry ?? '', website: q.data.org.website ?? '', description: q.data.org.description ?? '', agencyFeePct: q.data.org.agencyFeePct ?? 0 }); }, [q.data, v]);
  if (!q.data || !v) return <div className="skeleton h-60" />;
  const can = roleCan(role, 'settings.manage');
  return (
    <Section title="Workspace profile">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void act.run('s', () => api.orgs.updateOrg(ctx, orgId, v), { title: 'Workspace saved' }); }}>
        <fieldset disabled={!can} className="contents">
          <Field label="Name" error={act.fields.name}><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={act.fields.name} /></Field>
          <Field label="Country"><Select options={COUNTRIES} value={v.country} onChange={(e) => setV({ ...v, country: e.target.value })} /></Field>
          <Field label="Industry"><Input value={v.industry} onChange={(e) => setV({ ...v, industry: e.target.value })} /></Field>
          <Field label="Website" error={act.fields.website}><Input value={v.website} onChange={(e) => setV({ ...v, website: e.target.value })} error={act.fields.website} /></Field>
          <Field label="Description" className="sm:col-span-2"><Textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
          {q.data.org.type === 'agency' && <Field label="Agency fee %" hint="Shown in each client’s campaign budget"><Input type="number" min={0} max={40} value={v.agencyFeePct} onChange={(e) => setV({ ...v, agencyFeePct: Number(e.target.value) })} /></Field>}
        </fieldset>
        {can ? <div className="sm:col-span-2"><Button type="submit" variant="dark" loading={act.busy === 's'}>Save</Button></div> : <Notice className="sm:col-span-2">Only owners and admins can edit workspace settings.</Notice>}
      </form>
    </Section>
  );
}

function Products() {
  const { ctx, orgId, role } = useOrg();
  const act = useAction();
  const q = useQuery(() => api.orgs.getOrg(ctx, orgId), [ctx, orgId]);
  const [v, setV] = useState({ name: '', description: '', priceHint: '' });
  if (!q.data) return <div className="skeleton h-40" />;
  const can = roleCan(role, 'campaign.edit');
  return (
    <Section title="Products & services" description="Referenced in campaign briefs, AI drafts and creator invitations.">
      <ul className="divide-y divide-ink-150">{q.data.org.products.map((p) => <li key={p.id} className="flex items-start gap-3 py-3"><div className="min-w-0 flex-1"><p className="text-[13.5px] font-semibold">{p.name}{p.priceHint && <span className="ml-2 font-normal text-ink-500">{p.priceHint}</span>}</p><p className="text-[12.5px] text-ink-600">{p.description}</p></div>{can && <IconButton icon={Trash2} size="sm" label={`Delete ${p.name}`} onClick={() => act.run('d', () => api.orgs.deleteProduct(ctx, orgId, p.id))} />}</li>)}</ul>
      {!q.data.org.products.length && <p className="text-[13px] text-ink-500">No products yet.</p>}
      {can && (
        <form className="mt-4 grid gap-3 border-t border-ink-150 pt-4 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-end" onSubmit={async (e) => { e.preventDefault(); const r = await act.run('a', () => api.orgs.saveProduct(ctx, orgId, v), { title: 'Product added' }); if (r) setV({ name: '', description: '', priceHint: '' }); }}>
          <Field label="Name" error={act.fields.name}><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={act.fields.name} /></Field>
          <Field label="Description"><Input value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
          <Field label="Price (optional)"><Input value={v.priceHint} onChange={(e) => setV({ ...v, priceHint: e.target.value })} /></Field>
          <Button type="submit" icon={Plus} loading={act.busy === 'a'}>Add</Button>
        </form>
      )}
    </Section>
  );
}

function Plan() {
  const { ctx, orgId, role, org } = useOrg();
  const act = useAction();
  const q = useQuery(() => api.orgs.getOrg(ctx, orgId), [ctx, orgId]);
  if (!q.data) return <div className="skeleton h-60" />;
  if (org.type === 'client') return <Section title="Plan"><p className="text-[13px] text-ink-600">This client workspace uses {q.data.parentName}’s {q.data.plan.name} plan.</p></Section>;
  const plans = api.orgs.publicPlans().filter((p) => p.audience === (org.type === 'agency' ? 'agency' : 'brand'));
  const can = roleCan(role, 'settings.manage');
  return (
    <Section title="Plan & billing" description="Billing isn’t connected in Demo mode. Changing plan takes effect immediately and no payment is taken.">
      <div className="grid gap-3 md:grid-cols-3">
        {plans.map((p) => {
          const current = p.id === q.data!.org.planId;
          return (
            <div key={p.id} className={cx('rounded-[12px] border p-4', current ? 'border-ink-900 ring-1 ring-ink-900' : 'border-ink-200')}>
              <p className="text-[14px] font-semibold">{p.name}</p>
              <p className="num mt-1 text-[20px] font-semibold">{p.priceMonthly == null ? 'Custom' : money(p.priceMonthly, p.currency)}<span className="text-[12px] font-normal text-ink-500">{p.priceMonthly ? ' / month' : ''}</span></p>
              <ul className="mt-3 space-y-1">{p.features.slice(0, 5).map((f) => <li key={f} className="flex gap-1.5 text-[12.5px] text-ink-600"><Check className="mt-0.5 size-3.5 shrink-0 text-ok-600" />{f}</li>)}</ul>
              <Button className="mt-4 w-full" size="sm" variant={current ? 'soft' : 'secondary'} disabled={current || !can || p.priceMonthly == null} loading={act.busy === p.id} onClick={() => act.run(p.id, () => api.orgs.changePlan(ctx, orgId, p.id), { title: `Switched to ${p.name}`, body: 'Demo: no charge was made.' })}>{current ? 'Current plan' : p.priceMonthly == null ? 'Contact sales' : 'Switch'}</Button>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

export default function Settings() {
  const { query, navigate } = useRouter();
  const tab = (query.tab as Tab) || 'workspace';
  const { org } = useOrg();
  if (!org) return <PageSkeleton />;
  const go = (t: Tab) => navigate(`/app/settings?tab=${t}`, { replace: true });
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description={org.name} />
      <Tabs value={tab} onChange={go} tabs={[{ id: 'workspace', label: 'Workspace' }, { id: 'products', label: 'Products' }, { id: 'plan', label: 'Plan' }, { id: 'notifications', label: 'Notifications' }, { id: 'security', label: 'Security' }, { id: 'data', label: 'Data & privacy' }]} />
      {tab === 'workspace' && <Workspace />}
      {tab === 'products' && <Products />}
      {tab === 'plan' && <Plan />}
      {tab === 'notifications' && <NotificationPrefsPanel />}
      {tab === 'security' && <SecurityPanel />}
      {tab === 'data' && <DataPanel />}
    </div>
  );
}
