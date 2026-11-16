import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { api } from '../../server/api';
import { useOrg } from '../../app/session';
import { useQuery } from '../../app/hooks';
import { compact, money } from '../../lib/utils';
import type { Currency } from '../../domain/types';
import { Select } from '../../components/ui/Field';
import { EmptyState, Notice, PageHeader, PageSkeleton, Section } from '../../components/ui/misc';
import CampaignResults from '../../components/app/CampaignResults';

export default function Analytics() {
  const { ctx, orgId, org } = useOrg();
  const portfolio = useQuery(() => api.analytics.portfolioAnalytics(ctx, orgId), [ctx, orgId]);
  const campaigns = useQuery(() => (org.type === 'agency' ? Promise.resolve([]) : api.campaigns.listCampaigns(ctx, orgId)), [ctx, orgId, org.type]);
  const [cid, setCid] = useState('');
  if (!portfolio.data || !campaigns.data) return <PageSkeleton />;
  const withResults = campaigns.data.filter((c) => ['active', 'completed', 'under_review', 'paused'].includes(c.campaign.status));
  const selected = cid || withResults[0]?.campaign.id || '';
  return (
    <div className="space-y-5">
      <PageHeader title={org.type === 'agency' ? 'Agency analytics' : 'Analytics'} description="Every figure is labelled by source. Calculated metrics (engagement rate, cost per engagement) use recorded results and agreed fees." />
      <Section title={org.type === 'agency' ? 'All clients' : 'Workspace overview'}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-[13px]">
            <thead><tr className="text-[11.5px] text-ink-500"><th className="pb-2 font-medium">{org.type === 'agency' ? 'Client' : 'Workspace'}</th><th className="pb-2 text-right font-medium">Campaigns</th><th className="pb-2 text-right font-medium">Collaborations</th><th className="pb-2 text-right font-medium">Reach</th><th className="pb-2 text-right font-medium">Engagements</th><th className="pb-2 text-right font-medium">Clicks</th><th className="pb-2 pl-4 font-medium">Agreed fees</th></tr></thead>
            <tbody className="divide-y divide-ink-150">{portfolio.data.map((r) => <tr key={r.org.id}><td className="py-2.5 font-medium">{r.org.name}</td><td className="num text-right">{r.campaigns}</td><td className="num text-right">{r.collaborations}</td><td className="num text-right">{compact(r.reach)}</td><td className="num text-right">{compact(r.engagements)}</td><td className="num text-right">{compact(r.clicks)}</td><td className="num pl-4">{Object.entries(r.currencySpend).filter(([, v]) => v).map(([c, v]) => money(v, c as Currency, { compact: true })).join(' · ') || '—'}</td></tr>)}</tbody>
          </table>
        </div>
      </Section>
      {org.type === 'agency' ? <Notice tone="info">Open a client workspace from the switcher to see campaign-level reports.</Notice> : withResults.length ? (
        <Section title="Campaign performance" action={<Select aria-label="Campaign" className="w-64" options={withResults.map((c) => c.campaign.id)} labels={Object.fromEntries(withResults.map((c) => [c.campaign.id, c.campaign.name]))} value={selected} onChange={(e) => setCid(e.target.value)} />}>
          <CampaignResults key={selected} campaignId={selected} />
        </Section>
      ) : <div className="panel"><EmptyState icon={BarChart3} title="No running campaigns yet" message="Results can be recorded once a campaign is active." /></div>}
    </div>
  );
}
