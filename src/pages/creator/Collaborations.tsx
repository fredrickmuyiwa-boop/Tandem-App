import { Briefcase, ChevronRight } from 'lucide-react';
import { api } from '../../server/api';
import { useSession } from '../../app/session';
import { useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { formatDate } from '../../lib/utils';
import { Pill } from '../../components/ui/Badge';
import { EmptyState, Meter, PageHeader, PageSkeleton } from '../../components/ui/misc';

export default function Collaborations() {
  const { ctx } = useSession();
  const { navigate } = useRouter();
  const q = useQuery(() => api.collaborations.listCreatorCollaborations(ctx), [ctx]);
  if (!q.data) return <PageSkeleton />;
  return (
    <div>
      <PageHeader title="Collaborations" description="Agreed work: deliverables, deadlines, feedback and payments." />
      <div className="panel divide-y divide-ink-150">
        {q.data.length ? q.data.map((r) => (
          <button key={r.collab.id} onClick={() => navigate(`/creator/collaborations/${r.collab.id}`)} className="flex w-full flex-wrap items-center gap-4 px-5 py-4 text-left hover:bg-ink-50">
            <span className="min-w-[200px] flex-1"><span className="block text-[14px] font-semibold">{r.campaign.name}</span><span className="block text-[12.5px] text-ink-500">{r.campaign.brandName}{r.nextDue ? ` · next due ${formatDate(r.nextDue)}` : ''}</span></span>
            <span className="w-36"><span className="num block text-[12px] text-ink-600">{r.approved}/{r.total} approved</span><Meter value={r.approved} max={Math.max(1, r.total)} tone="ok" className="mt-1" /></span>
            {r.revisions > 0 ? <Pill tone="warning" dot>{r.revisions} revision{r.revisions > 1 ? 's' : ''} requested</Pill> : <Pill tone={r.collab.status === 'active' ? 'success' : 'neutral'} dot>{r.collab.status}</Pill>}
            <ChevronRight className="size-4 text-ink-300" />
          </button>
        )) : <EmptyState icon={Briefcase} title="No collaborations yet" message="When you and a brand agree terms, the work shows up here." />}
      </div>
    </div>
  );
}
