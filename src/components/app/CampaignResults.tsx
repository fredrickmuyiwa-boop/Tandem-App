import { useState } from 'react';
import { Plus, Upload, Trash2, Download } from 'lucide-react';
import { api } from '../../server/api';
import { useOrg } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { roleCan } from '../../server/access';
import { PLATFORMS, SOURCE_META } from '../../domain/constants';
import type { Platform } from '../../domain/types';
import { compact, formatDate, isoDay, money, pct } from '../../lib/utils';
import { copyText, downloadText, toCsv } from '../../lib/csv';
import Button, { IconButton } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { EmptyState, Notice, Stat } from '../ui/misc';
import { SourceTag } from '../ui/Badge';
import { useToast } from '../ui/Toast';
import LineChart from '../charts/LineChart';
import BarList from '../charts/BarList';

export default function CampaignResults({ campaignId }: { campaignId: string }) {
  const { ctx, orgId, role } = useOrg();
  const toast = useToast();
  const act = useAction();
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const q = useQuery(() => api.analytics.campaignAnalytics(ctx, orgId, campaignId, range), [ctx, orgId, campaignId, range.from, range.to]);
  const collabs = useQuery(() => api.collaborations.listOrgCollaborations(ctx, orgId), [ctx, orgId]);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [csv, setCsv] = useState('date,creator_handle,platform,reach,impressions,engagements,clicks,conversions\n');
  const [form, setForm] = useState({ creatorId: '', date: isoDay(0), platform: 'instagram' as Platform, reach: '', impressions: '', engagements: '', clicks: '', conversions: '', note: '' });
  const edit = roleCan(role, 'results.edit');
  if (q.error) return <Notice tone="warn">{q.error.message}</Notice>;
  if (!q.data) return <div className="skeleton h-80" />;
  const a = q.data;
  const cur = a.campaign.currency;
  const creators = (collabs.data ?? []).filter((x) => x.campaign.id === campaignId).map((x) => x.creator).filter(Boolean);
  const n = (s: string) => (s === '' ? null : Number(s));
  const exportCsv = async () => {
    const content = toCsv(a.rows.map((r) => ({ date: r.date, creator: creators.find((c) => c?.id === r.creatorId)?.handle ?? r.creatorId, platform: r.platform, reach: r.reach, impressions: r.impressions, engagements: r.engagements, clicks: r.clicks, conversions: r.conversions, source: SOURCE_META[r.source].label, sample: r.sample ? 'yes' : '' })));
    if (!downloadText(`${a.campaign.name.replace(/\W+/g, '-').toLowerCase()}-results.csv`, content)) { if (await copyText(content)) toast.success('Copied CSV to clipboard'); }
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="From"><Input type="date" value={range.from ?? ''} onChange={(e) => setRange({ ...range, from: e.target.value || undefined })} /></Field>
        <Field label="To"><Input type="date" value={range.to ?? ''} onChange={(e) => setRange({ ...range, to: e.target.value || undefined })} /></Field>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button icon={Download} disabled={!a.rows.length} onClick={exportCsv}>Export report</Button>
          {edit && <><Button icon={Upload} onClick={() => setImporting(true)}>Import CSV</Button><Button variant="dark" icon={Plus} disabled={!creators.length} onClick={() => { setForm({ ...form, creatorId: creators[0]?.id ?? '' }); setAdding(true); }}>Add results</Button></>}
        </div>
      </div>
      {a.sample && <Notice tone="neutral">Includes fictional sample results from the demo workspace.</Notice>}
      {!a.rows.length ? (
        <div className="panel"><EmptyState title="No results recorded" message="Add figures from creators’ platform insights, or import a CSV. Tandem doesn’t estimate performance without data." /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Reach" value={compact(a.totals.reach)} source={a.sources.map((s) => <SourceTag key={s} source={s} compact />)} />
            <Stat label="Engagements" value={compact(a.totals.engagements)} sub={`${pct(a.derived.engagementRate)} of impressions`} />
            <Stat label="Clicks" value={compact(a.totals.clicks)} sub={`${compact(a.totals.conversions)} conversions`} />
            <Stat label="Cost per engagement" value={a.derived.cpe != null ? money(a.derived.cpe, cur) : '—'} sub={`CPC ${a.derived.cpc != null ? money(a.derived.cpc, cur) : '—'} · CPA ${a.derived.cpa != null ? money(a.derived.cpa, cur) : '—'}`} source={<SourceTag source="estimate" compact />} />
          </div>
          <div className="panel p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[14px] font-semibold">Performance over time</p><div className="flex items-center gap-3 text-[12px] text-ink-500"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent-500" />Reach</span><span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: 'var(--color-clay-600)' }} />Engagements</span></div></div>
            <LineChart data={a.series as unknown as Record<string, number | string | null>[]} series={[{ key: 'reach', label: 'Reach', color: 'var(--color-accent-500)' }, { key: 'engagements', label: 'Engagements', color: 'var(--color-clay-600)' }]} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="panel p-5"><p className="mb-3 text-[14px] font-semibold">Engagements by creator</p><BarList rows={a.byCreator.map((c) => ({ label: c.name, value: c.engagements, hint: c.engagementRate != null ? `${c.engagementRate.toFixed(1)}%` : undefined }))} format={compact} /></div>
            <div className="panel overflow-x-auto p-5">
              <p className="mb-3 text-[14px] font-semibold">Creator comparison</p>
              <table className="w-full min-w-[420px] text-left text-[12.5px]">
                <thead><tr className="text-ink-500"><th className="pb-2 font-medium">Creator</th><th className="pb-2 text-right font-medium">Fee</th><th className="pb-2 text-right font-medium">Reach</th><th className="pb-2 text-right font-medium">ER</th><th className="pb-2 text-right font-medium">CPE</th></tr></thead>
                <tbody className="divide-y divide-ink-150">{a.byCreator.map((c) => <tr key={c.creatorId}><td className="py-2 font-medium">{c.name}</td><td className="num text-right">{money(c.fee, cur, { compact: true })}</td><td className="num text-right">{compact(c.reach)}</td><td className="num text-right">{pct(c.engagementRate)}</td><td className="num text-right">{c.cpe != null ? money(c.cpe, cur) : '—'}</td></tr>)}</tbody>
              </table>
              <p className="mt-2 text-[11.5px] text-ink-400">Costs are calculated from agreed fees, not including bonuses or fees.</p>
            </div>
          </div>
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[12.5px]">
              <thead><tr className="border-b border-ink-150 text-ink-500"><th className="px-5 py-2.5 font-medium">Date</th><th className="font-medium">Creator</th><th className="font-medium">Platform</th><th className="text-right font-medium">Reach</th><th className="text-right font-medium">Impr.</th><th className="text-right font-medium">Eng.</th><th className="text-right font-medium">Clicks</th><th className="pl-4 font-medium">Source</th><th /></tr></thead>
              <tbody className="divide-y divide-ink-150">{[...a.rows].reverse().slice(0, 40).map((r) => <tr key={r.id}><td className="px-5 py-2">{formatDate(r.date, { year: undefined })}</td><td>{a.byCreator.find((c) => c.creatorId === r.creatorId)?.name}</td><td>{PLATFORMS.find((p) => p.id === r.platform)?.label}</td><td className="num text-right">{compact(r.reach)}</td><td className="num text-right">{compact(r.impressions)}</td><td className="num text-right">{compact(r.engagements)}</td><td className="num text-right">{compact(r.clicks)}</td><td className="pl-4"><SourceTag source={r.source} />{r.sample && <span className="ml-1 text-[10.5px] text-clay-700">sample</span>}</td><td className="pr-3 text-right">{edit && <IconButton size="sm" icon={Trash2} label="Delete entry" onClick={() => act.run('del', () => api.analytics.deleteResult(ctx, orgId, r.id))} />}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title="Add results" description="Enter figures from the creator’s platform insights. They will be labelled as manually submitted." footer={<><Button onClick={() => setAdding(false)}>Cancel</Button><Button variant="dark" loading={act.busy === 'add'} onClick={async () => { const r = await act.run('add', () => api.analytics.addResult(ctx, orgId, { campaignId, creatorId: form.creatorId, date: form.date, platform: form.platform, reach: n(form.reach), impressions: n(form.impressions), engagements: n(form.engagements), clicks: n(form.clicks), conversions: n(form.conversions), note: form.note }), { title: 'Results added' }); if (r) setAdding(false); }}>Save results</Button></>}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Creator" className="sm:col-span-3"><Select options={creators.map((c) => c!.id)} labels={Object.fromEntries(creators.map((c) => [c!.id, c!.displayName]))} value={form.creatorId} onChange={(e) => setForm({ ...form, creatorId: e.target.value })} /></Field>
          <Field label="Date" error={act.fields.date}><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Platform"><Select options={PLATFORMS.map((p) => p.id)} labels={Object.fromEntries(PLATFORMS.map((p) => [p.id, p.label]))} value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value as Platform })} /></Field>
          <span />
          {(['reach', 'impressions', 'engagements', 'clicks', 'conversions'] as const).map((k) => <Field key={k} label={k[0].toUpperCase() + k.slice(1)}><Input type="number" min={0} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>)}
          <Field label="Note" className="sm:col-span-3"><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. From Instagram insights screenshot, 48h after posting" /></Field>
        </div>
      </Modal>
      <Modal open={importing} onClose={() => setImporting(false)} title="Import results from CSV" description="Paste rows exported from a reporting tool. Imported rows are labelled ‘Third-party import’." footer={<><Button onClick={() => setImporting(false)}>Cancel</Button><Button variant="dark" loading={act.busy === 'imp'} onClick={async () => { const r = await act.run('imp', () => api.analytics.importResultsCsv(ctx, orgId, campaignId, csv)); if (r && typeof r === 'object') { toast[r.errors.length ? 'warning' : 'success'](`Imported ${r.imported} row${r.imported === 1 ? '' : 's'}`, r.errors.slice(0, 3).join(' · ') || undefined); if (!r.errors.length) setImporting(false); } }}>Import</Button></>}>
        <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} className="min-h-[200px] font-mono text-[12px]" aria-label="CSV" />
        <p className="mt-2 text-[12px] text-ink-500">Required columns: date, creator_handle, platform. Optional: reach, impressions, engagements, clicks, conversions. Up to 500 rows.</p>
      </Modal>
    </div>
  );
}
