import { useState } from 'react';
import { Sparkles, Wand2, ChevronDown, Send, Megaphone, Info } from 'lucide-react';
import { api } from '../../server/api';
import { useOrg } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { interpretBrief, AI_PROVIDER, AI_PROVIDER_LABEL } from '../../ai/provider';
import { emptyCriteria, type BriefCriteria, type Interpretation } from '../../ai/brief';
import { criteriaFromCampaign } from '../../ai/matching';
import { CATEGORIES, COUNTRIES, CURRENCIES, LANGUAGES, OBJECTIVES, PLATFORMS, categoryLabel } from '../../domain/constants';
import type { Currency, Objective } from '../../domain/types';
import type { CreatorView } from '../../server/services/creators';
import { cx, money } from '../../lib/utils';
import { roleCan } from '../../server/access';
import Button from '../../components/ui/Button';
import { ChipSelect, Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Avatar, EmptyState, Notice, PageHeader, Skeleton } from '../../components/ui/misc';
import { Pill, SampleTag } from '../../components/ui/Badge';
import MatchExplain, { ScoreBadge } from '../../components/app/MatchExplain';
import SaveMenu from '../../components/app/SaveMenu';
import InviteModal from '../../components/app/InviteModal';

const SAMPLE = 'We are launching a skincare product in Nigeria. Our audience is women aged 20–35. We have a ₦5 million budget and want creators who can generate awareness and product interest.';
export const BRIEF_DRAFT_KEY = 'tandem.briefDraft';

function CriteriaEditor({ c, set }: { c: BriefCriteria; set: (p: Partial<BriefCriteria>) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Categories" className="md:col-span-2"><ChipSelect size="sm" options={CATEGORIES.map((x) => x.id)} labels={Object.fromEntries(CATEGORIES.map((x) => [x.id, x.label]))} value={c.categories} onChange={(v) => set({ categories: v })} /></Field>
      <Field label="Markets"><ChipSelect size="sm" options={COUNTRIES} value={c.countries} onChange={(v) => set({ countries: v })} /></Field>
      <Field label="Languages"><ChipSelect size="sm" options={LANGUAGES.slice(0, 9)} value={c.languages} onChange={(v) => set({ languages: v })} /></Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Gender"><Select options={['', 'female', 'male', 'all']} labels={{ '': 'Any', female: 'Women', male: 'Men', all: 'All' }} value={c.gender ?? ''} onChange={(e) => set({ gender: (e.target.value || null) as BriefCriteria['gender'] })} /></Field>
        <Field label="Age from"><Input type="number" min={13} max={80} value={c.ageMin ?? ''} onChange={(e) => set({ ageMin: e.target.value ? Number(e.target.value) : null })} /></Field>
        <Field label="to"><Input type="number" min={13} max={80} value={c.ageMax ?? ''} onChange={(e) => set({ ageMax: e.target.value ? Number(e.target.value) : null })} /></Field>
      </div>
      <div className="grid grid-cols-[1fr_90px_90px] gap-2">
        <Field label="Budget"><Input type="number" min={0} value={c.budget?.amount ?? ''} onChange={(e) => set({ budget: e.target.value ? { amount: Number(e.target.value), currency: c.budget?.currency ?? 'NGN' } : null })} /></Field>
        <Field label="Currency"><Select options={CURRENCIES} value={c.budget?.currency ?? 'NGN'} onChange={(e) => set({ budget: { amount: c.budget?.amount ?? 0, currency: e.target.value as Currency } })} /></Field>
        <Field label="Creators"><Input type="number" min={1} max={200} value={c.creatorCount ?? ''} onChange={(e) => set({ creatorCount: e.target.value ? Number(e.target.value) : null })} placeholder="Any" /></Field>
      </div>
      <Field label="Platforms"><ChipSelect size="sm" options={PLATFORMS.map((p) => p.id)} labels={Object.fromEntries(PLATFORMS.map((p) => [p.id, p.label]))} value={c.platforms} onChange={(v) => set({ platforms: v })} /></Field>
      <Field label="Objective"><Select options={['', ...OBJECTIVES.map((o) => o.id)]} labels={{ '': 'Not specified', ...Object.fromEntries(OBJECTIVES.map((o) => [o.id, o.label])) }} value={c.objective ?? ''} onChange={(e) => set({ objective: (e.target.value || null) as Objective | null })} /></Field>
    </div>
  );
}

export default function Match() {
  const { ctx, orgId, role } = useOrg();
  const { navigate } = useRouter();
  const act = useAction();
  const campaigns = useQuery(() => api.campaigns.listCampaigns(ctx, orgId), [ctx, orgId]);
  const [brief, setBrief] = useState('');
  const [interp, setInterp] = useState<(Interpretation & { notice?: string }) | null>(null);
  const [criteria, setCriteria] = useState<BriefCriteria | null>(null);
  const [results, setResults] = useState<Awaited<ReturnType<typeof api.ai.matchCreators>> | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [invite, setInvite] = useState<CreatorView | null>(null);
  const [busy, setBusy] = useState(false);

  const runMatch = async (c: BriefCriteria) => {
    const r = await act.run('match', () => api.ai.matchCreators(ctx, orgId, c, { limit: 24 }));
    if (r) setResults(r);
  };
  const interpret = async () => {
    if (brief.trim().length < 10) return;
    setBusy(true);
    const i = await interpretBrief(brief);
    setBusy(false);
    setInterp(i);
    setCriteria(i.criteria);
    await runMatch(i.criteria);
  };
  const fromCampaign = async (id: string) => {
    const c = campaigns.data?.find((x) => x.campaign.id === id)?.campaign;
    if (!c) return;
    const crit = criteriaFromCampaign(c);
    setInterp({ criteria: crit, interpretedBy: 'local', detected: [`From campaign “${c.name}”`], assumptions: [] });
    setCriteria(crit);
    await runMatch(crit);
  };
  const startCampaign = () => {
    try { sessionStorage.setItem(BRIEF_DRAFT_KEY, JSON.stringify({ brief, criteria })); } catch { /* storage blocked */ }
    navigate('/app/campaigns/new?fromBrief=1');
  };

  return (
    <div>
      <PageHeader eyebrow="AI matching" title="Find creators from a brief" description="Describe what you need in plain language. Tandem turns it into criteria you can adjust, then ranks listed creators with a reason for every point." />
      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <div className="panel p-4">
            <label htmlFor="brief" className="label">Campaign brief</label>
            <Textarea id="brief" value={brief} onChange={(e) => setBrief(e.target.value)} className="min-h-[140px]" maxLength={4000} placeholder={SAMPLE} />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <button onClick={() => setBrief(SAMPLE)} className="text-[12.5px] font-medium text-accent-600">Use example brief</button>
              <Button variant="dark" icon={Wand2} loading={busy || act.busy === 'match'} disabled={brief.trim().length < 10} onClick={interpret}>Interpret & match</Button>
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-[11.5px] text-ink-500"><Info className="mt-px size-3.5 shrink-0" />Interpreter: {AI_PROVIDER_LABEL}. {AI_PROVIDER === 'meta' ? 'Your brief is sent to Meta’s model through Tandem’s server; output is checked before use.' : 'Runs in your browser; nothing is sent anywhere.'}</p>
          </div>
          {!!campaigns.data?.length && (
            <div className="panel p-4">
              <Field label="Or match an existing campaign"><Select options={campaigns.data.map((x) => x.campaign.id)} labels={Object.fromEntries(campaigns.data.map((x) => [x.campaign.id, x.campaign.name]))} placeholder="Choose a campaign…" value="" onChange={(e) => e.target.value && fromCampaign(e.target.value)} /></Field>
            </div>
          )}
          {criteria && (
            <div className="panel p-4 animate-up">
              <div className="mb-3 flex items-center justify-between"><p className="text-[13px] font-semibold">Matching criteria</p><Pill tone={interp?.interpretedBy === 'meta' ? 'accent' : 'neutral'}>{interp?.interpretedBy === 'meta' ? `Meta · ${interp.model}` : 'Local interpreter'}</Pill></div>
              {interp?.notice && <Notice tone="warn" className="mb-3">{interp.notice}</Notice>}
              {!!interp?.assumptions.length && <ul className="mb-3 space-y-1">{interp.assumptions.map((a) => <li key={a} className="text-[12px] text-ink-500">• {a}</li>)}</ul>}
              <CriteriaEditor c={criteria} set={(p) => setCriteria({ ...criteria, ...p })} />
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="dark" icon={Sparkles} loading={act.busy === 'match'} onClick={() => runMatch(criteria)}>Update matches</Button>
                {roleCan(role, 'campaign.edit') && <Button icon={Megaphone} onClick={startCampaign}>Create campaign from this</Button>}
                <Button variant="ghost" onClick={() => { setCriteria(emptyCriteria()); setResults(null); setInterp(null); }}>Clear</Button>
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0">
          {!results && act.busy !== 'match' ? (
            <div className="panel"><EmptyState icon={Sparkles} title="Recommendations appear here" message="Each one shows a match score, the reasons behind it, concerns, budget fit and a suggested role." /></div>
          ) : !results ? (
            <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-[14px]" />)}</div>
          ) : !results.length ? (
            <div className="panel"><EmptyState title="No listed creators fit" message="Loosen the categories or markets and try again." /></div>
          ) : (
            <ul className={cx('space-y-3', act.busy === 'match' && 'opacity-60')}>
              <li className="flex items-center justify-between text-[12.5px] text-ink-500"><span><span className="num font-semibold text-ink-800">{results.length}</span> ranked recommendations</span><span>Click a row for the full breakdown</span></li>
              {results.map(({ match: m, creator: c }, i) => (
                <li key={c.id} className="panel overflow-hidden">
                  <button onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id} className="flex w-full items-start gap-3 p-4 text-left">
                    <span className="num mt-1 w-5 shrink-0 text-[12px] font-semibold text-ink-400">{i + 1}</span>
                    <Avatar name={c.displayName} hue={c.avatarHue} url={c.avatarUrl} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="text-[14px] font-semibold">{c.displayName}</p><span className="text-[12.5px] text-ink-500">@{c.handle}</span>{c.sample && <SampleTag />}</div>
                      <p className="text-[12.5px] text-ink-500">{m.suggestedRole.title} · {c.categories.map(categoryLabel).join(', ')} · {c.country}</p>
                      <p className="mt-1.5 line-clamp-2 text-[12.5px] text-ink-700">{m.reasons.join(' ') || 'Partial fit on the criteria given.'}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.budgetFit !== 'unknown' && <Pill tone={m.budgetFit === 'within' ? 'success' : m.budgetFit === 'stretch' ? 'warning' : 'danger'}>{m.budgetFit === 'within' ? 'Within budget' : m.budgetFit === 'stretch' ? 'Budget stretch' : 'Over budget'}{m.estimatedFee ? ` · ≈${money(m.estimatedFee.amount, m.estimatedFee.currency, { compact: true })}` : ''}</Pill>}
                        {m.concerns.slice(0, 2).map((x) => <Pill key={x} tone="neutral">{x.length > 48 ? `${x.slice(0, 46)}…` : x}</Pill>)}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2"><ScoreBadge score={m.score} confidence={m.confidence} /><ChevronDown className={cx('size-4 text-ink-400 transition-transform', open === c.id && 'rotate-180')} /></div>
                  </button>
                  {open === c.id && (
                    <div className="border-t border-ink-150 bg-ink-50/40 p-4 animate-up">
                      <MatchExplain m={m} />
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => navigate(`/app/creators/${c.id}`)}>View profile</Button>
                        <SaveMenu creatorId={c.id} compact />
                        {roleCan(role, 'outreach.send') && <Button size="sm" variant="dark" icon={Send} onClick={() => setInvite(c)}>Invite</Button>}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {invite && <InviteModal open creator={invite} onClose={() => setInvite(null)} />}
    </div>
  );
}
