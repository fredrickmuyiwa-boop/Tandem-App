import { useEffect, useMemo, useRef, useState } from 'react';
import { compact, formatDate } from '../../lib/utils';

export interface Series { key: string; label: string; color: string }

/** Responsive SVG area/line chart. One scale for marks, grid and labels. */
export default function LineChart({ data, series, height = 220, format = compact }: { data: Record<string, number | string | null>[]; series: Series[]; height?: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const pad = { l: 44, r: 12, t: 10, b: 26 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = useMemo(() => {
    const m = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key] ?? 0))));
    const mag = 10 ** Math.floor(Math.log10(m));
    return Math.ceil(m / mag) * mag;
  }, [data, series]);
  const x = (i: number) => pad.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  if (!data.length) return <div ref={ref} className="grid h-40 place-items-center text-[13px] text-ink-500">No data in this range.</div>;
  const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(iw / 80)));
  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
      <svg width={w} height={height} role="img" aria-label={`Chart of ${series.map((s) => s.label).join(', ')}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-ink-150)" />
            <text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--color-ink-400)" className="num">{format(t)}</text>
          </g>
        ))}
        {data.map((d, i) => (i % labelEvery === 0 || i === data.length - 1) && (
          <text key={i} x={x(i)} y={height - 8} textAnchor="middle" fontSize="10.5" fill="var(--color-ink-400)">{formatDate(String(d.date), { year: undefined })}</text>
        ))}
        {series.map((s) => {
          const pts = data.map((d, i) => [x(i), y(Number(d[s.key] ?? 0))] as const);
          const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' ');
          const area = `${line} L${pts[pts.length - 1][0]},${y(0)} L${pts[0][0]},${y(0)} Z`;
          return (
            <g key={s.key}>
              <path d={area} fill={s.color} opacity="0.08" />
              <path d={line} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3.5" fill={s.color} />
            </g>
          );
        })}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--color-ink-300)" strokeDasharray="3 3" />}
        {data.map((_, i) => <rect key={i} x={x(i) - iw / Math.max(1, data.length) / 2} y={pad.t} width={iw / Math.max(1, data.length)} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />)}
      </svg>
      {hover != null && (
        <div className="pointer-events-none absolute top-2 rounded-[10px] border border-ink-200 bg-surface px-3 py-2 text-[12px] shadow-md" style={{ left: Math.min(Math.max(x(hover) - 70, 0), w - 150) }}>
          <p className="font-semibold text-ink-900">{formatDate(String(data[hover].date))}</p>
          {series.map((s) => <p key={s.key} className="flex items-center gap-2 text-ink-600"><span className="size-2 rounded-full" style={{ background: s.color }} />{s.label}: <span className="num font-semibold text-ink-900">{data[hover][s.key] == null ? '—' : format(Number(data[hover][s.key]))}</span></p>)}
        </div>
      )}
    </div>
  );
}
