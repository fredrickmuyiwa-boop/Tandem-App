import { CheckCheck, ChevronRight } from 'lucide-react';
import { api } from '../../server/api';
import { useOrg } from '../../app/session';
import { useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { formatLabel, platformLabel } from '../../domain/constants';
import { timeAgo } from '../../lib/utils';
import { Pill } from '../../components/ui/Badge';
import { EmptyState, PageHeader, PageSkeleton } from '../../components/ui/misc';

export default function Approvals() {
  const { ctx, orgId, role } = useOrg();
  const { navigate } = useRouter();
  const q = useQuery(() => api.collaborations.approvalQueue(ctx, orgId), [ctx, orgId]);
  if (!q.data) return <PageSkeleton />;
  return (
    <div>
      <PageHeader title="Approvals" description={role === 'client_reviewer' ? 'Content your agency has approved and sent for your final sign-off.' : 'Submissions waiting for review, oldest first.'} />
      <div className="panel divide-y divide-ink-150">
        {q.data.length ? q.data.map(({ submission: s, deliverable: d, campaign, creatorName, canAct }) => (
          <button key={s.id} onClick={() => navigate(`/app/collaborations/${s.collaborationId}`)} className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-ink-50">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold">{d.title}</span>
              <span className="block truncate text-[12.5px] text-ink-500">{creatorName} · {campaign.name} · {formatLabel(d.format)} on {platformLabel(d.platform)} · v{s.version}</span>
            </span>
            <span className="hidden text-[12px] text-ink-400 sm:block">{timeAgo(s.submittedAt)}</span>
            <Pill tone={s.status === 'awaiting_client' ? 'warning' : 'accent'}>{s.status === 'awaiting_client' ? 'Awaiting client' : 'In review'}</Pill>
            {!canAct && <span className="text-[11.5px] text-ink-400">View only</span>}
            <ChevronRight className="size-4 text-ink-300" />
          </button>
        )) : <EmptyState icon={CheckCheck} title="Nothing to approve" message="New submissions will appear here." />}
      </div>
    </div>
  );
}
