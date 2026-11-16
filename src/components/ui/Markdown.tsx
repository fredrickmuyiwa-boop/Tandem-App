// Small, safe Markdown renderer for AI replies. Never injects HTML.
import { Fragment, type ReactNode } from 'react';

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0]; const k = `${key}-${i++}`;
    if (t.startsWith('**')) out.push(<strong key={k} className="font-semibold text-ink-900">{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={k} className="rounded bg-ink-100 px-1 font-mono text-[12px]">{t.slice(1, -1)}</code>);
    else out.push(<em key={k} className="text-ink-500">{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  let i = 0; let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const buf: string[] = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      out.push(<pre key={k++} className="my-2 whitespace-pre-wrap rounded-[10px] border border-ink-200 bg-ink-50 p-3.5 font-sans text-[13px] leading-relaxed text-ink-800">{buf.join('\n')}</pre>);
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*-\s+/, ''));
      out.push(<ul key={k++} className="my-1.5 space-y-1">{items.map((it, j) => <li key={j} className="flex gap-2"><span className="mt-[9px] size-1 shrink-0 rounded-full bg-ink-400" /><span>{inline(it, `${k}-${j}`)}</span></li>)}</ul>);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\d+\.\s+/, ''));
      out.push(<ol key={k++} className="my-1.5 space-y-1.5">{items.map((it, j) => <li key={j} className="flex gap-2.5"><span className="num mt-px grid size-5 shrink-0 place-items-center rounded-md bg-ink-100 text-[11px] font-semibold text-ink-700">{j + 1}</span><span>{inline(it, `${k}-${j}`)}</span></li>)}</ol>);
      continue;
    }
    if (line.startsWith('### ')) out.push(<p key={k++} className="mb-1 mt-2 text-[14.5px] font-semibold text-ink-900 first:mt-0">{inline(line.slice(4), String(k))}</p>);
    else if (!line.trim()) out.push(<div key={k++} className="h-2" />);
    else out.push(<p key={k++}>{inline(line, String(k))}</p>);
    i++;
  }
  return <div className="text-[13.5px] leading-relaxed text-ink-700">{out.map((n, j) => <Fragment key={j}>{n}</Fragment>)}</div>;
}
