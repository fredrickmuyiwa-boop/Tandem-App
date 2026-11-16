import { useState } from 'react';
import { Plus, Megaphone, Search, Copy } from 'lucide-react';
import { api } from '../../server/api';
import { useOrg } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { roleCan } from '../../server/access';
import { CAMPAIGN_STATUS, objectiveLabel } from '../../domain/constants';
import type { CampaignStatus } from '../../domain/types';
import { cx, formatDate, money } from '../../lib/utils';
import Button, { IconButton } from '../../components/ui/Button';
import { Pill } from '../../components/ui/Badge';
import { EmptyState, Meter, PageHeader, PageSkeleton } from '../../components/ui/misc';

const FILTERS: ('all' | CampaignStatus)[] = ['all', 'draft', 'recruiting', 'active', 'paused', 'completed'];

export default function Campaigns() {
  const { ctx, orgId, role } = useOrg();
  const { navigate } = useRouter();
  const act = useAction();
  const q = useQuery(() => api.campaigns.listCampaigns(ctx, orgId), [ctx, orgId]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [term, setTerm] = useState('');
  if (!q.data) return <PageSkeleton />;
  const canEdit = roleCan(role, 'campaign.edit');
  const canMoney = roleCan(role, 'budget.view');
  const rows = q.data.filter((x) => (filter === 'all' || x.campaign.status === filter || (filter === 'recruiting' && x.campaign.status === 'published')) && (!term || x.campaign.name.toLowerCase().includes(term.toLowerCase())));
  return (
    <div>
      <PageHeader title="Campaigns" description="Every campaign, its stage and what’s waiting." actions={canEdit && <Button variant="dark" icon={Plus} onClick={() => navigate('/app/campaigns/new')}>New campaign</Button>} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex gap-1 overflow-x-auto scroll-thin">
          {FILTERS.map((f) => <button key={f} onClick={() => setFilter(f)} className={cx('h-8 shrink-0 rounded-full px-3 text-[12.5px] font-medium', filter === f ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100')}>{f === 'all' ? 'All' : CAMPAIGN_STATUS[f].label}<span className="num ml-1.5 opacity-60">{f === 'all' ? q.data!.length : q.data!.filter((x) => x.campaign.status === f || (f === 'recruiting' && x.campaign.status === 'published')).length}</span></button>)}
        </div>
        <div className="relative sm:ml-auto sm:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" /><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search campaigns" className="input pl-9" aria-label="Search campaigns" /></div>
      </div>
      {rows.length ? (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead><tr className="border-b border-ink-150 text-[11.5px] text-ink-500"><th className="px-5 py-2.5 font-medium">Campaign</th><th className="font-medium">Status</th><th className="font-medium">Dates</th><th className="font-medium">Creators</th>{canMoney && <th className="font-medium">Budget committed</th>}<th className="font-medium">Waiting</th><th /></tr></thead>
            <tbody className="divide-y divide-ink-150">
              {rows.map(({ campaign: c, collaborations, applications, pendingReviews, committed, invitations }) => (
                <tr key={c.id} className="cursor-pointer hover:bg-ink-50/60" onClick={() => navigate(`/app/campaigns/${c.id}`)}>
                  <td className="px-5 py-3"><p className="font-semibold text-ink-900">{c.name}</p><p className="text-[12px] text-ink-500">{objectiveLabel(c.objective)} · {c.locations.join(', ') || 'Any market'}</p></td>
                  <td><Pill tone={CAMPAIGN_STATUS[c.status].tone} dot>{CAMPAIGN_STATUS[c.status].label}</Pill></td>
                  <td className="text-ink-600">{formatDate(c.startDate, { year: undefined })} – {formatDate(c.endDate, { year: undefined })}</td>
                  <td className="num">{collaborations}{invitations ? <span className="text-ink-400"> +{invitations} invited</span> : ''}</td>
                  {canMoney && <td className="w-48 pr-4"><p className="num text-[12px]">{money(committed, c.currency, { compact: true })} <span className="text-ink-400">/ {money(c.budget, c.currency, { compact: true })}</span></p><Meter value={committed} max={c.budget} className="mt-1" tone={committed > c.budget ? 'bad' : 'accent'} /></td>}
                  <td className="text-[12px]">{applications ? <Pill tone="accent">{applications} applications</Pill> : null} {pendingReviews ? <Pill tone="warning">{pendingReviews} to review</Pill> : null}{!applications && !pendingReviews && <span className="text-ink-400">—</span>}</td>
                  <td className="pr-3 text-right" onClick={(e) => e.stopPropagation()}>{canEdit && <IconButton icon={Copy} size="sm" label="Duplicate as draft" onClick={async () => { const r = await act.run('d', () => api.campaigns.duplicateCampaign(ctx, orgId, c.id), { title: 'Campaign duplicated', body: 'Saved as a draft.' }); if (r && typeof r === 'object') navigate(`/app/campaigns/${r.id}/edit`); }} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="panel"><EmptyState icon={Megaphone} title={q.data.length ? 'No campaigns match' : 'No campaigns yet'} message={q.data.length ? 'Try another filter.' : 'Create your first campaign. You can draft it from a plain-language brief.'} action={canEdit && !q.data.length && <Button variant="dark" icon={Plus} onClick={() => navigate('/app/campaigns/new')}>New campaign</Button>} /></div>}
    </div>
  );
}
