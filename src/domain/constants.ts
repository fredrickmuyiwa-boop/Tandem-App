import type {
  CampaignStatus, Category, CompensationModel, ContentFormat, Currency, DataSource, DeliverableStatus,
  NotificationType, Objective, OrgRole, PaymentStatus, Plan, Platform, RelationshipStatus,
} from './types';

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'beauty', label: 'Beauty & skincare' },
  { id: 'fashion', label: 'Fashion' },
  { id: 'lifestyle', label: 'Lifestyle' },
  { id: 'food', label: 'Food & beverage' },
  { id: 'fitness', label: 'Fitness & wellness' },
  { id: 'tech', label: 'Technology' },
  { id: 'travel', label: 'Travel & hospitality' },
  { id: 'education', label: 'Education' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'parenting', label: 'Parenting' },
  { id: 'finance', label: 'Finance & business' },
  { id: 'gaming', label: 'Gaming' },
];
export const categoryLabel = (c: Category) => CATEGORIES.find((x) => x.id === c)?.label ?? c;

export const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'x', label: 'X' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'snapchat', label: 'Snapchat' },
  { id: 'twitch', label: 'Twitch' },
];
export const platformLabel = (p: Platform) => PLATFORMS.find((x) => x.id === p)?.label ?? p;

export const FORMATS: { id: ContentFormat; label: string }[] = [
  { id: 'short_video', label: 'Short video' },
  { id: 'long_video', label: 'Long-form video' },
  { id: 'static_post', label: 'Static post' },
  { id: 'carousel', label: 'Carousel' },
  { id: 'story', label: 'Story' },
  { id: 'live', label: 'Live stream' },
  { id: 'ugc_asset', label: 'UGC asset (no posting)' },
  { id: 'blog', label: 'Article / blog' },
];
export const formatLabel = (f: ContentFormat) => FORMATS.find((x) => x.id === f)?.label ?? f;

export const OBJECTIVES: { id: Objective; label: string; hint: string }[] = [
  { id: 'awareness', label: 'Brand awareness', hint: 'Reach new people who match your audience.' },
  { id: 'launch', label: 'Product launch', hint: 'Create a concentrated moment around something new.' },
  { id: 'engagement', label: 'Engagement', hint: 'Spark conversation, saves and shares.' },
  { id: 'traffic', label: 'Website traffic', hint: 'Drive clicks to a landing page.' },
  { id: 'leads', label: 'Lead generation', hint: 'Collect sign-ups or enquiries.' },
  { id: 'sales', label: 'Sales', hint: 'Drive purchases with codes or links.' },
  { id: 'app_downloads', label: 'App downloads', hint: 'Drive installs.' },
  { id: 'community', label: 'Community growth', hint: 'Grow followers or members.' },
  { id: 'event', label: 'Event promotion', hint: 'Drive attendance or registrations.' },
];
export const objectiveLabel = (o: Objective) => OBJECTIVES.find((x) => x.id === o)?.label ?? o;

export const COMPENSATION: { id: CompensationModel; label: string; hint: string }[] = [
  { id: 'fixed', label: 'Fixed fee', hint: 'One agreed payment for the deliverables.' },
  { id: 'fixed_plus_bonus', label: 'Fixed fee + performance bonus', hint: 'Guaranteed base plus an optional bonus. Recommended.' },
  { id: 'milestone', label: 'Milestone payments', hint: 'Paid in stages, e.g. on approval and on posting.' },
  { id: 'negotiated', label: 'Negotiated per creator', hint: 'Each creator proposes and agrees a fee.' },
  { id: 'gifting', label: 'Product gifting', hint: 'Product only. Use only where creators opt in.' },
];
export const compensationLabel = (c: CompensationModel) => COMPENSATION.find((x) => x.id === c)?.label ?? c;

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  published: { label: 'Published', tone: 'accent' },
  recruiting: { label: 'Recruiting', tone: 'accent' },
  active: { label: 'Active', tone: 'success' },
  paused: { label: 'Paused', tone: 'warning' },
  under_review: { label: 'Under review', tone: 'warning' },
  completed: { label: 'Completed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

/** Allowed lifecycle transitions — enforced in the campaign service. */
export const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ['published', 'recruiting', 'cancelled'],
  published: ['recruiting', 'active', 'paused', 'cancelled'],
  recruiting: ['active', 'paused', 'cancelled'],
  active: ['paused', 'under_review', 'completed', 'cancelled'],
  paused: ['recruiting', 'active', 'cancelled'],
  under_review: ['active', 'completed'],
  completed: [],
  cancelled: [],
};

/** Fields editable per status. Once live, commercial terms are locked. */
export const EDITABLE_WHEN: Record<'all' | 'brief' | 'none', CampaignStatus[]> = {
  all: ['draft'],
  brief: ['published', 'recruiting', 'paused'],
  none: ['active', 'under_review', 'completed', 'cancelled'],
};

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export const DELIVERABLE_STATUS: Record<DeliverableStatus, { label: string; tone: Tone }> = {
  not_started: { label: 'Not started', tone: 'neutral' },
  in_review: { label: 'In review', tone: 'accent' },
  awaiting_client: { label: 'Awaiting client', tone: 'warning' },
  revision_requested: { label: 'Revision requested', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: Tone }> = {
  scheduled: { label: 'Scheduled', tone: 'neutral' },
  pending: { label: 'Pending', tone: 'warning' },
  paid: { label: 'Paid (recorded)', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

export const RELATIONSHIP: Record<RelationshipStatus, { label: string; tone: Tone }> = {
  prospect: { label: 'Prospect', tone: 'neutral' },
  contacted: { label: 'Contacted', tone: 'accent' },
  negotiating: { label: 'Negotiating', tone: 'warning' },
  active: { label: 'Active partner', tone: 'success' },
  past: { label: 'Past partner', tone: 'neutral' },
  do_not_contact: { label: 'Do not contact', tone: 'danger' },
};

export const SOURCE_META: Record<DataSource, { label: string; short: string; description: string }> = {
  verified: { label: 'Verified', short: 'Verified', description: 'Pulled from an authorised platform connection.' },
  creator_submitted: { label: 'Creator-submitted', short: 'Self-reported', description: 'Entered by the creator. Not independently verified.' },
  imported: { label: 'Third-party import', short: 'Imported', description: 'Imported from a third-party tool or file.' },
  estimate: { label: 'AI / calculated estimate', short: 'Estimate', description: 'Calculated by Tandem from other data. Treat as indicative.' },
  manual: { label: 'Manually submitted', short: 'Manual', description: 'Entered by your team from screenshots or reports.' },
};

export const ROLE_META: Record<OrgRole, { label: string; description: string }> = {
  owner: { label: 'Owner', description: 'Full control, including billing and deleting the workspace.' },
  admin: { label: 'Admin', description: 'Manage team, settings, campaigns and money.' },
  manager: { label: 'Campaign manager', description: 'Run campaigns: invite, negotiate, approve, record payments.' },
  member: { label: 'Member', description: 'Discover creators, build lists and draft. Cannot send offers or approve.' },
  client_reviewer: { label: 'Client reviewer', description: 'Agency clients: view campaigns and approve deliverables.' },
};

export const NOTIFICATION_TYPES: { id: NotificationType; label: string }[] = [
  { id: 'invitation', label: 'Campaign invitations' },
  { id: 'application', label: 'New applications' },
  { id: 'offer', label: 'Offers and counteroffers' },
  { id: 'collaboration', label: 'Collaboration updates' },
  { id: 'submission', label: 'Content submissions' },
  { id: 'review', label: 'Approvals' },
  { id: 'revision', label: 'Revision requests' },
  { id: 'deadline', label: 'Deadline reminders' },
  { id: 'payment', label: 'Payment status' },
  { id: 'campaign', label: 'Campaign updates' },
  { id: 'team', label: 'Team changes' },
  { id: 'verification', label: 'Verification' },
  { id: 'system', label: 'Account & security' },
];

export const CURRENCIES: Currency[] = ['NGN', 'USD', 'GBP', 'EUR', 'KES', 'GHS', 'ZAR'];

/**
 * Static reference rates used ONLY to compare budgets with rate cards in
 * different currencies. Shown in the UI as an estimate. Replace with a
 * live FX source in production.
 */
export const DEMO_FX_TO_USD: Record<Currency, number> = {
  USD: 1,
  NGN: 1 / 1550,
  GBP: 1.27,
  EUR: 1.08,
  KES: 1 / 129,
  GHS: 1 / 15.5,
  ZAR: 1 / 18.2,
};

export const COUNTRIES = [
  'Nigeria', 'Ghana', 'Kenya', 'South Africa', 'Egypt', 'United Kingdom', 'United States',
  'Canada', 'France', 'Germany', 'United Arab Emirates', 'India', 'Brazil',
];

export const LANGUAGES = ['English', 'Yoruba', 'Igbo', 'Hausa', 'Pidgin', 'Swahili', 'French', 'Arabic', 'Portuguese', 'Zulu', 'Twi', 'Spanish', 'German', 'Hindi'];

export const DEFAULT_PLANS: Plan[] = [
  {
    id: 'brand_starter', name: 'Starter', audience: 'brand', priceMonthly: 49, currency: 'USD',
    description: 'For brands running their first creator campaigns.',
    features: ['Creator discovery with core filters', 'Up to 2 active campaigns', 'Collaboration workspace', 'Content approvals'],
    limits: { activeCampaigns: 2, seats: 2, clientWorkspaces: 0, aiMatching: false, analytics: false, outreach: false },
  },
  {
    id: 'brand_growth', name: 'Growth', audience: 'brand', priceMonthly: 249, currency: 'USD',
    description: 'For teams running creator marketing every month.',
    features: ['Advanced discovery filters', 'Explainable AI matching', 'AI campaign strategist', 'Outreach & negotiation', 'Campaign analytics', 'Up to 10 active campaigns'],
    limits: { activeCampaigns: 10, seats: 8, clientWorkspaces: 0, aiMatching: true, analytics: true, outreach: true },
  },
  {
    id: 'brand_enterprise', name: 'Enterprise', audience: 'brand', priceMonthly: null, currency: 'USD',
    description: 'For multi-brand organisations with advanced controls.',
    features: ['Everything in Growth', 'Multiple workspaces', 'Advanced permissions', 'Advanced reporting', 'Custom integrations', 'Higher limits'],
    limits: { activeCampaigns: null, seats: null, clientWorkspaces: null, aiMatching: true, analytics: true, outreach: true },
  },
  {
    id: 'agency_studio', name: 'Agency', audience: 'agency', priceMonthly: 399, currency: 'USD',
    description: 'For agencies managing creator programmes for clients.',
    features: ['Up to 10 client workspaces', 'Shared creator database', 'Client approval workflows', 'Client reporting', 'Agency-wide analytics', 'AI matching & strategist'],
    limits: { activeCampaigns: 40, seats: 15, clientWorkspaces: 10, aiMatching: true, analytics: true, outreach: true },
  },
  {
    id: 'creator_free', name: 'Creator', audience: 'creator', priceMonthly: 0, currency: 'USD',
    description: 'Free for creators. Always.',
    features: ['Professional profile', 'Opportunities and invitations', 'Negotiation and collaboration tools', 'Earnings tracking'],
    limits: { activeCampaigns: null, seats: 1, clientWorkspaces: 0, aiMatching: false, analytics: false, outreach: false },
  },
];

export const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'application/pdf'];
export const INLINE_IMAGE_LIMIT = 1024 * 1024; // demo storage keeps images ≤ 1 MB
