import type {
  Category, ContentFormat, CreatorProfile, CreatorVisibility, Currency, DataSource, Platform, PortfolioItem, RateCard, SocialAccount, StoredFile,
} from '../../domain/types';
import { getDb, mutate } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import { latency } from '../config';
import { accessibleOrgIds, requireCreator, requireOrg, requireUser, type Ctx } from '../access';
import { cleanLine, cleanText, safeUrl } from '../../lib/sanitize';
import { nowIso, uid } from '../../lib/utils';
import { avgEngagement, minRate, totalFollowers } from '../../domain/creatorStats';
import { INLINE_IMAGE_LIMIT, PLATFORMS } from '../../domain/constants';
import { adminRecipients, notify } from '../notify';

/** What a brand or agency user is allowed to see about a creator. */
export type CreatorView = Omit<CreatorProfile, 'userId' | 'rates' | 'audience' | 'city' | 'portfolio'> & {
  rates: RateCard[] | null;
  audience: CreatorProfile['audience'] | null;
  city?: string;
  claimed: boolean;
  avatarUrl?: string;
  portfolio: (PortfolioItem & { previewUrl?: string })[];
};

function fileUrl(id?: string): string | undefined {
  if (!id) return undefined;
  return getDb().files.find((f) => f.id === id)?.dataUrl;
}

/** Apply the creator's privacy choices. This runs on the "server" for every org read. */
export function toView(c: CreatorProfile, relationship = false): CreatorView {
  const v = c.visibility;
  const { userId, rates, audience, city, ...rest } = c;
  return {
    ...rest,
    claimed: !!userId,
    rates: v.showRates ? rates : null,
    audience: v.showAudience ? audience : null,
    country: v.showLocation || relationship ? c.country : 'Location hidden',
    city: v.showLocation ? city : undefined,
    avatarUrl: fileUrl(c.avatarFileRef),
    portfolio: c.portfolio.map((p) => ({ ...p, previewUrl: fileUrl(p.fileRef) })),
  };
}

/** Creators an org has a working relationship with may be shown even if unlisted. */
function relatedCreatorIds(orgIds: string[]): Set<string> {
  const d = getDb();
  const ids = new Set<string>();
  for (const x of [...d.invitations, ...d.applications, ...d.collaborations]) if (orgIds.includes(x.orgId)) ids.add(x.creatorId);
  return ids;
}

export interface DiscoveryQuery {
  q?: string;
  categories?: Category[];
  platforms?: Platform[];
  countries?: string[];
  languages?: string[];
  formats?: ContentFormat[];
  followersMin?: number;
  followersMax?: number;
  engagementMin?: number;
  rateMax?: number;
  currency?: Currency;
  availability?: CreatorProfile['availability'][];
  identityVerified?: boolean;
  sources?: DataSource[];
  audienceFemaleMin?: number;
  sort?: 'relevance' | 'followers_desc' | 'followers_asc' | 'engagement_desc' | 'rate_asc' | 'newest';
  page?: number;
  pageSize?: number;
}

export async function discover(ctx: Ctx, orgId: string, q: DiscoveryQuery) {
  await latency();
  requireOrg(ctx, orgId, 'discover');
  const d = getDb();
  const term = cleanLine(q.q, 100).toLowerCase();
  const cur = q.currency ?? 'USD';
  let list = d.creators.filter((c) => c.visibility.listed);
  if (term) list = list.filter((c) => `${c.displayName} ${c.handle} ${c.bio} ${c.city ?? ''} ${c.country} ${c.categories.join(' ')}`.toLowerCase().includes(term));
  if (q.categories?.length) list = list.filter((c) => c.categories.some((x) => q.categories!.includes(x)));
  if (q.platforms?.length) list = list.filter((c) => c.socials.some((s) => q.platforms!.includes(s.platform)));
  if (q.countries?.length) list = list.filter((c) => c.visibility.showLocation && (q.countries!.includes(c.country) || c.audience.topCountries?.some((t) => q.countries!.includes(t.country) && t.pct >= 25)));
  if (q.languages?.length) list = list.filter((c) => c.languages.some((l) => q.languages!.includes(l)));
  if (q.formats?.length) list = list.filter((c) => c.formats.some((f) => q.formats!.includes(f)));
  if (q.followersMin != null) list = list.filter((c) => (totalFollowers(c) ?? -1) >= q.followersMin!);
  if (q.followersMax != null) list = list.filter((c) => { const f = totalFollowers(c); return f != null && f <= q.followersMax!; });
  if (q.engagementMin != null) list = list.filter((c) => (avgEngagement(c) ?? -1) >= q.engagementMin!);
  if (q.rateMax != null) list = list.filter((c) => { if (!c.visibility.showRates) return false; const r = minRate(c, cur); return r != null && r <= q.rateMax!; });
  if (q.availability?.length) list = list.filter((c) => q.availability!.includes(c.availability));
  if (q.identityVerified) list = list.filter((c) => c.identityVerification === 'verified');
  if (q.sources?.length) list = list.filter((c) => c.socials.some((s) => q.sources!.includes(s.source)));
  if (q.audienceFemaleMin != null) list = list.filter((c) => c.visibility.showAudience && (c.audience.female ?? -1) >= q.audienceFemaleMin!);

  const sorters: Record<string, (a: CreatorProfile, b: CreatorProfile) => number> = {
    relevance: (a, b) => Number(b.availability === 'available') - Number(a.availability === 'available') || (avgEngagement(b) ?? 0) - (avgEngagement(a) ?? 0),
    followers_desc: (a, b) => (totalFollowers(b) ?? -1) - (totalFollowers(a) ?? -1),
    followers_asc: (a, b) => (totalFollowers(a) ?? Infinity) - (totalFollowers(b) ?? Infinity),
    engagement_desc: (a, b) => (avgEngagement(b) ?? -1) - (avgEngagement(a) ?? -1),
    rate_asc: (a, b) => (minRate(a, cur) ?? Infinity) - (minRate(b, cur) ?? Infinity),
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  };
  list = [...list].sort(sorters[q.sort ?? 'relevance']);
  const pageSize = Math.min(Math.max(q.pageSize ?? 12, 1), 48);
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(q.page ?? 1, 1), pages);
  const items = list.slice((page - 1) * pageSize, page * pageSize).map((c) => toView(c));
  return { items, total, page, pages, pageSize };
}

export async function getCreatorForOrg(ctx: Ctx, orgId: string, creatorId: string) {
  await latency();
  requireOrg(ctx, orgId, 'org.view');
  const d = getDb();
  const c = d.creators.find((x) => x.id === creatorId);
  const related = relatedCreatorIds([orgId]).has(creatorId);
  if (!c || (!c.visibility.listed && !related)) throw notFound('Creator');
  const history = c.visibility.showCollabHistory
    ? d.collaborations.filter((x) => x.creatorId === c.id && x.status === 'completed').map((x) => {
        const camp = d.campaigns.find((k) => k.id === x.campaignId);
        const org = d.organizations.find((o) => o.id === x.orgId);
        return { id: x.id, brand: org?.type === 'client' ? org.name : org?.name ?? 'Brand', campaign: camp?.name ?? 'Campaign', completedAt: camp?.endDate };
      })
    : null;
  return { creator: toView(c, related), history };
}

/** Bulk lookup for UI lists (collections, compare). Silently drops ones the org can't see. */
export async function getCreatorsForOrg(ctx: Ctx, orgId: string, ids: string[]) {
  requireOrg(ctx, orgId, 'org.view');
  const d = getDb();
  const related = relatedCreatorIds([orgId]);
  return ids
    .map((id) => d.creators.find((c) => c.id === id))
    .filter((c): c is CreatorProfile => !!c && (c.visibility.listed || related.has(c.id)))
    .map((c) => toView(c, related.has(c.id)));
}

// ---------------- Creator self-service ----------------
export async function myProfile(ctx: Ctx) {
  const { creator } = requireCreator(ctx);
  return { creator, avatarUrl: fileUrl(creator.avatarFileRef), portfolioUrls: Object.fromEntries(creator.portfolio.map((p) => [p.id, fileUrl(p.fileRef)])) };
}

export async function updateMyProfile(ctx: Ctx, patch: Partial<Pick<CreatorProfile, 'displayName' | 'bio' | 'country' | 'city' | 'languages' | 'categories' | 'formats' | 'preferredCollabs' | 'availability'>> & { visibility?: Partial<CreatorVisibility> }) {
  await latency();
  const { user, creator } = requireCreator(ctx);
  if (patch.displayName != null && !cleanLine(patch.displayName)) throw new AppError('validation', 'Display name is required.', { displayName: 'Display name is required.' });
  if (patch.categories && (!patch.categories.length || patch.categories.length > 5)) throw new AppError('validation', 'Choose between 1 and 5 categories.', { categories: 'Choose between 1 and 5 categories.' });
  return mutate(() => {
    if (patch.displayName != null) creator.displayName = cleanLine(patch.displayName, 80);
    if (patch.bio != null) creator.bio = cleanText(patch.bio, 1200);
    if (patch.country) creator.country = cleanLine(patch.country, 60);
    if (patch.city != null) creator.city = cleanLine(patch.city, 60) || undefined;
    if (patch.languages) creator.languages = patch.languages.slice(0, 8).map((l) => cleanLine(l, 30));
    if (patch.categories) creator.categories = patch.categories;
    if (patch.formats) creator.formats = patch.formats;
    if (patch.preferredCollabs) creator.preferredCollabs = patch.preferredCollabs.slice(0, 10).map((x) => cleanLine(x, 60)).filter(Boolean);
    if (patch.availability) creator.availability = patch.availability;
    if (patch.visibility) creator.visibility = { ...creator.visibility, ...patch.visibility };
    creator.updatedAt = nowIso();
    audit({ actorId: user.id, actorEmail: user.email, action: 'creator.profile_updated', severity: 'info' });
    return creator;
  });
}

export async function saveSocial(ctx: Ctx, input: { id?: string; platform: Platform; handle: string; followers: number | null; engagementRate: number | null }) {
  await latency();
  const { creator } = requireCreator(ctx);
  if (!PLATFORMS.some((p) => p.id === input.platform)) throw new AppError('validation', 'Choose a platform.');
  const handle = cleanLine(input.handle, 60).replace(/^@/, '');
  if (!handle) throw new AppError('validation', 'Enter your handle.', { handle: 'Enter your handle.' });
  if (input.followers != null && (input.followers < 0 || input.followers > 1e9)) throw new AppError('validation', 'Enter a realistic follower count.', { followers: 'Enter a realistic follower count.' });
  if (input.engagementRate != null && (input.engagementRate < 0 || input.engagementRate > 100)) throw new AppError('validation', 'Engagement rate is a percentage between 0 and 100.', { engagementRate: 'Use a percentage between 0 and 100.' });
  return mutate(() => {
    const existing = input.id ? creator.socials.find((s) => s.id === input.id) : undefined;
    // Any figure a creator types is creator-submitted, even if it replaces verified data.
    const record: SocialAccount = { id: existing?.id ?? uid('soc'), platform: input.platform, handle, followers: input.followers, engagementRate: input.engagementRate, source: 'creator_submitted', updatedAt: nowIso() };
    if (existing) Object.assign(existing, record);
    else creator.socials.push(record);
    creator.updatedAt = nowIso();
    return record;
  });
}

export async function removeSocial(ctx: Ctx, id: string) {
  const { creator } = requireCreator(ctx);
  mutate(() => { creator.socials = creator.socials.filter((s) => s.id !== id); });
}

export async function saveAudience(ctx: Ctx, input: { female: number | null; male: number | null; ageBands: { band: string; pct: number }[]; topCountries: { country: string; pct: number }[] }) {
  await latency();
  const { creator } = requireCreator(ctx);
  const bad = (n: number | null) => n != null && (n < 0 || n > 100);
  if (bad(input.female) || bad(input.male) || ((input.female ?? 0) + (input.male ?? 0) > 100)) throw new AppError('validation', 'Gender split must be percentages that add up to 100 or less.');
  if (input.ageBands.some((a) => bad(a.pct)) || input.topCountries.some((t) => bad(t.pct))) throw new AppError('validation', 'Percentages must be between 0 and 100.');
  return mutate(() => {
    creator.audience = {
      female: input.female, male: input.male,
      ageBands: input.ageBands.filter((a) => a.pct > 0).slice(0, 6),
      topCountries: input.topCountries.filter((t) => t.country && t.pct > 0).slice(0, 5).map((t) => ({ country: cleanLine(t.country, 60), pct: t.pct })),
      source: 'creator_submitted', updatedAt: nowIso(),
    };
    creator.updatedAt = nowIso();
    return creator.audience;
  });
}

export async function saveRates(ctx: Ctx, rates: RateCard[]) {
  await latency();
  const { creator } = requireCreator(ctx);
  for (const r of rates) if (!(r.min >= 0) || !(r.max >= r.min)) throw new AppError('validation', 'Each rate needs a minimum and a maximum that is at least the minimum.');
  return mutate(() => {
    creator.rates = rates.slice(0, 12);
    creator.updatedAt = nowIso();
    return creator.rates;
  });
}

// ---------------- Files ----------------
export function validateUpload(file: { name: string; type: string; size: number }) {
  const d = getDb();
  if (!d.settings.allowedUploadTypes.includes(file.type)) throw new AppError('validation', `“${file.name}” isn’t an allowed file type. Use JPG, PNG, WebP, MP4, MOV or PDF.`);
  if (file.size > d.settings.maxUploadMb * 1024 * 1024) throw new AppError('validation', `“${file.name}” is larger than ${d.settings.maxUploadMb} MB.`);
}

/** Store an upload. Demo keeps small images inline; everything else as metadata only. */
export async function storeFile(ctx: Ctx, file: { name: string; type: string; size: number; dataUrl?: string }, scope: { orgId?: string; creatorId?: string; visibility: 'private' | 'public' }) {
  const user = requireUser(ctx);
  validateUpload(file);
  const inline = file.type.startsWith('image/') && file.size <= INLINE_IMAGE_LIMIT && file.dataUrl?.startsWith('data:image/') ? file.dataUrl : undefined;
  return mutate((d) => {
    const rec: StoredFile = { id: uid('file'), ownerUserId: user.id, orgId: scope.orgId, creatorId: scope.creatorId, name: cleanLine(file.name, 120), type: file.type, size: file.size, dataUrl: inline, visibility: scope.visibility, createdAt: nowIso() };
    d.files.push(rec);
    return rec;
  });
}

export async function addPortfolioItem(ctx: Ctx, input: { title: string; kind: PortfolioItem['kind']; url?: string; caption?: string; brand?: string; file?: { name: string; type: string; size: number; dataUrl?: string } }) {
  await latency();
  const { creator } = requireCreator(ctx);
  const title = cleanLine(input.title, 100);
  if (!title) throw new AppError('validation', 'Give the sample a title.', { title: 'Give the sample a title.' });
  if (creator.portfolio.length >= 12) throw new AppError('conflict', 'You can show up to 12 portfolio samples.');
  let url: string | undefined;
  if (input.kind === 'link') {
    url = safeUrl(input.url) ?? undefined;
    if (!url) throw new AppError('validation', 'Enter a valid link starting with https://', { url: 'Enter a valid link.' });
  }
  const stored = input.file ? await storeFile(ctx, input.file, { creatorId: creator.id, visibility: 'public' }) : undefined;
  return mutate(() => {
    const item: PortfolioItem = { id: uid('pf'), title, kind: input.kind, url, fileRef: stored?.id, caption: cleanText(input.caption, 300) || undefined, brand: cleanLine(input.brand, 60) || undefined, createdAt: nowIso() };
    creator.portfolio.unshift(item);
    creator.updatedAt = nowIso();
    return item;
  });
}

export async function removePortfolioItem(ctx: Ctx, id: string) {
  const { creator } = requireCreator(ctx);
  mutate((d) => {
    const item = creator.portfolio.find((p) => p.id === id);
    creator.portfolio = creator.portfolio.filter((p) => p.id !== id);
    if (item?.fileRef) d.files = d.files.filter((f) => f.id !== item.fileRef);
  });
}

export async function setAvatar(ctx: Ctx, file: { name: string; type: string; size: number; dataUrl?: string }) {
  await latency();
  const { creator } = requireCreator(ctx);
  if (!file.type.startsWith('image/')) throw new AppError('validation', 'Profile photos must be JPG, PNG or WebP images.');
  if (file.size > INLINE_IMAGE_LIMIT) throw new AppError('validation', 'In Demo mode, profile photos must be 1 MB or smaller.');
  const stored = await storeFile(ctx, file, { creatorId: creator.id, visibility: 'public' });
  mutate((d) => {
    if (creator.avatarFileRef) d.files = d.files.filter((f) => f.id !== creator.avatarFileRef);
    creator.avatarFileRef = stored.id;
  });
}

/** Signed-URL equivalent: returns file content only to people allowed to see it. */
export function readFile(ctx: Ctx, fileId: string): StoredFile {
  const user = requireUser(ctx);
  const d = getDb();
  const f = d.files.find((x) => x.id === fileId);
  if (!f) throw notFound('File');
  if (f.visibility === 'public' || f.ownerUserId === user.id || user.platformRole === 'admin') return f;
  const orgOk = f.orgId && accessibleOrgIds(user.id, d).includes(f.orgId);
  const creatorOk = f.creatorId && d.creators.find((c) => c.id === f.creatorId)?.userId === user.id;
  if (!orgOk && !creatorOk) {
    audit({ actorId: user.id, actorEmail: user.email, action: 'file.access_denied', target: fileId, severity: 'security' });
    throw forbidden('You don’t have access to this file.');
  }
  return f;
}

// ---------------- Verification & reports ----------------
export async function requestVerification(ctx: Ctx, evidence: string) {
  await latency();
  const { user, creator } = requireCreator(ctx);
  const text = cleanText(evidence, 800);
  if (text.length < 20) throw new AppError('validation', 'Tell us how we can confirm it’s you (at least 20 characters).', { evidence: 'Add more detail.' });
  const d = getDb();
  if (d.verificationRequests.some((v) => v.creatorId === creator.id && v.status === 'pending')) throw new AppError('conflict', 'You already have a verification request under review.');
  return mutate((db) => {
    creator.identityVerification = 'pending';
    db.verificationRequests.unshift({ id: uid('ver'), creatorId: creator.id, userId: user.id, evidence: text, status: 'pending', createdAt: nowIso() });
    notify(db, adminRecipients(db), 'verification', 'New verification request', `${creator.displayName} (@${creator.handle}) asked to be verified.`, '/admin/verification');
  });
}

export async function reportContent(ctx: Ctx, input: { targetType: 'creator' | 'campaign' | 'organization' | 'submission'; targetId: string; reason: string }) {
  await latency();
  const user = requireUser(ctx);
  const reason = cleanText(input.reason, 800);
  if (reason.length < 10) throw new AppError('validation', 'Describe the problem (at least 10 characters).', { reason: 'Add more detail.' });
  const d = getDb();
  const recent = d.reports.filter((r) => r.reporterId === user.id && Date.now() - new Date(r.createdAt).getTime() < 3_600_000).length;
  if (recent >= 5) throw new AppError('rate_limited', 'You’ve sent several reports recently. Our team will review them before you send more.');
  return mutate((db) => {
    db.reports.unshift({ id: uid('rep'), reporterId: user.id, targetType: input.targetType, targetId: input.targetId, reason, status: 'open', createdAt: nowIso() });
    audit({ actorId: user.id, actorEmail: user.email, action: 'moderation.reported', target: `${input.targetType}:${input.targetId}`, severity: 'warning' });
  });
}

export function assertCreatorOwns(ctx: Ctx, creatorId: string) {
  const { creator } = requireCreator(ctx);
  if (creator.id !== creatorId) throw forbidden();
  return creator;
}
