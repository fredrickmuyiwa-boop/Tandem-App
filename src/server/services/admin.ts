import type { Category, Plan } from '../../domain/types';
import { getDb, mutate } from '../db';
import { AppError, notFound } from '../errors';
import { audit } from '../audit';
import { latency } from '../config';
import { requireAdmin, type Ctx } from '../access';
import { cleanLine, cleanText } from '../../lib/sanitize';
import { nowIso } from '../../lib/utils';
import { notify } from '../notify';
import { toPublicUser } from './auth';

export async function overview(ctx: Ctx) {
  await latency();
  requireAdmin(ctx);
  const d = getDb();
  const day = 86_400_000;
  return {
    users: d.users.length,
    byKind: { brand: d.users.filter((u) => u.kind === 'brand').length, agency: d.users.filter((u) => u.kind === 'agency').length, creator: d.users.filter((u) => u.kind === 'creator').length },
    suspended: d.users.filter((u) => u.status === 'suspended').length,
    organizations: d.organizations.length,
    creators: d.creators.length,
    sampleCreators: d.creators.filter((c) => c.sample).length,
    campaigns: d.campaigns.length,
    liveCampaigns: d.campaigns.filter((c) => ['published', 'recruiting', 'active'].includes(c.status)).length,
    collaborations: d.collaborations.length,
    openReports: d.reports.filter((r) => r.status === 'open').length,
    pendingVerifications: d.verificationRequests.filter((v) => v.status === 'pending').length,
    securityEvents24h: d.audit.filter((a) => a.severity === 'security' && Date.now() - new Date(a.at).getTime() < day).length,
    failedLogins24h: d.audit.filter((a) => (a.action === 'auth.login_failed' || a.action === 'auth.lockout') && Date.now() - new Date(a.at).getTime() < day).length,
  };
}

export async function listUsers(ctx: Ctx, q = '') {
  await latency();
  requireAdmin(ctx);
  const d = getDb();
  const term = q.toLowerCase();
  return d.users.filter((u) => !term || `${u.name} ${u.email}`.toLowerCase().includes(term)).map((u) => ({ user: toPublicUser(u), orgs: d.memberships.filter((m) => m.userId === u.id).map((m) => d.organizations.find((o) => o.id === m.orgId)?.name).filter(Boolean) as string[] }));
}

export async function setUserStatus(ctx: Ctx, userId: string, status: 'active' | 'suspended', reason: string) {
  await latency();
  const admin = requireAdmin(ctx);
  const d = getDb();
  const u = d.users.find((x) => x.id === userId);
  if (!u) throw notFound('User');
  if (u.id === admin.id) throw new AppError('conflict', 'You can’t suspend your own account.');
  if (u.platformRole === 'admin') throw new AppError('conflict', 'Administrator accounts are managed outside the app.');
  const why = cleanText(reason, 500);
  if (status === 'suspended' && why.length < 10) throw new AppError('validation', 'Record why the account is being suspended (at least 10 characters).', { reason: 'Add a reason.' });
  mutate((db) => {
    u.status = status;
    if (status === 'suspended') db.sessions.forEach((s) => { if (s.userId === u.id) s.revoked = true; });
    audit({ actorId: admin.id, actorEmail: admin.email, action: `admin.user_${status}`, target: u.email, severity: 'security', detail: why });
  });
}

export async function listOrganizations(ctx: Ctx) {
  await latency();
  requireAdmin(ctx);
  const d = getDb();
  return d.organizations.map((o) => ({ org: o, members: d.memberships.filter((m) => m.orgId === o.id).length, campaigns: d.campaigns.filter((c) => c.orgId === o.id).length, parent: o.parentOrgId ? d.organizations.find((x) => x.id === o.parentOrgId)?.name : undefined }));
}

export async function setOrgStatus(ctx: Ctx, orgId: string, status: 'active' | 'suspended', reason: string) {
  await latency();
  const admin = requireAdmin(ctx);
  const o = getDb().organizations.find((x) => x.id === orgId);
  if (!o) throw notFound('Organisation');
  if (status === 'suspended' && cleanText(reason).length < 10) throw new AppError('validation', 'Record a reason (at least 10 characters).', { reason: 'Add a reason.' });
  mutate(() => {
    o.status = status;
    audit({ actorId: admin.id, actorEmail: admin.email, orgId, action: `admin.org_${status}`, target: o.name, severity: 'security', detail: cleanText(reason, 500) });
  });
}

export async function listCampaigns(ctx: Ctx) {
  await latency();
  requireAdmin(ctx);
  const d = getDb();
  return d.campaigns.map((c) => ({ id: c.id, name: c.name, status: c.status, org: d.organizations.find((o) => o.id === c.orgId)?.name ?? '', createdAt: c.createdAt, collaborations: d.collaborations.filter((k) => k.campaignId === c.id).length, reports: d.reports.filter((r) => r.targetType === 'campaign' && r.targetId === c.id).length }));
}

export async function verificationQueue(ctx: Ctx) {
  await latency();
  requireAdmin(ctx);
  const d = getDb();
  return d.verificationRequests.map((v) => ({ request: v, creator: d.creators.find((c) => c.id === v.creatorId) ?? null }));
}

export async function decideVerification(ctx: Ctx, id: string, approve: boolean, note: string) {
  await latency();
  const admin = requireAdmin(ctx);
  const d = getDb();
  const v = d.verificationRequests.find((x) => x.id === id);
  if (!v) throw notFound('Request');
  if (v.status !== 'pending') throw new AppError('conflict', 'This request has already been decided.');
  mutate((db) => {
    v.status = approve ? 'approved' : 'rejected';
    v.decidedAt = nowIso();
    v.decidedBy = admin.id;
    v.note = cleanText(note, 500) || undefined;
    const c = db.creators.find((x) => x.id === v.creatorId);
    if (c) c.identityVerification = approve ? 'verified' : 'rejected';
    notify(db, [v.userId], 'verification', approve ? 'Your identity is verified' : 'Verification not approved', approve ? 'Brands now see a verified-identity badge. Audience figures stay labelled by their source.' : v.note ?? 'Contact support for details.', '/creator/profile');
    audit({ actorId: admin.id, actorEmail: admin.email, action: `admin.verification_${v.status}`, target: c?.handle, severity: 'warning' });
  });
}

export async function listReports(ctx: Ctx) {
  await latency();
  requireAdmin(ctx);
  const d = getDb();
  return d.reports.map((r) => {
    const target = r.targetType === 'creator' ? d.creators.find((c) => c.id === r.targetId)?.displayName : r.targetType === 'campaign' ? d.campaigns.find((c) => c.id === r.targetId)?.name : r.targetType === 'organization' ? d.organizations.find((o) => o.id === r.targetId)?.name : r.targetId;
    return { report: r, targetName: target ?? 'Removed item', reporter: d.users.find((u) => u.id === r.reporterId)?.email ?? 'Deleted user' };
  });
}

export async function resolveReport(ctx: Ctx, id: string, outcome: 'resolved' | 'dismissed', resolution: string, action?: 'unlist_creator' | 'pause_campaign') {
  await latency();
  const admin = requireAdmin(ctx);
  const d = getDb();
  const r = d.reports.find((x) => x.id === id);
  if (!r) throw notFound('Report');
  if (cleanText(resolution).length < 5) throw new AppError('validation', 'Record the outcome.', { resolution: 'Record the outcome.' });
  mutate((db) => {
    r.status = outcome;
    r.resolution = cleanText(resolution, 500);
    if (action === 'unlist_creator' && r.targetType === 'creator') { const c = db.creators.find((x) => x.id === r.targetId); if (c) c.visibility.listed = false; }
    if (action === 'pause_campaign' && r.targetType === 'campaign') { const c = db.campaigns.find((x) => x.id === r.targetId); if (c && ['published', 'recruiting', 'active'].includes(c.status)) c.status = 'paused'; }
    audit({ actorId: admin.id, actorEmail: admin.email, action: `admin.report_${outcome}`, target: `${r.targetType}:${r.targetId}`, severity: 'warning', detail: action });
  });
}

export async function getSettings(ctx: Ctx) {
  requireAdmin(ctx);
  return getDb().settings;
}

export async function updateFees(ctx: Ctx, input: { platformFeePct: number; defaultAgencyFeePct: number; maxUploadMb: number }) {
  await latency();
  const admin = requireAdmin(ctx);
  if (!(input.platformFeePct >= 0 && input.platformFeePct <= 30)) throw new AppError('validation', 'Platform fee must be between 0% and 30%.');
  if (!(input.defaultAgencyFeePct >= 0 && input.defaultAgencyFeePct <= 40)) throw new AppError('validation', 'Agency fee must be between 0% and 40%.');
  if (!(input.maxUploadMb >= 1 && input.maxUploadMb <= 500)) throw new AppError('validation', 'Upload limit must be between 1 and 500 MB.');
  mutate((d) => {
    Object.assign(d.settings, input);
    audit({ actorId: admin.id, actorEmail: admin.email, action: 'admin.fees_updated', severity: 'warning', detail: JSON.stringify(input) });
  });
}

export async function updatePlan(ctx: Ctx, planId: string, patch: Partial<Pick<Plan, 'name' | 'priceMonthly' | 'description' | 'features'>>) {
  await latency();
  const admin = requireAdmin(ctx);
  const d = getDb();
  const p = d.settings.plans.find((x) => x.id === planId);
  if (!p) throw notFound('Plan');
  if (patch.priceMonthly != null && !(patch.priceMonthly >= 0)) throw new AppError('validation', 'Price must be zero or more.');
  mutate(() => {
    if (patch.name) p.name = cleanLine(patch.name, 40);
    if (patch.priceMonthly !== undefined) p.priceMonthly = patch.priceMonthly;
    if (patch.description != null) p.description = cleanText(patch.description, 200);
    if (patch.features) p.features = patch.features.map((f) => cleanLine(f, 80)).filter(Boolean).slice(0, 10);
    audit({ actorId: admin.id, actorEmail: admin.email, action: 'admin.plan_updated', target: p.id, severity: 'warning' });
  });
}

export async function toggleCategory(ctx: Ctx, id: Category, enabled: boolean) {
  const admin = requireAdmin(ctx);
  mutate((d) => {
    const c = d.settings.categories.find((x) => x.id === id);
    if (c) c.enabled = enabled;
    audit({ actorId: admin.id, actorEmail: admin.email, action: 'admin.category_toggled', target: id, severity: 'info' });
  });
}

export async function auditLog(ctx: Ctx, severity?: 'info' | 'warning' | 'security') {
  await latency();
  requireAdmin(ctx);
  return getDb().audit.filter((a) => !severity || a.severity === severity).slice(0, 400);
}
