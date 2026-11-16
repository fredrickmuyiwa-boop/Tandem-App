-- Tandem — initial schema for Supabase (Postgres 15+).
--
-- Mirrors the domain model in src/domain/types.ts and the permission matrix in
-- src/server/access.ts. Every table has Row Level Security enabled; nothing is
-- readable or writable by `anon`. Privileged checks run in SECURITY DEFINER
-- helpers with a pinned search_path.
--
-- Payments are TRACKING ONLY: no balances, wallets or escrow live here.
-- The service-role key bypasses RLS; use it only in server code, never in the browser.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null check (kind in ('brand', 'agency', 'creator', 'admin')),
  platform_role text not null default 'user' check (platform_role in ('user', 'admin')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  notification_prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  type text not null check (type in ('brand', 'agency', 'client')),
  parent_org_id uuid references public.organizations (id) on delete cascade,
  country text not null,
  industry text,
  website text check (website is null or website ~* '^https?://'),
  description text check (description is null or char_length(description) <= 2000),
  plan_id text not null default 'brand_starter',
  agency_fee_pct numeric(5, 2) check (agency_fee_pct is null or agency_fee_pct between 0 and 40),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Client workspaces always belong to an agency; other orgs never have a parent.
  constraint client_has_parent check ((type = 'client') = (parent_org_id is not null))
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  price_hint text,
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'manager', 'member', 'client_reviewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null check (role in ('admin', 'manager', 'member', 'client_reviewer')),
  invited_by uuid references public.profiles (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

-- ---------------------------------------------------------------------------
-- Creators
-- ---------------------------------------------------------------------------
create table public.creator_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  handle text not null unique check (handle ~ '^[a-z0-9_.]{2,30}$'),
  bio text not null default '' check (char_length(bio) <= 1000),
  country text not null,
  city text,                                      -- private unless visibility.show_city
  languages text[] not null default '{}',
  categories text[] not null default '{}',
  formats text[] not null default '{}',
  audience jsonb,                                 -- private unless visibility.show_audience; carries its own `source`
  rates jsonb,                                    -- private unless visibility.show_rates
  portfolio jsonb not null default '[]'::jsonb,
  preferred_collabs text[] not null default '{}',
  availability text not null default 'available' check (availability in ('available', 'limited', 'unavailable')),
  identity_verification text not null default 'unverified' check (identity_verification in ('unverified', 'pending', 'verified', 'rejected')),
  visibility jsonb not null default '{"listed": true, "show_rates": false, "show_audience": true, "show_city": false}'::jsonb,
  avatar_path text,
  sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  platform text not null check (platform in ('instagram', 'tiktok', 'youtube', 'x', 'linkedin', 'snapchat', 'twitch')),
  handle text not null,
  url text check (url is null or url ~* '^https://'),
  followers integer check (followers is null or followers >= 0),
  engagement_rate numeric(5, 2) check (engagement_rate is null or engagement_rate between 0 and 100),
  avg_views integer check (avg_views is null or avg_views >= 0),
  -- Where the numbers came from. Only a verified platform connection may set 'verified'.
  source text not null default 'creator_submitted' check (source in ('verified', 'creator_submitted', 'imported', 'estimate', 'manual')),
  updated_at timestamptz not null default now(),
  unique (creator_id, platform)
);

-- ---------------------------------------------------------------------------
-- Campaigns
-- ---------------------------------------------------------------------------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 3 and 120),
  description text not null default '' check (char_length(description) <= 5000),
  product_id uuid references public.products (id) on delete set null,
  objective text not null check (objective in ('awareness', 'launch', 'engagement', 'traffic', 'leads', 'sales', 'app_downloads', 'community', 'event')),
  audience jsonb not null default '{}'::jsonb,
  locations text[] not null default '{}',
  languages text[] not null default '{}',
  categories text[] not null default '{}',
  platforms text[] not null default '{}',
  deliverables jsonb not null default '[]'::jsonb,
  budget numeric(14, 2) not null check (budget >= 0),
  currency text not null check (currency in ('NGN', 'USD', 'GBP', 'EUR', 'KES', 'GHS', 'ZAR')),
  compensation_model text not null check (compensation_model in ('fixed', 'fixed_plus_bonus', 'milestone', 'negotiated', 'gifting')),
  fee_guide text,
  start_date date not null,
  end_date date not null,
  requirements text,
  guidelines text,
  performance_targets text,
  approval jsonb not null default '{"internal": true, "client": false}'::jsonb,
  visibility text not null default 'public' check (visibility in ('public', 'invite_only')),
  status text not null default 'draft' check (status in ('draft', 'published', 'recruiting', 'active', 'paused', 'under_review', 'completed', 'cancelled')),
  sample boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_dates check (end_date >= start_date)
);

create table public.campaign_activity (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete cascade,
  creator_id uuid references public.creator_profiles (id) on delete set null,
  collaboration_id uuid,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text not null,
  action text not null,
  at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Outreach & negotiation
-- ---------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  message text not null check (char_length(message) <= 4000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  sent_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (campaign_id, creator_id)
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  pitch text not null check (char_length(pitch) between 20 and 2000),
  proposed_fee numeric(14, 2) not null check (proposed_fee >= 0),
  currency text not null,
  status text not null default 'submitted' check (status in ('submitted', 'shortlisted', 'rejected', 'withdrawn', 'offered')),
  created_at timestamptz not null default now(),
  unique (campaign_id, creator_id)
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  from_side text not null check (from_side in ('org', 'creator')),
  terms jsonb not null,  -- fee, currency, deliverables, deadline, revision_limit, usage_rights, exclusivity, bonus, schedule
  message text,
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected', 'superseded', 'withdrawn')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint offer_fee_nonnegative check ((terms ->> 'fee')::numeric >= 0)
);
-- At most one open offer per conversation.
create unique index offers_one_open on public.offers (campaign_id, creator_id) where status = 'open';

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  from_side text not null check (from_side in ('org', 'creator', 'system')),
  author_id uuid references public.profiles (id) on delete set null,
  author_name text not null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Collaborations, deliverables, content
-- ---------------------------------------------------------------------------
create table public.collaborations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  creator_id uuid not null references public.creator_profiles (id) on delete restrict,
  offer_id uuid not null references public.offers (id) on delete restrict,
  terms jsonb not null,   -- frozen copy of the accepted offer terms
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (campaign_id, creator_id)
);

create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  collaboration_id uuid not null references public.collaborations (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  title text not null,
  platform text not null,
  format text not null,
  due_date date not null,
  status text not null default 'not_started' check (status in ('not_started', 'in_review', 'awaiting_client', 'revision_requested', 'approved', 'rejected')),
  revision_count integer not null default 0 check (revision_count >= 0)
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete cascade,
  bucket text not null default 'submissions',
  path text not null unique,             -- object path in Supabase Storage (private bucket)
  name text not null,
  mime_type text not null check (mime_type ~ '^(image/(jpeg|png|webp|gif)|video/(mp4|quicktime|webm)|application/pdf)$'),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 524288000),
  created_at timestamptz not null default now()
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.deliverables (id) on delete cascade,
  collaboration_id uuid not null references public.collaborations (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  version integer not null check (version >= 1),
  caption text check (caption is null or char_length(caption) <= 4000),
  links text[] not null default '{}',
  file_ids uuid[] not null default '{}',
  note text,
  status text not null default 'in_review' check (status in ('in_review', 'awaiting_client', 'approved', 'revision_requested', 'rejected')),
  submitted_at timestamptz not null default now(),
  unique (deliverable_id, version)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  reviewer_id uuid references public.profiles (id) on delete set null,
  reviewer_name text not null,
  stage text not null check (stage in ('internal', 'client')),
  decision text not null check (decision in ('approved', 'revision_requested', 'rejected', 'comment')),
  comment text check (comment is null or char_length(comment) <= 2000),
  at timestamptz not null default now(),
  constraint feedback_required check (decision in ('approved', 'comment') or char_length(coalesce(comment, '')) >= 5)
);

-- ---------------------------------------------------------------------------
-- Money (tracking only) & results
-- ---------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  collaboration_id uuid not null references public.collaborations (id) on delete cascade,
  creator_id uuid not null references public.creator_profiles (id) on delete restrict,
  label text not null,
  kind text not null check (kind in ('base', 'milestone', 'bonus', 'gifting')),
  amount numeric(14, 2) not null check (amount >= 0),
  currency text not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'pending', 'paid', 'cancelled')),
  due_date date not null,
  paid_at timestamptz,
  reference text check (reference is null or char_length(reference) <= 120),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint paid_has_date check ((status = 'paid') = (paid_at is not null))
);

create table public.results (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  collaboration_id uuid references public.collaborations (id) on delete cascade,
  creator_id uuid references public.creator_profiles (id) on delete set null,
  date date not null,
  platform text not null,
  reach bigint check (reach is null or reach >= 0),
  impressions bigint check (impressions is null or impressions >= 0),
  engagements bigint check (engagements is null or engagements >= 0),
  clicks bigint check (clicks is null or clicks >= 0),
  conversions bigint check (conversions is null or conversions >= 0),
  source text not null check (source in ('verified', 'creator_submitted', 'imported', 'estimate', 'manual')),
  note text,
  entered_by uuid references public.profiles (id) on delete set null,
  sample boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Relationships
-- ---------------------------------------------------------------------------
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  creator_ids uuid[] not null default '{}',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.crm_records (
  org_id uuid not null references public.organizations (id) on delete cascade,
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  status text not null default 'prospect' check (status in ('prospect', 'contacted', 'negotiating', 'active', 'past', 'do_not_contact')),
  tags text[] not null default '{}',
  notes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (org_id, creator_id)
);

-- ---------------------------------------------------------------------------
-- Notifications, trust & safety, audit, settings
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text check (link is null or link ~ '^/'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  evidence text not null check (char_length(evidence) between 20 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index one_pending_verification on public.verification_requests (creator_id) where status = 'pending';

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  target_type text not null check (target_type in ('creator', 'campaign', 'organization', 'submission')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution text,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  org_id uuid,
  action text not null,
  target text,
  severity text not null default 'info' check (severity in ('info', 'warning', 'security')),
  detail text
);

create table public.platform_settings (
  id boolean primary key default true check (id),   -- single row
  platform_fee_pct numeric(5, 2) not null default 8 check (platform_fee_pct between 0 and 30),
  default_agency_fee_pct numeric(5, 2) not null default 15 check (default_agency_fee_pct between 0 and 40),
  max_upload_mb integer not null default 200 check (max_upload_mb between 1 and 500),
  categories jsonb not null default '[]'::jsonb,
  plans jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (true);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index on public.memberships (user_id);
create index on public.organizations (parent_org_id);
create index on public.campaigns (org_id, status);
create index on public.campaigns (status) where visibility = 'public';
create index on public.campaign_activity (campaign_id, at desc);
create index on public.invitations (creator_id);
create index on public.applications (creator_id);
create index on public.offers (campaign_id, creator_id, created_at desc);
create index on public.messages (campaign_id, creator_id, created_at);
create index on public.collaborations (creator_id);
create index on public.collaborations (org_id);
create index on public.deliverables (collaboration_id);
create index on public.submissions (org_id, status);
create index on public.reviews (submission_id);
create index on public.payments (org_id, status);
create index on public.payments (creator_id);
create index on public.results (campaign_id, date);
create index on public.notifications (user_id, created_at desc) where read_at is null;
create index on public.audit_log (at desc);
create index on public.audit_log (severity, at desc);
create index on public.creator_profiles using gin (categories);
create index on public.social_accounts (creator_id);

-- ---------------------------------------------------------------------------
-- Authorisation helpers (SECURITY DEFINER, pinned search_path)
-- ---------------------------------------------------------------------------
create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active');
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and platform_role = 'admin' and status = 'active');
$$;

-- Effective role in an org. Agency staff inherit their agency role in client
-- workspaces, except client reviewers, who only see the workspace they belong to.
create or replace function public.org_role(target uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select m.role from memberships m join profiles p on p.id = m.user_id
      where m.org_id = target and m.user_id = auth.uid() and p.status = 'active'),
    (select m.role from organizations o
      join memberships m on m.org_id = o.parent_org_id and m.user_id = auth.uid()
      join profiles p on p.id = m.user_id and p.status = 'active'
      where o.id = target and o.type = 'client' and m.role <> 'client_reviewer')
  );
$$;

-- Mirrors MATRIX in src/server/access.ts. Suspended orgs grant nothing.
create or replace function public.has_perm(target uuid, perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when not exists (select 1 from organizations where id = target and status = 'active') then false
    else case public.org_role(target)
      when 'owner' then true
      when 'admin' then true
      when 'manager' then perm not in ('team.manage', 'settings.manage', 'clients.manage')
      when 'member' then perm in ('org.view', 'campaign.view', 'discover', 'collections.edit', 'crm.view', 'crm.edit', 'budget.view', 'strategist')
      when 'client_reviewer' then perm in ('org.view', 'campaign.view', 'content.review.client')
      else false
    end
  end;
$$;

create or replace function public.my_creator_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from creator_profiles where user_id = auth.uid();
$$;

-- Is the signed-in creator a party to this campaign conversation?
create or replace function public.is_creator_party(campaign uuid, creator uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select creator = public.my_creator_id() and public.is_active_user();
$$;

-- Append-only audit writer. Clients cannot insert into audit_log directly.
create or replace function public.write_audit(p_action text, p_target text, p_severity text default 'info', p_org uuid default null, p_detail text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_severity not in ('info', 'warning', 'security') then raise exception 'invalid severity'; end if;
  insert into audit_log (actor_id, actor_email, org_id, action, target, severity, detail)
  values (auth.uid(), (select email from auth.users where id = auth.uid()), p_org, left(p_action, 80), left(p_target, 200), p_severity, left(p_detail, 1000));
end $$;

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger t_profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger t_orgs_touch before update on public.organizations for each row execute function public.touch_updated_at();
create trigger t_creators_touch before update on public.creator_profiles for each row execute function public.touch_updated_at();
create trigger t_campaigns_touch before update on public.campaigns for each row execute function public.touch_updated_at();

-- Users can't promote themselves or lift their own suspension.
-- Guards run as the calling role, so `current_user` is 'authenticated' for app
-- users and 'service_role'/'postgres' for trusted server code and migrations.
create or replace function public.guard_profile() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() and (new.platform_role is distinct from old.platform_role or new.status is distinct from old.status or new.kind is distinct from old.kind) then
    raise exception 'Only administrators can change account role or status' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger t_profiles_guard before update on public.profiles for each row execute function public.guard_profile();

-- Creators can't mark themselves verified or flip the sample flag.
create or replace function public.guard_creator() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.identity_verification := 'unverified';
      new.sample := false;
    elsif new.identity_verification is distinct from old.identity_verification and not (old.identity_verification in ('unverified', 'rejected') and new.identity_verification = 'pending') then
      raise exception 'Identity verification is set by administrators' using errcode = '42501';
    elsif new.sample is distinct from old.sample then
      raise exception 'Sample flag is managed by administrators' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger t_creators_guard before insert or update on public.creator_profiles for each row execute function public.guard_creator();

-- Only a verified platform connection (server side, service role) may label numbers 'verified'.
create or replace function public.guard_social_source() returns trigger language plpgsql as $$
begin
  if new.source = 'verified' and current_user in ('authenticated', 'anon') then
    raise exception 'Only a verified platform connection can mark figures as verified' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger t_social_source before insert or update on public.social_accounts for each row execute function public.guard_social_source();
create trigger t_results_source before insert or update on public.results for each row execute function public.guard_social_source();

-- Campaign lifecycle. Mirrors CAMPAIGN_TRANSITIONS in src/domain/constants.ts.
create or replace function public.guard_campaign_status() returns trigger language plpgsql as $$
declare allowed text[];
begin
  if new.status is not distinct from old.status then
    -- Commercial terms are frozen once a campaign is live.
    if old.status not in ('draft', 'paused') and (new.budget, new.currency, new.compensation_model, new.deliverables, new.start_date)
       is distinct from (old.budget, old.currency, old.compensation_model, old.deliverables, old.start_date) then
      raise exception 'Commercial terms can only change while a campaign is a draft or paused' using errcode = '23514';
    end if;
    return new;
  end if;
  allowed := case old.status
    when 'draft' then array['published', 'recruiting', 'cancelled']
    when 'published' then array['recruiting', 'active', 'paused', 'cancelled']
    when 'recruiting' then array['active', 'paused', 'cancelled']
    when 'active' then array['paused', 'under_review', 'completed', 'cancelled']
    when 'paused' then array['recruiting', 'active', 'cancelled']
    when 'under_review' then array['active', 'completed']
    else array[]::text[]
  end;
  if not new.status = any (allowed) then
    raise exception 'A % campaign cannot move to %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end $$;
create trigger t_campaign_status before update on public.campaigns for each row execute function public.guard_campaign_status();

-- Accepted offers are immutable.
create or replace function public.guard_offer() returns trigger language plpgsql as $$
begin
  if old.status <> 'open' then raise exception 'This offer has already been decided' using errcode = '23514'; end if;
  if new.terms is distinct from old.terms then raise exception 'Offer terms cannot be edited; send a counteroffer instead' using errcode = '23514'; end if;
  return new;
end $$;
create trigger t_offer_guard before update on public.offers for each row execute function public.guard_offer();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.products enable row level security;
alter table public.memberships enable row level security;
alter table public.team_invites enable row level security;
alter table public.creator_profiles enable row level security;
alter table public.social_accounts enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_activity enable row level security;
alter table public.invitations enable row level security;
alter table public.applications enable row level security;
alter table public.offers enable row level security;
alter table public.messages enable row level security;
alter table public.collaborations enable row level security;
alter table public.deliverables enable row level security;
alter table public.files enable row level security;
alter table public.submissions enable row level security;
alter table public.reviews enable row level security;
alter table public.payments enable row level security;
alter table public.results enable row level security;
alter table public.collections enable row level security;
alter table public.crm_records enable row level security;
alter table public.notifications enable row level security;
alter table public.verification_requests enable row level security;
alter table public.reports enable row level security;
alter table public.audit_log enable row level security;
alter table public.platform_settings enable row level security;

-- Profiles: yourself, people who share an org with you, admins.
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_admin()
  or exists (select 1 from memberships a join memberships b on a.org_id = b.org_id where a.user_id = auth.uid() and b.user_id = profiles.id)
);
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- Organisations
create policy orgs_select on public.organizations for select to authenticated using (public.org_role(id) is not null or public.is_admin());
create policy orgs_insert on public.organizations for insert to authenticated with check (
  public.is_active_user() and (type <> 'client' or public.has_perm(parent_org_id, 'clients.manage'))
);
create policy orgs_update on public.organizations for update to authenticated using (public.has_perm(id, 'settings.manage') or public.is_admin()) with check (public.has_perm(id, 'settings.manage') or public.is_admin());

create policy products_rw on public.products for all to authenticated using (public.has_perm(org_id, 'org.view')) with check (public.has_perm(org_id, 'campaign.edit'));

-- Memberships: members see their org's roster; only team managers change it.
create policy memberships_select on public.memberships for select to authenticated using (user_id = auth.uid() or public.org_role(org_id) is not null or public.is_admin());
create policy memberships_write on public.memberships for insert to authenticated with check (public.has_perm(org_id, 'team.manage') and role <> 'owner');
create policy memberships_update on public.memberships for update to authenticated using (public.has_perm(org_id, 'team.manage') and role <> 'owner') with check (public.has_perm(org_id, 'team.manage') and role <> 'owner');
create policy memberships_delete on public.memberships for delete to authenticated using ((public.has_perm(org_id, 'team.manage') and role <> 'owner') or (user_id = auth.uid() and role <> 'owner'));

create policy team_invites_rw on public.team_invites for all to authenticated using (public.has_perm(org_id, 'team.manage')) with check (public.has_perm(org_id, 'team.manage'));

-- Creator profiles: the base table (with private columns) is visible only to
-- its owner and admins. Everyone else reads public.creator_directory below.
create policy creators_select_own on public.creator_profiles for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy creators_insert_own on public.creator_profiles for insert to authenticated with check (user_id = auth.uid() and public.is_active_user());
create policy creators_update_own on public.creator_profiles for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy creators_delete_own on public.creator_profiles for delete to authenticated using (user_id = auth.uid());

create policy socials_select on public.social_accounts for select to authenticated using (
  public.is_admin() or creator_id = public.my_creator_id()
  or exists (select 1 from creator_profiles c where c.id = creator_id and (c.visibility ->> 'listed')::boolean)
);
create policy socials_write on public.social_accounts for all to authenticated using (creator_id = public.my_creator_id()) with check (creator_id = public.my_creator_id());

-- Privacy-filtered directory. Runs with the view owner's rights so it can read
-- the base table, and only ever returns columns the creator chose to share.
create view public.creator_directory with (security_barrier = true) as
  select c.id, c.display_name, c.handle, c.bio, c.country,
         case when (c.visibility ->> 'show_city')::boolean then c.city end as city,
         c.languages, c.categories, c.formats,
         case when (c.visibility ->> 'show_audience')::boolean then c.audience end as audience,
         case when (c.visibility ->> 'show_rates')::boolean then c.rates end as rates,
         c.preferred_collabs, c.availability, c.identity_verification, c.avatar_path, c.sample, c.updated_at
  from public.creator_profiles c
  where public.is_active_user()
    and ((c.visibility ->> 'listed')::boolean
      -- A brand already working with a creator can still open their profile.
      or exists (select 1 from public.collaborations k where k.creator_id = c.id and public.has_perm(k.org_id, 'campaign.view'))
      or c.user_id = auth.uid());
revoke all on public.creator_directory from anon;
grant select on public.creator_directory to authenticated;

-- Campaigns: org members only on the base table (it holds the total budget).
create policy campaigns_select on public.campaigns for select to authenticated using (public.has_perm(org_id, 'campaign.view') or public.is_admin());
create policy campaigns_insert on public.campaigns for insert to authenticated with check (public.has_perm(org_id, 'campaign.edit') and created_by = auth.uid());
create policy campaigns_update on public.campaigns for update to authenticated using (public.has_perm(org_id, 'campaign.edit') or public.is_admin()) with check (public.has_perm(org_id, 'campaign.edit') or public.is_admin());
create policy campaigns_delete on public.campaigns for delete to authenticated using (public.has_perm(org_id, 'campaign.edit') and status = 'draft');

-- What creators see: open public campaigns, or ones they're already part of. No budget column.
create view public.campaign_marketplace with (security_barrier = true) as
  select c.id, c.org_id, o.name as brand_name, o.country as brand_country, c.name, c.description, c.objective, c.audience,
         c.locations, c.languages, c.categories, c.platforms, c.deliverables, c.currency, c.compensation_model, c.fee_guide,
         c.start_date, c.end_date, c.requirements, c.guidelines, c.visibility, c.status
  from public.campaigns c join public.organizations o on o.id = c.org_id
  where public.is_active_user() and o.status = 'active'
    and ((c.visibility = 'public' and c.status in ('published', 'recruiting'))
      or exists (select 1 from public.invitations i where i.campaign_id = c.id and i.creator_id = public.my_creator_id())
      or exists (select 1 from public.applications a where a.campaign_id = c.id and a.creator_id = public.my_creator_id())
      or exists (select 1 from public.collaborations k where k.campaign_id = c.id and k.creator_id = public.my_creator_id()));
revoke all on public.campaign_marketplace from anon;
grant select on public.campaign_marketplace to authenticated;

create policy activity_select on public.campaign_activity for select to authenticated using (public.has_perm(org_id, 'campaign.view'));
create policy activity_insert on public.campaign_activity for insert to authenticated with check (public.has_perm(org_id, 'campaign.view') and actor_id = auth.uid());

-- Negotiation: org staff with budget visibility (not client reviewers) and the creator.
create policy invitations_select on public.invitations for select to authenticated using (public.has_perm(org_id, 'budget.view') or public.is_creator_party(campaign_id, creator_id));
create policy invitations_insert on public.invitations for insert to authenticated with check (public.has_perm(org_id, 'outreach.send') and sent_by = auth.uid());
create policy invitations_update on public.invitations for update to authenticated using (public.has_perm(org_id, 'outreach.send') or public.is_creator_party(campaign_id, creator_id));

create policy applications_select on public.applications for select to authenticated using (public.has_perm(org_id, 'budget.view') or public.is_creator_party(campaign_id, creator_id));
create policy applications_insert on public.applications for insert to authenticated with check (
  public.is_creator_party(campaign_id, creator_id) and status = 'submitted'
  and exists (select 1 from campaigns c where c.id = campaign_id and c.org_id = applications.org_id and c.visibility = 'public' and c.status in ('published', 'recruiting'))
);
create policy applications_update on public.applications for update to authenticated using (public.has_perm(org_id, 'outreach.send') or public.is_creator_party(campaign_id, creator_id));

create policy offers_select on public.offers for select to authenticated using (public.has_perm(org_id, 'budget.view') or public.is_creator_party(campaign_id, creator_id));
create policy offers_insert on public.offers for insert to authenticated with check (
  created_by = auth.uid() and status = 'open' and (
    (from_side = 'org' and public.has_perm(org_id, 'outreach.send'))
    or (from_side = 'creator' and public.is_creator_party(campaign_id, creator_id))
  )
);
-- Each side may only decide offers made by the other side (or withdraw their own).
create policy offers_update on public.offers for update to authenticated using (
  (from_side = 'creator' and public.has_perm(org_id, 'outreach.send'))
  or (from_side = 'org' and public.is_creator_party(campaign_id, creator_id))
  or (from_side = 'org' and public.has_perm(org_id, 'outreach.send') and status = 'open')
);

create policy messages_select on public.messages for select to authenticated using (public.has_perm(org_id, 'budget.view') or public.is_creator_party(campaign_id, creator_id));
create policy messages_insert on public.messages for insert to authenticated with check (
  author_id = auth.uid() and (
    (from_side = 'org' and public.has_perm(org_id, 'outreach.send'))
    or (from_side = 'creator' and public.is_creator_party(campaign_id, creator_id))
  )
);

-- Collaborations & content: client reviewers can see these (not money).
create policy collabs_select on public.collaborations for select to authenticated using (public.has_perm(org_id, 'campaign.view') or public.is_creator_party(campaign_id, creator_id) or public.is_admin());
create policy collabs_write on public.collaborations for insert to authenticated with check (public.has_perm(org_id, 'outreach.send') or public.is_creator_party(campaign_id, creator_id));
create policy collabs_update on public.collaborations for update to authenticated using (public.has_perm(org_id, 'campaign.edit'));

create policy deliverables_select on public.deliverables for select to authenticated using (public.has_perm(org_id, 'campaign.view') or creator_id = public.my_creator_id());
create policy deliverables_insert on public.deliverables for insert to authenticated with check (public.has_perm(org_id, 'outreach.send') or creator_id = public.my_creator_id());
create policy deliverables_update on public.deliverables for update to authenticated using (
  public.has_perm(org_id, 'content.review.internal') or public.has_perm(org_id, 'content.review.client') or creator_id = public.my_creator_id()
);

create policy files_select on public.files for select to authenticated using (owner_user_id = auth.uid() or (org_id is not null and public.has_perm(org_id, 'campaign.view')) or public.is_admin());
create policy files_insert on public.files for insert to authenticated with check (owner_user_id = auth.uid());
create policy files_delete on public.files for delete to authenticated using (owner_user_id = auth.uid());

create policy submissions_select on public.submissions for select to authenticated using (public.has_perm(org_id, 'campaign.view') or creator_id = public.my_creator_id());
create policy submissions_insert on public.submissions for insert to authenticated with check (
  creator_id = public.my_creator_id() and status = 'in_review'
  and exists (select 1 from deliverables d join collaborations k on k.id = d.collaboration_id
              where d.id = deliverable_id and k.id = collaboration_id and k.creator_id = submissions.creator_id and k.status = 'active'
                and d.status in ('not_started', 'revision_requested'))
);
-- USING picks who may act at the current stage; WITH CHECK lets that reviewer
-- move it on (approve, request a revision, reject, or hand to the client).
create policy submissions_update on public.submissions for update to authenticated using (
  (status = 'in_review' and public.has_perm(org_id, 'content.review.internal'))
  or (status = 'awaiting_client' and public.has_perm(org_id, 'content.review.client'))
) with check (
  status in ('awaiting_client', 'approved', 'revision_requested', 'rejected')
  and (public.has_perm(org_id, 'content.review.internal') or public.has_perm(org_id, 'content.review.client'))
);

create policy reviews_select on public.reviews for select to authenticated using (
  public.has_perm(org_id, 'campaign.view') or exists (select 1 from submissions s where s.id = submission_id and s.creator_id = public.my_creator_id())
);
create policy reviews_insert on public.reviews for insert to authenticated with check (
  reviewer_id = auth.uid() and (
    (stage = 'internal' and public.has_perm(org_id, 'content.review.internal'))
    or (stage = 'client' and public.has_perm(org_id, 'content.review.client'))
  )
);

-- Payments: tracking only. Creators can read their own rows, never change them.
create policy payments_select on public.payments for select to authenticated using (public.has_perm(org_id, 'budget.view') or creator_id = public.my_creator_id());
create policy payments_insert on public.payments for insert to authenticated with check (public.has_perm(org_id, 'payments.edit') or public.is_creator_party(campaign_id, creator_id));
create policy payments_update on public.payments for update to authenticated using (public.has_perm(org_id, 'payments.edit')) with check (public.has_perm(org_id, 'payments.edit'));

create policy results_select on public.results for select to authenticated using (public.has_perm(org_id, 'campaign.view') or creator_id = public.my_creator_id());
create policy results_insert on public.results for insert to authenticated with check (
  entered_by = auth.uid() and (
    public.has_perm(org_id, 'results.edit')
    or (creator_id = public.my_creator_id() and source = 'creator_submitted')
  )
);
create policy results_update on public.results for update to authenticated using (public.has_perm(org_id, 'results.edit'));
create policy results_delete on public.results for delete to authenticated using (public.has_perm(org_id, 'results.edit'));

create policy collections_select on public.collections for select to authenticated using (public.has_perm(org_id, 'discover'));
create policy collections_write on public.collections for all to authenticated using (public.has_perm(org_id, 'collections.edit')) with check (public.has_perm(org_id, 'collections.edit'));

create policy crm_select on public.crm_records for select to authenticated using (public.has_perm(org_id, 'crm.view'));
create policy crm_write on public.crm_records for all to authenticated using (public.has_perm(org_id, 'crm.edit')) with check (public.has_perm(org_id, 'crm.edit'));

-- Notifications are created server side (service role); users read and mark their own.
create policy notifications_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_mark on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

create policy verif_select on public.verification_requests for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy verif_insert on public.verification_requests for insert to authenticated with check (user_id = auth.uid() and creator_id = public.my_creator_id() and status = 'pending');
create policy verif_update on public.verification_requests for update to authenticated using (public.is_admin());

create policy reports_insert on public.reports for insert to authenticated with check (reporter_id = auth.uid() and status = 'open' and public.is_active_user());
create policy reports_select on public.reports for select to authenticated using (reporter_id = auth.uid() or public.is_admin());
create policy reports_update on public.reports for update to authenticated using (public.is_admin());

-- Audit log: append-only via write_audit(); admins read all, org owners/admins read their org's.
create policy audit_select on public.audit_log for select to authenticated using (public.is_admin() or (org_id is not null and public.has_perm(org_id, 'settings.manage')));

create policy settings_select on public.platform_settings for select to authenticated using (true);
create policy settings_update on public.platform_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Grants. RLS decides rows; these decide verbs. `anon` gets nothing.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.audit_log from authenticated;
revoke insert, delete on public.platform_settings from authenticated;
revoke insert on public.notifications from authenticated;
grant usage on all sequences in schema public to authenticated;
grant execute on function public.write_audit(text, text, text, uuid, text) to authenticated;

commit;
