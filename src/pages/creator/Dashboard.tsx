import { ArrowRight, Inbox, CalendarClock, Wallet, Sparkles } from 'lucide-react';
import { api } from '../../server/api';
import { useSession } from '../../app/session';
import { useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { DELIVERABLE_STATUS, categoryLabel, objectiveLabel } from '../../domain/constants';
import type { Currency } from '../../domain/types';
import { daysUntil, firstName, formatDate, money, timeAgo } from '../../lib/utils';
import Button from '../../components/ui/Button';
import { Pill } from '../../components/ui/Badge';
import { EmptyState, Meter, PageHeader, PageSkeleton, Section, Stat } from '../../components/ui/misc';

export default function CreatorDashboard() {
  const { ctx, me } = useSession();
  const { navigate } = useRouter();
  const q = useQuery(() => api.dashboard.creatorDashboard(ctx), [ctx]);
  if (!q.data) return <PageSkeleton />;
  const d = q.data;
  const earnings = Object.entries(d.earnings) as [Currency, { paid: number; upcoming: number }][];
  const pct = Math.round(d.completeness.score * 100);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Creator dashboard" title={`Hi ${firstName(me?.user.name)}`} description="Your opportunities, deadlines and earnings in one place." actions={<Button variant="dark" iconRight={ArrowRight} onClick={() => navigate('/creator/opportunities')}>Browse opportunities</Button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Offers waiting" value={d.offers.length} tone={d.offers.length ? 'warn' : 'default'} sub="Invitations & counteroffers" />
        <Stat label="Active collaborations" value={d.active.length} sub={`${d.completed} completed`} />
        <Stat label="Content in review" value={d.reviewStatus.inReview} sub={`${d.reviewStatus.revisions} revision${d.reviewStatus.revisions === 1 ? '' : 's'} requested`} />
        {earnings[0] ? <Stat label="Paid to date" value={money(earnings[0][1].paid, earnings[0][0], { compact: true })} sub={`${money(earnings[0][1].upcoming, earnings[0][0], { compact: true })} upcoming`} /> : <Stat label="Paid to date" value="—" sub="No payments yet" />}
      </div>
      {pct < 100 && (
        <div className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1"><p className="text-[14px] font-semibold">Your profile is {pct}% complete</p><p className="text-[12.5px] text-ink-500">Brands and AI matching rely on this. Missing: {d.completeness.missing.slice(0, 4).join(', ')}.</p><Meter value={pct} tone={pct > 70 ? 'ok' : 'warn'} className="mt-2 max-w-sm" /></div>
          <Button onClick={() => navigate('/creator/profile')}>Complete profile</Button>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Offers & invitations" action={<Inbox className="size-4 text-ink-400" />}>
          {d.offers.length ? <ul className="space-y-2">{d.offers.map(({ offer: o, campaign: c }) => <li key={o.id}><button onClick={() => navigate(`/creator/deals/${c.id}`)} className="flex w-full items-center gap-3 rounded-[11px] border border-accent-200 bg-accent-50/40 p-3 text-left hover:border-accent-300"><span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-semibold">{c.name}</span><span className="block text-[12px] text-ink-500">{c.brandName} · {timeAgo(o.createdAt)}</span></span><span className="num text-[14px] font-semibold">{money(o.terms.fee, o.terms.currency)}</span><ArrowRight className="size-4 text-ink-400" /></button></li>)}</ul>
            : d.applications.length ? <ul className="space-y-2">{d.applications.map(({ application: a, campaign: c }) => <li key={a.id} className="flex items-center justify-between rounded-[11px] border border-ink-200 p-3 text-[13px]"><span><span className="font-medium">{c.name}</span><span className="block text-[12px] text-ink-500">Applied {timeAgo(a.createdAt)}</span></span><Pill tone={a.status === 'shortlisted' ? 'accent' : 'neutral'}>{a.status}</Pill></li>)}</ul>
            : <EmptyState title="No offers right now" message="Apply to open campaigns, or keep your profile up to date so brands find you." className="py-6" />}
        </Section>
        <Section title="Upcoming deadlines" action={<CalendarClock className="size-4 text-ink-400" />}>
          {d.deadlines.length ? <ul className="space-y-2.5">{d.deadlines.map((x) => { const days = daysUntil(x.dueDate); return <li key={x.id}><button onClick={() => navigate(`/creator/collaborations/${x.collaborationId}`)} className="flex w-full items-center gap-3 text-left"><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{x.title}</span><span className={days < 0 ? 'text-[12px] font-semibold text-bad-600' : 'text-[12px] text-ink-500'}>{days < 0 ? `${-days} days overdue` : days === 0 ? 'Due today' : `Due ${formatDate(x.dueDate, { year: undefined })}`}</span></span><Pill tone={DELIVERABLE_STATUS[x.status].tone}>{DELIVERABLE_STATUS[x.status].label}</Pill></button></li>; })}</ul> : <p className="text-[13px] text-ink-500">Nothing due.</p>}
        </Section>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Recommended for you" description="Open campaigns that match your categories, platforms and location." action={<Sparkles className="size-4 text-accent-600" />}>
          {d.recommended.length ? <ul className="space-y-2">{d.recommended.map((c) => <li key={c.id}><button onClick={() => navigate(`/creator/opportunities/${c.id}`)} className="w-full rounded-[11px] border border-ink-200 p-3 text-left hover:border-ink-300"><p className="text-[13.5px] font-semibold">{c.name}</p><p className="text-[12px] text-ink-500">{c.brandName} · {objectiveLabel(c.objective)} · {c.categories.map(categoryLabel).join(', ')}</p><p className="mt-1 text-[12px] text-ink-600">{c.feeGuide}</p></button></li>)}</ul> : <p className="text-[13px] text-ink-500">No new matches right now.</p>}
        </Section>
        <Section title="Earnings" action={<Wallet className="size-4 text-ink-400" />}>
          {earnings.length ? <ul className="space-y-3">{earnings.map(([c, e]) => <li key={c} className="flex justify-between text-[13px]"><span className="font-medium">{c}</span><span className="num"><span className="font-semibold text-ok-600">{money(e.paid, c)}</span> paid · {money(e.upcoming, c)} upcoming</span></li>)}</ul> : <p className="text-[13px] text-ink-500">Payments appear here once terms are agreed.</p>}
          <Button size="sm" className="mt-4" onClick={() => navigate('/creator/earnings')}>Payment history</Button>
        </Section>
      </div>
    </div>
  );
}
