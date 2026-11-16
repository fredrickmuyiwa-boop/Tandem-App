import { useState } from 'react';
import { ArrowLeft, Pencil, Copy, Send, Users, ChevronRight, Sparkles, Inbox } from 'lucide-react';
import { api } from '../../server/api';
import { useOrg } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { roleCan } from '../../server/access';
import { CAMPAIGN_STATUS, CAMPAIGN_TRANSITIONS, categoryLabel, compensationLabel, formatLabel, objectiveLabel, platformLabel } from '../../domain/constants';
import type { CampaignStatus } from '../../domain/types';
import type { CreatorView } from '../../server/services/creators';
import { cx, formatDate, money, timeAgo } from '../../lib/utils';
import Button from '../../components/ui/Button';
import { Pill, SampleTag } from '../../components/ui/Badge';
import { Avatar, EmptyState, KeyValue, PageSkeleton, Section, Tabs, Notice } from '../../components/ui/misc';
import { Confirm } from '../../components/ui/Modal';
import { Field, Textarea } from '../../components/ui/Field';
import { ScoreBadge } from '../../components/app/MatchExplain';
import InviteModal from '../../components/app/InviteModal';
import OrgDealPanel from '../../components/app/OrgDealPanel';
import CampaignBudget from '../../components/app/CampaignBudget';
import CampaignResults from '../../components/app/CampaignResults';

type Tab = 'overview' | 'recommendations' | 'deals' | 'collaborations' | 'budget' | 'results' | 'activity';

const ACTION_LABEL: Partial<Record<CampaignStatus, string>> = { published: 'Publish', recruiting: 'Open recruiting', active: 'Mark active', paused: 'Pause', under_review: 'Move to review', completed: 'Complete', cancelled: 'Cancel campaign' };
const STAGE: Record<string, { label: string; tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' }> = {
  agreed: { label: 'Agreed', tone: 'success' }, creator_countered: { label: 'Counteroffer', tone: 'warning' }, awaiting_creator: { label: 'Awaiting creator', tone: 'accent' },
  application: { label: 'Applied', tone: 'accent' }, closed: { label: 'Closed', tone: 'neutral' }, open: { label: 'Open', tone: 'neutral' },
};

function Recommendations({ campaignId, onInvite }: { campaignId: string; onInvite: (c: CreatorView) => void }) {
  const { ctx, orgId, role } = useOrg();
  const { navigate } = useRouter();
  const q = useQuery(() => api.ai.matchForCampaign(ctx, orgId, campaignId, { limit: 15 }), [ctx, orgId, campaignId]);
  if (q.error) return <Notice tone="warn">{q.error.message}</Notice>;
  if (!q.data) return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20" />)}</div>;
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-ink-500">Ranked against this campaign’s categories, markets, audience, budget and platforms. Open a profile to see the factor-by-factor breakdown.</p>
      <ul className="panel divide-y divide-ink-150">
        {q.data.map(({ creator: c, match: m, alreadyEngaged }) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Avatar name={c.displayName} hue={c.avatarHue} url={c.avatarUrl} />
            <div className="min-w-[180px] flex-1">
              <p className="flex items-center gap-2 text-[13.5px] font-semibold">{c.displayName}{c.sample && <SampleTag />}</p>
              <p className="line-clamp-1 text-[12.5px] text-ink-500">{m.suggestedRole.title} · {m.reasons[0] ?? 'Partial fit'}</p>
              {m.concerns[0] && <p className="line-clamp-1 text-[12px] text-warn-600">{m.concerns[0]}</p>}
            </div>
            <ScoreBadge score={m.score} confidence={m.confidence} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => navigate(`/app/creators/${c.id}?campaign=${campaignId}`)}>Why?</Button>
              {alreadyEngaged ? <Pill tone="neutral">In pipeline</Pill> : roleCan(role, 'outreach.send') && <Button size="sm" variant="dark" icon={Send} onClick={() => onInvite(c)}>Invite</Button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Deals({ campaignId, selected, onSelect }: { campaignId: string; selected?: string; onSelect: (id: string) => void }) {
  const { ctx, orgId } = useOrg();
  const q = useQuery(() => api.deals.campaignPipeline(ctx, orgId, campaignId), [ctx, orgId, campaignId]);
  if (!q.data) return <div className="skeleton h-72" />;
  if (!q.data.length) return <div className="panel"><EmptyState icon={Inbox} title="No conversations yet" message="Invite creators from Recommendations or Discover. Applications appear here too." /></div>;
  const current = selected ?? q.data[0].creator?.id;
  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <ul className="panel h-fit divide-y divide-ink-150 overflow-hidden lg:sticky lg:top-20">
        {q.data.map((t) => t.creator && (
          <li key={t.creator.id}>
            <button onClick={() => onSelect(t.creator!.id)} className={cx('flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-ink-50', current === t.creator.id && 'bg-ink-50')} aria-current={current === t.creator.id}>
              <Avatar name={t.creator.displayName} hue={t.creator.avatarHue} url={t.creator.avatarUrl} size="sm" />
              <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 truncate text-[13px] font-semibold">{t.creator.displayName}{t.needsReply && <span className="size-1.5 rounded-full bg-accent-600" aria-label="Needs reply" />}</span><span className="block truncate text-[11.5px] text-ink-500">{t.latestOffer ? money(t.latestOffer.terms.fee, t.latestOffer.terms.currency) : t.application ? money(t.application.proposedFee, t.application.currency) : '—'} · {timeAgo(t.lastActivity)}</span></span>
              <Pill tone={STAGE[t.stage].tone}>{STAGE[t.stage].label}</Pill>
            </button>
          </li>
        ))}
      </ul>
      <div className="panel min-w-0 p-5">{current && <OrgDealPanel key={current} campaignId={campaignId} creatorId={current} />}</div>
    </div>
  );
}

function Collabs({ campaignId }: { campaignId: string }) {
  const { ctx, orgId } = useOrg();
  const { navigate } = useRouter();
  const q = useQuery(() => api.collaborations.listOrgCollaborations(ctx, orgId), [ctx, orgId]);
  if (!q.data) return <div className="skeleton h-40" />;
  const rows = q.data.filter((x) => x.campaign.id === campaignId);
  if (!rows.length) return <div className="panel"><EmptyState icon={Users} title="No collaborations yet" message="When a creator accepts terms, their workspace appears here." /></div>;
  return (
    <ul className="panel divide-y divide-ink-150">
      {rows.map((r) => (
        <li key={r.collab.id}><button onClick={() => navigate(`/app/collaborations/${r.collab.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink-50">
          {r.creator && <Avatar name={r.creator.displayName} hue={r.creator.avatarHue} url={r.creator.avatarUrl} size="sm" />}
          <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-semibold">{r.creator?.displayName}</span><span className="block text-[12px] text-ink-500">{r.approved}/{r.total} approved{r.nextDue ? ` · next due ${formatDate(r.nextDue, { year: undefined })}` : ''}</span></span>
          {r.toReview > 0 && <Pill tone="warning">{r.toReview} to review</Pill>}
          <Pill tone={r.collab.status === 'active' ? 'success' : 'neutral'}>{r.collab.status}</Pill>
          <ChevronRight className="size-4 text-ink-300" />
        </button></li>
      ))}
    </ul>
  );
}

export default function CampaignDetail({ params }: { params: Record<string, string> }) {
  const { ctx, orgId, role } = useOrg();
  const { navigate, query } = useRouter();
  const act = useAction();
  const q = useQuery(() => api.campaigns.getCampaign(ctx, orgId, params.id), [ctx, orgId, params.id]);
  const tab = (query.tab as Tab) || 'overview';
  const [invite, setInvite] = useState<CreatorView | null>(null);
  const [confirm, setConfirm] = useState<CampaignStatus | null>(null);
  const [reason, setReason] = useState('');
  if (q.error) return <EmptyState title="Campaign not found" action={<Button onClick={() => navigate('/app/campaigns')}>All campaigns</Button>} />;
  if (!q.data) return <PageSkeleton />;
  const { campaign: c, collaborations, applications, invitations, pendingReviews, committed, product, activity } = q.data;
  const s = CAMPAIGN_STATUS[c.status];
  const canEdit = roleCan(role, 'campaign.edit');
  const canMoney = roleCan(role, 'budget.view');
  const transitions = CAMPAIGN_TRANSITIONS[c.status];
  const go = (t: Tab) => navigate(`/app/campaigns/${c.id}?tab=${t}`, { replace: true });
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    ...(roleCan(role, 'discover') ? [{ id: 'recommendations' as Tab, label: 'Recommendations' }] : []),
    ...(roleCan(role, 'budget.view') ? [{ id: 'deals' as Tab, label: 'Negotiations', count: applications + invitations }] : []),
    { id: 'collaborations', label: 'Collaborations', count: collaborations },
    ...(canMoney ? [{ id: 'budget' as Tab, label: 'Budget' }] : []),
    { id: 'results', label: 'Results' },
    { id: 'activity', label: 'Activity' },
  ];
  return (
    <div>
      <button onClick={() => navigate('/app/campaigns')} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 hover:text-ink-900"><ArrowLeft className="size-4" />Campaigns</button>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-[24px] font-semibold tracking-tight">{c.name}</h1><Pill tone={s.tone} dot>{s.label}</Pill>{c.sample && <SampleTag />}</div>
          <p className="mt-1 text-[13.5px] text-ink-500">{objectiveLabel(c.objective)} · {formatDate(c.startDate)} – {formatDate(c.endDate)} · {c.visibility === 'public' ? 'Open to applications' : 'Invite only'}{canMoney && <> · <span className="num">{money(committed, c.currency)} of {money(c.budget, c.currency)} committed</span></>}</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {transitions.filter((t) => !['cancelled'].includes(t)).slice(0, 2).map((t) => <Button key={t} variant={t === 'completed' || t === 'recruiting' || t === 'published' ? 'dark' : 'secondary'} size="sm" loading={act.busy === t} onClick={() => (t === 'completed' || t === 'paused' ? setConfirm(t) : act.run(t, () => api.campaigns.transitionCampaign(ctx, orgId, c.id, t), { title: `Campaign ${CAMPAIGN_STATUS[t].label.toLowerCase()}` }))}>{ACTION_LABEL[t]}</Button>)}
            {!['completed', 'cancelled', 'active', 'under_review'].includes(c.status) && <Button size="sm" icon={Pencil} onClick={() => navigate(`/app/campaigns/${c.id}/edit`)}>Edit</Button>}
            <Button size="sm" icon={Copy} onClick={async () => { const r = await act.run('dup', () => api.campaigns.duplicateCampaign(ctx, orgId, c.id), { title: 'Duplicated as a draft' }); if (r && typeof r === 'object') navigate(`/app/campaigns/${r.id}/edit`); }}>Duplicate</Button>
            {transitions.includes('cancelled') && <Button size="sm" variant="danger" onClick={() => setConfirm('cancelled')}>Cancel</Button>}
          </div>
        )}
      </div>
      {pendingReviews > 0 && <Notice tone="warn" className="mb-4">{pendingReviews} submission{pendingReviews > 1 ? 's are' : ' is'} waiting for review. <button className="font-semibold underline" onClick={() => go('collaborations')}>Review now</button></Notice>}
      <div className="mb-5"><Tabs tabs={tabs} value={tab} onChange={go} /></div>

      {tab === 'overview' && (
        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <div className="space-y-5">
            <Section title="Brief"><p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink-700">{c.description}</p>{product && <p className="mt-3 text-[13px] text-ink-600"><span className="font-medium">Product:</span> {product.name} — {product.description}</p>}</Section>
            <Section title="Deliverables per creator"><ul className="divide-y divide-ink-150">{c.deliverables.map((d) => <li key={d.id} className="flex justify-between py-2 text-[13px]"><span>{d.notes || formatLabel(d.format)}</span><span className="text-ink-600">{d.quantity} × {formatLabel(d.format)} · {platformLabel(d.platform)}</span></li>)}</ul></Section>
            {(c.requirements || c.guidelines) && <Section title="Requirements & guidelines"><div className="grid gap-4 md:grid-cols-2"><div><p className="label">Requirements</p><p className="whitespace-pre-wrap text-[13px] text-ink-700">{c.requirements || '—'}</p></div><div><p className="label">Guidelines</p><p className="whitespace-pre-wrap text-[13px] text-ink-700">{c.guidelines || '—'}</p></div></div></Section>}
          </div>
          <div className="space-y-5">
            <Section title="Targeting"><KeyValue items={[
              ['Markets', c.locations.join(', ') || 'Any'], ['Languages', c.languages.join(', ') || 'Any'],
              ['Audience', `${c.audience.genders.includes('all') ? 'All genders' : c.audience.genders.map((g) => (g === 'female' ? 'Women' : 'Men')).join(', ')}${c.audience.ageMin ? `, ${c.audience.ageMin}–${c.audience.ageMax}` : ''}`],
              ['Categories', c.categories.map(categoryLabel).join(', ') || '—'], ['Platforms', c.platforms.map(platformLabel).join(', ')],
            ]} /></Section>
            <Section title="Terms"><KeyValue items={[
              ...(canMoney ? [['Budget', money(c.budget, c.currency)] as [string, string]] : []), ['Compensation', compensationLabel(c.compensationModel)],
              ['Approvals', `${c.approval.internal ? 'Internal' : 'None'}${c.approval.client ? ' → client' : ''}`], ['Targets', c.performanceTargets || '—'],
            ]} /></Section>
            {roleCan(role, 'discover') && ['published', 'recruiting', 'active'].includes(c.status) && <Button className="w-full" icon={Sparkles} onClick={() => go('recommendations')}>See recommended creators</Button>}
          </div>
        </div>
      )}
      {tab === 'recommendations' && <Recommendations campaignId={c.id} onInvite={setInvite} />}
      {tab === 'deals' && <Deals campaignId={c.id} selected={query.creator} onSelect={(id) => navigate(`/app/campaigns/${c.id}?tab=deals&creator=${id}`, { replace: true })} />}
      {tab === 'collaborations' && <Collabs campaignId={c.id} />}
      {tab === 'budget' && <CampaignBudget campaignId={c.id} />}
      {tab === 'results' && <CampaignResults campaignId={c.id} />}
      {tab === 'activity' && <Section title="Activity history"><ol className="space-y-3 border-l border-ink-200 pl-4">{activity.map((a) => <li key={a.id} className="relative text-[13px]"><span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-ink-300" /><span className="font-medium">{a.actorName}</span> <span className="text-ink-600">{a.action}</span><span className="block text-[11.5px] text-ink-400">{timeAgo(a.at)}</span></li>)}</ol>{!activity.length && <p className="text-[13px] text-ink-500">No activity yet.</p>}</Section>}

      {invite && <InviteModal open creator={invite} campaignId={c.id} onClose={() => setInvite(null)} />}
      <Confirm open={!!confirm} onClose={() => setConfirm(null)} tone={confirm === 'cancelled' ? 'danger' : 'primary'} busy={!!act.busy} confirmLabel={confirm ? ACTION_LABEL[confirm] : ''} title={confirm === 'cancelled' ? 'Cancel this campaign?' : confirm === 'completed' ? 'Complete this campaign?' : 'Pause this campaign?'}
        message={<div className="space-y-3"><p>{confirm === 'cancelled' ? 'Open invitations and offers are withdrawn, active collaborations are cancelled and scheduled payments are cancelled. Creators are notified.' : confirm === 'completed' ? 'All deliverables must be approved. Active collaborations are marked complete.' : 'Creators are notified. You can edit the brief while paused.'}</p><Field label="Note (optional)"><Textarea className="min-h-[60px]" value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>}
        onConfirm={async () => { const t = confirm!; const r = await act.run(t, () => api.campaigns.transitionCampaign(ctx, orgId, c.id, t, reason), { title: `Campaign ${CAMPAIGN_STATUS[t].label.toLowerCase()}` }); if (r) { setConfirm(null); setReason(''); } }} />
    </div>
  );
}
