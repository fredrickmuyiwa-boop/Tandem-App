import type { AuditEvent } from '../domain/types';
import { getDb, inMutation, isReady, persistSoon, writeHook } from './db';
import { uid, nowIso } from '../lib/utils';

export function audit(e: Omit<AuditEvent, 'id' | 'at'>) {
  if (!isReady()) return;
  const d = getDb();
  const entry = { id: uid('aud'), at: nowIso(), ...e };
  d.audit.unshift(entry);
  // Inside a mutation the live replica picks this up in its diff; outside one, send it directly.
  if (!inMutation()) writeHook()?.outsideMutation('audit', entry);
  if (d.audit.length > 1500) d.audit.length = 1500;
  persistSoon();
}
