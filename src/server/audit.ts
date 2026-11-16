import type { AuditEvent } from '../domain/types';
import { getDb, isReady, persistSoon } from './db';
import { uid, nowIso } from '../lib/utils';

export function audit(e: Omit<AuditEvent, 'id' | 'at'>) {
  if (!isReady()) return;
  const d = getDb();
  d.audit.unshift({ id: uid('aud'), at: nowIso(), ...e });
  if (d.audit.length > 1500) d.audit.length = 1500;
  persistSoon();
}
