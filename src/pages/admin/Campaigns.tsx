import { api } from '../../server/api';
import { useSession } from '../../app/session';
import { useQuery } from '../../app/hooks';
import { CAMPAIGN_STATUS } from '../../domain/constants';
import { formatDate } from '../../lib/utils';
import { Pill } from '../../components/ui/Badge';
import { PageHeader, PageSkeleton } from '../../components/ui/misc';

export default function Campaigns() {
  const { ctx } = useSession();
  const q = useQuery(() => api.admin.listCampaigns(ctx), [ctx]);
  if (!q.data) return <PageSkeleton />;
  return (
    <div>
      <PageHeader title="Campaigns" description="All campaigns across organisations. Pause a reported campaign from Moderation." />
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead><tr className="border-b border-ink-150 text-left text-[11.5px] uppercase tracking-wide text-ink-500"><th className="px-4 py-2.5 font-medium">Campaign</th><th className="px-4 py-2.5 font-medium">Organisation</th><th className="px-4 py-2.5 font-medium">Created</th><th className="px-4 py-2.5 text-right font-medium">Collabs</th><th className="px-4 py-2.5 text-right font-medium">Reports</th><th className="px-4 py-2.5 font-medium">Status</th></tr></thead>
          <tbody className="divide-y divide-ink-150">{q.data.map((c) => (
            <tr key={c.id}><td className="px-4 py-3 font-medium">{c.name}</td><td className="px-4 py-3 text-ink-600">{c.org}</td><td className="px-4 py-3 text-ink-600">{formatDate(c.createdAt)}</td><td className="num px-4 py-3 text-right">{c.collaborations}</td><td className="num px-4 py-3 text-right">{c.reports || '—'}</td><td className="px-4 py-3"><Pill tone={CAMPAIGN_STATUS[c.status].tone} dot>{CAMPAIGN_STATUS[c.status].label}</Pill></td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
