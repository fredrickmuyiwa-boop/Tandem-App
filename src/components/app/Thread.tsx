import { useState } from 'react';
import { Send } from 'lucide-react';
import type { Message } from '../../domain/types';
import { cx, formatDateTime } from '../../lib/utils';
import Button from '../ui/Button';

export default function Thread({ messages, me, onSend, canSend, placeholder = 'Write a message…' }: { messages: Message[]; me: 'org' | 'creator'; onSend?: (body: string) => Promise<unknown>; canSend?: boolean; placeholder?: string }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <ol className="space-y-3">
        {messages.map((m) =>
          m.from === 'system' ? (
            <li key={m.id} className="mx-auto max-w-md rounded-[10px] bg-ink-50 px-3 py-2 text-center text-[12px] text-ink-500">{m.body}<span className="mt-0.5 block text-[10.5px] text-ink-400">{formatDateTime(m.createdAt)}</span></li>
          ) : (
            <li key={m.id} className={cx('flex', m.from === me ? 'justify-end' : 'justify-start')}>
              <div className={cx('max-w-[85%] rounded-[14px] px-3.5 py-2.5', m.from === me ? 'rounded-br-[5px] bg-ink-900 text-white' : 'rounded-bl-[5px] border border-ink-200 bg-surface text-ink-800')}>
                <p className={cx('text-[11px] font-medium', m.from === me ? 'text-white/60' : 'text-ink-500')}>{m.senderName}{m.kind === 'clarification' && ' · question'}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed">{m.body}</p>
                <p className={cx('mt-1 text-[10.5px]', m.from === me ? 'text-white/50' : 'text-ink-400')}>{formatDateTime(m.createdAt)}</p>
              </div>
            </li>
          ),
        )}
        {!messages.length && <li className="py-6 text-center text-[13px] text-ink-500">No messages yet.</li>}
      </ol>
      {onSend && canSend && (
        <form className="mt-4 flex items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (!text.trim()) return; setBusy(true); const r = await onSend(text).catch(() => undefined); setBusy(false); if (r !== undefined) setText(''); }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={3000} placeholder={placeholder} className="input min-h-[44px] flex-1 resize-none" aria-label="Message" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.currentTarget.form as HTMLFormElement).requestSubmit(); }} />
          <Button type="submit" variant="dark" icon={Send} loading={busy} aria-label="Send message">Send</Button>
        </form>
      )}
    </div>
  );
}
