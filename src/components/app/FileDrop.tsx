import { useRef, useState } from 'react';
import { Upload, X, FileText, Film } from 'lucide-react';
import { INLINE_IMAGE_LIMIT, UPLOAD_TYPES } from '../../domain/constants';
import { cx } from '../../lib/utils';
import { api } from '../../server/api';

/** `file` is kept so it can be uploaded to storage at submit time (Live mode). */
export interface PickedFile { name: string; type: string; size: number; dataUrl?: string; file?: File }

const readAsDataUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
const fmtSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

export default function FileDrop({ files, onChange, maxFiles = 6, maxMb = 50, accept = UPLOAD_TYPES, onError, label = 'Drop files or browse' }: { files: PickedFile[]; onChange: (f: PickedFile[]) => void; maxFiles?: number; maxMb?: number; accept?: string[]; onError: (msg: string) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const add = async (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= maxFiles) { onError(`You can attach up to ${maxFiles} files.`); break; }
      if (!accept.includes(f.type)) { onError(`“${f.name}” isn’t an allowed file type.`); continue; }
      if (f.size > maxMb * 1048576) { onError(`“${f.name}” is larger than ${maxMb} MB.`); continue; }
      const dataUrl = f.type.startsWith('image/') && f.size <= INLINE_IMAGE_LIMIT ? await readAsDataUrl(f) : undefined;
      next.push({ name: f.name, type: f.type, size: f.size, dataUrl, file: f });
    }
    onChange(next);
  };
  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void add(e.dataTransfer.files); }}
        className={cx('flex flex-col items-center justify-center rounded-[12px] border border-dashed px-4 py-6 text-center transition-colors', over ? 'border-accent-400 bg-accent-50' : 'border-ink-300 bg-ink-50/60')}
      >
        <Upload className="size-5 text-ink-400" />
        <button type="button" onClick={() => input.current?.click()} className="mt-2 text-[13px] font-medium text-accent-600 hover:text-accent-700">{label}</button>
        <p className="mt-1 text-[11.5px] text-ink-500">JPG, PNG, WebP, MP4, MOV or PDF · up to {maxMb} MB each</p>
        <input ref={input} type="file" multiple={maxFiles > 1} accept={accept.join(',')} className="sr-only" onChange={(e) => { void add(e.target.files); e.target.value = ''; }} aria-label="Choose files" />
      </div>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-2.5 rounded-[10px] border border-ink-200 bg-surface p-2">
              {f.dataUrl ? <img src={f.dataUrl} alt="" className="size-9 rounded-md object-cover" /> : <span className="grid size-9 place-items-center rounded-md bg-ink-100 text-ink-500">{f.type.startsWith('video') ? <Film className="size-4" /> : <FileText className="size-4" />}</span>}
              <span className="min-w-0 flex-1"><span className="block truncate text-[12.5px] font-medium">{f.name}</span><span className="text-[11.5px] text-ink-500">{fmtSize(f.size)}{api.storage.storageConnected() ? ' · uploads when you submit' : !f.dataUrl ? ' · name and size only in Demo mode' : ''}</span></span>
              <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label={`Remove ${f.name}`}><X className="size-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
