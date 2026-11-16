// Tandem domain model. Mirrors supabase/migrations/0001_init.sql so the
// in-browser demo backend and the production Postgres backend share one shape.

export type ID = string;
export type ISODate = string;

/** Where a number came from. Every metric in the UI carries one of these. */
export type DataSource = 'verified' | 'creator_submitted' | 'imported' | 'estimate' | 'manual';

export type Currency = 'NGN' | 'USD' | 'GBP' | 'EUR' | 'KES' | 'GHS' | 'ZAR';

export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'x' | 'linkedin' | 'snapchat' | 'twitch';
export type ContentFormat = 'short_video' | 'long_video' | 'static_post' | 'carousel' | 'story' | 'live' | 'ugc_asset' | 'blog';

export type Category =
  | 'beauty' | 'fashion' | 'lifestyle' | 'food' | 'fitness' | 'tech' | 'travel'
  | 'education' | 'entertainment' | 'parenting' | 'finance' | 'gaming';

// ---------------- Identity ----------------
export type PlatformRole = 'user' | 'admin';
export type AccountStatus = 'active' | 'suspended';
export type AccountKind = 'brand' | 'agency' | 'creator' | 'admin';

export interface User {
  id: ID;
  email: string;
  name: string;
  kind: AccountKind;
  platformRole: PlatformRole;
  status: AccountStatus;
  emailVerified: boolean;
  passwordHash: string;
  passwordSalt: string;
  mfaEnabled: boolean;
  createdAt: ISODate;
  lastLoginAt?: ISODate;
  onboarded: boolean;
  emailVerifyToken?: string;
  passwordResetToken?: string;
  passwordResetExpires?: number;
}

export interface Session {
  token: string;
  userId: ID;
  createdAt: ISODate;
  expiresAt: ISODate;
  revoked: boolean;
  userAgent?: string;
  /** Organisation the user is currently working in (brands/agencies). */
  activeOrgId?: ID;
}

export type OrgType = 'brand' | 'agency' | 'client';
export type OrgRole = 'owner' | 'admin' | 'manager' | 'member' | 'client_reviewer';

export interface Organization {
  id: ID;
  name: string;
  type: OrgType;
  /** Client workspaces belong to an agency. */
  parentOrgId?: ID;
  country: string;
  industry?: string;
  website?: string;
  description?: string;
  planId: string;
  agencyFeePct?: number;
  status: AccountStatus;
  createdAt: ISODate;
  products: Product[];
}

export interface Product {
  id: ID;
  name: string;
  description: string;
  priceHint?: string;
}

export interface Membership {
  id: ID;
  orgId: ID;
  userId: ID;
  role: OrgRole;
  createdAt: ISODate;
}

export interface TeamInvite {
  id: ID;
  orgId: ID;
  email: string;
  role: OrgRole;
  invitedBy: ID;
  createdAt: ISODate;
  status: 'pending' | 'accepted' | 'revoked';
}

// ---------------- Creators ----------------
export interface SocialAccount {
  id: ID;
  platform: Platform;
  handle: string;
  followers: number | null;
  engagementRate: number | null; // percent, e.g. 4.2
  source: DataSource;
  updatedAt: ISODate;
}

export interface AudienceProfile {
  female?: number | null; // percent
  male?: number | null;
  ageBands?: { band: string; pct: number }[];
  topCountries?: { country: string; pct: number }[];
  source: DataSource;
  updatedAt?: ISODate;
}

export interface RateCard {
  format: ContentFormat;
  platform: Platform;
  min: number;
  max: number;
  currency: Currency;
}

export interface PortfolioItem {
  id: ID;
  title: string;
  kind: 'image' | 'video' | 'link';
  url?: string; // external link
  fileRef?: ID; // stored file id
  caption?: string;
  brand?: string;
  createdAt: ISODate;
}

export interface CreatorVisibility {
  listed: boolean; // appears in discovery
  showLocation: boolean;
  showRates: boolean;
  showAudience: boolean;
  showCollabHistory: boolean;
}

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export interface CreatorProfile {
  id: ID;
  userId?: ID; // null for unclaimed sample profiles
  displayName: string;
  handle: string;
  bio: string;
  country: string;
  city?: string;
  languages: string[];
  categories: Category[];
  formats: ContentFormat[];
  socials: SocialAccount[];
  audience: AudienceProfile;
  rates: RateCard[];
  portfolio: PortfolioItem[];
  preferredCollabs: string[];
  availability: 'available' | 'limited' | 'unavailable';
  identityVerification: VerificationStatus;
  visibility: CreatorVisibility;
  avatarHue: number;
  avatarFileRef?: ID;
  sample: boolean; // fictional demo profile
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ---------------- Campaigns ----------------
export type CampaignStatus = 'draft' | 'published' | 'recruiting' | 'active' | 'paused' | 'under_review' | 'completed' | 'cancelled';
export type Objective = 'awareness' | 'launch' | 'engagement' | 'traffic' | 'leads' | 'sales' | 'app_downloads' | 'community' | 'event';
export type CompensationModel = 'fixed' | 'fixed_plus_bonus' | 'milestone' | 'negotiated' | 'gifting';

export interface DeliverableSpec {
  id: ID;
  platform: Platform;
  format: ContentFormat;
  quantity: number;
  notes?: string;
}

export interface TargetAudience {
  ageMin?: number;
  ageMax?: number;
  genders: ('female' | 'male' | 'all')[];
  interests: string[];
}

export interface Campaign {
  id: ID;
  orgId: ID;
  name: string;
  description: string;
  productId?: ID;
  objective: Objective;
  audience: TargetAudience;
  locations: string[];
  languages: string[];
  platforms: Platform[];
  categories: Category[];
  budget: number;
  currency: Currency;
  startDate: string;
  endDate: string;
  deliverables: DeliverableSpec[];
  requirements: string;
  guidelines: string;
  approval: { internal: boolean; client: boolean };
  compensationModel: CompensationModel;
  performanceTargets: string;
  visibility: 'public' | 'invite_only';
  status: CampaignStatus;
  createdBy: ID;
  createdAt: ISODate;
  updatedAt: ISODate;
  sample?: boolean;
}

export interface ActivityEntry {
  id: ID;
  orgId?: ID;
  campaignId?: ID;
  collaborationId?: ID;
  creatorId?: ID;
  actorId: ID;
  actorName: string;
  action: string;
  at: ISODate;
}

// ---------------- Deals ----------------
export interface Terms {
  fee: number;
  currency: Currency;
  bonus?: { amount: number; condition: string } | null;
  deliverables: DeliverableSpec[];
  deadline: string;
  usageRights: string;
  exclusivity: string;
  revisionLimit: number;
  milestones?: { label: string; pct: number }[];
  gifting?: string;
}

export interface Invitation {
  id: ID;
  campaignId: ID;
  orgId: ID;
  creatorId: ID;
  message: string;
  terms: Terms;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'countered';
  createdBy: ID;
  createdAt: ISODate;
  respondedAt?: ISODate;
}

export interface Application {
  id: ID;
  campaignId: ID;
  orgId: ID;
  creatorId: ID;
  pitch: string;
  proposedFee: number;
  currency: Currency;
  status: 'submitted' | 'shortlisted' | 'offered' | 'rejected' | 'withdrawn';
  createdAt: ISODate;
  reviewedAt?: ISODate;
}

export type OfferStatus = 'open' | 'accepted' | 'rejected' | 'superseded' | 'withdrawn';

export interface Offer {
  id: ID;
  campaignId: ID;
  orgId: ID;
  creatorId: ID;
  from: 'org' | 'creator';
  terms: Terms;
  message: string;
  status: OfferStatus;
  createdBy: ID;
  createdAt: ISODate;
  respondedAt?: ISODate;
}

export interface Message {
  id: ID;
  campaignId: ID;
  orgId: ID;
  creatorId: ID;
  from: 'org' | 'creator' | 'system';
  senderId?: ID;
  senderName: string;
  body: string;
  kind: 'message' | 'clarification' | 'system';
  createdAt: ISODate;
}

export interface Collaboration {
  id: ID;
  campaignId: ID;
  orgId: ID;
  creatorId: ID;
  offerId: ID;
  terms: Terms;
  status: 'active' | 'completed' | 'cancelled';
  createdAt: ISODate;
}

export type DeliverableStatus = 'not_started' | 'in_review' | 'awaiting_client' | 'revision_requested' | 'approved' | 'rejected';

export interface Deliverable {
  id: ID;
  collaborationId: ID;
  orgId: ID;
  creatorId: ID;
  title: string;
  platform: Platform;
  format: ContentFormat;
  dueDate: string;
  status: DeliverableStatus;
  revisionCount: number;
}

export interface StoredFile {
  id: ID;
  ownerUserId: ID;
  orgId?: ID;
  creatorId?: ID;
  name: string;
  type: string;
  size: number;
  /** Small images (≤ 1 MB) kept inline for preview when no storage is connected. */
  dataUrl?: string;
  /** Live mode: object path in the private `submissions` bucket (served via signed URLs). */
  storagePath?: string;
  visibility: 'private' | 'public';
  createdAt: ISODate;
}

export interface Submission {
  id: ID;
  deliverableId: ID;
  collaborationId: ID;
  orgId: ID;
  creatorId: ID;
  version: number;
  caption: string;
  links: string[];
  fileIds: ID[];
  note: string;
  status: 'in_review' | 'awaiting_client' | 'approved' | 'revision_requested' | 'rejected';
  submittedAt: ISODate;
  reviews: Review[];
}

export interface Review {
  id: ID;
  reviewerId: ID;
  reviewerName: string;
  stage: 'internal' | 'client';
  decision: 'approved' | 'revision_requested' | 'rejected' | 'comment';
  comment: string;
  at: ISODate;
}

// ---------------- Money ----------------
export type PaymentStatus = 'scheduled' | 'pending' | 'paid' | 'cancelled';

export interface PaymentRecord {
  id: ID;
  orgId: ID;
  campaignId: ID;
  collaborationId: ID;
  creatorId: ID;
  label: string;
  kind: 'base' | 'milestone' | 'bonus' | 'gifting';
  amount: number;
  currency: Currency;
  status: PaymentStatus;
  dueDate: string;
  paidAt?: ISODate;
  reference?: string;
  updatedBy?: ID;
}

export interface Plan {
  id: string;
  name: string;
  audience: 'brand' | 'agency' | 'creator';
  priceMonthly: number | null; // null = contact sales
  currency: Currency;
  description: string;
  features: string[];
  limits: { activeCampaigns: number | null; seats: number | null; clientWorkspaces: number | null; aiMatching: boolean; analytics: boolean; outreach: boolean };
}

// ---------------- Analytics ----------------
export interface ResultEntry {
  id: ID;
  orgId: ID;
  campaignId: ID;
  collaborationId?: ID;
  creatorId: ID;
  date: string;
  platform: Platform;
  reach: number | null;
  impressions: number | null;
  engagements: number | null;
  clicks: number | null;
  conversions: number | null;
  source: DataSource;
  note?: string;
  enteredBy: ID;
  createdAt: ISODate;
  sample?: boolean;
}

// ---------------- CRM / collections ----------------
export interface Collection {
  id: ID;
  orgId: ID;
  name: string;
  description?: string;
  creatorIds: ID[];
  sharedWithClients: boolean;
  createdBy: ID;
  createdAt: ISODate;
}

export type RelationshipStatus = 'prospect' | 'contacted' | 'negotiating' | 'active' | 'past' | 'do_not_contact';

export interface CrmRecord {
  id: ID;
  orgId: ID;
  creatorId: ID;
  status: RelationshipStatus;
  tags: string[];
  notes: { id: ID; text: string; authorName: string; at: ISODate }[];
  reminders: { id: ID; text: string; due: string; done: boolean }[];
  preferredContact?: string;
  updatedAt: ISODate;
}

// ---------------- Notifications / audit ----------------
export type NotificationType =
  | 'invitation' | 'application' | 'offer' | 'collaboration' | 'submission' | 'review' | 'revision'
  | 'deadline' | 'payment' | 'campaign' | 'team' | 'system' | 'verification';

export interface AppNotification {
  id: ID;
  userId: ID;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: ISODate;
  emailQueued: boolean;
}

export interface NotificationPrefs {
  userId: ID;
  inApp: Record<NotificationType, boolean>;
  email: Record<NotificationType, boolean>;
  digest: 'instant' | 'daily' | 'off';
}

export interface AuditEvent {
  id: ID;
  at: ISODate;
  actorId?: ID;
  actorEmail?: string;
  orgId?: ID;
  action: string;
  target?: string;
  severity: 'info' | 'warning' | 'security';
  detail?: string;
}

export interface VerificationRequest {
  id: ID;
  creatorId: ID;
  userId: ID;
  evidence: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: ISODate;
  decidedAt?: ISODate;
  decidedBy?: ID;
  note?: string;
}

export interface ModerationReport {
  id: ID;
  reporterId: ID;
  targetType: 'creator' | 'campaign' | 'organization' | 'submission';
  targetId: ID;
  reason: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: ISODate;
  resolution?: string;
}

export interface PlatformSettings {
  platformFeePct: number;
  defaultAgencyFeePct: number;
  categories: { id: Category; label: string; enabled: boolean }[];
  plans: Plan[];
  maxUploadMb: number;
  allowedUploadTypes: string[];
}

export interface Database {
  version: number;
  seededAt: ISODate;
  users: User[];
  sessions: Session[];
  loginAttempts: Record<string, { count: number; firstAt: number; lockedUntil?: number }>;
  organizations: Organization[];
  memberships: Membership[];
  teamInvites: TeamInvite[];
  creators: CreatorProfile[];
  campaigns: Campaign[];
  activity: ActivityEntry[];
  invitations: Invitation[];
  applications: Application[];
  offers: Offer[];
  messages: Message[];
  collaborations: Collaboration[];
  deliverables: Deliverable[];
  submissions: Submission[];
  files: StoredFile[];
  payments: PaymentRecord[];
  results: ResultEntry[];
  collections: Collection[];
  crm: CrmRecord[];
  notifications: AppNotification[];
  notificationPrefs: NotificationPrefs[];
  audit: AuditEvent[];
  verificationRequests: VerificationRequest[];
  reports: ModerationReport[];
  settings: PlatformSettings;
}
