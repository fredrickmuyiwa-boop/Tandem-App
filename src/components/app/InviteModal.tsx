import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { Campaign, Terms } from '../../domain/types';
import type { CreatorView } from '../../server/services/creators';
import { api } from '../../server/api';
import { useOrg } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { draftInvitation } from '../../ai/outreach';
import { typicalRate } from '../../domain/creatorStats';
import { money } from '../../lib/utils';
import { Modal } from '../ui/Modal';
import Button from '../ui/Button';
import { Field, Select, Textarea } from '../ui/Field';
import { Notice } from '../ui/misc';
import TermsEditor, { defaultTerms } from './TermsEditor';
import { useRouter } from '../../lib/router';

export default function InviteModal({ creator, campaignId, open, onClose }: { creator: CreatorView; campaignId?: string; open: boolean; onClose: () => void }) {
  const { ctx, orgId, org, me } = useOrg();
  const { navigate } = useRouter();
  const act = useAction();
  const campaigns = useQuery(() => api.campaigns.listCampaigns(ctx, orgId), [ctx, orgId]);
  const eligible = useMemo(() => (campaigns.data ?? []).map((x) => x.campaign).filter((c) => ['published', 'recruiting', 'active'].includes(c.status)), [campaigns.data]);
  const [cid, setCid] = useState(campaignId ?? '');
  const campaign: Campaign | undefined = eligible.find((c) => c.id === cid);
  const [terms, setTerms] = useState<Terms | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { if (!cid && eligible[0]) setCid(campaignId ?? eligible[0].id); }, [eligible, cid, campaignId]);
  useEffect(() => {
    if (!campaign) return;
    const fee = (creator.rates ? typicalRate(creator, campaign.currency) : null) ?? campaign.budget / 10;
    setTerms(defaultTerms(campaign, fee));
    setMessage(draftInvitation({ creator, campaign, orgName: org.name, senderName: me?.user.name ?? 'The team', productName: undefined }));
  }, [campaign?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!campaign || !terms) return;
    const r = await act.run('send', () => api.deals.sendInvitation(ctx, orgId, campaign.id, creator.id, { message, terms }), { title: `Invitation sent to ${creator.displayName}`, body: 'They’ll see it in Tandem. No external email was sent.', action: { label: 'Open negotiation', onClick: () => navigate(`/app/campaigns/${campaign.id}?tab=deals&creator=${creator.id}`) } });
    if (r) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={`Invite ${creator.displayName}`} description="Your invitation includes proposed terms. The creator can accept, decline, ask a question or counter."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={act.busy === 'send'} disabled={!campaign} onClick={send}>Send invitation</Button></>}>
      {campaigns.loading && !campaigns.data ? <p className="py-8 text-center text-[13px] text-ink-500">Loading campaigns…</p> : !eligible.length ? (
        <Notice tone="warn">Publish a campaign before inviting creators. Drafts can’t receive invitations.</Notice>
      ) : (
        <div className="space-y-5">
          <Field label="Campaign">
            <Select options={eligible.map((c) => c.id)} labels={Object.fromEntries(eligible.map((c) => [c.id, `${c.name} · ${money(c.budget, c.currency)}`]))} value={cid} onChange={(e) => setCid(e.target.value)} />
          </Field>
          {terms && <TermsEditor value={terms} onChange={setTerms} errors={act.fields} />}
          <Field label={<span className="inline-flex items-center gap-1.5">Personal message <span className="inline-flex items-center gap-1 rounded-md bg-accent-50 px-1.5 py-0.5 text-[10.5px] font-medium text-accent-700"><Sparkles className="size-3" />AI draft — edit before sending</span></span>} error={act.fields.message}>
            <Textarea className="min-h-[200px]" value={message} onChange={(e) => setMessage(e.target.value)} error={act.fields.message} />
          </Field>
          <p className="text-[12px] text-ink-500">Drafted from {creator.displayName}’s shared profile and your campaign brief. Nothing is sent until you click Send.</p>
        </div>
      )}
    </Modal>
  );
}
