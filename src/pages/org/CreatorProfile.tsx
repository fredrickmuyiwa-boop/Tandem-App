import { useState, type ReactNode } from 'react';
import { ArrowLeft, Link2, Flag, Send, MapPin, Languages, ExternalLink, Plus, Bell, Image as ImageIcon } from 'lucide-react';
import { api } from '../../server/api';
import { useOrg } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { roleCan } from '../../server/access';
import { RELATIONSHIP, categoryLabel, formatLabel, platformLabel } from '../../domain/constants';
import type { RelationshipStatus } from '../../domain/types';
import { avgEngagement, statsSource, tier, totalFollowers } from '../../domain/creatorStats';
import { compact, formatDate, money, timeAgo } from '../../lib/utils';
import { copyText } from '../../lib/csv';
import Button from '../../components/ui/Button';
import { Pill, SampleTag, SourceTag, VerifiedIdentity } from '../../components/ui/Badge';
import { Avatar, EmptyState, PageSkeleton, Section, Tabs, Notice, Meter } from '../../components/ui/misc';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import SaveMenu from '../../components/app/SaveMenu';
import InviteModal from '../../components/app/InviteModal';
import MatchExplain, { ScoreBadge } from '../../components/app/MatchExplain';

function Crm({ creatorId }: { creatorId: string }) {
  const { ctx, orgId, role } = useOrg();
  const act = useAction();
  const q = useQuery(() => api.crm.getCrm(ctx, orgId, creatorId), [ctx, orgId, creatorId]);
  const [note, setNote] = useState('');
  const [tag, setTag] = useState('');
  const [rem, setRem] = useState({ text: '', due: '' });
  const r = q.data?.record;
  const edit = roleCan(role, 'crm.edit');
  if (!q.data) return <div className="skeleton h-40" />;
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-ink-500">Private to your workspace. The creator never sees these notes.</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Relationship"><Select disabled={!edit} options={Object.keys(RELATIONSHIP) as RelationshipStatus[]} labels={Object.fromEntries(Object.entries(RELATIONSHIP).map(([k, v]) => [k, v.label]))} value={r?.status ?? 'prospect'} onChange={(e) => act.run('s', () => api.crm.updateCrm(ctx, orgId, creatorId, { status: e.target.value as RelationshipStatus }))} /></Field>
        <Field label="Preferred contact"><Input disabled={!edit} defaultValue={r?.preferredContact ?? ''} placeholder="In-platform messages" onBlur={(e) => e.target.value !== (r?.preferredContact ?? '') && act.run('p', () => api.crm.updateCrm(ctx, orgId, creatorId, { preferredContact: e.target.value }))} /></Field>
      </div>
      <div>
        <p className="label">Tags</p>
        <div className="flex flex-wrap gap-1.5">
          {(r?.tags ?? []).map((t) => <button key={t} disabled={!edit} onClick={() => act.run('t', () => api.crm.updateCrm(ctx, orgId, creatorId, { tags: r!.tags.filter((x) => x !== t) }))} className="rounded-md bg-ink-100 px-2 py-0.5 text-[12px] text-ink-700 hover:bg-bad-50 hover:text-bad-600" title="Remove tag">#{t}</button>)}
          {edit && <form onSubmit={(e) => { e.preventDefault(); if (tag.trim()) void act.run('t', () => api.crm.updateCrm(ctx, orgId, creatorId, { tags: [...(r?.tags ?? []), tag] })).then(() => setTag('')); }}><input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="+ tag" className="h-6 w-20 rounded-md border border-dashed border-ink-300 px-1.5 text-[12px] focus:outline-none" aria-label="Add tag" /></form>}
        </div>
      </div>
      <div>
        <p className="label">Reminders</p>
        <ul className="space-y-1.5">{(r?.reminders ?? []).map((x) => (
          <li key={x.id} className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={x.done} disabled={!edit} onChange={() => act.run('r', () => api.crm.toggleReminder(ctx, orgId, creatorId, x.id))} className="size-4 accent-accent-600" aria-label={`Done: ${x.text}`} /><span className={x.done ? 'text-ink-400 line-through' : ''}>{x.text}</span><span className="ml-auto text-[11.5px] text-ink-500">{formatDate(x.due, { year: undefined })}</span></li>
        ))}</ul>
        {edit && <form className="mt-2 grid grid-cols-[1fr_130px_auto] gap-1.5" onSubmit={(e) => { e.preventDefault(); void act.run('a', () => api.crm.addReminder(ctx, orgId, creatorId, rem.text, rem.due)).then((ok) => ok && setRem({ text: '', due: '' })); }}><Input value={rem.text} onChange={(e) => setRem({ ...rem, text: e.target.value })} placeholder="Follow up about…" aria-label="Reminder" className="h-8" /><Input type="date" value={rem.due} onChange={(e) => setRem({ ...rem, due: e.target.value })} aria-label="Due date" className="h-8" /><Button size="sm" type="submit" icon={Bell}>Add</Button></form>}
      </div>
      <div>
        <p className="label">Notes</p>
        {edit && <form onSubmit={(e) => { e.preventDefault(); void act.run('n', () => api.crm.addCrmNote(ctx, orgId, creatorId, note)).then((ok) => ok && setNote('')); }}><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a private note" className="min-h-[64px]" aria-label="New note" /><div className="mt-1.5 flex justify-end"><Button size="sm" type="submit" icon={Plus} disabled={!note.trim()}>Add note</Button></div></form>}
        <ul className="mt-2 space-y-2">{(r?.notes ?? []).map((n) => <li key={n.id} className="rounded-[10px] bg-ink-50 p-2.5 text-[13px]"><p className="whitespace-pre-wrap text-ink-800">{n.text}</p><p className="mt-1 text-[11px] text-ink-400">{n.authorName} · {timeAgo(n.at)}</p></li>)}</ul>
      </div>
      {q.data.collaborations.length > 0 && <div><p className="label">With your workspace</p><ul className="space-y-1 text-[13px]">{q.data.collaborations.map((k) => <li key={k.collab.id} className="flex justify-between"><span>{k.campaignName}</span><Pill tone={k.collab.status === 'completed' ? 'neutral' : 'success'}>{k.collab.status}</Pill></li>)}</ul></div>}
    </div>
  );
}

export default function CreatorProfile({ params }: { params: Record<string, string> }) {
  const { ctx, orgId, role } = useOrg();
  const { navigate, query } = useRouter();
  const toast = useToast();
  const act = useAction();
  const q = useQuery(() => api.creators.getCreatorForOrg(ctx, orgId, params.id), [ctx, orgId, params.id]);
  const match = useQuery(async () => (query.campaign ? (await api.ai.matchForCampaign(ctx, orgId, query.campaign, { limit: 200 }).catch(() => [])).find((m) => m.creator.id === params.id) ?? null : null), [ctx, orgId, query.campaign, params.id]);
  const [tab, setTab] = useState<'overview' | 'portfolio' | 'history'>('overview');
  const [invite, setInvite] = useState(false);
  const [report, setReport] = useState(false);
  const [reason, setReason] = useState('');
  if (q.error) return <EmptyState title="Creator not available" message="This profile isn’t listed or doesn’t exist." action={<Button onClick={() => navigate('/app/discover')}>Back to discovery</Button>} />;
  if (!q.data) return <PageSkeleton />;
  const c = q.data.creator;
  const f = totalFollowers(c);
  const er = avgEngagement(c);
  const share = async () => { (await copyText(`${location.origin}${location.pathname}#/app/creators/${c.id}`)) ? toast.success('Link copied', 'Teammates in this workspace can open it.') : toast.error('Couldn’t copy', 'Copy the address from your browser instead.'); };

  const Stat = ({ label, value, src }: { label: string; value: ReactNode; src?: ReturnType<typeof statsSource> }) => (
    <div className="min-w-0 rounded-[12px] border border-ink-200 px-3.5 py-3"><p className="flex flex-wrap items-center justify-between gap-1 text-[12px] text-ink-500">{label}{src && <SourceTag source={src} />}</p><p className="num mt-1 text-[18px] font-semibold">{value}</p></div>
  );

  return (
    <div>
      <button onClick={() => window.history.length > 1 ? window.history.back() : navigate('/app/discover')} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 hover:text-ink-900"><ArrowLeft className="size-4" />Back</button>
      <div className="panel mb-5 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <Avatar name={c.displayName} hue={c.avatarHue} url={c.avatarUrl} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-[22px] font-semibold tracking-tight">{c.displayName}</h1>{c.sample && <SampleTag />}{c.identityVerification === 'verified' && <VerifiedIdentity />}</div>
            <p className="text-[13.5px] text-ink-500">@{c.handle}</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-600"><span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{c.city ? `${c.city}, ` : ''}{c.country}</span><span className="inline-flex items-center gap-1"><Languages className="size-3.5" />{c.languages.join(', ')}</span>{c.availability !== 'available' && <Pill tone="warning">{c.availability === 'limited' ? 'Limited availability' : 'Unavailable'}</Pill>}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <SaveMenu creatorId={c.id} />
            <Button icon={Link2} onClick={share}>Share</Button>
            {roleCan(role, 'outreach.send') && <Button variant="dark" icon={Send} onClick={() => setInvite(true)}>Invite to campaign</Button>}
          </div>
        </div>
        {c.sample && <Notice className="mt-4" tone="neutral">Sample profile: this creator and their figures are fictional demo data.</Notice>}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          {match.data && (
            <Section title="Match for this campaign" action={<ScoreBadge score={match.data.match.score} confidence={match.data.match.confidence} />}>
              <MatchExplain m={match.data.match} />
            </Section>
          )}
          <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'portfolio', label: 'Portfolio', count: c.portfolio.length }, { id: 'history', label: 'Collaboration history' }]} />
          {tab === 'overview' && (
            <div className="space-y-5">
              <p className="max-w-2xl text-[14px] leading-relaxed text-ink-700">{c.bio || 'No biography yet.'}</p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Audience" value={compact(f)} src={statsSource(c)} />
                <Stat label="Engagement" value={er != null ? `${er.toFixed(1)}%` : '—'} src={statsSource(c)} />
                <Stat label="Tier" value={<span className="text-[14px]">{tier(f).label}</span>} />
                <Stat label="Formats" value={<span className="text-[13px] font-medium">{c.formats.slice(0, 3).map(formatLabel).join(', ') || '—'}</span>} />
              </div>
              <Section title="Social accounts" description="Figures are shown exactly as provided, with their source.">
                <ul className="divide-y divide-ink-150">{c.socials.map((s) => <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5 text-[13px]"><span className="w-24 font-semibold">{platformLabel(s.platform)}</span><span className="text-ink-500">@{s.handle}</span><span className="num ml-auto">{compact(s.followers)} followers</span><span className="num w-20 text-right">{s.engagementRate != null ? `${s.engagementRate}% ER` : 'ER —'}</span><SourceTag source={s.source} /><span className="w-20 text-right text-[11.5px] text-ink-400">{timeAgo(s.updatedAt)}</span></li>)}</ul>
                {!c.socials.length && <p className="text-[13px] text-ink-500">No social accounts added.</p>}
              </Section>
              <Section title="Audience" action={c.audience && <SourceTag source={c.audience.source} />}>
                {!c.audience ? <p className="text-[13px] text-ink-500">This creator keeps audience details private. Ask them for recent insights during negotiation.</p> : (!c.audience.topCountries?.length && c.audience.female == null) ? <p className="text-[13px] text-ink-500">Not provided yet.</p> : (
                  <div className="grid gap-6 md:grid-cols-3">
                    <div><p className="label">Gender</p>{c.audience.female != null ? <><Meter value={c.audience.female} tone="accent" /><p className="num mt-1.5 text-[12.5px] text-ink-600">{c.audience.female}% women · {c.audience.male ?? 100 - c.audience.female}% men</p></> : <p className="text-[12.5px] text-ink-500">—</p>}</div>
                    <div><p className="label">Age</p><ul className="space-y-1">{c.audience.ageBands?.map((a) => <li key={a.band} className="flex items-center gap-2 text-[12.5px]"><span className="w-12 text-ink-500">{a.band}</span><Meter value={a.pct} max={60} tone="ink" className="flex-1" /><span className="num w-8 text-right">{a.pct}%</span></li>)}</ul></div>
                    <div><p className="label">Top markets</p><ul className="space-y-1">{c.audience.topCountries?.map((t) => <li key={t.country} className="flex justify-between text-[12.5px]"><span>{t.country}</span><span className="num font-medium">{t.pct}%</span></li>)}</ul></div>
                  </div>
                )}
              </Section>
              <Section title="Indicative rates" description="Starting points set by the creator. Final fees are agreed per collaboration.">
                {c.rates == null ? <p className="text-[13px] text-ink-500">Rates on request.</p> : c.rates.length ? <ul className="divide-y divide-ink-150">{c.rates.map((r, i) => <li key={i} className="flex justify-between py-2 text-[13px]"><span>{formatLabel(r.format)} · {platformLabel(r.platform)}</span><span className="num font-medium">{money(r.min, r.currency)} – {money(r.max, r.currency)}</span></li>)}</ul> : <p className="text-[13px] text-ink-500">No rates provided.</p>}
                {c.preferredCollabs.length > 0 && <p className="mt-3 text-[12.5px] text-ink-600"><span className="font-medium">Prefers:</span> {c.preferredCollabs.join(' · ')}</p>}
              </Section>
              <p className="text-[12px] text-ink-400">Categories: {c.categories.map(categoryLabel).join(', ')} · Profile updated {timeAgo(c.updatedAt)}</p>
            </div>
          )}
          {tab === 'portfolio' && (c.portfolio.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {c.portfolio.map((p) => (
                <div key={p.id} className="panel overflow-hidden">
                  {p.previewUrl ? <img src={p.previewUrl} alt={p.title} loading="lazy" className="aspect-[4/3] w-full object-cover" /> : <div className="grid aspect-[4/3] place-items-center bg-ink-50 text-ink-300"><ImageIcon className="size-7" /></div>}
                  <div className="p-3"><p className="text-[13px] font-semibold">{p.title}</p>{p.caption && <p className="mt-0.5 text-[12px] text-ink-500">{p.caption}</p>}{p.url && <a href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="link mt-1.5 inline-flex items-center gap-1 text-[12px]">Open link<ExternalLink className="size-3" /></a>}</div>
                </div>
              ))}
            </div>
          ) : <div className="panel"><EmptyState icon={ImageIcon} title="No portfolio samples yet" /></div>)}
          {tab === 'history' && (q.data.history == null ? <div className="panel"><EmptyState title="History is private" message="This creator chose not to show past collaborations." /></div> : q.data.history.length ? (
            <ul className="panel divide-y divide-ink-150">{q.data.history.map((h) => <li key={h.id} className="flex justify-between px-5 py-3 text-[13px]"><span><span className="font-medium">{h.brand}</span> · {h.campaign}</span><span className="text-ink-500">{formatDate(h.completedAt)}</span></li>)}</ul>
          ) : <div className="panel"><EmptyState title="No completed collaborations on Tandem yet" /></div>)}
        </div>
        <aside className="space-y-5">
          {roleCan(role, 'crm.view') && <Section title="Your relationship"><Crm creatorId={c.id} /></Section>}
          <button onClick={() => setReport(true)} className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-500 hover:text-bad-600"><Flag className="size-3.5" />Report this profile</button>
        </aside>
      </div>
      {invite && <InviteModal open creator={c} campaignId={query.campaign} onClose={() => setInvite(false)} />}
      <Modal open={report} onClose={() => setReport(false)} title="Report this profile" size="sm" description="Our trust & safety team reviews every report." footer={<><Button onClick={() => setReport(false)}>Cancel</Button><Button variant="danger" loading={act.busy === 'r'} onClick={async () => { const ok = await act.run('r', () => api.creators.reportContent(ctx, { targetType: 'creator', targetId: c.id, reason }), { title: 'Report sent', body: 'Thanks — an administrator will review it.' }); if (ok) { setReport(false); setReason(''); } }}>Send report</Button></>}>
        <Field label="What’s wrong?" error={act.fields.reason}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. figures look inconsistent, impersonation, inappropriate content" error={act.fields.reason} /></Field>
      </Modal>
    </div>
  );
}
