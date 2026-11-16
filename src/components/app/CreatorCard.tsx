import { MapPin, Bookmark, Plus } from 'lucide-react';
import type { CreatorView } from '../../server/services/creators';
import { avgEngagement, statsSource, tier, totalFollowers, typicalRate } from '../../domain/creatorStats';
import { categoryLabel, platformLabel } from '../../domain/constants';
import type { Currency } from '../../domain/types';
import { compact, cx, money } from '../../lib/utils';
import { Avatar } from '../ui/misc';
import { SampleTag, SourceTag, VerifiedIdentity } from '../ui/Badge';

export default function CreatorCard({ c, currency = 'USD', onOpen, onSave, onCompare, comparing, saved }: { c: CreatorView; currency?: Currency; onOpen: () => void; onSave?: () => void; onCompare?: () => void; comparing?: boolean; saved?: boolean }) {
  const f = totalFollowers(c);
  const er = avgEngagement(c);
  const src = statsSource(c);
  const rate = c.rates ? typicalRate(c, currency) : null;
  const converted = c.rates?.some((r) => r.currency !== currency);
  return (
    <article className="panel group flex flex-col p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <button onClick={onOpen} className="shrink-0" aria-label={`Open ${c.displayName}`}><Avatar name={c.displayName} hue={c.avatarHue} url={c.avatarUrl} size="md" /></button>
        <div className="min-w-0 flex-1">
          <button onClick={onOpen} className="block max-w-full truncate text-left text-[14px] font-semibold text-ink-900 hover:underline">{c.displayName}</button>
          <p className="truncate text-[12.5px] text-ink-500">@{c.handle}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {c.sample && <SampleTag />}
          {c.identityVerification === 'verified' && <VerifiedIdentity />}
        </div>
      </div>
      <p className="mt-3 line-clamp-2 min-h-[36px] text-[12.5px] leading-relaxed text-ink-600">{c.bio}</p>
      <div className="mt-3 flex flex-wrap gap-1">
        {c.categories.slice(0, 3).map((x) => <span key={x} className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-700">{categoryLabel(x)}</span>)}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 border-t border-ink-150 pt-3 text-[12px]">
        <div><dt className="text-ink-500">Audience</dt><dd className="num mt-0.5 flex items-center gap-1 font-semibold text-ink-900">{compact(f)}{src && <SourceTag source={src} compact />}</dd></div>
        <div><dt className="text-ink-500">Eng. rate</dt><dd className="num mt-0.5 font-semibold text-ink-900">{er != null ? `${er.toFixed(1)}%` : '—'}</dd></div>
        <div><dt className="text-ink-500">Typical fee</dt><dd className="num mt-0.5 font-semibold text-ink-900" title={converted ? 'Converted at reference exchange rates (estimate)' : undefined}>{c.rates == null ? <span className="font-normal text-ink-500">On request</span> : rate != null ? `${converted ? '≈' : ''}${money(rate, currency, { compact: true })}` : '—'}</dd></div>
      </dl>
      <div className="mt-3 flex items-center gap-2 text-[11.5px] text-ink-500">
        <span className="flex items-center gap-1 truncate"><MapPin className="size-3" />{c.city ? `${c.city}, ` : ''}{c.country}</span>
        <span className="ml-auto flex shrink-0 gap-1">{c.socials.map((s) => <span key={s.id} className="rounded bg-ink-50 px-1.5 py-0.5 text-ink-600">{platformLabel(s.platform)}</span>)}</span>
      </div>
      <p className="mt-1 text-[11.5px] text-ink-400">{tier(f).label}{c.availability !== 'available' && <span className="text-warn-600"> · {c.availability === 'limited' ? 'Limited availability' : 'Unavailable'}</span>}</p>
      {(onSave || onCompare) && (
        <div className="mt-3 flex gap-2 border-t border-ink-150 pt-3">
          {onSave && <button onClick={onSave} className={cx('inline-flex flex-1 items-center justify-center gap-1.5 rounded-[9px] border py-1.5 text-[12.5px] font-medium', saved ? 'border-accent-200 bg-accent-50 text-accent-700' : 'border-ink-200 text-ink-700 hover:bg-ink-50')}><Bookmark className="size-3.5" />{saved ? 'Saved' : 'Save'}</button>}
          {onCompare && <button onClick={onCompare} aria-pressed={comparing} className={cx('inline-flex flex-1 items-center justify-center gap-1.5 rounded-[9px] border py-1.5 text-[12.5px] font-medium', comparing ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 text-ink-700 hover:bg-ink-50')}><Plus className="size-3.5" />{comparing ? 'Comparing' : 'Compare'}</button>}
        </div>
      )}
    </article>
  );
}
