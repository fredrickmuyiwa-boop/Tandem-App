import { Inbox, ChevronRight } from 'lucide-react';
import { api } from '../../server/api';
import { useSession } from '../../app/session';
import { useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { money, timeAgo } from '../../lib/utils';
import { Pill } from '../../components/ui/Badge';
import { EmptyState, PageHeader, PageSkeleton } from '../../components/ui/misc';

const STAGE: Record<string, { label: string; tone: 'neutral' | 'accent' | 'success' | 'warning' }> = {
  offer_received: { label: 'Offer to review', tone: 'warning' }, awaiting_brand: { label: 'Waiting for brand', tone: 'accent' }, applied: { label: 'Applied', tone: 'accent' }, agreed: { label: 'Agreed', tone: 'success' }, closed: { label: 'Closed', tone: 'neutral' },
};

export default function Deals() {
  const { ctx } = useSession();
  const { navigate } = useRouter();
  const q = useQuery(() => api.deals.creatorDeals(ctx), [ctx]);
  if (!q.data) return <PageSkeleton />;
  return (
    <div>
      <PageHeader title="Invitations & offers" description="Every conversation with a brand: invitations, applications, offers and counteroffers." />
      <div className="panel divide-y divide-ink-150">
        {q.data.length ? q.data.map((d) => (
          <button key={d.campaign.id} onClick={() => navigate(`/creator/deals/${d.campaign.id}`)} className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left hover:bg-ink-50">
            <span className="min-w-[200px] flex-1"><span className="block text-[14px] font-semibold">{d.campaign.name}</span><span className="block text-[12.5px] text-ink-500">{d.campaign.brandName} · {timeAgo(d.lastActivity)}</span></span>
            <span className="num text-[13.5px] font-semibold">{d.latestOffer ? money(d.latestOffer.terms.fee, d.latestOffer.terms.currency) : d.application ? money(d.application.proposedFee, d.application.currency) : ''}</span>
            <Pill tone={STAGE[d.stage].tone} dot>{STAGE[d.stage].label}</Pill>
            <ChevronRight className="size-4 text-ink-300" />
          </button>
        )) : <EmptyState icon={Inbox} title="No conversations yet" message="Apply to an opportunity or wait for an invitation." />}
      </div>
    </div>
  );
}
