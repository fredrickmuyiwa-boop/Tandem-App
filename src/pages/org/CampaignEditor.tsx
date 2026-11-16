import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Wand2, Plus, Trash2, Lock } from 'lucide-react';
import { api } from '../../server/api';
import type { CampaignInput } from '../../server/services/campaigns';
import { useOrg } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { interpretBrief } from '../../ai/provider';
import type { BriefCriteria } from '../../ai/brief';
import { CATEGORIES, COMPENSATION, COUNTRIES, CURRENCIES, EDITABLE_WHEN, FORMATS, LANGUAGES, OBJECTIVES, PLATFORMS } from '../../domain/constants';
import type { CompensationModel, ContentFormat, Currency, Objective, Platform } from '../../domain/types';
import { isoDay, uid } from '../../lib/utils';
import Button, { IconButton } from '../../components/ui/Button';
import { Checkbox, ChipSelect, Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Notice, PageHeader, PageSkeleton } from '../../components/ui/misc';
import { BRIEF_DRAFT_KEY } from './Match';

const blank = (): CampaignInput => ({
  name: '', description: '', productId: undefined, objective: 'awareness', audience: { genders: ['all'], ageMin: 18, ageMax: 35, interests: [] }, locations: [], languages: ['English'],
  platforms: ['instagram'], categories: [], budget: 0, currency: 'NGN', startDate: isoDay(14), endDate: isoDay(44),
  deliverables: [{ id: uid('dlv'), platform: 'instagram', format: 'short_video', quantity: 1 }], requirements: '', guidelines: '', approval: { internal: true, client: false },
  compensationModel: 'fixed_plus_bonus', performanceTargets: '', visibility: 'public',
});

function applyCriteria(v: CampaignInput, c: BriefCriteria, brief: string): CampaignInput {
  return {
    ...v,
    name: v.name || nameFromSummary(c.summary),
    description: v.description || brief.slice(0, 1200),
    categories: c.categories.length ? c.categories : v.categories,
    locations: c.countries.length ? c.countries : v.locations,
    languages: c.languages.length ? c.languages : v.languages,
    audience: { ...v.audience, genders: c.gender ? [c.gender] : v.audience.genders, ageMin: c.ageMin ?? v.audience.ageMin, ageMax: c.ageMax ?? v.audience.ageMax, interests: c.interests.length ? c.interests : v.audience.interests },
    budget: c.budget?.amount ?? v.budget,
    currency: c.budget?.currency ?? v.currency,
    objective: c.objective ?? v.objective,
    platforms: c.platforms.length ? c.platforms : v.platforms,
    deliverables: c.formats.length ? c.formats.slice(0, 3).map((f) => ({ id: uid('dlv'), platform: (c.platforms[0] ?? 'instagram') as Platform, format: f, quantity: 1 })) : v.deliverables,
  };
}

/** A readable draft name from a brief's first sentence, e.g. "Launching a skincare product in Nigeria". */
function nameFromSummary(summary: string) {
  let t = summary.replace(/^(we\s+are|we're|we\s+will\s+be|our\s+brand\s+is)\s+/i, '').replace(/[.!?,;:\s]+$/, '').trim();
  if (t.length > 60) t = t.slice(0, 60).replace(/\s+\S*$/, '');
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

export default function CampaignEditor({ params }: { params: Record<string, string> }) {
  const { ctx, orgId, org } = useOrg();
  const { navigate, query } = useRouter();
  const act = useAction();
  const editing = !!params.id;
  const existing = useQuery(() => (editing ? api.campaigns.getCampaign(ctx, orgId, params.id) : Promise.resolve(null)), [ctx, orgId, params.id]);
  const orgInfo = useQuery(() => api.orgs.getOrg(ctx, orgId), [ctx, orgId]);
  const [v, setV] = useState<CampaignInput | null>(editing ? null : blank());
  const [brief, setBrief] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [assumptions, setAssumptions] = useState<string[]>([]);

  useEffect(() => {
    if (editing && existing.data && !v) {
      const { id: _i, orgId: _o, status: _s, createdBy: _c, createdAt: _ca, updatedAt: _u, sample: _sa, ...rest } = existing.data.campaign;
      setV(rest);
    }
  }, [editing, existing.data, v]);
  useEffect(() => {
    if (!editing && query.fromBrief) {
      try {
        const raw = sessionStorage.getItem(BRIEF_DRAFT_KEY);
        if (raw) { const { brief: b, criteria } = JSON.parse(raw) as { brief: string; criteria: BriefCriteria }; setBrief(b ?? ''); setV((x) => applyCriteria(x ?? blank(), criteria, b ?? '')); sessionStorage.removeItem(BRIEF_DRAFT_KEY); }
      } catch { /* ignore */ }
    }
  }, [editing, query.fromBrief]);

  const status = existing.data?.campaign.status ?? 'draft';
  const lockCommercial = editing && !EDITABLE_WHEN.all.includes(status);
  const lockAll = editing && EDITABLE_WHEN.none.includes(status);
  const products = orgInfo.data?.org.products ?? [];
  const set = (p: Partial<CampaignInput>) => setV((x) => ({ ...(x as CampaignInput), ...p }));
  const f = act.fields;
  const canPublish = !editing;
  const isClient = org.type === 'client';
  const sections = useMemo(() => ['Basics', 'Audience & market', 'Channels & content', 'Budget & terms', 'Schedule & approvals'], []);

  if ((editing && !existing.data) || !v) return <PageSkeleton />;

  const draftFromBrief = async () => {
    if (brief.trim().length < 10) return;
    setDrafting(true);
    const i = await interpretBrief(brief);
    setDrafting(false);
    setV(applyCriteria(v, i.criteria, brief));
    setAssumptions([...i.detected.map((d) => `Detected: ${d}`), ...i.assumptions, ...(i.notice ? [i.notice] : [])]);
  };
  const save = async (publish: boolean) => {
    if (editing) {
      const changed = lockCommercial ? Object.fromEntries((['description', 'requirements', 'guidelines', 'performanceTargets', 'endDate', 'approval', 'visibility'] as const).map((k) => [k, v[k]])) : v;
      const r = await act.run('save', () => api.campaigns.updateCampaign(ctx, orgId, params.id, changed), { title: 'Campaign saved' });
      if (r) navigate(`/app/campaigns/${params.id}`);
    } else {
      const r = await act.run(publish ? 'pub' : 'save', () => api.campaigns.createCampaign(ctx, orgId, v, { publish }), { title: publish ? 'Campaign published' : 'Draft saved', body: publish ? 'It’s now recruiting. Invite creators or wait for applications.' : 'Publish when you’re ready.' });
      if (r && typeof r === 'object') navigate(`/app/campaigns/${r.id}`);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader back={<button onClick={() => navigate(editing ? `/app/campaigns/${params.id}` : '/app/campaigns')} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 hover:text-ink-900"><ArrowLeft className="size-4" />{editing ? 'Back to campaign' : 'Campaigns'}</button>} title={editing ? `Edit ${existing.data?.campaign.name}` : 'New campaign'} description={editing ? undefined : 'Start from a brief, or fill in the details yourself.'} />
      {lockAll && <Notice tone="warn" icon={Lock} className="mb-4">This campaign is {status.replace('_', ' ')} and can’t be edited. Pause it to change the brief.</Notice>}
      {lockCommercial && !lockAll && <Notice tone="info" icon={Lock} className="mb-4">Published campaigns keep their commercial terms fixed so creators can rely on them. You can still edit the description, requirements, guidelines, targets, end date, approvals and visibility.</Notice>}
      {!editing && (
        <div className="panel mb-5 p-4">
          <label htmlFor="brief" className="label">Draft from a brief <span className="font-normal text-ink-500">— optional</span></label>
          <Textarea id="brief" value={brief} onChange={(e) => setBrief(e.target.value)} className="min-h-[90px]" placeholder="e.g. Launching a fitness app in Kenya and South Africa for 18–30s. KES 600,000 for 8 creators on TikTok." />
          <div className="mt-2 flex justify-end"><Button icon={Wand2} loading={drafting} disabled={brief.trim().length < 10} onClick={draftFromBrief}>Fill the form from this brief</Button></div>
          {assumptions.length > 0 && <ul className="mt-2 space-y-0.5 text-[12px] text-ink-500">{assumptions.map((a) => <li key={a}>• {a}</li>)}</ul>}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); void save(false); }} noValidate>
        <fieldset disabled={lockAll} className="space-y-5">
          <section className="panel p-5"><h2 className="mb-4 text-[15px] font-semibold">{sections[0]}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Campaign name" required error={f.name} className="sm:col-span-2"><Input disabled={lockCommercial} value={v.name} onChange={(e) => set({ name: e.target.value })} error={f.name} maxLength={120} /></Field>
              <Field label="Description" required error={f.description} hint="What should creators know about the campaign?" className="sm:col-span-2"><Textarea value={v.description} onChange={(e) => set({ description: e.target.value })} error={f.description} maxLength={3000} /></Field>
              <Field label="Objective" required><Select disabled={lockCommercial} options={OBJECTIVES.map((o) => o.id)} labels={Object.fromEntries(OBJECTIVES.map((o) => [o.id, o.label]))} value={v.objective} onChange={(e) => set({ objective: e.target.value as Objective })} /></Field>
              <Field label="Product or service" hint={products.length ? undefined : 'Add products in Settings'}><Select disabled={lockCommercial} options={products.map((p) => p.id)} labels={Object.fromEntries(products.map((p) => [p.id, p.name]))} placeholder="None" value={v.productId ?? ''} onChange={(e) => set({ productId: e.target.value || undefined })} /></Field>
            </div>
          </section>
          <section className="panel p-5"><h2 className="mb-4 text-[15px] font-semibold">{sections[1]}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Target markets"><ChipSelect size="sm" options={COUNTRIES} value={v.locations} onChange={(x) => !lockCommercial && set({ locations: x })} /></Field>
              <Field label="Content languages"><ChipSelect size="sm" options={LANGUAGES.slice(0, 10)} value={v.languages} onChange={(x) => !lockCommercial && set({ languages: x })} /></Field>
              <Field label="Audience gender"><Select disabled={lockCommercial} options={['all', 'female', 'male']} labels={{ all: 'All', female: 'Women', male: 'Men' }} value={v.audience.genders[0]} onChange={(e) => set({ audience: { ...v.audience, genders: [e.target.value as 'all'] } })} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Age from" error={f.ageMin}><Input disabled={lockCommercial} type="number" min={13} max={80} value={v.audience.ageMin ?? ''} onChange={(e) => set({ audience: { ...v.audience, ageMin: e.target.value ? Number(e.target.value) : undefined } })} /></Field>
                <Field label="to"><Input disabled={lockCommercial} type="number" min={13} max={80} value={v.audience.ageMax ?? ''} onChange={(e) => set({ audience: { ...v.audience, ageMax: e.target.value ? Number(e.target.value) : undefined } })} /></Field>
              </div>
              <Field label="Audience interests" hint="Comma separated" className="sm:col-span-2"><Input disabled={lockCommercial} value={v.audience.interests.join(', ')} onChange={(e) => set({ audience: { ...v.audience, interests: e.target.value.split(',').map((x) => x.trim()) } })} placeholder="e.g. home cooking, budget beauty" /></Field>
            </div>
          </section>
          <section className="panel p-5"><h2 className="mb-4 text-[15px] font-semibold">{sections[2]}</h2>
            <div className="space-y-4">
              <Field label="Creator categories"><ChipSelect size="sm" options={CATEGORIES.map((c) => c.id)} labels={Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]))} value={v.categories} onChange={(x) => !lockCommercial && set({ categories: x })} /></Field>
              <Field label="Platforms" required error={f.platforms}><ChipSelect size="sm" options={PLATFORMS.map((p) => p.id)} labels={Object.fromEntries(PLATFORMS.map((p) => [p.id, p.label]))} value={v.platforms} onChange={(x) => !lockCommercial && set({ platforms: x })} /></Field>
              <div>
                <p className="label">Deliverables per creator <span className="text-bad-600">*</span></p>
                <div className="space-y-2">
                  {v.deliverables.map((d, i) => (
                    <div key={d.id} className="grid grid-cols-[1fr_1fr_70px_auto] gap-2 sm:grid-cols-[150px_170px_70px_1fr_auto]">
                      <Select aria-label="Platform" disabled={lockCommercial} options={PLATFORMS.map((p) => p.id)} labels={Object.fromEntries(PLATFORMS.map((p) => [p.id, p.label]))} value={d.platform} onChange={(e) => set({ deliverables: v.deliverables.map((x, j) => (j === i ? { ...x, platform: e.target.value as Platform } : x)) })} />
                      <Select aria-label="Format" disabled={lockCommercial} options={FORMATS.map((x) => x.id)} labels={Object.fromEntries(FORMATS.map((x) => [x.id, x.label]))} value={d.format} onChange={(e) => set({ deliverables: v.deliverables.map((x, j) => (j === i ? { ...x, format: e.target.value as ContentFormat } : x)) })} />
                      <Input aria-label="Quantity" disabled={lockCommercial} type="number" min={1} max={50} value={d.quantity} onChange={(e) => set({ deliverables: v.deliverables.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)) })} />
                      <Input aria-label="Notes" disabled={lockCommercial} className="col-span-3 sm:col-span-1" placeholder="Notes, e.g. routine Reel" value={d.notes ?? ''} onChange={(e) => set({ deliverables: v.deliverables.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)) })} />
                      <IconButton icon={Trash2} label="Remove deliverable" disabled={lockCommercial || v.deliverables.length === 1} onClick={() => set({ deliverables: v.deliverables.filter((_, j) => j !== i) })} />
                    </div>
                  ))}
                </div>
                {!lockCommercial && <button type="button" onClick={() => set({ deliverables: [...v.deliverables, { id: uid('dlv'), platform: v.platforms[0] ?? 'instagram', format: 'story', quantity: 1 }] })} className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-accent-600"><Plus className="size-3.5" />Add deliverable</button>}
              </div>
              <Field label="Content requirements"><Textarea value={v.requirements} onChange={(e) => set({ requirements: e.target.value })} placeholder="Must-haves: disclosure, product shown, link in bio…" maxLength={3000} /></Field>
              <Field label="Brand guidelines"><Textarea value={v.guidelines} onChange={(e) => set({ guidelines: e.target.value })} placeholder="Tone, do’s and don’ts, claims to avoid…" maxLength={3000} /></Field>
            </div>
          </section>
          <section className="panel p-5"><h2 className="mb-4 text-[15px] font-semibold">{sections[3]}</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Total budget" required error={f.budget}><Input disabled={lockCommercial} type="number" min={0} value={v.budget || ''} onChange={(e) => set({ budget: Number(e.target.value) })} error={f.budget} /></Field>
              <Field label="Currency"><Select disabled={lockCommercial} options={CURRENCIES} value={v.currency} onChange={(e) => set({ currency: e.target.value as Currency })} /></Field>
              <Field label="Compensation"><Select disabled={lockCommercial} options={COMPENSATION.map((c) => c.id)} labels={Object.fromEntries(COMPENSATION.map((c) => [c.id, c.label]))} value={v.compensationModel} onChange={(e) => set({ compensationModel: e.target.value as CompensationModel })} /></Field>
              <p className="text-[12px] text-ink-500 sm:col-span-3">{COMPENSATION.find((c) => c.id === v.compensationModel)?.hint} Creators see the compensation model and their offer — never your total budget.</p>
              <Field label="Performance targets" className="sm:col-span-3" hint="Targets guide creators. They are not guarantees."><Input value={v.performanceTargets} onChange={(e) => set({ performanceTargets: e.target.value })} placeholder="e.g. 2% engagement rate, 1,500 link clicks" /></Field>
            </div>
          </section>
          <section className="panel p-5"><h2 className="mb-4 text-[15px] font-semibold">{sections[4]}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start date" error={f.startDate}><Input disabled={lockCommercial} type="date" value={v.startDate} onChange={(e) => set({ startDate: e.target.value })} /></Field>
              <Field label="End date" error={f.endDate}><Input type="date" value={v.endDate} onChange={(e) => set({ endDate: e.target.value })} error={f.endDate} /></Field>
              <div className="space-y-3 sm:col-span-2">
                <Checkbox label="Review content before it goes live" description="Your team approves every submission." checked={v.approval.internal} onChange={(x) => set({ approval: { ...v.approval, internal: x } })} />
                {isClient && <Checkbox label="Also require client approval" description="After your team approves, the client gives final sign-off." checked={v.approval.client} onChange={(x) => set({ approval: { ...v.approval, client: x } })} />}
                <Checkbox label="List publicly so creators can apply" description="Otherwise only invited creators see it." checked={v.visibility === 'public'} onChange={(x) => set({ visibility: x ? 'public' : 'invite_only' })} />
              </div>
            </div>
          </section>
        </fieldset>
        {!lockAll && (
          <div className="sticky bottom-0 -mx-4 mt-5 flex flex-wrap justify-end gap-2 border-t border-ink-200 bg-paper/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-[14px] sm:border">
            <Button onClick={() => navigate(editing ? `/app/campaigns/${params.id}` : '/app/campaigns')}>Cancel</Button>
            <Button type="submit" loading={act.busy === 'save'}>{editing ? 'Save changes' : 'Save draft'}</Button>
            {canPublish && <Button variant="dark" loading={act.busy === 'pub'} onClick={() => save(true)}>Save & publish</Button>}
          </div>
        )}
      </form>
    </div>
  );
}
