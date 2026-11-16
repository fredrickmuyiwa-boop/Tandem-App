import { useState } from 'react';
import { Scale, Plus, Trash2 } from 'lucide-react';
import { api } from '../../server/api';
import type { ScenarioMix } from '../../server/services/money';
import { useOrg } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { CURRENCIES } from '../../domain/constants';
import type { Currency } from '../../domain/types';
import { compact, cx, money } from '../../lib/utils';
import Button, { IconButton } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { Meter, PageHeader, PageSkeleton, Section, Stat, Notice } from '../../components/ui/misc';
import { SourceTag } from '../../components/ui/Badge';
import PaymentsTable from '../../components/app/PaymentsTable';

const TIERS = [{ id: 'nano', label: 'Nano' }, { id: 'micro', label: 'Micro' }, { id: 'mid', label: 'Mid-tier' }, { id: 'macro', label: 'Macro' }] as const;
type Scenario = { name: string; mix: ScenarioMix[] };
const DEFAULTS: Scenario[] = [
  { name: 'Many micro voices', mix: [{ tier: 'nano', count: 6 }, { tier: 'micro', count: 8 }, { tier: 'mid', count: 0 }, { tier: 'macro', count: 0 }] },
  { name: 'Hero + support', mix: [{ tier: 'nano', count: 0 }, { tier: 'micro', count: 4 }, { tier: 'mid', count: 2 }, { tier: 'macro', count: 0 }] },
];

function Scenarios() {
  const { ctx, orgId } = useOrg();
  const act = useAction();
  const [budget, setBudget] = useState(5_000_000);
  const [currency, setCurrency] = useState<Currency>('NGN');
  const [sc, setSc] = useState<Scenario[]>(DEFAULTS);
  const [res, setRes] = useState<Awaited<ReturnType<typeof api.money.compareScenarios>> | null>(null);
  const run = async () => { const r = await act.run('sc', () => api.money.compareScenarios(ctx, orgId, { budget, currency, scenarios: sc })); if (r && typeof r === 'object') setRes(r); };
  return (
    <Section title="Compare allocation scenarios" description="Cost and coverage using the median indicative rates creators chose to share. These are estimates — not predicted results." action={<Scale className="size-4 text-ink-400" />}>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Budget"><Input type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="w-40" /></Field>
        <Field label="Currency"><Select options={CURRENCIES} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className="w-24" /></Field>
        <Button variant="dark" loading={act.busy === 'sc'} onClick={run}>Compare</Button>
        {sc.length < 3 && <Button icon={Plus} onClick={() => setSc([...sc, { name: `Scenario ${sc.length + 1}`, mix: TIERS.map((t) => ({ tier: t.id, count: 0 })) }])}>Add scenario</Button>}
      </div>
      <div className={cx('mt-4 grid gap-3', sc.length === 3 ? 'lg:grid-cols-3' : 'md:grid-cols-2')}>
        {sc.map((s, i) => {
          const r = res?.scenarios[i];
          return (
            <div key={i} className="rounded-[12px] border border-ink-200 p-4">
              <div className="flex items-center gap-2"><Input aria-label="Scenario name" value={s.name} onChange={(e) => setSc(sc.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="h-8 font-medium" />{sc.length > 1 && <IconButton size="sm" icon={Trash2} label="Remove scenario" onClick={() => setSc(sc.filter((_, j) => j !== i))} />}</div>
              <div className="mt-3 grid grid-cols-4 gap-2">{TIERS.map((t) => <Field key={t.id} label={t.label}><Input type="number" min={0} max={200} value={s.mix.find((m) => m.tier === t.id)?.count ?? 0} onChange={(e) => setSc(sc.map((x, j) => (j === i ? { ...x, mix: x.mix.map((m) => (m.tier === t.id ? { ...m, count: Number(e.target.value) } : m)) } : x)))} className="h-8" /></Field>)}</div>
              {r && (
                <div className="mt-3 border-t border-ink-150 pt-3 text-[12.5px] animate-up">
                  <p className="num text-[18px] font-semibold">{money(r.total, currency)} <SourceTag source="estimate" /></p>
                  <p className={cx('font-medium', r.withinBudget ? 'text-ok-600' : 'text-bad-600')}>{r.withinBudget ? `Within budget · ${money(budget - r.total, currency)} spare` : `Over budget by ${money(r.total - budget, currency)}`}</p>
                  <p className="mt-1 text-ink-600">{r.creators} creators · {money(r.creatorCost, currency)} fees + {money(r.platformFee, currency)} platform fee</p>
                  <p className="text-ink-600">Combined audience ≈ {compact(r.combinedFollowers)} (followers, not reach)</p>
                  {r.incomplete && <p className="mt-1 text-warn-600">Some tiers have no shared rates to estimate from.</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {res && <p className="mt-3 text-[11.5px] text-ink-500">Median rates from {res.tierStats.map((t) => `${t.sampleSize} ${t.tier}`).join(', ')} profiles. Converted at reference exchange rates where needed.</p>}
    </Section>
  );
}

export default function Budget() {
  const { ctx, orgId } = useOrg();
  const { navigate } = useRouter();
  const q = useQuery(() => api.money.budgetOverview(ctx, orgId), [ctx, orgId]);
  if (!q.data) return <PageSkeleton />;
  const cur = Object.entries(q.data.byCurrency) as [Currency, { total: number; committed: number; paid: number; pending: number; remaining: number }][];
  return (
    <div className="space-y-5">
      <PageHeader title="Budget & payments" description="Budgets, commitments, fees and payment status across campaigns. Tandem tracks payments — it never holds or moves money." />
      {cur.map(([c, b]) => (
        <div key={c} className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label={`Total budget (${c})`} value={money(b.total, c, { compact: true })} />
          <Stat label="Committed incl. fees" value={money(b.committed, c, { compact: true })} />
          <Stat label="Paid (recorded)" value={money(b.paid, c, { compact: true })} />
          <Stat label="Pending payment" value={money(b.pending, c, { compact: true })} tone={b.pending ? 'warn' : 'default'} />
          <Stat label="Uncommitted" value={money(b.remaining, c, { compact: true })} />
        </div>
      ))}
      {!cur.length && <Notice>No campaigns with budgets yet.</Notice>}
      <Section title="By campaign">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead><tr className="text-[11.5px] text-ink-500"><th className="pb-2 font-medium">Campaign</th><th className="pb-2 text-right font-medium">Budget</th><th className="pb-2 text-right font-medium">Committed</th><th className="pb-2 text-right font-medium">Fees</th><th className="pb-2 pl-4 font-medium">Used</th><th className="pb-2 text-right font-medium">Uncommitted</th></tr></thead>
            <tbody className="divide-y divide-ink-150">{q.data.rows.map((r) => { const used = r.committed + r.platformFee + r.agencyFee; return (
              <tr key={r.campaignId} className="cursor-pointer hover:bg-ink-50/60" onClick={() => navigate(`/app/campaigns/${r.campaignId}?tab=budget`)}>
                <td className="py-2.5 font-medium">{r.name}</td><td className="num text-right">{money(r.total, r.currency, { compact: true })}</td><td className="num text-right">{money(r.committed, r.currency, { compact: true })}</td><td className="num text-right">{money(r.platformFee + r.agencyFee, r.currency, { compact: true })}</td>
                <td className="w-40 pl-4"><Meter value={used} max={r.total} tone={used > r.total ? 'bad' : 'accent'} /></td><td className={cx('num text-right', r.remaining < 0 && 'text-bad-600')}>{money(r.remaining, r.currency, { compact: true })}</td>
              </tr>); })}</tbody>
          </table>
        </div>
      </Section>
      <PaymentsTable title="All payments" />
      <Scenarios />
    </div>
  );
}
