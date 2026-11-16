import { useState } from 'react';
import { Contact, Search, Bell } from 'lucide-react';
import { api } from '../../server/api';
import { useOrg } from '../../app/session';
import { useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { RELATIONSHIP } from '../../domain/constants';
import type { RelationshipStatus } from '../../domain/types';
import { cx, formatDate, timeAgo } from '../../lib/utils';
import { Pill } from '../../components/ui/Badge';
import { Avatar, EmptyState, PageHeader, PageSkeleton, Section } from '../../components/ui/misc';

export default function Crm() {
  const { ctx, orgId } = useOrg();
  const { navigate } = useRouter();
  const q = useQuery(() => api.crm.listCrm(ctx, orgId), [ctx, orgId]);
  const reminders = useQuery(() => api.crm.myOrgReminders(ctx, orgId), [ctx, orgId]);
  const [status, setStatus] = useState<RelationshipStatus | 'all'>('all');
  const [term, setTerm] = useState('');
  if (!q.data || !reminders.data) return <PageSkeleton />;
  const tags = [...new Set(q.data.flatMap((r) => r.record.tags))];
  const tag = term.startsWith('#') ? term.slice(1) : '';
  const rows = q.data.filter((r) => (status === 'all' || r.record.status === status) && (!term || (tag ? r.record.tags.includes(tag) : `${r.creator?.displayName} ${r.creator?.handle}`.toLowerCase().includes(term.toLowerCase()))));
  return (
    <div className="space-y-5">
      <PageHeader title="Creator CRM" description="Your workspace’s private record of every creator relationship: status, tags, notes and follow-ups." />
      {reminders.data.length > 0 && (
        <Section title="Follow-ups" action={<Bell className="size-4 text-ink-400" />}>
          <ul className="grid gap-2 md:grid-cols-2">{reminders.data.slice(0, 6).map((r) => { const overdue = r.due < new Date().toISOString().slice(0, 10); return <li key={r.id}><button onClick={() => navigate(`/app/creators/${r.creatorId}`)} className="flex w-full items-center gap-3 rounded-[10px] border border-ink-200 px-3 py-2 text-left hover:border-ink-300"><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{r.text}</span><span className="block text-[12px] text-ink-500">{r.creatorName}</span></span><span className={cx('text-[12px]', overdue ? 'font-semibold text-bad-600' : 'text-ink-500')}>{formatDate(r.due, { year: undefined })}</span></button></li>; })}</ul>
        </Section>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex gap-1 overflow-x-auto scroll-thin">{(['all', ...Object.keys(RELATIONSHIP)] as (RelationshipStatus | 'all')[]).map((s) => <button key={s} onClick={() => setStatus(s)} className={cx('h-8 shrink-0 rounded-full px-3 text-[12.5px] font-medium', status === s ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100')}>{s === 'all' ? 'All' : RELATIONSHIP[s].label}</button>)}</div>
        <div className="relative sm:ml-auto sm:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" /><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search, or #tag" className="input pl-9" aria-label="Search CRM" list="crm-tags" /><datalist id="crm-tags">{tags.map((t) => <option key={t} value={`#${t}`} />)}</datalist></div>
      </div>
      <div className="panel divide-y divide-ink-150">
        {rows.length ? rows.map(({ record: r, creator: c, collaborations, completed, dueReminders }) => c && (
          <button key={r.id} onClick={() => navigate(`/app/creators/${c.id}`)} className="flex w-full flex-wrap items-center gap-3 px-5 py-3.5 text-left hover:bg-ink-50">
            <Avatar name={c.displayName} hue={c.avatarHue} url={c.avatarUrl} size="sm" />
            <span className="min-w-[160px] flex-1"><span className="block text-[13.5px] font-semibold">{c.displayName}</span><span className="block truncate text-[12px] text-ink-500">{r.notes[0]?.text ?? 'No notes yet'}</span></span>
            <span className="flex flex-wrap gap-1">{r.tags.slice(0, 3).map((t) => <span key={t} className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-600">#{t}</span>)}</span>
            <span className="w-32 text-[12px] text-ink-500">{collaborations} collab{collaborations === 1 ? '' : 's'}{completed ? ` · ${completed} done` : ''}</span>
            {dueReminders > 0 && <Pill tone="danger">{dueReminders} due</Pill>}
            <Pill tone={RELATIONSHIP[r.status].tone}>{RELATIONSHIP[r.status].label}</Pill>
            <span className="w-20 text-right text-[11.5px] text-ink-400">{timeAgo(r.updatedAt)}</span>
          </button>
        )) : <EmptyState icon={Contact} title={q.data.length ? 'No matches' : 'No relationships yet'} message="Creators are added when you invite them, they apply, or you add a note on their profile." />}
      </div>
    </div>
  );
}
