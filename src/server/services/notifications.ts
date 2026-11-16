import type { NotificationPrefs } from '../../domain/types';
import { getDb, mutate } from '../db';
import { latency } from '../config';
import { requireUser, type Ctx } from '../access';
import { defaultPrefs, notify } from '../notify';
import { daysUntil } from '../../lib/utils';

export async function listNotifications(ctx: Ctx, opts: { unreadOnly?: boolean; limit?: number } = {}) {
  await latency();
  const user = requireUser(ctx);
  return getDb().notifications.filter((n) => n.userId === user.id && (!opts.unreadOnly || !n.read)).slice(0, opts.limit ?? 100);
}

export async function markRead(ctx: Ctx, id?: string) {
  const user = requireUser(ctx);
  mutate((d) => d.notifications.forEach((n) => { if (n.userId === user.id && (!id || n.id === id)) n.read = true; }));
}

export async function getPrefs(ctx: Ctx): Promise<NotificationPrefs> {
  const user = requireUser(ctx);
  return getDb().notificationPrefs.find((p) => p.userId === user.id) ?? defaultPrefs(user.id);
}

export async function savePrefs(ctx: Ctx, prefs: Omit<NotificationPrefs, 'userId'>) {
  await latency();
  const user = requireUser(ctx);
  mutate((d) => {
    d.notificationPrefs = d.notificationPrefs.filter((p) => p.userId !== user.id);
    // Security and account notices can't be switched off in-app.
    d.notificationPrefs.push({ ...prefs, userId: user.id, inApp: { ...prefs.inApp, system: true } });
  });
}

/** Deadline reminders: run on sign-in (production: a scheduled job). Deduplicated by notify(). */
export function runDeadlineReminders(ctx: Ctx) {
  const user = requireUser(ctx);
  const d = getDb();
  const creator = d.creators.find((c) => c.userId === user.id);
  const due = d.deliverables.filter((x) => (creator ? x.creatorId === creator.id : false) && !['approved', 'in_review', 'awaiting_client'].includes(x.status) && daysUntil(x.dueDate) <= 2 && daysUntil(x.dueDate) >= -3);
  if (!due.length) return 0;
  mutate((db) => due.forEach((x) => {
    const days = daysUntil(x.dueDate);
    notify(db, [user.id], 'deadline', days < 0 ? `Overdue: ${x.title}` : `Due ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}: ${x.title}`, 'Submit your content in the collaboration workspace.', `/creator/collaborations/${x.collaborationId}`);
  }));
  return due.length;
}
