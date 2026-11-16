import { useState } from 'react';
import { Check, X, Repeat2, Star, Send, ExternalLink } from 'lucide-react';
import { api } from '../../server/api';
import { useOrg } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { roleCan } from '../../server/access';
import type { Terms } from '../../domain/types';
import { money, timeAgo } from '../../lib/utils';
import Button from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Field, Textarea } from '../ui/Field';
import { Avatar, Notice } from '../ui/misc';
import { Pill } from '../ui/Badge';
import OfferCard from './OfferCard';
import TermsEditor, { defaultTerms } from './TermsEditor';
import Thread from './Thread';

export default function OrgDealPanel({ campaignId, creatorId }: { campaignId: string; creatorId: string }) {
  const { ctx, orgId, role, org } = useOrg();
  const { navigate } = useRouter();
  const act = useAction();
  const q = useQuery(() => api.deals.orgThread(ctx, orgId, campaignId, creatorId), [ctx, orgId, campaignId, creatorId]);
  const [offerOpen, setOfferOpen] = useState(false);
  const [terms, setTerms] = useState<Terms | null>(null);
  const [message, setMessage] = useState('');
  const [declineOffer, setDeclineOffer] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const can = roleCan(role, 'outreach.send');
  if (!q.data) return <div className="skeleton h-80" />;
  const { campaign, creator, offers, messages, application, invitation, collaboration } = q.data;
  const latest = offers[offers.length - 1];
  const openOffer = latest?.status === 'open' ? latest : null;
  const startOffer = (base?: Terms) => {
    setTerms(base ? { ...base } : defaultTerms(campaign, application?.proposedFee ?? 0));
    setMessage('');
    setOfferOpen(true);
  };
  const sendOffer = async () => {
    if (!terms) return;
    const r = await act.run('offer', () => api.deals.makeOffer(ctx, orgId, campaignId, creatorId, { terms, message }), { title: 'Offer sent', body: `${creator.displayName} will see it in Tandem.` });
    if (r) setOfferOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Avatar name={creator.displayName} hue={creator.avatarHue} url={creator.avatarUrl} />
        <div className="min-w-0 flex-1"><p className="truncate text-[15px] font-semibold">{creator.displayName}</p><p className="text-[12.5px] text-ink-500">@{creator.handle} · {creator.country}</p></div>
        <Button size="sm" icon={ExternalLink} onClick={() => navigate(`/app/creators/${creator.id}?campaign=${campaignId}`)}>Profile</Button>
      </div>
      {collaboration && <Notice tone="ok">Terms agreed {timeAgo(collaboration.createdAt)}. <button className="font-semibold underline" onClick={() => navigate(`/app/collaborations/${collaboration.id}`)}>Open collaboration workspace</button></Notice>}
      {application && (
        <div className="rounded-[12px] border border-ink-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[13px] font-semibold">Application <span className="font-normal text-ink-500">· {timeAgo(application.createdAt)}</span></p><Pill tone={application.status === 'rejected' ? 'danger' : application.status === 'shortlisted' ? 'accent' : 'neutral'}>{application.status}</Pill></div>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-700">{application.pitch}</p>
          <p className="num mt-2 text-[13px]">Proposed fee: <span className="font-semibold">{money(application.proposedFee, application.currency)}</span></p>
          {can && ['submitted', 'shortlisted'].includes(application.status) && !collaboration && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-150 pt-3">
              {application.status === 'submitted' && <Button size="sm" icon={Star} loading={act.busy === 'sl'} onClick={() => act.run('sl', () => api.deals.reviewApplication(ctx, orgId, application.id, 'shortlisted'), { title: 'Shortlisted' })}>Shortlist</Button>}
              <Button size="sm" variant="dark" icon={Send} onClick={() => startOffer()}>Send offer</Button>
              <Button size="sm" variant="danger" icon={X} loading={act.busy === 'rj'} onClick={() => act.run('rj', () => api.deals.reviewApplication(ctx, orgId, application.id, 'rejected'), { title: 'Application declined', body: 'The creator has been told politely.' })}>Decline</Button>
            </div>
          )}
        </div>
      )}
      {invitation && invitation.status === 'declined' && <Notice tone="neutral">The creator declined this invitation.</Notice>}
      {offers.length > 0 && (
        <div className="space-y-3">
          <p className="eyebrow">Offers</p>
          {[...offers].reverse().map((o) => (
            <OfferCard key={o.id} offer={o} fromLabel={o.from === 'org' ? org.name : creator.displayName} actions={can && o.id === openOffer?.id && o.from === 'creator' ? (
              <>
                <Button size="sm" variant="primary" icon={Check} loading={act.busy === 'acc'} onClick={async () => { const r = await act.run('acc', () => api.deals.orgRespond(ctx, orgId, o.id, 'accept'), { title: 'Counteroffer accepted', body: 'A collaboration workspace has been created.' }); if (r && typeof r === 'object' && 'collaborationId' in r && r.collaborationId) navigate(`/app/collaborations/${r.collaborationId}`); }}>Accept {money(o.terms.fee, o.terms.currency)}</Button>
                <Button size="sm" icon={Repeat2} onClick={() => startOffer(o.terms)}>Counter</Button>
                <Button size="sm" variant="danger" icon={X} onClick={() => setDeclineOffer(o.id)}>Decline</Button>
              </>
            ) : o.id === openOffer?.id && o.from === 'org' ? <p className="text-[12.5px] text-ink-500">Waiting for {creator.displayName} to respond.</p> : undefined} />
          ))}
        </div>
      )}
      {can && !collaboration && !openOffer && !application && invitation?.status !== 'declined' && offers.length > 0 && <Button icon={Send} onClick={() => startOffer(latest?.terms)}>Send a new offer</Button>}
      <div>
        <p className="eyebrow mb-2">Conversation</p>
        <div className="rounded-[12px] border border-ink-200 bg-ink-50/40 p-3"><Thread messages={messages} me="org" canSend={can} onSend={(b) => act.run('msg', () => api.deals.sendMessage(ctx, { orgId }, campaignId, creatorId, b))} /></div>
        {!can && <p className="mt-2 text-[12px] text-ink-500">Your role can read this conversation but not reply.</p>}
      </div>
      <Modal open={offerOpen} onClose={() => setOfferOpen(false)} size="lg" title={`Offer to ${creator.displayName}`} description="Sending a new offer replaces any open one." footer={<><Button onClick={() => setOfferOpen(false)}>Cancel</Button><Button variant="dark" loading={act.busy === 'offer'} onClick={sendOffer}>Send offer</Button></>}>
        {terms && <div className="space-y-4"><TermsEditor value={terms} onChange={setTerms} errors={act.fields} /><Field label="Message (optional)"><Textarea value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-[70px]" /></Field></div>}
      </Modal>
      <Modal open={!!declineOffer} onClose={() => setDeclineOffer(null)} size="sm" title="Decline counteroffer" footer={<><Button onClick={() => setDeclineOffer(null)}>Cancel</Button><Button variant="danger" loading={act.busy === 'dec'} onClick={async () => { const r = await act.run('dec', () => api.deals.orgRespond(ctx, orgId, declineOffer!, 'reject', reason), { title: 'Counteroffer declined' }); if (r) { setDeclineOffer(null); setReason(''); } }}>Decline</Button></>}>
        <Field label="Reason (shared with the creator)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" /></Field>
      </Modal>
    </div>
  );
}
