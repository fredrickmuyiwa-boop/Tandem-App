import { useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import { api } from '../../server/api';
import { useSession } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { formatDateTime } from '../../lib/utils';
import Button from '../../components/ui/Button';
import { Pill } from '../../components/ui/Badge';
import { Textarea } from '../../components/ui/Field';
import { EmptyState, Notice, PageHeader, PageSkeleton } from '../../components/ui/misc';

export default function Verification() {
  const { ctx } = useSession();
  const act = useAction();
  const q = useQuery(() => api.admin.verificationQueue(ctx), [ctx]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!q.data) return <PageSkeleton />;
  const sorted = [...q.data].sort((a, b) => (a.request.status === 'pending' ? 0 : 1) - (b.request.status === 'pending' ? 0 : 1) || b.request.createdAt.localeCompare(a.request.createdAt));
  return (
    <div className="space-y-4">
      <PageHeader title="Identity verification" description="Approving confirms who the creator is. It does not verify their audience numbers, which stay labelled by source." />
      <Notice tone="info">Check the evidence against the creator’s linked profiles. In production, use your documented identity-check procedure; this demo stores text evidence only.</Notice>
      {sorted.length ? sorted.map(({ request: r, creator: c }) => (
        <div key={r.id} className="panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[14px] font-semibold">{c?.displayName ?? 'Deleted creator'} <span className="font-normal text-ink-500">@{c?.handle}</span></p><Pill tone={r.status === 'pending' ? 'warning' : r.status === 'approved' ? 'success' : 'danger'} dot>{r.status}</Pill></div>
          <p className="mt-1 text-[12px] text-ink-500">Requested {formatDateTime(r.createdAt)}</p>
          <p className="mt-3 whitespace-pre-wrap rounded-[10px] bg-ink-50 p-3 text-[13px] text-ink-800">{r.evidence}</p>
          {c && <p className="mt-2 text-[12.5px] text-ink-600">Linked: {c.socials.map((s) => `${s.platform} @${s.handle}`).join(' · ') || 'none'}</p>}
          {r.status === 'pending' ? (
            <div className="mt-4 space-y-2">
              <Textarea value={notes[r.id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} placeholder="Note to the creator (shown if rejected)" className="min-h-[60px]" aria-label="Decision note" />
              <div className="flex gap-2"><Button size="sm" variant="primary" icon={BadgeCheck} loading={act.busy === `a${r.id}`} onClick={() => act.run(`a${r.id}`, () => api.admin.decideVerification(ctx, r.id, true, notes[r.id] ?? ''), { title: 'Identity verified' })}>Approve</Button><Button size="sm" variant="danger" loading={act.busy === `r${r.id}`} onClick={() => act.run(`r${r.id}`, () => api.admin.decideVerification(ctx, r.id, false, notes[r.id] ?? ''), { title: 'Request rejected' })}>Reject</Button></div>
            </div>
          ) : r.note && <p className="mt-2 text-[12.5px] text-ink-600">Note: {r.note}</p>}
        </div>
      )) : <div className="panel"><EmptyState icon={BadgeCheck} title="No verification requests" /></div>}
    </div>
  );
}
