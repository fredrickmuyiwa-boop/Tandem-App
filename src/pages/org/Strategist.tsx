import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Trash2, ShieldCheck } from 'lucide-react';
import { api } from '../../server/api';
import { useOrg } from '../../app/session';
import { useQuery } from '../../app/hooks';
import { askStrategist, AI_PROVIDER, AI_PROVIDER_LABEL } from '../../ai/provider';
import { STRATEGIST_PROMPTS } from '../../ai/strategist';
import { cx } from '../../lib/utils';
import Button from '../../components/ui/Button';
import { Select } from '../../components/ui/Field';
import Markdown from '../../components/ui/Markdown';
import { PageHeader } from '../../components/ui/misc';
import { useToast } from '../../components/ui/Toast';

interface Msg { role: 'user' | 'assistant'; text: string; basedOn?: string[]; provider?: string; notice?: string }

export default function Strategist() {
  const { ctx, orgId, org } = useOrg();
  const toast = useToast();
  const campaigns = useQuery(() => api.campaigns.listCampaigns(ctx, orgId), [ctx, orgId]);
  const [cid, setCid] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!cid && campaigns.data?.[0]) setCid(campaigns.data.find((c) => c.campaign.status !== 'draft')?.campaign.id ?? campaigns.data[0].campaign.id); }, [campaigns.data, cid]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs.length, busy]);
  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    setInput('');
    setMsgs((m) => [...m, { role: 'user', text }]);
    setBusy(true);
    try {
      const context = await api.ai.strategistContext(ctx, orgId, cid || undefined);
      const r = await askStrategist(text, context);
      setMsgs((m) => [...m, { role: 'assistant', text: r.text, basedOn: r.basedOn, provider: r.provider, notice: r.notice }]);
    } catch (e) { toast.error('The strategist couldn’t answer', (e as Error).message); }
    finally { setBusy(false); }
  };
  const campaign = campaigns.data?.find((c) => c.campaign.id === cid)?.campaign;
  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[560px] flex-col">
      <PageHeader title="AI campaign strategist" description="Plans, briefs, risk checks and summaries built from this workspace’s own data. Suggestions are labelled as suggestions." actions={<Select aria-label="Campaign" className="w-64" options={(campaigns.data ?? []).map((c) => c.campaign.id)} labels={Object.fromEntries((campaigns.data ?? []).map((c) => [c.campaign.id, c.campaign.name]))} placeholder="No campaign (workspace only)" value={cid} onChange={(e) => setCid(e.target.value)} />} />
      <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-150 px-4 py-2.5 text-[12px] text-ink-500">
          <span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-sage-600" />Sees only {org.name}{campaign ? ` · “${campaign.name}”` : ''} · {AI_PROVIDER_LABEL}</span>
          {msgs.length > 0 && <button onClick={() => setMsgs([])} className="inline-flex items-center gap-1 hover:text-ink-900"><Trash2 className="size-3.5" />Clear</button>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 scroll-thin">
          {!msgs.length ? (
            <div className="mx-auto max-w-2xl py-6 text-center">
              <Sparkles className="mx-auto size-6 text-accent-600" />
              <p className="mt-3 text-[16px] font-semibold">What do you need help with?</p>
              <p className="mt-1 text-[13px] text-ink-500">{AI_PROVIDER === 'meta' ? 'Answers come from Meta’s model using a snapshot of this workspace.' : 'Answers are generated locally from your workspace data.'} I can’t send messages, change records or approve payments — only suggest.</p>
              <div className="mt-6 grid gap-2 text-left sm:grid-cols-2">{STRATEGIST_PROMPTS.map((p) => <button key={p} onClick={() => ask(p)} className="rounded-[11px] border border-ink-200 bg-surface px-3.5 py-2.5 text-[13px] font-medium text-ink-800 hover:border-ink-400">{p}</button>)}</div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-5">
              {msgs.map((m, i) => m.role === 'user' ? (
                <div key={i} className="flex justify-end"><div className="max-w-[85%] rounded-[14px] rounded-br-[5px] bg-ink-900 px-3.5 py-2.5 text-[13.5px] text-white">{m.text}</div></div>
              ) : (
                <div key={i} className="flex gap-3">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[8px] bg-accent-50 text-accent-700"><Sparkles className="size-3.5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="rounded-[14px] rounded-tl-[5px] border border-ink-200 bg-surface px-4 py-3"><Markdown text={m.text} /></div>
                    <p className="mt-1.5 text-[11.5px] text-ink-400">{m.provider === 'meta' ? 'Meta model' : 'Local logic'}{m.basedOn?.length ? ` · based on ${m.basedOn.join(', ')}` : ''}</p>
                    {m.notice && <p className="mt-1 text-[11.5px] text-warn-600">{m.notice}</p>}
                  </div>
                </div>
              ))}
              {busy && <div className="flex gap-3" aria-live="polite"><span className="grid size-7 place-items-center rounded-[8px] bg-accent-50 text-accent-700"><Sparkles className="size-3.5" /></span><div className="flex items-center gap-1 rounded-[14px] border border-ink-200 bg-surface px-4 py-3">{[0, 1, 2].map((d) => <span key={d} className="size-1.5 animate-bounce rounded-full bg-ink-400" style={{ animationDelay: `${d * 0.12}s` }} />)}</div></div>}
              <div ref={end} />
            </div>
          )}
        </div>
        <div className="border-t border-ink-150 p-3">
          {msgs.length > 0 && <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 scroll-thin">{STRATEGIST_PROMPTS.slice(0, 7).map((p) => <button key={p} disabled={busy} onClick={() => ask(p)} className="shrink-0 rounded-full border border-ink-200 px-2.5 py-1 text-[12px] text-ink-600 hover:border-ink-400 disabled:opacity-50">{p}</button>)}</div>}
          <form onSubmit={(e) => { e.preventDefault(); void ask(input); }} className="flex items-end gap-2">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1} maxLength={2000} placeholder="Ask about this campaign…" className={cx('input min-h-[40px] flex-1 resize-none py-2')} aria-label="Ask the strategist" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(input); } }} />
            <Button type="submit" variant="dark" icon={Send} loading={busy} disabled={!input.trim()} aria-label="Send">Ask</Button>
          </form>
        </div>
      </div>
    </div>
  );
}
