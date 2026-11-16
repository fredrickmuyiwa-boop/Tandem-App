import { useState } from 'react';
import { Flag } from 'lucide-react';
import { api } from '../../server/api';
import { useSession } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { formatDateTime } from '../../lib/utils';
import Button from '../../components/ui/Button';
import { Pill } from '../../components/ui/Badge';
import { Checkbox, Textarea } from '../../components/ui/Field';
import { EmptyState, PageHeader, PageSkeleton } from '../../components/ui/misc';

export default function Moderation() {
  const { ctx } = useSession();
  const act = useAction();
  const q = useQuery(() => api.admin.listReports(ctx), [ctx]);
  const [res, setRes] = useState<Record<string, string>>({});
  const [enforce, setEnforce] = useState<Record<string, boolean>>({});
  if (!q.data) return <PageSkeleton />;
  const rows = [...q.data].sort((a, b) => (a.report.status === 'open' ? 0 : 1) - (b.report.status === 'open' ? 0 : 1));
  return (
    <div className="space-y-4">
      <PageHeader title="Moderation" description="Reports from users about profiles, campaigns and content." />
      {rows.length ? rows.map(({ report: r, targetName, reporter }) => {
        const action = r.targetType === 'creator' ? 'unlist_creator' as const : r.targetType === 'campaign' ? 'pause_campaign' as const : undefined;
        const decide = (outcome: 'resolved' | 'dismissed') => act.run(`${outcome}${r.id}`, () => api.admin.resolveReport(ctx, r.id, outcome, res[r.id] ?? '', outcome === 'resolved' && enforce[r.id] ? action : undefined), { title: outcome === 'resolved' ? 'Report resolved' : 'Report dismissed' });
        return (
          <div key={r.id} className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[14px] font-semibold">{targetName} <span className="font-normal text-ink-500">({r.targetType})</span></p><Pill tone={r.status === 'open' ? 'warning' : 'neutral'} dot>{r.status}</Pill></div>
            <p className="mt-1 text-[12px] text-ink-500">Reported by {reporter} · {formatDateTime(r.createdAt)}</p>
            <p className="mt-3 whitespace-pre-wrap rounded-[10px] bg-ink-50 p-3 text-[13px]">{r.reason}</p>
            {r.status === 'open' ? (
              <div className="mt-4 space-y-2">
                <Textarea value={res[r.id] ?? ''} onChange={(e) => setRes({ ...res, [r.id]: e.target.value })} placeholder="Record the outcome" className="min-h-[60px]" aria-label="Outcome" />
                {action && <Checkbox checked={!!enforce[r.id]} onChange={(v) => setEnforce({ ...enforce, [r.id]: v })} label={action === 'unlist_creator' ? 'Also hide this creator from discovery' : 'Also pause this campaign'} />}
                <div className="flex gap-2"><Button size="sm" variant="dark" loading={act.busy === `resolved${r.id}`} onClick={() => decide('resolved')}>Resolve</Button><Button size="sm" loading={act.busy === `dismissed${r.id}`} onClick={() => decide('dismissed')}>Dismiss</Button></div>
                {act.fields.resolution && <p className="text-[12px] text-bad-600">{act.fields.resolution}</p>}
              </div>
            ) : r.resolution && <p className="mt-2 text-[12.5px] text-ink-600">Outcome: {r.resolution}</p>}
          </div>
        );
      }) : <div className="panel"><EmptyState icon={Flag} title="No reports" /></div>}
    </div>
  );
}
