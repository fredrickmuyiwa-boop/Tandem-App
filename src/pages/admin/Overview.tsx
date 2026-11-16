import { api } from '../../server/api';
import { useSession } from '../../app/session';
import { useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { Notice, PageHeader, PageSkeleton, Stat } from '../../components/ui/misc';

export default function Overview() {
  const { ctx } = useSession();
  const { navigate } = useRouter();
  const q = useQuery(() => api.admin.overview(ctx), [ctx]);
  if (!q.data) return <PageSkeleton />;
  const o = q.data;
  return (
    <div className="space-y-5">
      <PageHeader title="Platform overview" description="Counts from this environment’s data. Sample records are labelled and counted separately where shown." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Accounts" value={o.users} sub={`${o.byKind.brand} brand · ${o.byKind.agency} agency · ${o.byKind.creator} creator`} />
        <Stat label="Organisations" value={o.organizations} />
        <Stat label="Creator profiles" value={o.creators} sub={`${o.sampleCreators} are labelled sample profiles`} />
        <Stat label="Campaigns" value={o.campaigns} sub={`${o.liveCampaigns} live`} />
        <Stat label="Collaborations" value={o.collaborations} />
        <Stat label="Suspended accounts" value={o.suspended} tone={o.suspended ? 'warn' : 'default'} />
        <Stat label="Security events (24h)" value={o.securityEvents24h} tone={o.securityEvents24h ? 'warn' : 'default'} />
        <Stat label="Failed sign-ins (24h)" value={o.failedLogins24h} tone={o.failedLogins24h > 10 ? 'warn' : 'default'} />
      </div>
      {(o.pendingVerifications > 0 || o.openReports > 0) && (
        <Notice tone="warn">
          {o.pendingVerifications > 0 && <><button className="font-semibold underline" onClick={() => navigate('/admin/verification')}>{o.pendingVerifications} verification request{o.pendingVerifications > 1 ? 's' : ''}</button> waiting. </>}
          {o.openReports > 0 && <><button className="font-semibold underline" onClick={() => navigate('/admin/moderation')}>{o.openReports} open report{o.openReports > 1 ? 's' : ''}</button> to review.</>}
        </Notice>
      )}
    </div>
  );
}
