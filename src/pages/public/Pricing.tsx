import { Check } from 'lucide-react';
import { api } from '../../server/api';
import { useRouter } from '../../lib/router';
import { money, cx } from '../../lib/utils';
import Button from '../../components/ui/Button';
import { Notice } from '../../components/ui/misc';

export default function Pricing() {
  const { navigate } = useRouter();
  const plans = api.orgs.publicPlans();
  const groups: { title: string; audience: 'brand' | 'agency' | 'creator' }[] = [{ title: 'Brands', audience: 'brand' }, { title: 'Agencies', audience: 'agency' }, { title: 'Creators', audience: 'creator' }];
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <p className="eyebrow mb-2">Pricing</p>
      <h1 className="font-display text-[44px] leading-tight">Simple plans. Free for creators.</h1>
      <p className="mt-3 max-w-xl text-[14.5px] text-ink-600">Pricing is configured by platform administrators. A platform fee applies to agreed collaboration fees and is shown in every budget.</p>
      <Notice className="mt-6 max-w-xl" tone="info">Demo build: changing plan updates your workspace immediately and no payment is taken. Billing connects to a payment provider in production.</Notice>
      {groups.map((g) => (
        <section key={g.audience} className="mt-10">
          <h2 className="mb-3 text-[15px] font-semibold text-ink-700">{g.title}</h2>
          <div className={cx('grid gap-4', g.audience === 'brand' ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
            {plans.filter((p) => p.audience === g.audience).map((p) => (
              <div key={p.id} className={cx('panel flex flex-col p-6', p.id === 'brand_growth' && 'border-ink-900 ring-1 ring-ink-900')}>
                <div className="flex items-center justify-between"><h3 className="text-[17px] font-semibold">{p.name}</h3>{p.id === 'brand_growth' && <span className="rounded-full bg-ink-900 px-2 py-0.5 text-[11px] font-medium text-white">Most teams</span>}</div>
                <p className="mt-1 text-[13px] text-ink-500">{p.description}</p>
                <p className="num mt-4 text-[30px] font-semibold tracking-tight">{p.priceMonthly == null ? 'Custom' : p.priceMonthly === 0 ? 'Free' : money(p.priceMonthly, p.currency)}{p.priceMonthly ? <span className="text-[13px] font-normal text-ink-500"> / month</span> : null}</p>
                <ul className="mt-4 flex-1 space-y-2">{p.features.map((f) => <li key={f} className="flex gap-2 text-[13px] text-ink-700"><Check className="mt-0.5 size-4 shrink-0 text-ok-600" />{f}</li>)}</ul>
                <Button className="mt-6" variant={p.id === 'brand_growth' ? 'dark' : 'secondary'} onClick={() => navigate(p.priceMonthly == null ? '/signup?kind=brand' : `/signup?kind=${g.audience}`)}>{p.priceMonthly == null ? 'Talk to us' : p.priceMonthly === 0 ? 'Create your profile' : 'Start with this plan'}</Button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
