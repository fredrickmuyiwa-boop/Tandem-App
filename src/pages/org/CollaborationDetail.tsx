import { ArrowLeft, CheckCircle2, ScrollText } from 'lucide-react';
import { api } from '../../server/api';
import { useOrg } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { roleCan } from '../../server/access';
import { DELIVERABLE_STATUS, formatLabel, platformLabel } from '../../domain/constants';
import { daysUntil, formatDate, money, timeAgo } from '../../lib/utils';
import Button from '../../components/ui/Button';
import { Pill, SampleTag } from '../../components/ui/Badge';
import { Avatar, EmptyState, KeyValue, Notice, PageSkeleton, Section } from '../../components/ui/misc';
import SubmissionCard from '../../components/app/SubmissionCard';
import PaymentsTable from '../../components/app/PaymentsTable';
import Thread from '../../components/app/Thread';

export default function CollaborationDetail({ params }: { params: Record<string, string> }) {
  const { ctx, orgId, role } = useOrg();
  const { navigate } = useRouter();
  const act = useAction();
  const q = useQuery(() => api.collaborations.orgCollaboration(ctx, orgId, params.id), [ctx, orgId, params.id]);
  if (q.error) return <EmptyState title="Collaboration not found" action={<Button onClick={() => navigate('/app/collaborations')}>All collaborations</Button>} />;
  if (!q.data) return <PageSkeleton />;
  const { collab, deliverables, submissions, messages, activity, campaign, creator } = q.data;
  const t = collab.terms;
  const allApproved = deliverables.length > 0 && deliverables.every((d) => d.status === 'approved');
  const isClient = role === 'client_reviewer';
  return (
    <div>
      <button onClick={() => navigate(isClient ? '/app/approvals' : `/app/campaigns/${campaign.id}?tab=collaborations`)} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 hover:text-ink-900"><ArrowLeft className="size-4" />{isClient ? 'Approvals' : campaign.name}</button>
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center">
        <Avatar name={creator.displayName} hue={creator.avatarHue} url={creator.avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-[22px] font-semibold tracking-tight">{creator.displayName}</h1>{creator.sample && <SampleTag />}<Pill tone={collab.status === 'active' ? 'success' : 'neutral'} dot>{collab.status}</Pill></div>
          <p className="text-[13px] text-ink-500">{campaign.name} · started {timeAgo(collab.createdAt)}</p>
        </div>
        {roleCan(role, 'campaign.edit') && collab.status === 'active' && <Button variant="dark" icon={CheckCircle2} disabled={!allApproved} title={allApproved ? undefined : 'Approve every deliverable first'} loading={act.busy === 'done'} onClick={() => act.run('done', () => api.collaborations.completeCollaboration(ctx, orgId, collab.id), { title: 'Collaboration completed' })}>Mark complete</Button>}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          {deliverables.map((d) => {
            const subs = submissions.filter((s) => s.deliverableId === d.id);
            const days = daysUntil(d.dueDate);
            const latest = subs[0];
            const canReview = latest && ((latest.status === 'in_review' && roleCan(role, 'content.review.internal')) || (latest.status === 'awaiting_client' && roleCan(role, 'content.review.client')));
            return (
              <Section key={d.id} title={d.title} description={`${formatLabel(d.format)} · ${platformLabel(d.platform)} · due ${formatDate(d.dueDate)}${d.status !== 'approved' ? days < 0 ? ` (${-days}d overdue)` : ` (in ${days}d)` : ''}`} action={<Pill tone={DELIVERABLE_STATUS[d.status].tone} dot>{DELIVERABLE_STATUS[d.status].label}</Pill>}>
                {subs.length ? (
                  <div className="space-y-3">
                    {subs.map((s, i) => <SubmissionCard key={s.id} s={s} latest={i === 0} canReview={!!canReview} revisionsLeft={t.revisionLimit - d.revisionCount} onReview={(dec, comment) => act.run(`rev${s.id}`, () => api.collaborations.reviewSubmission(ctx, orgId, s.id, dec, comment), { title: dec === 'approved' ? (latest?.status === 'in_review' && campaign.approval.client ? 'Approved — sent to client' : 'Approved') : dec === 'revision_requested' ? 'Revision requested' : dec === 'rejected' ? 'Rejected' : 'Comment added' })} />)}
                    {latest?.status === 'awaiting_client' && !roleCan(role, 'content.review.client') && <Notice tone="info">Waiting for the client’s final approval.</Notice>}
                    {d.status === 'rejected' && roleCan(role, 'content.review.internal') && <Button size="sm" onClick={() => act.run('reopen', () => api.collaborations.reopenDeliverable(ctx, orgId, d.id), { title: 'Deliverable reopened' })}>Reopen for a new submission</Button>}
                  </div>
                ) : <p className="text-[13px] text-ink-500">Nothing submitted yet.</p>}
              </Section>
            );
          })}
          {!isClient && <PaymentsTable campaignId={campaign.id} collaborationId={collab.id} title="Payment schedule" />}
          {!isClient && <Section title="Messages"><Thread messages={messages} me="org" canSend={roleCan(role, 'outreach.send')} onSend={(b) => act.run('msg', () => api.deals.sendMessage(ctx, { orgId }, campaign.id, creator.id, b))} /></Section>}
        </div>
        <aside className="space-y-5">
          <Section title="Agreed terms" action={<ScrollText className="size-4 text-ink-400" />}>
            <KeyValue items={[
              ...(isClient ? [] : [['Fee', money(t.fee, t.currency)] as [string, string]]),
              ...(t.bonus && !isClient ? [['Bonus', `${money(t.bonus.amount, t.currency)} if ${t.bonus.condition.toLowerCase()}`] as [string, string]] : []),
              ['Deadline', formatDate(t.deadline)], ['Revisions', `${t.revisionLimit} round${t.revisionLimit === 1 ? '' : 's'}`], ['Usage rights', t.usageRights], ['Exclusivity', t.exclusivity],
            ]} />
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-500">These are the commercial terms both sides accepted in Tandem. They are not a signed legal contract; use your own agreement process where one is needed.</p>
          </Section>
          <Section title="Activity"><ol className="space-y-2.5">{activity.map((a) => <li key={a.id} className="text-[12.5px]"><span className="font-medium">{a.actorName}</span> <span className="text-ink-600">{a.action}</span><span className="block text-[11px] text-ink-400">{timeAgo(a.at)}</span></li>)}</ol></Section>
        </aside>
      </div>
    </div>
  );
}
