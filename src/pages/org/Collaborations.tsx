import { useState } from 'react';
import { Handshake, ChevronRight } from 'lucide-react';
import { api } from '../../server/api';
import { useOrg } from '../../app/session';
import { useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { cx, formatDate, money } from '../../lib/utils';
import { Pill } from '../../components/ui/Badge';
import { Avatar, EmptyState, Meter, PageHeader, PageSkeleton } from '../../components/ui/misc';

export default function Collaborations() {
  const { ctx, orgId } = useOrg();
  const { navigate } = useRouter();
  const q = useQuery(() => api.collaborations.listOrgCollaborations(ctx, orgId), [ctx, orgId]);
  const [filter, setFilter] = useState<'active' | 'completed' | 'all'>('active');
  if (!q.data) return <PageSkeleton />;
  const rows = q.data.filter((r) => filter === 'all' || r.collab.status === filter);
  return (
    <div>
      <PageHeader title="Collaborations" description="Every creator partnership with agreed terms." />
      <div className="mb-4 flex gap-1">{(['active', 'completed', 'all'] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={cx('h-8 rounded-full px-3 text-[12.5px] font-medium capitalize', filter === f ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100')}>{f}</button>)}</div>
      <div className="panel divide-y divide-ink-150">
        {rows.length ? rows.map((r) => (
          <button key={r.collab.id} onClick={() => navigate(`/app/collaborations/${r.collab.id}`)} className="flex w-full flex-wrap items-center gap-4 px-5 py-3.5 text-left hover:bg-ink-50">
            {r.creator && <Avatar name={r.creator.displayName} hue={r.creator.avatarHue} url={r.creator.avatarUrl} size="sm" />}
            <span className="min-w-[160px] flex-1"><span className="block text-[13.5px] font-semibold">{r.creator?.displayName}</span><span className="block text-[12px] text-ink-500">{r.campaign.name}</span></span>
            <span className="num w-28 text-[12.5px]">{money(r.collab.terms.fee, r.collab.terms.currency, { compact: true })}</span>
            <span className="w-40"><span className="num block text-[12px] text-ink-500">{r.approved}/{r.total} approved</span><Meter value={r.approved} max={Math.max(1, r.total)} tone="ok" className="mt-1" /></span>
            <span className="w-28 text-[12px] text-ink-500">{r.nextDue ? `Due ${formatDate(r.nextDue, { year: undefined })}` : '—'}</span>
            {r.toReview > 0 ? <Pill tone="warning">{r.toReview} to review</Pill> : <Pill tone={r.collab.status === 'active' ? 'success' : 'neutral'}>{r.collab.status}</Pill>}
            <ChevronRight className="size-4 text-ink-300" />
          </button>
        )) : <EmptyState icon={Handshake} title="No collaborations here" message="Collaborations start when a creator and your team agree terms." />}
      </div>
    </div>
  );
}
