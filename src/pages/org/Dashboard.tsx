import { ArrowRight, Plus, Sparkles, Compass, Building2, CheckCheck, CalendarClock, MessagesSquare, Wallet, FileCheck2, UserPlus, HelpCircle } from 'lucide-react';
import { api } from '../../server/api';
import { useOrg } from '../../app/session';
import { useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { roleCan } from '../../server/access';
import { CAMPAIGN_STATUS, DELIVERABLE_STATUS, categoryLabel } from '../../domain/constants';
import type { Currency } from '../../domain/types';
import { compact, daysUntil, firstName, formatDate, money, timeAgo } from '../../lib/utils';
import Button from '../../components/ui/Button';
import { Pill } from '../../components/ui/Badge';
import { Avatar, EmptyState, Meter, PageHeader, PageSkeleton, Section, Stat } from '../../components/ui/misc';
import { ScoreBadge } from '../../components/app/MatchExplain';

const KIND_ICON: Record<string, typeof Wallet> = { Counteroffer: MessagesSquare, Application: UserPlus, Question: HelpCircle, Review: FileCheck2, Payment: Wallet };

function Recommendations({ campaignId }: { campaignId: string }) {
  const { ctx, orgId } = useOrg();
  const { navigate } = useRouter();
  const q = useQuery(() => api.ai.matchForCampaign(ctx, orgId, campaignId, { limit: 8 }).catch(() => null), [ctx, orgId, campaignId]);
  if (q.data === null) return <p className="text-[13px] text-ink-500">AI recommendations are part of the Growth plan.</p>;
  const list = (q.data ?? []).filter((x) => !x.alreadyEngaged).slice(0, 3);
  if (!q.data) return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14" />)}</div>;
  if (!list.length) return <p className="text-[13px] text-ink-500">Everyone who matches is already in your pipeline.</p>;
  return (
    <ul className="space-y-2">
      {list.map(({ creator, match }) => (
        <li key={creator.id}>
          <button onClick={() => navigate(`/app/creators/${creator.id}?campaign=${campaignId}`)} className="flex w-full items-center gap-3 rounded-[11px] border border-ink-200 p-2.5 text-left hover:border-ink-300">
            <Avatar name={creator.displayName} hue={creator.avatarHue} size="sm" />
            <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold">{creator.displayName}</span><span className="block truncate text-[12px] text-ink-500">{match.reasons[0] ?? match.suggestedRole.title}</span></span>
            <ScoreBadge score={match.score} confidence={match.confidence} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function AgencyDashboard() {
  const { ctx, orgId, org, me, switchOrg } = useOrg();
  const { navigate } = useRouter();
  const clients = useQuery(() => api.orgs.listClients(ctx, orgId), [ctx, orgId]);
  const portfolio = useQuery(() => api.analytics.portfolioAnalytics(ctx, orgId), [ctx, orgId]);
  if (!clients.data || !portfolio.data) return <PageSkeleton />;
  const open = async (id: string, to = '/app/dashboard') => { await switchOrg(id); navigate(to); };
  const totals = clients.data.reduce((a, c) => ({ campaigns: a.campaigns + c.campaigns, active: a.active + c.active, approvals: a.approvals + c.pendingApprovals }), { campaigns: 0, active: 0, approvals: 0 });
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Agency overview" title={`Good to see you, ${firstName(me?.user.name)}`} description={`${org.name} · ${clients.data.length} client workspaces`} actions={<><Button icon={Plus} onClick={() => navigate('/app/clients')}>Add client</Button><Button variant="dark" icon={Compass} onClick={() => navigate('/app/discover')}>Discover creators</Button></>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Client workspaces" value={clients.data.length} />
        <Stat label="Live campaigns" value={totals.active} sub={`${totals.campaigns} in total`} />
        <Stat label="Waiting for review" value={totals.approvals} sub="Across all clients" tone={totals.approvals ? 'warn' : 'default'} />
        <Stat label="Reach recorded" value={compact(portfolio.data.reduce((s, r) => s + (r.reach ?? 0), 0))} sub="Manual & sample entries" />
      </div>
      <Section title="Clients" description="Each client has its own campaigns, budget and approvals. Switch in to work on one.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead><tr className="border-b border-ink-150 text-[11.5px] text-ink-500"><th className="py-2 font-medium">Client</th><th className="font-medium">Live campaigns</th><th className="font-medium">Collaborations</th><th className="font-medium">To review</th><th className="font-medium">Client reviewers</th><th /></tr></thead>
            <tbody className="divide-y divide-ink-150">
              {clients.data.map((c) => {
                const p = portfolio.data!.find((x) => x.org.id === c.org.id);
                return (
                  <tr key={c.org.id}>
                    <td className="py-3"><p className="font-semibold">{c.org.name}</p><p className="text-[12px] text-ink-500">{c.org.industry} · {c.org.country}</p></td>
                    <td className="num">{c.active}</td>
                    <td className="num">{p?.collaborations ?? 0}</td>
                    <td>{c.pendingApprovals ? <Pill tone="warning" dot>{c.pendingApprovals}</Pill> : <span className="text-ink-400">—</span>}</td>
                    <td className="num">{c.reviewers}</td>
                    <td className="text-right"><Button size="sm" iconRight={ArrowRight} onClick={() => open(c.org.id)}>Open</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!clients.data.length && <EmptyState icon={Building2} title="No clients yet" message="Create a workspace for each client you run campaigns for." action={<Button variant="dark" onClick={() => navigate('/app/clients')}>Add client</Button>} />}
      </Section>
    </div>
  );
}

export default function Dashboard() {
  const { ctx, orgId, org, role, me } = useOrg();
  const { navigate } = useRouter();
  const q = useQuery(() => api.dashboard.orgDashboard(ctx, orgId), [ctx, orgId]);
  if (org.type === 'agency') return <AgencyDashboard />;
  if (!q.data) return <PageSkeleton />;
  const d = q.data;
  const spend = d.spend ? (Object.entries(d.spend) as [Currency, { budget: number; committed: number; paid: number }][]) : [];
  const canEdit = roleCan(role, 'campaign.edit');
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={org.type === 'client' ? 'Client workspace' : 'Dashboard'} title={`Good to see you, ${firstName(me?.user.name)}`} description={role === 'client_reviewer' ? 'Review content waiting for your approval and follow campaign progress.' : `${d.counts.live} live campaign${d.counts.live === 1 ? '' : 's'} · ${d.counts.activeCollabs} active collaboration${d.counts.activeCollabs === 1 ? '' : 's'}`}
        actions={canEdit && <><Button icon={Sparkles} onClick={() => navigate('/app/match')}>Match from a brief</Button><Button variant="dark" icon={Plus} onClick={() => navigate('/app/campaigns/new')}>New campaign</Button></>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Live campaigns" value={d.counts.live} sub={`${d.counts.drafts} draft${d.counts.drafts === 1 ? '' : 's'}`} />
        <Stat label="Content to review" value={d.counts.toReview} tone={d.counts.toReview ? 'warn' : 'default'} sub="Submissions in review" />
        {roleCan(role, 'outreach.send') ? <Stat label="New applications" value={d.counts.applications} sub="Waiting for a decision" /> : <Stat label="Active collaborations" value={d.counts.activeCollabs} />}
        {spend[0] ? <Stat label="Committed spend" value={money(spend[0][1].committed, spend[0][0], { compact: true })} sub={`of ${money(spend[0][1].budget, spend[0][0], { compact: true })} live budget · incl. fees`} /> : <Stat label="Upcoming deadlines" value={d.deadlines.length} />}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr] *:min-w-0">
        <Section title="Needs your attention" description="Things waiting on you, newest first.">
          {d.attention.length ? (
            <ul className="-mx-2 divide-y divide-ink-150">
              {d.attention.map((a, i) => {
                const I = KIND_ICON[a.kind] ?? CheckCheck;
                return (
                  <li key={i}>
                    <button onClick={() => navigate(a.link)} className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2.5 text-left hover:bg-ink-50">
                      <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-ink-100 text-ink-600"><I className="size-4" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium text-ink-900">{a.title}</span><span className="block truncate text-[12px] text-ink-500">{a.kind} · {a.detail}</span></span>
                      <span className="shrink-0 text-[11.5px] text-ink-400">{timeAgo(a.at)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyState icon={CheckCheck} title="Nothing waiting" message="You’re up to date." className="py-6" />}
        </Section>

        <Section title="Upcoming deadlines" action={<CalendarClock className="size-4 text-ink-400" />}>
          {d.deadlines.length ? (
            <ul className="space-y-2.5">
              {d.deadlines.map((x) => {
                const days = daysUntil(x.due);
                return (
                  <li key={x.id}>
                    <button onClick={() => navigate(`/app/collaborations/${x.collaborationId}`)} className="flex w-full items-center gap-3 text-left">
                      <span className="num w-12 shrink-0 text-center"><span className="block text-[15px] font-semibold">{new Date(x.due).getDate()}</span><span className="block text-[10.5px] uppercase text-ink-500">{new Date(x.due).toLocaleDateString('en-GB', { month: 'short' })}</span></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{x.title}</span><span className="block truncate text-[12px] text-ink-500">{x.creator} · {days < 0 ? <span className="text-bad-600">{-days}d overdue</span> : days === 0 ? 'today' : `in ${days}d`}</span></span>
                      <Pill tone={DELIVERABLE_STATUS[x.status].tone}>{DELIVERABLE_STATUS[x.status].label}</Pill>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-[13px] text-ink-500">No open deliverables.</p>}
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr] *:min-w-0">
        <Section title="Live campaigns" action={<button className="text-[12.5px] font-medium text-accent-600" onClick={() => navigate('/app/campaigns')}>All campaigns</button>}>
          {d.campaigns.length ? (
            <ul className="space-y-3">
              {d.campaigns.map(({ campaign: c, creators, approved, total }) => (
                <li key={c.id}>
                  <button onClick={() => navigate(`/app/campaigns/${c.id}`)} className="w-full rounded-[12px] border border-ink-200 p-3.5 text-left hover:border-ink-300">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="truncate text-[14px] font-semibold">{c.name}</p><p className="text-[12px] text-ink-500">{c.categories.map(categoryLabel).join(', ')} · {formatDate(c.startDate, { year: undefined })} – {formatDate(c.endDate, { year: undefined })}</p></div>
                      <Pill tone={CAMPAIGN_STATUS[c.status].tone} dot>{CAMPAIGN_STATUS[c.status].label}</Pill>
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-[12px] text-ink-500">
                      <span className="shrink-0">{creators} creator{creators === 1 ? '' : 's'}</span>
                      <Meter value={approved} max={Math.max(total, 1)} tone="ok" className="flex-1" />
                      <span className="num shrink-0">{approved}/{total} approved</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={Plus} title="No live campaigns" message="Create a campaign and publish it to start recruiting creators." action={canEdit && <Button variant="dark" onClick={() => navigate('/app/campaigns/new')}>New campaign</Button>} className="py-6" />}
        </Section>

        {roleCan(role, 'discover') && d.recruitingCampaignId ? (
          <Section title="Recommended creators" description={`For “${d.campaigns.find((x) => x.campaign.id === d.recruitingCampaignId)?.campaign.name ?? 'your recruiting campaign'}”`} action={<Sparkles className="size-4 text-accent-600" />}>
            <Recommendations campaignId={d.recruitingCampaignId} />
          </Section>
        ) : (
          <Section title="Recent activity">
            <ul className="space-y-3">{d.activity.map((a) => <li key={a.id} className="text-[13px]"><span className="font-medium">{a.actorName}</span> <span className="text-ink-600">{a.action}</span><span className="block text-[11.5px] text-ink-400">{timeAgo(a.at)}</span></li>)}</ul>
          </Section>
        )}
      </div>

      {roleCan(role, 'discover') && d.recruitingCampaignId && (
        <Section title="Recent activity">
          <ul className="grid gap-x-6 gap-y-3 md:grid-cols-2">{d.activity.map((a) => <li key={a.id} className="text-[13px]"><span className="font-medium">{a.actorName}</span> <span className="text-ink-600">{a.action}</span><span className="block text-[11.5px] text-ink-400">{timeAgo(a.at)}</span></li>)}</ul>
        </Section>
      )}
    </div>
  );
}
