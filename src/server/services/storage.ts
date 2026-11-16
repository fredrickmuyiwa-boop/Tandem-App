// File uploads for content submissions.
// Demo mode: nothing leaves the browser (small images are kept inline for preview).
// Live mode: files go to the private Supabase Storage bucket `submissions` and are
// read back through short-lived signed URLs; storage policies decide who may do either.
import { AppError } from '../../lib/errors';
import { requireUser, type Ctx } from '../access';
import { getDb } from '../db';
import { validateUpload } from './creators';

export interface UploadInput { name: string; type: string; size: number; dataUrl?: string; file?: Blob }
export interface UploadedFile { name: string; type: string; size: number; dataUrl?: string; storagePath?: string }

export interface StorageBackend {
  upload(path: string, file: Blob, contentType: string, onProgress: (sentBytes: number) => void): Promise<void>;
  signedUrl(path: string, expiresInSeconds: number): Promise<string>;
}

let backend: StorageBackend | null = null;
export const setStorageBackend = (b: StorageBackend | null) => { backend = b; };
export const storageConnected = () => backend !== null;

/** Keep names readable but safe for object paths. */
export function safeObjectName(name: string) {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 10) : '';
  const base = (dot > 0 ? name.slice(0, dot) : name).normalize('NFKD').replace(/[^A-Za-z0-9._ ()-]/g, '_').replace(/_+/g, '_').trim().slice(0, 120) || 'file';
  return `${base}${ext}`;
}

const randomId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 16);

/**
 * Upload the files for a submission before it is submitted. Returns the same list with
 * `storagePath` set for each uploaded file. `onProgress` reports a 0–1 fraction overall.
 */
export async function uploadSubmissionFiles(ctx: Ctx, collaborationId: string, files: UploadInput[], onProgress?: (fraction: number) => void): Promise<UploadedFile[]> {
  requireUser(ctx);
  const collab = getDb().collaborations.find((k) => k.id === collaborationId);
  if (!collab) throw new AppError('not_found', 'Collaboration not found.');
  if (collab.status !== 'active') throw new AppError('conflict', 'This collaboration isn’t active.');
  files.forEach(validateUpload);
  if (!backend) return files.map(({ file: _f, ...rest }) => rest);
  const total = files.reduce((n, f) => n + (f.file ? f.size : 0), 0) || 1;
  let done = 0;
  const out: UploadedFile[] = [];
  for (const f of files) {
    if (!f.file) { out.push({ name: f.name, type: f.type, size: f.size, dataUrl: f.dataUrl }); continue; }
    const path = `${collab.id}/${randomId()}-${safeObjectName(f.name)}`;
    try {
      await backend.upload(path, f.file, f.type, (sent) => onProgress?.(Math.min(1, (done + sent) / total)));
    } catch (e) {
      throw e instanceof AppError ? e : new AppError('network', `“${f.name}” didn’t upload. Check your connection and try again.`);
    }
    done += f.size;
    onProgress?.(Math.min(1, done / total));
    out.push({ name: f.name, type: f.type, size: f.size, storagePath: path });
  }
  return out;
}

/** A link to view a stored file, valid for an hour. Null when storage isn't connected. */
export async function signedUrl(ctx: Ctx, storagePath: string): Promise<string | null> {
  requireUser(ctx);
  if (!backend) return null;
  return backend.signedUrl(storagePath, 3600);
}
