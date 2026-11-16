import { useState } from 'react';
import { Search, LayoutGrid } from 'lucide-react';
import { api } from '../../server/api';
import { useSession } from '../../app/session';
import { useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { CATEGORIES, OBJECTIVES, PLATFORMS, categoryLabel, objectiveLabel, platformLabel } from '../../domain/constants';
import type { Category, Objective, Platform } from '../../domain/types';
import { formatDate } from '../../lib/utils';
import { Select } from '../../components/ui/Field';
import { Pill } from '../../components/ui/Badge';
import { EmptyState, PageHeader, PageSkeleton } from '../../components/ui/misc';

export default function Opportunities() {
  const { ctx } = useSession();
  const { navigate } = useRouter();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [platform, setPlatform] = useState<Platform | ''>('');
  const [objective, setObjective] = useState<Objective | ''>('');
  const res = useQuery(() => api.campaigns.marketplace(ctx, { q, category: category || undefined, platform: platform || undefined, objective: objective || undefined }), [ctx, q, category, platform, objective]);
  return (
    <div>
      <PageHeader title="Opportunities" description="Open campaigns accepting applications. Brands see your profile as you’ve set it." />
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_170px_150px_170px]">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns" className="input pl-9" aria-label="Search campaigns" /></div>
        <Select aria-label="Category" options={['', ...CATEGORIES.map((c) => c.id)]} labels={{ '': 'All categories', ...Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label])) }} value={category} onChange={(e) => setCategory(e.target.value as Category)} />
        <Select aria-label="Platform" options={['', ...PLATFORMS.map((p) => p.id)]} labels={{ '': 'All platforms', ...Object.fromEntries(PLATFORMS.map((p) => [p.id, p.label])) }} value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} />
        <Select aria-label="Objective" options={['', ...OBJECTIVES.map((o) => o.id)]} labels={{ '': 'All objectives', ...Object.fromEntries(OBJECTIVES.map((o) => [o.id, o.label])) }} value={objective} onChange={(e) => setObjective(e.target.value as Objective)} />
      </div>
      {!res.data ? <PageSkeleton /> : res.data.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {res.data.map(({ campaign: c, fit, applied, invited }) => (
            <button key={c.id} onClick={() => navigate(`/creator/opportunities/${c.id}`)} className="panel flex flex-col p-4 text-left transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-2"><p className="text-[14.5px] font-semibold">{c.name}</p>{applied ? <Pill tone="accent">Applied</Pill> : invited ? <Pill tone="warning">Invited</Pill> : fit >= 3 ? <Pill tone="success">Good fit</Pill> : null}</div>
              <p className="text-[12.5px] text-ink-500">{c.brandName} · {c.brandCountry}</p>
              <p className="mt-2 line-clamp-3 text-[12.5px] leading-relaxed text-ink-600">{c.description}</p>
              <div className="mt-3 flex flex-wrap gap-1">{c.categories.map((x) => <span key={x} className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-700">{categoryLabel(x)}</span>)}{c.platforms.map((p) => <span key={p} className="rounded-md bg-ink-50 px-1.5 py-0.5 text-[11px] text-ink-600">{platformLabel(p)}</span>)}</div>
              <p className="mt-auto pt-3 text-[12px] text-ink-500">{objectiveLabel(c.objective)} · {c.feeGuide} · {formatDate(c.startDate, { year: undefined })} – {formatDate(c.endDate, { year: undefined })}</p>
            </button>
          ))}
        </div>
      ) : <div className="panel"><EmptyState icon={LayoutGrid} title="No open campaigns match" message="Try other filters, or check back soon." /></div>}
    </div>
  );
}
