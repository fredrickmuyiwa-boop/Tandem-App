import type { Collection, CrmRecord, RelationshipStatus } from '../../domain/types';
import { getDb, mutate } from '../db';
import { AppError, notFound } from '../errors';
import { latency } from '../config';
import { effectiveRole, requireOrg, type Ctx } from '../access';
import { cleanLine, cleanText } from '../../lib/sanitize';
import { nowIso, uid } from '../../lib/utils';
import { toView } from './creators';
import { RELATIONSHIP } from '../../domain/constants';

/** Collections visible in a workspace: its own, plus the parent agency's shared database for agency staff. */
function visibleCollections(userId: string, orgId: string): Collection[] {
  const d = getDb();
  const org = d.organizations.find((o) => o.id === orgId)!;
  const role = effectiveRole(userId, orgId, d);
  const own = d.collections.filter((c) => c.orgId === orgId && (role !== 'client_reviewer' || c.sharedWithClients));
  const agencyRole = org.parentOrgId ? effectiveRole(userId, org.parentOrgId, d) : null;
  const agency = org.parentOrgId && agencyRole && agencyRole !== 'client_reviewer' ? d.collections.filter((c) => c.orgId === org.parentOrgId) : [];
  return [...own, ...agency];
}

export async function listCollections(ctx: Ctx, orgId: string) {
  await latency();
  const { user } = requireOrg(ctx, orgId, 'org.view');
  const d = getDb();
  return visibleCollections(user.id, orgId).map((c) => ({ collection: c, inherited: c.orgId !== orgId, ownerName: d.organizations.find((o) => o.id === c.orgId)?.name ?? '' }));
}

export async function getCollection(ctx: Ctx, orgId: string, id: string) {
  await latency();
  const { user } = requireOrg(ctx, orgId, 'org.view');
  const c = visibleCollections(user.id, orgId).find((x) => x.id === id);
  if (!c) throw notFound('Collection');
  const d = getDb();
  const creators = c.creatorIds.map((cid) => d.creators.find((x) => x.id === cid)).filter((x): x is NonNullable<typeof x> => !!x).map((x) => toView(x));
  return { collection: c, creators, editable: c.orgId === orgId || effectiveRole(user.id, c.orgId) != null };
}

function editableCollection(ctx: Ctx, orgId: string, id: string) {
  const { user } = requireOrg(ctx, orgId, 'collections.edit');
  const c = visibleCollections(user.id, orgId).find((x) => x.id === id);
  if (!c) throw notFound('Collection');
  return c;
}

export async function createCollection(ctx: Ctx, orgId: string, input: { name: string; description?: string; sharedWithClients?: boolean; creatorIds?: string[] }) {
  await latency();
  const { user } = requireOrg(ctx, orgId, 'collections.edit');
  const name = cleanLine(input.name, 80);
  if (!name) throw new AppError('validation', 'Name your collection.', { name: 'Name your collection.' });
  return mutate((d) => {
    const c: Collection = { id: uid('col'), orgId, name, description: cleanText(input.description, 300) || undefined, creatorIds: [...new Set(input.creatorIds ?? [])], sharedWithClients: !!input.sharedWithClients, createdBy: user.id, createdAt: nowIso() };
    d.collections.push(c);
    return c;
  });
}

export async function updateCollection(ctx: Ctx, orgId: string, id: string, patch: { name?: string; description?: string; sharedWithClients?: boolean }) {
  const c = editableCollection(ctx, orgId, id);
  mutate(() => {
    if (patch.name != null) c.name = cleanLine(patch.name, 80) || c.name;
    if (patch.description != null) c.description = cleanText(patch.description, 300);
    if (patch.sharedWithClients != null) c.sharedWithClients = patch.sharedWithClients;
  });
}

export async function toggleInCollection(ctx: Ctx, orgId: string, id: string, creatorId: string, on: boolean) {
  const c = editableCollection(ctx, orgId, id);
  if (!getDb().creators.some((x) => x.id === creatorId)) throw notFound('Creator');
  mutate(() => {
    c.creatorIds = on ? [...new Set([...c.creatorIds, creatorId])] : c.creatorIds.filter((x) => x !== creatorId);
  });
}

export async function deleteCollection(ctx: Ctx, orgId: string, id: string) {
  const c = editableCollection(ctx, orgId, id);
  mutate((d) => { d.collections = d.collections.filter((x) => x.id !== c.id); });
}

// ---------------- CRM ----------------
function record(orgId: string, creatorId: string): CrmRecord {
  const d = getDb();
  let r = d.crm.find((x) => x.orgId === orgId && x.creatorId === creatorId);
  if (!r) {
    r = { id: uid('crm'), orgId, creatorId, status: 'prospect', tags: [], notes: [], reminders: [], updatedAt: nowIso() };
    d.crm.push(r);
  }
  return r;
}

export async function listCrm(ctx: Ctx, orgId: string) {
  await latency();
  requireOrg(ctx, orgId, 'crm.view');
  const d = getDb();
  return d.crm.filter((r) => r.orgId === orgId).map((r) => {
    const c = d.creators.find((x) => x.id === r.creatorId);
    const collabs = d.collaborations.filter((k) => k.orgId === orgId && k.creatorId === r.creatorId);
    return { record: r, creator: c ? toView(c, true) : null, collaborations: collabs.length, completed: collabs.filter((k) => k.status === 'completed').length, dueReminders: r.reminders.filter((x) => !x.done && x.due <= new Date().toISOString().slice(0, 10)).length };
  }).filter((x) => x.creator).sort((a, b) => b.dueReminders - a.dueReminders || b.record.updatedAt.localeCompare(a.record.updatedAt));
}

export async function getCrm(ctx: Ctx, orgId: string, creatorId: string) {
  requireOrg(ctx, orgId, 'crm.view');
  const d = getDb();
  const r = d.crm.find((x) => x.orgId === orgId && x.creatorId === creatorId);
  const results = d.results.filter((x) => x.orgId === orgId && x.creatorId === creatorId);
  const collabs = d.collaborations.filter((k) => k.orgId === orgId && k.creatorId === creatorId).map((k) => ({ collab: k, campaignName: d.campaigns.find((c) => c.id === k.campaignId)?.name ?? '' }));
  return { record: r ?? null, collaborations: collabs, resultEntries: results.length };
}

export async function updateCrm(ctx: Ctx, orgId: string, creatorId: string, patch: { status?: RelationshipStatus; tags?: string[]; preferredContact?: string }) {
  await latency();
  requireOrg(ctx, orgId, 'crm.edit');
  if (!getDb().creators.some((c) => c.id === creatorId)) throw notFound('Creator');
  if (patch.status && !RELATIONSHIP[patch.status]) throw new AppError('validation', 'Choose a relationship status.');
  return mutate(() => {
    const r = record(orgId, creatorId);
    if (patch.status) r.status = patch.status;
    if (patch.tags) r.tags = [...new Set(patch.tags.map((t) => cleanLine(t, 30).toLowerCase()).filter(Boolean))].slice(0, 12);
    if (patch.preferredContact != null) r.preferredContact = cleanLine(patch.preferredContact, 120) || undefined;
    r.updatedAt = nowIso();
    return r;
  });
}

export async function addCrmNote(ctx: Ctx, orgId: string, creatorId: string, text: string) {
  const { user } = requireOrg(ctx, orgId, 'crm.edit');
  const body = cleanText(text, 2000);
  if (!body) throw new AppError('validation', 'Write a note first.');
  return mutate(() => {
    const r = record(orgId, creatorId);
    r.notes.unshift({ id: uid('note'), text: body, authorName: user.name, at: nowIso() });
    r.updatedAt = nowIso();
    return r;
  });
}

export async function addReminder(ctx: Ctx, orgId: string, creatorId: string, text: string, due: string) {
  requireOrg(ctx, orgId, 'crm.edit');
  const body = cleanLine(text, 160);
  if (!body || Number.isNaN(Date.parse(due))) throw new AppError('validation', 'Add the reminder text and a date.');
  return mutate(() => {
    const r = record(orgId, creatorId);
    r.reminders.push({ id: uid('rem'), text: body, due: due.slice(0, 10), done: false });
    r.updatedAt = nowIso();
    return r;
  });
}

export async function toggleReminder(ctx: Ctx, orgId: string, creatorId: string, reminderId: string) {
  requireOrg(ctx, orgId, 'crm.edit');
  const r = getDb().crm.find((x) => x.orgId === orgId && x.creatorId === creatorId);
  const rem = r?.reminders.find((x) => x.id === reminderId);
  if (!rem) throw notFound('Reminder');
  mutate(() => { rem.done = !rem.done; });
}

export async function myOrgReminders(ctx: Ctx, orgId: string) {
  requireOrg(ctx, orgId, 'crm.view');
  const d = getDb();
  return d.crm.filter((r) => r.orgId === orgId).flatMap((r) => r.reminders.filter((x) => !x.done).map((x) => ({ ...x, creatorId: r.creatorId, creatorName: d.creators.find((c) => c.id === r.creatorId)?.displayName ?? '' }))).sort((a, b) => a.due.localeCompare(b.due));
}

