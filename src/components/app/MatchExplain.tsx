import { AlertTriangle, CheckCircle2, CircleDashed, MinusCircle, CircleHelp } from 'lucide-react';
import type { MatchResult } from '../../ai/matching';
import { cx } from '../../lib/utils';
import { SourceTag } from '../ui/Badge';

const STATUS = {
  strong: { Icon: CheckCircle2, cls: 'text-ok-600', bar: 'bg-ok-600' },
  partial: { Icon: MinusCircle, cls: 'text-warn-600', bar: 'bg-warn-600' },
  weak: { Icon: AlertTriangle, cls: 'text-bad-600', bar: 'bg-bad-600' },
  unknown: { Icon: CircleHelp, cls: 'text-ink-400', bar: 'bg-ink-300' },
  not_requested: { Icon: CircleDashed, cls: 'text-ink-300', bar: 'bg-ink-200' },
};

export function ScoreBadge({ score, confidence }: { score: number; confidence: MatchResult['confidence'] }) {
  const tone = score >= 75 ? 'bg-ok-50 text-ok-600' : score >= 55 ? 'bg-accent-50 text-accent-700' : 'bg-ink-100 text-ink-600';
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className={cx('num grid h-9 min-w-12 place-items-center rounded-[10px] px-2 text-[17px] font-semibold', tone)} aria-label={`Match score ${score} out of 100, ${confidence} confidence`} title={`${confidence} confidence`}>{score}</span>
      <span className="hidden text-[11.5px] leading-tight text-ink-500 sm:block">match<br /><span className={cx('font-medium', confidence === 'limited' ? 'text-warn-600' : 'text-ink-700')}>{confidence === 'limited' ? 'Limited data' : `${confidence[0].toUpperCase()}${confidence.slice(1)} confidence`}</span></span>
    </div>
  );
}

export default function MatchExplain({ m }: { m: MatchResult }) {
  return (
    <div className="space-y-4">
      {m.confidence === 'limited' && <p className="rounded-[10px] bg-warn-50 px-3 py-2 text-[12.5px] text-warn-600">This recommendation is based on limited information. Ask the creator for recent platform insights before deciding.</p>}
      <ul className="space-y-2.5">
        {m.factors.map((f) => {
          const s = STATUS[f.status];
          return (
            <li key={f.key} className="grid grid-cols-[18px_1fr_auto] items-start gap-2.5">
              <s.Icon className={cx('mt-0.5 size-[18px]', s.cls)} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5"><p className="text-[13px] font-medium text-ink-800">{f.label}</p>{f.source && <SourceTag source={f.source} />}</div>
                <p className="text-[12.5px] leading-snug text-ink-500">{f.reason}</p>
              </div>
              <div className="w-20 pt-1 text-right">
                <span className="num text-[12px] font-semibold text-ink-700">{Math.round(f.points)}<span className="text-ink-400">/{f.weight}</span></span>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink-100"><div className={cx('h-full', s.bar)} style={{ width: `${(f.points / f.weight) * 100}%` }} /></div>
              </div>
            </li>
          );
        })}
      </ul>
      {m.concerns.length > 0 && (
        <div>
          <p className="eyebrow mb-1.5">Potential concerns</p>
          <ul className="space-y-1">{m.concerns.map((c) => <li key={c} className="flex gap-2 text-[12.5px] text-ink-600"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn-600" />{c}</li>)}</ul>
        </div>
      )}
      <div className="rounded-[10px] border border-ink-200 p-3">
        <p className="text-[12.5px] font-semibold text-ink-800">Suggested role: {m.suggestedRole.title}</p>
        <p className="text-[12px] text-ink-500">{m.suggestedRole.why}</p>
      </div>
      <p className="text-[11.5px] text-ink-400">Score = sum of weighted factors above. Factors you didn’t specify in the brief count as neutral (60%). Engagement is compared with Tandem reference benchmarks by audience size, which are assumptions.</p>
    </div>
  );
}
