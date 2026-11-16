import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Search, SlidersHorizontal, X, ChevronLeft, ChevronRight, Columns3, UserSearch, Send } from 'lucide-react';
import { api } from '../../server/api';
import type { DiscoveryQuery, CreatorView } from '../../server/services/creators';
import { useOrg } from '../../app/session';
import { useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { CATEGORIES, COUNTRIES, CURRENCIES, FORMATS, LANGUAGES, PLATFORMS, SOURCE_META, categoryLabel, platformLabel } from '../../domain/constants';
import type { Category, ContentFormat, Currency, DataSource, Platform } from '../../domain/types';
import { avgEngagement, statsSource, tier, totalFollowers, typicalRate } from '../../domain/creatorStats';
import { compact, cx, money } from '../../lib/utils';
import { roleCan } from '../../server/access';
import Button from '../../components/ui/Button';
import { ChipSelect, Select, Checkbox, Field, Input } from '../../components/ui/Field';
import { Drawer } from '../../components/ui/Modal';
import { EmptyState, PageHeader, Skeleton } from '../../components/ui/misc';
import { SourceTag } from '../../components/ui/Badge';
import CreatorCard from '../../components/app/CreatorCard';
import InviteModal from '../../components/app/InviteModal';

const SIZE_PRESETS = [
  { id: 'any', label: 'Any size', min: undefined, max: undefined },
  { id: 'nano', label: 'Nano · under 10K', min: 1000, max: 9999 },
  { id: 'focus', label: 'Focus · 5K–50K', min: 5000, max: 50000 },
  { id: 'micro', label: 'Micro · 10K–50K', min: 10000, max: 50000 },
  { id: 'mid', label: 'Mid · 50K–250K', min: 50000, max: 250000 },
  { id: 'macro', label: 'Macro · 250K+', min: 250000, max: undefined },
] as const;

const SORTS = { relevance: 'Best fit first', followers_desc: 'Largest audience', followers_asc: 'Smallest audience', engagement_desc: 'Highest engagement', rate_asc: 'Lowest typical rate', newest: 'Newest profiles' } as const;

type F = { categories: Category[]; platforms: Platform[]; countries: string[]; languages: string[]; formats: ContentFormat[]; size: (typeof SIZE_PRESETS)[number]['id']; engagementMin: string; rateMax: string; currency: Currency; available: boolean; identityVerified: boolean; sources: DataSource[]; audienceFemaleMin: string };
const EMPTY: F = { categories: [], platforms: [], countries: [], languages: [], formats: [], size: 'any', engagementMin: '', rateMax: '', currency: 'NGN', available: false, identityVerified: false, sources: [], audienceFemaleMin: '' };

function Filters({ f, set, onReset }: { f: F; set: (p: Partial<F>) => void; onReset: () => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between"><p className="text-[13px] font-semibold">Filters</p><button onClick={onReset} className="text-[12px] font-medium text-accent-600">Reset</button></div>
      <Field label="Category"><ChipSelect size="sm" options={CATEGORIES.map((c) => c.id)} labels={Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]))} value={f.categories} onChange={(v) => set({ categories: v })} /></Field>
      <Field label="Platform"><ChipSelect size="sm" options={PLATFORMS.map((p) => p.id)} labels={Object.fromEntries(PLATFORMS.map((p) => [p.id, p.label]))} value={f.platforms} onChange={(v) => set({ platforms: v })} /></Field>
      <Field label="Audience size"><Select options={SIZE_PRESETS.map((s) => s.id)} labels={Object.fromEntries(SIZE_PRESETS.map((s) => [s.id, s.label]))} value={f.size} onChange={(e) => set({ size: e.target.value as F['size'] })} /></Field>
      <Field label="Location" hint="Creator location, or 25%+ of their audience"><Select options={['', ...COUNTRIES]} labels={{ '': 'Anywhere' }} value={f.countries[0] ?? ''} onChange={(e) => set({ countries: e.target.value ? [e.target.value] : [] })} /></Field>
      <Field label="Language"><Select options={['', ...LANGUAGES]} labels={{ '': 'Any language' }} value={f.languages[0] ?? ''} onChange={(e) => set({ languages: e.target.value ? [e.target.value] : [] })} /></Field>
      <Field label="Content format"><Select options={['', ...FORMATS.map((x) => x.id)]} labels={{ '': 'Any format', ...Object.fromEntries(FORMATS.map((x) => [x.id, x.label])) }} value={f.formats[0] ?? ''} onChange={(e) => set({ formats: e.target.value ? [e.target.value as ContentFormat] : [] })} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Min. engagement %"><Input type="number" min={0} step={0.5} value={f.engagementMin} onChange={(e) => set({ engagementMin: e.target.value })} placeholder="e.g. 3" /></Field>
        <Field label="Women in audience %"><Input type="number" min={0} max={100} value={f.audienceFemaleMin} onChange={(e) => set({ audienceFemaleMin: e.target.value })} placeholder="e.g. 60" /></Field>
      </div>
      <Field label="Typical rate up to" hint="Converted at reference rates when currencies differ">
        <div className="grid grid-cols-[1fr_88px] gap-2">
          <Input type="number" min={0} value={f.rateMax} onChange={(e) => set({ rateMax: e.target.value })} placeholder="Any" />
          <Select options={CURRENCIES} value={f.currency} onChange={(e) => set({ currency: e.target.value as Currency })} aria-label="Currency" />
        </div>
      </Field>
      <Field label="Data source"><ChipSelect size="sm" options={['verified', 'imported', 'creator_submitted'] as DataSource[]} labels={Object.fromEntries(Object.entries(SOURCE_META).map(([k, v]) => [k, v.short]))} value={f.sources} onChange={(v) => set({ sources: v })} /></Field>
      <div className="space-y-2.5">
        <Checkbox label="Available now" checked={f.available} onChange={(v) => set({ available: v })} />
        <Checkbox label="Identity verified" checked={f.identityVerified} onChange={(v) => set({ identityVerified: v })} />
      </div>
    </div>
  );
}

function Compare({ creators, currency, onClose, onRemove }: { creators: CreatorView[]; currency: Currency; onClose: () => void; onRemove: (id: string) => void }) {
  const rows: [string, (c: CreatorView) => ReactNode][] = [
    ['Audience size', (c) => <span className="flex items-center gap-1.5">{compact(totalFollowers(c))}<SourceTag source={statsSource(c)} compact /></span>],
    ['Tier', (c) => tier(totalFollowers(c)).label],
    ['Engagement', (c) => { const er = avgEngagement(c); return er != null ? `${er.toFixed(1)}%` : 'Not provided'; }],
    ['Typical rate', (c) => (c.rates == null ? 'On request' : money(typicalRate(c, currency), currency))],
    ['Top audience market', (c) => (c.audience?.topCountries?.[0] ? `${c.audience.topCountries[0].country} · ${c.audience.topCountries[0].pct}%` : c.audience ? 'Not provided' : 'Private')],
    ['Women in audience', (c) => (c.audience?.female != null ? `${c.audience.female}%` : c.audience ? 'Not provided' : 'Private')],
    ['Categories', (c) => c.categories.map(categoryLabel).join(', ')],
    ['Platforms', (c) => c.socials.map((s) => platformLabel(s.platform)).join(', ')],
    ['Languages', (c) => c.languages.join(', ')],
    ['Availability', (c) => c.availability],
    ['Identity', (c) => (c.identityVerification === 'verified' ? 'Verified' : 'Not verified')],
  ];
  return (
    <Drawer open onClose={onClose} title="Compare creators" subtitle="Side by side, using only what each creator shares." width="max-w-4xl">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-[13px]">
          <thead>
            <tr><th className="w-40" />{creators.map((c) => <th key={c.id} className="pb-3 align-top"><p className="font-semibold">{c.displayName}</p><p className="text-[12px] font-normal text-ink-500">@{c.handle}</p><button onClick={() => onRemove(c.id)} className="mt-1 text-[11.5px] font-normal text-ink-400 hover:text-bad-600">Remove</button></th>)}</tr>
          </thead>
          <tbody className="divide-y divide-ink-150">
            {rows.map(([label, fn]) => <tr key={label}><td className="py-2.5 pr-3 text-ink-500">{label}</td>{creators.map((c) => <td key={c.id} className="py-2.5 pr-3 font-medium text-ink-800">{fn(c)}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </Drawer>
  );
}

export default function Discover() {
  const { ctx, orgId, role } = useOrg();
  const { navigate } = useRouter();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [f, setF] = useState<F>(EMPTY);
  const [sort, setSort] = useState<keyof typeof SORTS>('relevance');
  const [page, setPage] = useState(1);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [compare, setCompare] = useState<CreatorView[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [invite, setInvite] = useState<CreatorView | null>(null);
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => setPage(1), [debounced, f, sort]);
  const set = (p: Partial<F>) => setF((x) => ({ ...x, ...p }));
  const size = SIZE_PRESETS.find((s) => s.id === f.size)!;
  const query: DiscoveryQuery = useMemo(() => ({
    q: debounced, categories: f.categories, platforms: f.platforms, countries: f.countries, languages: f.languages, formats: f.formats,
    followersMin: size.min, followersMax: size.max, engagementMin: f.engagementMin ? Number(f.engagementMin) : undefined,
    rateMax: f.rateMax ? Number(f.rateMax) : undefined, currency: f.currency, availability: f.available ? ['available'] : undefined,
    identityVerified: f.identityVerified || undefined, sources: f.sources, audienceFemaleMin: f.audienceFemaleMin ? Number(f.audienceFemaleMin) : undefined,
    sort, page, pageSize: 12,
  }), [debounced, f, sort, page, size]);
  const res = useQuery(() => api.creators.discover(ctx, orgId, query), [ctx, orgId, query]);
  const active = Object.entries(f).filter(([k, v]) => (Array.isArray(v) ? v.length : typeof v === 'boolean' ? v : k === 'size' ? v !== 'any' : k !== 'currency' && v)).length;
  const toggleCompare = (c: CreatorView) => setCompare((xs) => (xs.some((x) => x.id === c.id) ? xs.filter((x) => x.id !== c.id) : xs.length >= 3 ? xs : [...xs, c]));

  return (
    <div>
      <PageHeader title="Discover creators" description="Search profiles creators have chosen to list. Figures are labelled by source — self-reported numbers are not verified." actions={<Button icon={UserSearch} onClick={() => navigate('/app/match')}>Match from a brief</Button>} />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block"><div className="panel sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto p-4 scroll-thin"><Filters f={f} set={set} onReset={() => setF(EMPTY)} /></div></aside>
        <div className="min-w-0">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, handle, niche or city…" className="input h-10 pl-9" aria-label="Search creators" />
            </div>
            <div className="flex gap-2">
              <Button className="lg:hidden" icon={SlidersHorizontal} onClick={() => setMobileFilters(true)}>Filters{active ? ` (${active})` : ''}</Button>
              <Select aria-label="Sort" className="h-10 sm:w-48" options={Object.keys(SORTS) as (keyof typeof SORTS)[]} labels={SORTS} value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)} />
            </div>
          </div>
          <div className="mb-3 flex items-center justify-between text-[12.5px] text-ink-500">
            <span aria-live="polite">{res.data ? <><span className="num font-semibold text-ink-800">{res.data.total}</span> creators</> : 'Searching…'}</span>
            {active > 0 && <button onClick={() => setF(EMPTY)} className="inline-flex items-center gap-1 font-medium text-accent-600"><X className="size-3.5" />Clear {active} filter{active > 1 ? 's' : ''}</button>}
          </div>
          {!res.data ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[268px] rounded-[14px]" />)}</div>
          ) : res.data.items.length ? (
            <>
              <div className={cx('grid gap-3 sm:grid-cols-2 xl:grid-cols-3 transition-opacity', res.loading && 'opacity-60')}>
                {res.data.items.map((c) => (
                  <CreatorCard key={c.id} c={c} currency={f.currency} onOpen={() => navigate(`/app/creators/${c.id}`)} onCompare={() => toggleCompare(c)} comparing={compare.some((x) => x.id === c.id)} />
                ))}
              </div>
              {res.data.pages > 1 && (
                <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Pagination">
                  <Button size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                  <span className="num px-2 text-[12.5px] text-ink-500">Page {res.data.page} of {res.data.pages}</span>
                  <Button size="sm" iconRight={ChevronRight} disabled={page >= res.data.pages} onClick={() => setPage(page + 1)}>Next</Button>
                </nav>
              )}
            </>
          ) : <div className="panel"><EmptyState icon={UserSearch} title="No creators match" message="Try fewer filters, a wider audience size, or another market." action={<Button onClick={() => setF(EMPTY)}>Clear filters</Button>} /></div>}
        </div>
      </div>

      {compare.length > 0 && (
        <div className="fixed inset-x-3 bottom-4 z-30 mx-auto flex max-w-xl items-center gap-3 rounded-[14px] border border-ink-200 bg-surface p-2.5 pl-4 shadow-lg animate-up sm:inset-x-auto sm:right-6">
          <Columns3 className="size-4 text-ink-500" />
          <p className="min-w-0 flex-1 truncate text-[13px]"><span className="font-semibold">{compare.length}</span> selected · {compare.map((c) => c.displayName.split(' ')[0]).join(', ')}</p>
          {compare.length === 1 && roleCan(role, 'outreach.send') && <Button size="sm" icon={Send} onClick={() => setInvite(compare[0])}>Invite</Button>}
          <Button size="sm" variant="dark" disabled={compare.length < 2} onClick={() => setShowCompare(true)}>Compare</Button>
          <button onClick={() => setCompare([])} className="rounded p-1 text-ink-400 hover:text-ink-700" aria-label="Clear selection"><X className="size-4" /></button>
        </div>
      )}
      {showCompare && <Compare creators={compare} currency={f.currency} onClose={() => setShowCompare(false)} onRemove={(id) => setCompare((xs) => xs.filter((x) => x.id !== id))} />}
      {invite && <InviteModal open creator={invite} onClose={() => setInvite(null)} />}
      <Drawer open={mobileFilters} onClose={() => setMobileFilters(false)} title="Filters" width="max-w-sm" footer={<Button variant="dark" onClick={() => setMobileFilters(false)}>Show {res.data?.total ?? ''} creators</Button>}>
        <Filters f={f} set={set} onReset={() => setF(EMPTY)} />
      </Drawer>
    </div>
  );
}
