import type { Database, NotificationPrefs, NotificationType } from '../domain/types';
import { NOTIFICATION_TYPES } from '../domain/constants';
import { uid, nowIso } from '../lib/utils';
import { roleCan, type Permission } from './access';

export function defaultPrefs(userId: string): NotificationPrefs {
  const all = Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t.id, true])) as Record<NotificationType, boolean>;
  const email = { ...all, campaign: false, team: false } as Record<NotificationType, boolean>;
  return { userId, inApp: all, email, digest: 'instant' };
}

/**
 * Create in-app notifications. Duplicates (same user, title) within 10 minutes
 * are collapsed so users are not spammed. Email is only *queued*: no email
 * provider is connected in Demo mode, and the UI says so.
 */
export function notify(d: Database, userIds: (string | undefined)[], type: NotificationType, title: string, body: string, link?: string) {
  const now = Date.now();
  for (const userId of new Set(userIds.filter(Boolean) as string[])) {
    const prefs = d.notificationPrefs.find((p) => p.userId === userId) ?? defaultPrefs(userId);
    if (!prefs.inApp[type] && !prefs.email[type]) continue;
    const dup = d.notifications.find((n) => n.userId === userId && n.title === title && now - new Date(n.createdAt).getTime() < 600_000);
    if (dup) continue;
    d.notifications.unshift({
      id: uid('ntf'),
      userId,
      type,
      title,
      body,
      link,
      read: !prefs.inApp[type],
      createdAt: nowIso(),
      emailQueued: prefs.email[type] && prefs.digest !== 'off',
    });
  }
  if (d.notifications.length > 2000) d.notifications.length = 2000;
}

/** Users in an org (plus agency staff for client workspaces) holding a permission. */
export function orgRecipients(d: Database, orgId: string, perm: Permission): string[] {
  const org = d.organizations.find((o) => o.id === orgId);
  const ids = d.memberships.filter((m) => m.orgId === orgId && roleCan(m.role, perm)).map((m) => m.userId);
  if (org?.parentOrgId) ids.push(...d.memberships.filter((m) => m.orgId === org.parentOrgId && roleCan(m.role, perm)).map((m) => m.userId));
  return [...new Set(ids)];
}

export function creatorUser(d: Database, creatorId: string): string | undefined {
  return d.creators.find((c) => c.id === creatorId)?.userId;
}
