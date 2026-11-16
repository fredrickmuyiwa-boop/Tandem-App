import { CheckCircle2, CircleDashed, PlugZap } from 'lucide-react';
import { AI_PROVIDER_LABEL } from '../../ai/provider';

const REAL = [
  'Accounts, sessions, email-verification flow, password reset and login lockout (simulated email delivery).',
  'Workspaces, roles, agency client workspaces and permission checks on every action.',
  'Creator profiles with server-enforced privacy settings.',
  'Discovery, collections, CRM, campaigns and their lifecycle rules.',
  'Invitations, applications, offers, counteroffers, messages and collaboration workspaces.',
  'Content submission, version history, revision limits and two-stage approval.',
  'Budget tracking, fees, payment status records and scenario comparison.',
  'Results entry and CSV import, with calculated metrics and source labels.',
  'Explainable AI matching, brief interpretation and the campaign strategist (local logic by default).',
];
const SIM = [
  'Data storage — your browser’s local storage, not a server. Use Settings → Reset demo data to start over.',
  'Emails — queued and shown in-app only. No email provider is connected.',
  'Payments — recorded, never executed. Tandem is not a wallet or escrow service.',
  'Social platform statistics — sample creators’ figures are fictional. “Verified” labels in the demo are illustrative.',
  'File storage — small images are kept in the browser; videos and PDFs keep only their details.',
];
const CONNECT = [
  ['Meta Model API', 'Set META_MODEL_API_KEY on the server and VITE_AI_PROVIDER=meta to use Meta’s Muse Spark model for brief interpretation and the strategist.'],
  ['Supabase', 'Run supabase/migrations/0001_init.sql, then set the Supabase URL and anon key. Row Level Security enforces the same rules as the demo backend.'],
  ['Email & payments', 'Connect a transactional email provider and a licensed payment provider before handling real money or messages.'],
  ['Social platforms', 'Verified statistics require each platform’s official, authorised API access.'],
];

export default function Help() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="eyebrow mb-2">How this demo works</p>
      <h1 className="text-[26px] font-semibold tracking-tight">What’s real, what’s simulated</h1>
      <p className="mt-2 text-[14px] text-ink-600">AI mode: <strong>{AI_PROVIDER_LABEL}</strong>.</p>
      <section className="mt-8"><h2 className="mb-3 text-[15px] font-semibold">Works for real in this build</h2><ul className="space-y-2">{REAL.map((x) => <li key={x} className="flex gap-2.5 text-[13.5px] text-ink-700"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok-600" />{x}</li>)}</ul></section>
      <section className="mt-8"><h2 className="mb-3 text-[15px] font-semibold">Simulated in Demo mode</h2><ul className="space-y-2">{SIM.map((x) => <li key={x} className="flex gap-2.5 text-[13.5px] text-ink-700"><CircleDashed className="mt-0.5 size-4 shrink-0 text-ink-400" />{x}</li>)}</ul></section>
      <section className="mt-8"><h2 className="mb-3 text-[15px] font-semibold">Needs credentials to connect</h2><dl className="divide-y divide-ink-200 rounded-[14px] border border-ink-200 bg-surface">{CONNECT.map(([t, d]) => <div key={t} className="flex gap-3 p-4"><PlugZap className="mt-0.5 size-4 shrink-0 text-accent-600" /><div><dt className="text-[13.5px] font-semibold">{t}</dt><dd className="mt-0.5 text-[13px] text-ink-600">{d}</dd></div></div>)}</dl></section>
    </div>
  );
}
