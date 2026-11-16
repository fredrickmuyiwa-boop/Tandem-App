import { useEffect, useState } from 'react';
import { api } from '../../server/api';
import { useSession } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import type { Plan } from '../../domain/types';
import Button from '../../components/ui/Button';
import { Field, Input, Textarea, Toggle } from '../../components/ui/Field';
import { Notice, PageHeader, PageSkeleton, Section } from '../../components/ui/misc';

function PlanEditor({ plan }: { plan: Plan }) {
  const { ctx } = useSession();
  const act = useAction();
  const [v, setV] = useState({ name: plan.name, price: plan.priceMonthly == null ? '' : String(plan.priceMonthly), description: plan.description, features: plan.features.join('\n') });
  return (
    <div className="rounded-[12px] border border-ink-200 p-4">
      <p className="mb-3 text-[12px] uppercase tracking-wide text-ink-500">{plan.audience} · {plan.id}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label={`Monthly price (${plan.currency})`} hint="Blank = contact sales"><Input type="number" min={0} value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} /></Field>
        <Field label="Description" className="sm:col-span-2"><Input value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
        <Field label="Features (one per line)" className="sm:col-span-2"><Textarea value={v.features} onChange={(e) => setV({ ...v, features: e.target.value })} /></Field>
      </div>
      <Button className="mt-3" size="sm" loading={act.busy === 's'} onClick={() => act.run('s', () => api.admin.updatePlan(ctx, plan.id, { name: v.name, priceMonthly: v.price === '' ? null : Number(v.price), description: v.description, features: v.features.split('\n') }), { title: `${v.name} saved` })}>Save plan</Button>
    </div>
  );
}

export default function Settings() {
  const { ctx } = useSession();
  const act = useAction();
  const q = useQuery(() => api.admin.getSettings(ctx), [ctx]);
  const [fees, setFees] = useState<{ platformFeePct: number; defaultAgencyFeePct: number; maxUploadMb: number } | null>(null);
  useEffect(() => { if (q.data && !fees) setFees({ platformFeePct: q.data.platformFeePct, defaultAgencyFeePct: q.data.defaultAgencyFeePct, maxUploadMb: q.data.maxUploadMb }); }, [q.data, fees]);
  if (!q.data || !fees) return <PageSkeleton />;
  return (
    <div className="space-y-5">
      <PageHeader title="Platform settings" description="Changes apply immediately and are recorded in the audit log." />
      <Section title="Fees & limits">
        <Notice className="mb-4">Fees are displayed in budgets for planning. Tandem doesn’t collect them — no billing provider is connected.</Notice>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Platform fee %"><Input type="number" min={0} max={30} step={0.5} value={fees.platformFeePct} onChange={(e) => setFees({ ...fees, platformFeePct: Number(e.target.value) })} /></Field>
          <Field label="Default agency fee %"><Input type="number" min={0} max={40} value={fees.defaultAgencyFeePct} onChange={(e) => setFees({ ...fees, defaultAgencyFeePct: Number(e.target.value) })} /></Field>
          <Field label="Max upload (MB)"><Input type="number" min={1} max={500} value={fees.maxUploadMb} onChange={(e) => setFees({ ...fees, maxUploadMb: Number(e.target.value) })} /></Field>
        </div>
        <Button className="mt-3" variant="dark" loading={act.busy === 'f'} onClick={() => act.run('f', () => api.admin.updateFees(ctx, fees), { title: 'Fees saved' })}>Save</Button>
      </Section>
      <Section title="Categories" description="Disabled categories are hidden from new profiles and campaigns.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{q.data.categories.map((c) => <div key={c.id} className="flex items-center justify-between rounded-[10px] border border-ink-150 px-3 py-2"><span className="text-[13px]">{c.label}</span><Toggle label={`${c.label} enabled`} checked={c.enabled} onChange={(v) => act.run(c.id, () => api.admin.toggleCategory(ctx, c.id, v))} /></div>)}</div>
      </Section>
      <Section title="Plans"><div className="grid gap-3 lg:grid-cols-2">{q.data.plans.map((p) => <PlanEditor key={p.id} plan={p} />)}</div></Section>
    </div>
  );
}
