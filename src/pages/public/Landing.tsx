import { useState, type ReactNode } from 'react';
import { ArrowRight, Sparkles, ShieldCheck, Scale, Handshake, FileCheck2, Wallet, BarChart3, Compass, Users, Building2, Camera } from 'lucide-react';
import { useRouter } from '../../lib/router';
import { api, IS_DEMO } from '../../server/api';
import { interpretBrief, AI_PROVIDER_LABEL } from '../../ai/provider';
import type { Interpretation } from '../../ai/brief';
import { categoryLabel, OBJECTIVES, platformLabel } from '../../domain/constants';
import { money } from '../../lib/utils';
import Button from '../../components/ui/Button';
import { Avatar } from '../../components/ui/misc';
import { SourceTag } from '../../components/ui/Badge';

const EXAMPLE = 'We are launching a skincare product in Nigeria. Our audience is women aged 20–35. We have a ₦5 million budget and want creators who can generate awareness and product interest.';

type Preview = Awaited<ReturnType<typeof api.ai.publicDemoMatch>>;

function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-7 items-center rounded-full border border-ink-200 bg-surface px-2.5 text-[12px] font-medium text-ink-700">{children}</span>;
}

function BriefDemo() {
  const [text, setText] = useState(EXAMPLE);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ i: Interpretation; matches: Preview } | null>(null);
  const run = async () => {
    if (text.trim().length < 10) return;
    setBusy(true);
    const i = await interpretBrief(text);
    const matches = await api.ai.publicDemoMatch(i.criteria);
    setRes({ i, matches });
    setBusy(false);
  };
  const c = res?.i.criteria;
  return (
    <div className="panel overflow-hidden shadow-md">
      <div className="flex items-center justify-between border-b border-ink-150 px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-800"><Sparkles className="size-3.5 text-accent-600" /> Try it: describe a campaign</p>
        <span className="text-[11px] text-ink-400">{AI_PROVIDER_LABEL}</span>
      </div>
      <div className="p-4">
        <label htmlFor="brief" className="sr-only">Campaign brief</label>
        <textarea id="brief" value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={1500} className="input min-h-[104px] resize-none text-[13.5px]" />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11.5px] text-ink-500">Matches fictional sample profiles only.</p>
          <Button variant="dark" size="sm" loading={busy} onClick={run} iconRight={ArrowRight}>Find creators</Button>
        </div>
      </div>
      {res && c && (
        <div className="border-t border-ink-150 bg-ink-50/60 p-4 animate-up">
          <p className="eyebrow mb-2">Understood as</p>
          <div className="flex flex-wrap gap-1.5">
            {c.categories.map((x) => <Chip key={x}>{categoryLabel(x)}</Chip>)}
            {c.countries.map((x) => <Chip key={x}>{x}</Chip>)}
            {c.gender && c.gender !== 'all' && <Chip>{c.gender === 'female' ? 'Women' : 'Men'}{c.ageMin ? ` ${c.ageMin}–${c.ageMax}` : ''}</Chip>}
            {c.budget && <Chip>{money(c.budget.amount, c.budget.currency, { compact: true })}</Chip>}
            {c.objective && <Chip>{OBJECTIVES.find((o) => o.id === c.objective)?.label}</Chip>}
            {c.platforms.map((p) => <Chip key={p}>{platformLabel(p)}</Chip>)}
          </div>
          <ul className="mt-4 space-y-2">
            {res.matches.map((m) => (
              <li key={m.handle} className="flex items-start gap-3 rounded-[12px] border border-ink-200 bg-surface p-3">
                <Avatar name={m.name} hue={m.hue} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-ink-900">{m.name} <span className="font-normal text-ink-500">· {m.role}</span></p>
                  <p className="line-clamp-2 text-[12px] text-ink-600">{m.reasons.join(' ') || 'Partial fit.'}{m.concern && <span className="text-warn-600"> Watch: {m.concern}</span>}</p>
                </div>
                <span className="num rounded-[8px] bg-ok-50 px-2 py-1 text-[13px] font-semibold text-ok-600">{m.score}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const STEPS = [
  { icon: Compass, title: 'Brief', text: 'Describe the objective, audience, market and budget. Tandem turns it into matching criteria you can edit.' },
  { icon: Sparkles, title: 'Match', text: 'Every recommendation shows its score, the reasons, the concerns and the data behind it.' },
  { icon: Handshake, title: 'Negotiate', text: 'Invite with clear terms. Creators accept, ask questions or counter. Accepted terms become the collaboration.' },
  { icon: FileCheck2, title: 'Approve', text: 'Creators submit drafts. You comment, request revisions within the agreed limit, and approve — with an optional client stage.' },
  { icon: Wallet, title: 'Track spend', text: 'Budgets, fees and payment status in one place. Tandem records payments; your provider moves the money.' },
  { icon: BarChart3, title: 'Measure', text: 'Results are labelled by source, so a verified figure is never confused with a screenshot.' },
];

export default function Landing() {
  const { navigate } = useRouter();
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
        <div>
          <p className="eyebrow mb-4">Creator marketing operating system</p>
          <h1 className="font-display text-[46px] leading-[1.02] tracking-[-0.01em] text-ink-950 sm:text-[60px]">The right brands.<br />The right creators.<br /><span className="italic text-accent-700">Better campaigns.</span></h1>
          <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-ink-600">Tandem connects brands, agencies and creators in one workspace — from the first brief to approved content and recorded results. Less spreadsheet work, fewer lost DMs, and AI recommendations that explain themselves.</p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            <Button variant="dark" size="lg" onClick={() => navigate('/signup')} iconRight={ArrowRight}>Create a free account</Button>
            <Button size="lg" onClick={() => navigate('/signin')}>{IS_DEMO ? 'Explore the demo' : 'Sign in'}</Button>
          </div>
          {IS_DEMO && <p className="mt-4 text-[12.5px] text-ink-500">The demo opens with fictional brands, creators and figures. Nothing is sent or paid.</p>}
        </div>
        <BriefDemo />
      </section>

      <section className="border-y border-ink-150 bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="max-w-2xl">
            <p className="eyebrow mb-2">How a campaign runs</p>
            <h2 className="text-[28px] font-semibold tracking-tight">Six steps, one record of what was agreed.</h2>
          </div>
          <ol className="mt-8 grid gap-px overflow-hidden rounded-[14px] border border-ink-200 bg-ink-200 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="bg-surface p-5">
                <div className="flex items-center gap-2.5"><span className="num text-[12px] font-semibold text-ink-400">0{i + 1}</span><s.icon className="size-4 text-accent-600" /><h3 className="text-[15px] font-semibold">{s.title}</h3></div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            { id: 'brands', icon: Building2, title: 'For brands', points: ['Discover creators with 5K–50K engaged followers', 'Explainable AI matching against your brief', 'Approvals, budgets and results in one place'] },
            { id: 'agencies', icon: Users, title: 'For agencies', points: ['A workspace for every client', 'A shared creator database across clients', 'Client approval stage and client-ready reporting'] },
            { id: 'creators', icon: Camera, title: 'For creators', points: ['Free professional profile you control', 'Clear offers you can accept, question or counter', 'Deadlines, feedback and payment status tracked'] },
          ].map((a) => (
            <div key={a.id} id={a.id} className="panel scroll-mt-24 p-6">
              <a.icon className="size-5 text-ink-500" />
              <h3 className="mt-3 text-[18px] font-semibold">{a.title}</h3>
              <ul className="mt-3 space-y-2">{a.points.map((p) => <li key={p} className="flex gap-2 text-[13.5px] text-ink-600"><span className="mt-2 size-1 shrink-0 rounded-full bg-accent-500" />{p}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-ink-150 bg-ink-950 text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-white/50">Trust by design</p>
            <h2 className="mt-2 font-display text-[38px] leading-tight">Every number says where it came from.</h2>
            <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-white/70">Creator-submitted figures, imported data, verified platform data and Tandem’s own estimates are labelled everywhere. Recommendations show their reasoning. Nothing is invented to fill a gap.</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: ShieldCheck, t: 'Workspace isolation', d: 'Your shortlists, notes and budgets are private to your organisation.' },
              { icon: Scale, t: 'Creator privacy controls', d: 'Creators decide whether rates, audience and location are visible.' },
              { icon: Sparkles, t: 'AI that shows its work', d: 'Scores break down into weighted factors with sources and concerns.' },
              { icon: Wallet, t: 'No hidden money flows', d: 'Tandem tracks payment status. A licensed provider executes payments.' },
            ].map((x) => (
              <li key={x.t} className="rounded-[14px] border border-white/10 bg-white/[0.04] p-4">
                <x.icon className="size-4 text-accent-300" />
                <p className="mt-2 text-[14px] font-semibold">{x.t}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-white/60">{x.d}</p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2 lg:col-span-2">
            <span className="text-[12px] text-white/50">Source labels:</span>
            {(['verified', 'creator_submitted', 'imported', 'manual', 'estimate'] as const).map((s) => <span key={s} className="rounded-md bg-white px-1 py-0.5"><SourceTag source={s} /></span>)}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
        <h2 className="font-display text-[36px] leading-tight">Run your next creator campaign in Tandem.</h2>
        <p className="mx-auto mt-3 max-w-md text-[14.5px] text-ink-600">Free for creators. Plans for brands and agencies.</p>
        <div className="mt-6 flex justify-center gap-2.5"><Button variant="dark" size="lg" onClick={() => navigate('/signup')}>Get started</Button><Button size="lg" onClick={() => navigate('/pricing')}>See pricing</Button></div>
      </section>
    </>
  );
}
