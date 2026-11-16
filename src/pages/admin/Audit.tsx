import { useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '../../server/api';
import { useSession } from '../../app/session';
import { useQuery } from '../../app/hooks';
import { formatDateTime } from '../../lib/utils';
import { downloadText, toCsv } from '../../lib/csv';
import Button from '../../components/ui/Button';
import { Pill } from '../../components/ui/Badge';
import { PageHeader, PageSkeleton, Tabs } from '../../components/ui/misc';

type Sev = 'all' | 'security' | 'warning' | 'info';
export default function Audit() {
  const { ctx } = useSession();
  const [sev, setSev] = useState<Sev>('all');
  const q = useQuery(() => api.admin.auditLog(ctx, sev === 'all' ? undefined : sev), [ctx, sev]);
  return (
    <div className="space-y-4">
      <PageHeader title="Audit & security" description="Sign-ins, lockouts, permission denials, data changes and admin actions. Most recent 400 events." actions={q.data && <Button icon={Download} size="sm" onClick={() => downloadText('tandem-audit.csv', toCsv(q.data!.map((a) => ({ at: a.at, severity: a.severity, action: a.action, actor: a.actorEmail ?? '', target: a.target ?? '', detail: a.detail ?? '' }))), 'text/csv')}>Export CSV</Button>} />
      <Tabs value={sev} onChange={setSev} tabs={[{ id: 'all', label: 'All' }, { id: 'security', label: 'Security' }, { id: 'warning', label: 'Warnings' }, { id: 'info', label: 'Info' }]} />
      {!q.data ? <PageSkeleton /> : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[760px] text-[12.5px]">
            <thead><tr className="border-b border-ink-150 text-left text-[11px] uppercase tracking-wide text-ink-500"><th className="px-4 py-2.5 font-medium">When</th><th className="px-4 py-2.5 font-medium">Severity</th><th className="px-4 py-2.5 font-medium">Action</th><th className="px-4 py-2.5 font-medium">Actor</th><th className="px-4 py-2.5 font-medium">Target</th><th className="px-4 py-2.5 font-medium">Detail</th></tr></thead>
            <tbody className="divide-y divide-ink-150">{q.data.map((a) => (
              <tr key={a.id}><td className="whitespace-nowrap px-4 py-2.5 text-ink-600">{formatDateTime(a.at)}</td><td className="px-4 py-2.5"><Pill tone={a.severity === 'security' ? 'danger' : a.severity === 'warning' ? 'warning' : 'neutral'}>{a.severity}</Pill></td><td className="font-mono px-4 py-2.5">{a.action}</td><td className="px-4 py-2.5 text-ink-600">{a.actorEmail ?? 'system'}</td><td className="px-4 py-2.5 text-ink-600">{a.target}</td><td className="max-w-[260px] truncate px-4 py-2.5 text-ink-500" title={a.detail}>{a.detail}</td></tr>
            ))}</tbody>
          </table>
          {!q.data.length && <p className="p-6 text-center text-[13px] text-ink-500">No events.</p>}
        </div>
      )}
    </div>
  );
}
