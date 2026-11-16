import { useState } from 'react';
import { KeyRound, LogOut, Download, Trash2, RotateCcw, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import { api, resetDemo, IS_DEMO } from '../../server/api';
import { useSession } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { NOTIFICATION_TYPES } from '../../domain/constants';
import type { NotificationPrefs } from '../../domain/types';
import { formatDateTime } from '../../lib/utils';
import { copyText, downloadText } from '../../lib/csv';
import Button from '../ui/Button';
import { Field, Input, Select, Toggle } from '../ui/Field';
import { Confirm } from '../ui/Modal';
import { Notice, Section } from '../ui/misc';
import { useToast } from '../ui/Toast';

export function NotificationPrefsPanel() {
  const { ctx } = useSession();
  const act = useAction();
  const q = useQuery(() => api.notifications.getPrefs(ctx), [ctx]);
  const [p, setP] = useState<NotificationPrefs | null>(null);
  const prefs = p ?? q.data ?? null;
  if (!prefs) return <div className="skeleton h-60" />;
  const set = (kind: 'inApp' | 'email', id: string, v: boolean) => setP({ ...prefs, [kind]: { ...prefs[kind], [id]: v } });
  return (
    <Section title="Notifications" description="Choose what reaches you. Duplicate alerts within 10 minutes are combined.">
      <Notice tone="info" className="mb-4">Email delivery needs a transactional email provider, which isn’t connected in the demo. Email choices are saved and shown as “queued”.</Notice>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-[13px]">
          <thead><tr className="text-left text-[11.5px] text-ink-500"><th className="pb-2 font-medium">Event</th><th className="w-20 pb-2 text-center font-medium">In-app</th><th className="w-20 pb-2 text-center font-medium">Email</th></tr></thead>
          <tbody className="divide-y divide-ink-150">{NOTIFICATION_TYPES.map((t) => <tr key={t.id}><td className="py-2.5">{t.label}</td><td className="text-center"><Toggle label={`${t.label} in-app`} checked={prefs.inApp[t.id]} disabled={t.id === 'system'} onChange={(v) => set('inApp', t.id, v)} /></td><td className="text-center"><Toggle label={`${t.label} email`} checked={prefs.email[t.id]} onChange={(v) => set('email', t.id, v)} /></td></tr>)}</tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <Field label="Email frequency"><Select options={['instant', 'daily', 'off'] as const} labels={{ instant: 'As it happens', daily: 'Daily digest', off: 'Never' }} value={prefs.digest} onChange={(e) => setP({ ...prefs, digest: e.target.value as NotificationPrefs['digest'] })} className="w-48" /></Field>
        <Button variant="dark" disabled={!p} loading={act.busy === 'p'} onClick={async () => { const r = await act.run('p', () => api.notifications.savePrefs(ctx, prefs), { title: 'Preferences saved' }); if (r) setP(null); }}>Save preferences</Button>
      </div>
    </Section>
  );
}

export function SecurityPanel() {
  const { ctx, me } = useSession();
  const act = useAction();
  const sessions = useQuery(() => api.auth.listSessions(ctx), [ctx]);
  const [pw, setPw] = useState({ current: '', next: '' });
  return (
    <div className="space-y-5">
      <Section title="Password" action={<KeyRound className="size-4 text-ink-400" />}>
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={async (e) => { e.preventDefault(); const r = await act.run('pw', () => api.auth.changePassword(ctx, pw.current, pw.next), { title: 'Password changed', body: 'Other sessions were signed out.' }); if (r) setPw({ current: '', next: '' }); }}>
          <Field label="Current password" error={act.fields.current}><Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} error={act.fields.current} /></Field>
          <Field label="New password" error={act.fields.next} hint="10+ characters, letters and numbers"><Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} error={act.fields.next} /></Field>
          <Button type="submit" loading={act.busy === 'pw'} disabled={!pw.current || !pw.next}>Change</Button>
        </form>
      </Section>
      <Section title="Two-step verification" action={<ShieldCheck className="size-4 text-ink-400" />}>
        <p className="text-[13px] text-ink-600">{me?.user.mfaEnabled ? 'On.' : 'Off.'} {IS_DEMO ? 'Multi-factor authentication is provided by Supabase Auth in production and isn’t available in Demo mode.' : 'Multi-factor authentication isn’t switched on for this workspace yet.'}</p>
      </Section>
      <Section title="Active sessions" action={<MonitorSmartphone className="size-4 text-ink-400" />} description={IS_DEMO ? 'Sessions expire after 12 hours.' : 'Other devices can’t be listed here, but you can sign them all out.'}>
        <ul className="divide-y divide-ink-150">{(sessions.data ?? []).map((s, i) => <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13px]"><span><span className="font-medium">{s.userAgent.slice(0, 60)}</span>{s.current && <span className="ml-2 rounded-md bg-ok-50 px-1.5 py-0.5 text-[11px] font-medium text-ok-600">This device</span>}</span><span className="text-[12px] text-ink-500">Started {formatDateTime(s.createdAt)} · expires {formatDateTime(s.expiresAt)}</span></li>)}</ul>
        <Button className="mt-3" icon={LogOut} loading={act.busy === 'so'} disabled={IS_DEMO && (sessions.data?.length ?? 0) < 2} onClick={() => act.run('so', () => api.auth.signOutOtherSessions(ctx), { title: 'Other sessions signed out' })}>Sign out other sessions</Button>
      </Section>
    </div>
  );
}

export function DataPanel() {
  const { ctx, me, setToken } = useSession();
  const toast = useToast();
  const act = useAction();
  const [del, setDel] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [reset, setReset] = useState(false);
  return (
    <div className="space-y-5">
      <Section title="Your data" description="Download everything Tandem holds about your account.">
        <Button icon={Download} onClick={async () => { const data = await api.auth.exportMyData(ctx); const json = JSON.stringify(data, null, 2); if (downloadText('tandem-my-data.json', json, 'application/json')) toast.success('Export started'); else if (await copyText(json)) toast.success('Copied to clipboard', 'Your browser blocked the download.'); }}>Export my data (JSON)</Button>
      </Section>
      {IS_DEMO && <Section title="Demo data" description="Restore the original sample workspace in this browser.">
        <Button icon={RotateCcw} onClick={() => setReset(true)}>Reset demo data</Button>
      </Section>}
      <Section title="Delete account" description="Removes your account and profile. Agreed collaborations and payment records stay with the other party where they need them.">
        <Button variant="danger" icon={Trash2} onClick={() => setDel(true)}>Delete my account</Button>
      </Section>
      <Confirm open={del} onClose={() => setDel(false)} title="Delete your account?" confirmLabel="Delete permanently" busy={act.busy === 'del'} message={<div className="space-y-3"><p>This can’t be undone. Type <strong>{me?.user.email}</strong> to confirm.</p><Input value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} aria-label="Confirm email" error={act.fields.confirm} /></div>}
        onConfirm={async () => { const r = await act.run('del', () => api.auth.deleteAccount(ctx, confirmEmail)); if (r) { setToken(null); window.location.hash = '#/'; } }} />
      <Confirm open={reset} onClose={() => setReset(false)} title="Reset all demo data?" confirmLabel="Reset" message="Everything you’ve changed in this browser is replaced with the original sample data, and you’ll be signed out." onConfirm={async () => { await resetDemo(); setToken(null); window.location.hash = '#/signin'; }} />
    </div>
  );
}
