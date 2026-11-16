import { useState } from 'react';
import { ArrowLeft, Send, Flag } from 'lucide-react';
import { api } from '../../server/api';
import { useSession } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { categoryLabel, compensationLabel, formatLabel, objectiveLabel, platformLabel } from '../../domain/constants';
import { formatDate, money, timeAgo } from '../../lib/utils';
import Button from '../../components/ui/Button';
import { Field, Input, Textarea } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { EmptyState, KeyValue, Notice, PageSkeleton, Section } from '../../components/ui/misc';

export default function OpportunityDetail({ params }: { params: Record<string, string> }) {
  const { ctx } = useSession();
  const { navigate } = useRouter();
  const act = useAction();
  const q = useQuery(() => api.campaigns.campaignForCreator(ctx, params.id), [ctx, params.id]);
  const [pitch, setPitch] = useState('');
  const [fee, setFee] = useState('');
  const [report, setReport] = useState(false);
  const [reason, setReason] = useState('');
  if (q.error) return <EmptyState title="Opportunity not available" message="It may have closed." action={<Button onClick={() => navigate('/creator/opportunities')}>Back</Button>} />;
  if (!q.data) return <PageSkeleton />;
  const { campaign: c, application, invitation, canApply } = q.data;
  return (
    <div className="mx-auto max-w-4xl">
      <button onClick={() => navigate('/creator/opportunities')} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 hover:text-ink-900"><ArrowLeft className="size-4" />Opportunities</button>
      <h1 className="text-[24px] font-semibold tracking-tight">{c.name}</h1>
      <p className="mt-1 text-[13.5px] text-ink-500">{c.brandName} · {objectiveLabel(c.objective)} · {formatDate(c.startDate)} – {formatDate(c.endDate)}</p>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Section title="About the campaign"><p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink-700">{c.description}</p>{c.productName && <p className="mt-2 text-[13px] text-ink-600"><span className="font-medium">Product:</span> {c.productName}</p>}</Section>
          <Section title="What you’d create"><ul className="divide-y divide-ink-150">{c.deliverables.map((d) => <li key={d.id} className="flex justify-between py-2 text-[13px]"><span>{d.notes || formatLabel(d.format)}</span><span className="text-ink-600">{d.quantity} × {formatLabel(d.format)} · {platformLabel(d.platform)}</span></li>)}</ul></Section>
          {(c.requirements || c.guidelines) && <Section title="Requirements & guidelines"><p className="whitespace-pre-wrap text-[13px] text-ink-700">{c.requirements}</p>{c.guidelines && <p className="mt-2 whitespace-pre-wrap text-[13px] text-ink-700">{c.guidelines}</p>}</Section>}
          {application ? <Notice tone="info">You applied {timeAgo(application.createdAt)} proposing {money(application.proposedFee, application.currency)} — status: {application.status}. <button className="font-semibold underline" onClick={() => navigate(`/creator/deals/${c.id}`)}>Open conversation</button></Notice>
            : invitation ? <Notice tone="info">You’ve been invited to this campaign. <button className="font-semibold underline" onClick={() => navigate(`/creator/deals/${c.id}`)}>See the offer</button></Notice>
            : canApply && (
              <Section title="Apply">
                <div className="space-y-3">
                  <Field label="Why you’re a good fit" error={act.fields.pitch} hint="Mention your audience, a relevant post and your idea."><Textarea value={pitch} onChange={(e) => setPitch(e.target.value)} maxLength={2000} error={act.fields.pitch} /></Field>
                  <Field label={`Your proposed fee (${c.currency})`} error={act.fields.proposedFee}><Input type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} error={act.fields.proposedFee} className="max-w-xs" /></Field>
                  <Button variant="dark" icon={Send} loading={act.busy === 'apply'} onClick={async () => { const r = await act.run('apply', () => api.deals.applyToCampaign(ctx, c.id, { pitch, proposedFee: Number(fee) }), { title: 'Application sent', body: `${c.brandName} will review it.` }); if (r) navigate(`/creator/deals/${c.id}`); }}>Send application</Button>
                </div>
              </Section>
            )}
        </div>
        <aside className="space-y-5">
          <Section title="At a glance"><KeyValue items={[['Brand', c.brandName], ['Markets', c.locations.join(', ') || 'Any'], ['Languages', c.languages.join(', ') || 'Any'], ['Categories', c.categories.map(categoryLabel).join(', ')], ['Compensation', compensationLabel(c.compensationModel)], ['Audience', `${c.audience.genders.includes('all') ? 'All' : c.audience.genders.join(', ')}${c.audience.ageMin ? `, ${c.audience.ageMin}–${c.audience.ageMax}` : ''}`]]} /></Section>
          <button onClick={() => setReport(true)} className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-500 hover:text-bad-600"><Flag className="size-3.5" />Report this campaign</button>
        </aside>
      </div>
      <Modal open={report} onClose={() => setReport(false)} size="sm" title="Report this campaign" footer={<><Button onClick={() => setReport(false)}>Cancel</Button><Button variant="danger" loading={act.busy === 'r'} onClick={async () => { const r = await act.run('r', () => api.creators.reportContent(ctx, { targetType: 'campaign', targetId: c.id, reason }), { title: 'Report sent' }); if (r) setReport(false); }}>Send report</Button></>}>
        <Field label="What’s wrong?" error={act.fields.reason}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} error={act.fields.reason} /></Field>
      </Modal>
    </div>
  );
}
