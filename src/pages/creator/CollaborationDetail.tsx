import { useState } from 'react';
import { ArrowLeft, Upload, ScrollText } from 'lucide-react';
import { api } from '../../server/api';
import { useSession } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { useToast } from '../../components/ui/Toast';
import { DELIVERABLE_STATUS, PAYMENT_STATUS, formatLabel, platformLabel } from '../../domain/constants';
import { daysUntil, formatDate, money } from '../../lib/utils';
import Button from '../../components/ui/Button';
import { Pill } from '../../components/ui/Badge';
import { Field, Input, Textarea } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { EmptyState, KeyValue, Notice, PageSkeleton, Section } from '../../components/ui/misc';
import SubmissionCard from '../../components/app/SubmissionCard';
import FileDrop, { type PickedFile } from '../../components/app/FileDrop';
import Thread from '../../components/app/Thread';

const SUBMITTABLE = ['not_started', 'in_progress', 'revision_requested'];

export default function CollaborationDetail({ params }: { params: Record<string, string> }) {
  const { ctx } = useSession();
  const { navigate } = useRouter();
  const toast = useToast();
  const act = useAction();
  const q = useQuery(() => api.collaborations.creatorCollaboration(ctx, params.id), [ctx, params.id]);
  const [target, setTarget] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [links, setLinks] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<PickedFile[]>([]);
  if (q.error) return <EmptyState title="Collaboration not found" action={<Button onClick={() => navigate('/creator/collaborations')}>Back</Button>} />;
  if (!q.data) return <PageSkeleton />;
  const { collab, deliverables, submissions, payments, messages, campaignView: c, orgName, creatorId } = q.data;
  const t = collab.terms;
  const close = () => { setTarget(null); setCaption(''); setLinks(''); setNote(''); setFiles([]); };
  const submit = async () => {
    if (!target) return;
    const r = await act.run('sub', () => api.collaborations.submitContent(ctx, target, { caption, links: links.split(/\s+/).filter(Boolean), note, files }), { title: 'Submitted for review', body: `${orgName} has been notified.` });
    if (r) close();
  };
  const targetDel = deliverables.find((d) => d.id === target);
  return (
    <div>
      <button onClick={() => navigate('/creator/collaborations')} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 hover:text-ink-900"><ArrowLeft className="size-4" />Collaborations</button>
      <div className="mb-5 flex flex-wrap items-center gap-2"><h1 className="text-[22px] font-semibold tracking-tight">{c.name}</h1><Pill tone={collab.status === 'active' ? 'success' : 'neutral'} dot>{collab.status}</Pill></div>
      <p className="-mt-4 mb-5 text-[13px] text-ink-500">{orgName}</p>
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          {deliverables.map((d) => {
            const subs = submissions.filter((s) => s.deliverableId === d.id);
            const days = daysUntil(d.dueDate);
            return (
              <Section key={d.id} title={d.title} description={`${formatLabel(d.format)} · ${platformLabel(d.platform)} · due ${formatDate(d.dueDate)}${d.status !== 'approved' ? days < 0 ? ` (${-days}d overdue)` : ` (in ${days}d)` : ''}`} action={<Pill tone={DELIVERABLE_STATUS[d.status].tone} dot>{DELIVERABLE_STATUS[d.status].label}</Pill>}>
                {d.status === 'revision_requested' && <Notice tone="warn" className="mb-3">Revision requested — see the feedback below. {Math.max(0, t.revisionLimit - d.revisionCount)} revision round(s) left in the agreed terms.</Notice>}
                {subs.length ? <div className="space-y-3">{subs.map((s, i) => <SubmissionCard key={s.id} s={s} latest={i === 0} canReview={false} revisionsLeft={t.revisionLimit - d.revisionCount} />)}</div> : <p className="text-[13px] text-ink-500">Nothing submitted yet.</p>}
                {collab.status === 'active' && SUBMITTABLE.includes(d.status) && <Button className="mt-3" size="sm" variant="dark" icon={Upload} onClick={() => setTarget(d.id)}>{subs.length ? 'Submit a new version' : 'Submit content'}</Button>}
              </Section>
            );
          })}
          <Section title="Payments" description="Tracked by the brand. Tandem does not hold or move money.">
            {payments.length ? <ul className="divide-y divide-ink-150">{payments.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5 text-[13px]"><span className="flex-1">{p.label}<span className="block text-[11.5px] text-ink-500">due {formatDate(p.dueDate)}{p.reference ? ` · ref ${p.reference}` : ''}</span></span><span className="num font-semibold">{money(p.amount, p.currency)}</span><Pill tone={PAYMENT_STATUS[p.status].tone} dot>{PAYMENT_STATUS[p.status].label}</Pill></li>)}</ul> : <p className="text-[13px] text-ink-500">No payment schedule.</p>}
          </Section>
          <Section title="Messages"><Thread messages={messages} me="creator" canSend onSend={(b) => act.run('m', () => api.deals.sendMessage(ctx, 'creator', collab.campaignId, creatorId, b))} /></Section>
        </div>
        <aside>
          <Section title="Agreed terms" action={<ScrollText className="size-4 text-ink-400" />}>
            <KeyValue items={[['Fee', money(t.fee, t.currency)], ...(t.bonus ? [['Bonus', `${money(t.bonus.amount, t.currency)} if ${t.bonus.condition.toLowerCase()}`] as [string, string]] : []), ['Deadline', formatDate(t.deadline)], ['Revisions', `${t.revisionLimit} round${t.revisionLimit === 1 ? '' : 's'}`], ['Usage rights', t.usageRights], ['Exclusivity', t.exclusivity]]} />
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-500">Commercial terms both sides accepted in Tandem. Not a signed legal contract.</p>
          </Section>
        </aside>
      </div>
      <Modal open={!!target} onClose={close} size="lg" title={`Submit: ${targetDel?.title ?? ''}`} description="Upload drafts or link to them. The brand reviews before anything is published." footer={<><Button onClick={close}>Cancel</Button><Button variant="dark" loading={act.busy === 'sub'} onClick={submit}>Submit for review</Button></>}>
        <div className="space-y-4">
          <Field label="Caption / script" error={act.fields.caption}><Textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={4000} error={act.fields.caption} /></Field>
          <Field label="Files" hint="Images up to 1 MB preview inline in Demo mode; other files store their name and size only." error={act.fields.files}><FileDrop files={files} onChange={setFiles} onError={(m) => toast.error('File not added', m)} /></Field>
          <Field label="Links (optional)" hint="Space-separated https links, e.g. an unlisted video or a drive folder." error={act.fields.links}><Input value={links} onChange={(e) => setLinks(e.target.value)} error={act.fields.links} /></Field>
          <Field label="Note to reviewer (optional)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[60px]" /></Field>
        </div>
      </Modal>
    </div>
  );
}
