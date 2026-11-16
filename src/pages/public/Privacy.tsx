import { IS_DEMO } from '../../server/api';

export default function Privacy() {
  const items: [string, string][] = [
    ['What we collect', 'Account details (name, email), organisation details, creator profile information that creators choose to add, campaign records, messages and files exchanged in collaborations, and security logs. We do not scrape social platforms.'],
    ['Creator control', 'Creators decide whether their rates, audience statistics, location and collaboration history are visible to brands, and whether they appear in discovery at all. These choices are enforced on the server, not just hidden in the interface.'],
    ['Organisation privacy', 'Shortlists, CRM notes, budgets and internal comments belong to the organisation that created them and are never visible to other organisations.'],
    ['Your rights', 'You can export your data and delete your account from Settings. Some records (for example agreed collaboration terms and payment records) may be retained where needed for the other party’s legitimate business or legal obligations.'],
    ['International data', 'Tandem is designed with GDPR and the Nigeria Data Protection Act in mind. It has not been through legal review and makes no compliance claims.'],
    IS_DEMO
      ? ['Demo mode', 'In this demo, all data is stored only in your browser. No emails are sent, no payments are made, and no third-party integrations are connected.']
      : ['Where data is stored', 'Account and workspace data is stored in Tandem’s Supabase (Postgres) database, protected by row-level security. Payments are recorded for tracking only; Tandem never holds or moves money.'],
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <p className="eyebrow mb-2">Privacy & data</p>
      <h1 className="font-display text-[42px] leading-tight">How Tandem handles data</h1>
      <p className="mt-3 text-[14.5px] text-ink-600">A plain-language summary. A full privacy notice is required before launch.</p>
      <dl className="mt-8 divide-y divide-ink-200 border-y border-ink-200">
        {items.map(([t, d]) => <div key={t} className="grid gap-2 py-5 sm:grid-cols-[200px_1fr]"><dt className="text-[14px] font-semibold">{t}</dt><dd className="text-[14px] leading-relaxed text-ink-600">{d}</dd></div>)}
      </dl>
    </div>
  );
}
