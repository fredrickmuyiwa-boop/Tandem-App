import { useState } from 'react';
import { Check, RotateCcw, X, MessageSquare, ExternalLink, FileText, Film } from 'lucide-react';
import type { Review, Submission } from '../../domain/types';
import { cx, formatDateTime } from '../../lib/utils';
import Button from '../ui/Button';
import { Pill } from '../ui/Badge';
import { Textarea } from '../ui/Field';

type Sub = Submission & { files: { id: string; name: string; type: string; size: number; previewUrl?: string }[] };
const STATUS: Record<Submission['status'], { label: string; tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' }> = {
  in_review: { label: 'In review', tone: 'accent' }, awaiting_client: { label: 'Awaiting client', tone: 'warning' }, approved: { label: 'Approved', tone: 'success' }, revision_requested: { label: 'Revision requested', tone: 'warning' }, rejected: { label: 'Rejected', tone: 'danger' },
};
const DECISION: Record<Review['decision'], string> = { approved: 'approved', revision_requested: 'requested a revision', rejected: 'rejected', comment: 'commented' };

export default function SubmissionCard({ s, latest, canReview, revisionsLeft, onReview }: { s: Sub; latest: boolean; canReview: boolean; revisionsLeft: number; onReview?: (decision: Review['decision'], comment: string) => Promise<unknown> }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (d: Review['decision']) => { if (!onReview) return; setBusy(d); const r = await onReview(d, comment); setBusy(null); if (r) setComment(''); };
  return (
    <div className={cx('rounded-[12px] border p-4', latest ? 'border-ink-300 bg-surface' : 'border-ink-150 bg-ink-50/50')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-ink-500"><span className="font-semibold text-ink-800">Version {s.version}</span> · submitted {formatDateTime(s.submittedAt)}</p>
        <Pill tone={STATUS[s.status].tone} dot>{STATUS[s.status].label}</Pill>
      </div>
      {s.caption && <p className="mt-3 whitespace-pre-wrap rounded-[10px] bg-ink-50 p-3 text-[13px] leading-relaxed text-ink-800">{s.caption}</p>}
      {(s.files.length > 0 || s.links.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {s.files.map((f) => f.previewUrl ? <a key={f.id} href={f.previewUrl} target="_blank" rel="noreferrer" className="block"><img src={f.previewUrl} alt={f.name} className="size-20 rounded-[10px] border border-ink-200 object-cover" /></a> : <span key={f.id} className="inline-flex items-center gap-1.5 rounded-[9px] border border-ink-200 px-2.5 py-1.5 text-[12px]">{f.type.startsWith('video') ? <Film className="size-3.5" /> : <FileText className="size-3.5" />}{f.name}</span>)}
          {s.links.map((l) => <a key={l} href={l} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 rounded-[9px] border border-ink-200 px-2.5 py-1.5 text-[12px] text-accent-700 hover:bg-accent-50">{new URL(l).hostname}<ExternalLink className="size-3" /></a>)}
        </div>
      )}
      {s.note && <p className="mt-2 text-[12.5px] text-ink-600"><span className="font-medium">Creator note:</span> {s.note}</p>}
      {s.reviews.length > 0 && (
        <ol className="mt-3 space-y-2 border-l-2 border-ink-150 pl-3">
          {s.reviews.map((r) => <li key={r.id} className="text-[12.5px]"><span className="font-medium">{r.reviewerName}</span> <span className="text-ink-500">{DECISION[r.decision]}{r.stage === 'client' ? ' (client)' : ''} · {formatDateTime(r.at)}</span>{r.comment && <p className="mt-0.5 whitespace-pre-wrap text-ink-700">{r.comment}</p>}</li>)}
        </ol>
      )}
      {latest && canReview && onReview && (
        <div className="mt-4 border-t border-ink-150 pt-3">
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Feedback for the creator (required for revisions and rejections)" className="min-h-[64px]" aria-label="Review feedback" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" icon={Check} loading={busy === 'approved'} onClick={() => act('approved')}>{s.status === 'in_review' ? 'Approve' : 'Give final approval'}</Button>
            <Button size="sm" icon={RotateCcw} loading={busy === 'revision_requested'} disabled={revisionsLeft <= 0} onClick={() => act('revision_requested')} title={revisionsLeft <= 0 ? 'Agreed revision limit reached' : undefined}>Request revision</Button>
            <Button size="sm" variant="danger" icon={X} loading={busy === 'rejected'} onClick={() => act('rejected')}>Reject</Button>
            <Button size="sm" variant="ghost" icon={MessageSquare} loading={busy === 'comment'} disabled={!comment.trim()} onClick={() => act('comment')}>Comment only</Button>
            <span className="ml-auto text-[11.5px] text-ink-500">{revisionsLeft} revision{revisionsLeft === 1 ? '' : 's'} left</span>
          </div>
        </div>
      )}
    </div>
  );
}
