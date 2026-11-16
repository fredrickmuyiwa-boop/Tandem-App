import { useState } from 'react';
import { ArrowLeft, Check, X, Repeat2, HelpCircle } from 'lucide-react';
import { api } from '../../server/api';
import { useSession } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import type { Terms } from '../../domain/types';
import { money } from '../../lib/utils';
import Button from '../../components/ui/Button';
import { Field, Textarea } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { EmptyState, Notice, PageSkeleton, Section } from '../../components/ui/misc';
import OfferCard from '../../components/app/OfferCard';
import TermsEditor from '../../components/app/TermsEditor';
import Thread from '../../components/app/Thread';

export default function DealThread({ params }: { params: Record<string, string> }) {
  const { ctx } = useSession();
  const { navigate } = useRouter();
  const act = useAction();
  const q = useQuery(() => api.deals.creatorThread(ctx, params.id), [ctx, params.id]);
  const [counter, setCounter] = useState<Terms | null>(null);
  const [msg, setMsg] = useState('');
  const [modal, setModal] = useState<'counter' | 'clarify' | 'reject' | null>(null);
  if (q.error) return <EmptyState title="Conversation not found" action={<Button onClick={() => navigate('/creator/deals')}>Back</Button>} />;
  if (!q.data) return <PageSkeleton />;
  const { campaign: c, offers, messages, invitation, application, collaboration, creatorId } = q.data;
  const open = offers.find((o) => o.status === 'open' && o.from === 'org');
  const close = () => { setModal(null); setMsg(''); };
  const respond = async (action: 'accept' | 'reject' | 'counter' | 'clarify') => {
    if (!open) return;
    const r = await act.run(action, () => api.deals.creatorRespond(ctx, open.id, action, { terms: action === 'counter' ? counter ?? undefined : undefined, message: msg }), { title: action === 'accept' ? 'Offer accepted' : action === 'counter' ? 'Counteroffer sent' : action === 'clarify' ? 'Question sent' : 'Offer declined' });
    if (r) { close(); if (action === 'accept' && typeof r === 'object' && 'collaborationId' in r && r.collaborationId) navigate(`/creator/collaborations/${r.collaborationId}`); }
  };
  return (
    <div className="mx-auto max-w-4xl">
      <button onClick={() => navigate('/creator/deals')} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 hover:text-ink-900"><ArrowLeft className="size-4" />Invitations & offers</button>
      <h1 className="text-[22px] font-semibold tracking-tight">{c.name}</h1>
      <p className="mt-1 text-[13px] text-ink-500">{c.brandName} · <button className="link" onClick={() => navigate(`/creator/opportunities/${c.id}`)}>Campaign details</button></p>
      <div className="mt-5 space-y-5">
        {collaboration && <Notice tone="ok">Terms agreed. <button className="font-semibold underline" onClick={() => navigate(`/creator/collaborations/${collaboration.id}`)}>Go to your collaboration workspace</button></Notice>}
        {application && !offers.length && <Notice tone="info">You applied proposing {money(application.proposedFee, application.currency)}. Status: {application.status}.{['submitted', 'shortlisted'].includes(application.status) && <> <button className="font-semibold underline" onClick={() => act.run('w', () => api.deals.withdrawApplication(ctx, application.id), { title: 'Application withdrawn' })}>Withdraw</button></>}</Notice>}
        {offers.length > 0 && (
          <Section title="Offers">
            <div className="space-y-3">
              {[...offers].reverse().map((o) => (
                <OfferCard key={o.id} offer={o} fromLabel={o.from === 'org' ? c.brandName : 'You'} actions={o.id === open?.id ? (
                  <>
                    <Button size="sm" variant="primary" icon={Check} loading={act.busy === 'accept'} onClick={() => respond('accept')}>Accept {money(o.terms.fee, o.terms.currency)}</Button>
                    <Button size="sm" icon={Repeat2} onClick={() => { setCounter({ ...o.terms }); setModal('counter'); }}>Counteroffer</Button>
                    <Button size="sm" icon={HelpCircle} onClick={() => setModal('clarify')}>Ask a question</Button>
                    <Button size="sm" variant="danger" icon={X} onClick={() => setModal('reject')}>Decline</Button>
                  </>
                ) : o.status === 'open' && o.from === 'creator' ? <p className="text-[12.5px] text-ink-500">Waiting for {c.brandName} to respond.</p> : undefined} />
              ))}
            </div>
            <p className="mt-3 text-[11.5px] text-ink-500">Accepting records these commercial terms as the basis of the collaboration. It is not a signed legal contract.</p>
          </Section>
        )}
        {invitation?.status === 'pending' && !open && <Button variant="danger" onClick={() => act.run('dec', () => api.deals.declineInvitation(ctx, invitation.id), { title: 'Invitation declined' })}>Decline invitation</Button>}
        <Section title="Conversation"><Thread messages={messages} me="creator" canSend={!!(offers.length || application || invitation)} onSend={(b) => act.run('m', () => api.deals.sendMessage(ctx, 'creator', c.id, creatorId, b))} /></Section>
      </div>
      <Modal open={modal === 'counter'} onClose={close} size="lg" title="Send a counteroffer" description="Change the fee or terms. The brand can accept, decline or reply." footer={<><Button onClick={close}>Cancel</Button><Button variant="dark" loading={act.busy === 'counter'} onClick={() => respond('counter')}>Send counteroffer</Button></>}>
        {counter && <div className="space-y-4"><TermsEditor value={counter} onChange={setCounter} errors={act.fields} lockDeliverables={false} /><Field label="Message"><Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Explain your counteroffer" className="min-h-[70px]" /></Field></div>}
      </Modal>
      <Modal open={modal === 'clarify'} onClose={close} size="sm" title="Ask a question" footer={<><Button onClick={close}>Cancel</Button><Button variant="dark" loading={act.busy === 'clarify'} onClick={() => respond('clarify')}>Send question</Button></>}>
        <Field label="Your question" error={act.fields.message}><Textarea value={msg} onChange={(e) => setMsg(e.target.value)} error={act.fields.message} /></Field>
      </Modal>
      <Modal open={modal === 'reject'} onClose={close} size="sm" title="Decline this offer?" footer={<><Button onClick={close}>Cancel</Button><Button variant="danger" loading={act.busy === 'reject'} onClick={() => respond('reject')}>Decline</Button></>}>
        <Field label="Reason (optional, shared with the brand)"><Textarea value={msg} onChange={(e) => setMsg(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
