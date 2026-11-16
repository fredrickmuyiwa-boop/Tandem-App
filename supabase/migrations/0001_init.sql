-- Tandem — schema, authorisation helpers, integrity rules and Row Level Security.
--
-- Tables mirror src/domain/types.ts one-to-one: each top-level field is a
-- snake_case column; nested objects and lists are jsonb with the app's own
-- camelCase keys. IDs are text (the app generates them; profiles use the
-- Supabase Auth user id).
--
-- Every table has RLS. `anon` gets nothing. Payments are TRACKING ONLY:
-- there are no balances, wallets or escrow here. The service-role key
-- bypasses RLS; use it only in trusted server code, never in the browser.

begin;

-- ---------------------------------------------------------------------------
-- Accounts & organisations
-- ---------------------------------------------------------------------------
create table public.profiles (
  id text primary key,                         -- = auth.users.id
  email text not null,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null check (kind in ('brand', 'agency', 'creator', 'admin')),
  platform_role text not null default 'user' check (platform_role in ('user', 'admin')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  email_verified boolean not null default false,
  mfa_enabled boolean not null default false,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index profiles_email on public.profiles (lower(email));

create table public.organizations (
  id text primary key,
  name text not null check (char_length(name) between 1 and 120),
  type text not null check (type in ('brand', 'agency', 'client')),
  parent_org_id text references public.organizations (id) on delete cascade,
  country text not null,
  industry text,
  website text check (website is null or website ~* '^https?://'),
  description text check (description is null or char_length(description) <= 2000),
  plan_id text not null,
  agency_fee_pct numeric check (agency_fee_pct is null or agency_fee_pct between 0 and 40),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  products jsonb not null default '[]',
  constraint client_has_parent check ((type = 'client') = (parent_org_id is not null))
);

create table public.memberships (
  id text primary key,
  org_id text not null references public.organizations (id) on delete cascade,
  user_id text not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'manager', 'member', 'client_reviewer')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create table public.team_invites (
  id text primary key,
  org_id text not null references public.organizations (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null check (role in ('admin', 'manager', 'member', 'client_reviewer')),
  invited_by text references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked'))
);

-- ---------------------------------------------------------------------------
-- Creators
-- ---------------------------------------------------------------------------
create table public.creator_profiles (
  id text primary key,
  user_id text unique references public.profiles (id) on delete cascade,   -- null = unclaimed sample profile
  display_name text not null check (char_length(display_name) between 1 and 80),
  handle text not null unique check (handle ~ '^[a-z0-9_.]{2,30}$'),
  bio text not null default '' check (char_length(bio) <= 1000),
  country text not null,
  city text,
  languages jsonb not null default '[]',
  categories jsonb not null default '[]',
  formats jsonb not null default '[]',
  socials jsonb not null default '[]',          -- [{platform, handle, followers, engagementRate, source, updatedAt}]
  audience jsonb not null default '{"source":"creator_submitted"}',
  rates jsonb not null default '[]',
  portfolio jsonb not null default '[]',
  preferred_collabs jsonb not null default '[]',
  availability text not null default 'available' check (availability in ('available', 'limited', 'unavailable')),
  identity_verification text not null default 'unverified' check (identity_verification in ('unverified', 'pending', 'verified', 'rejected')),
  visibility jsonb not null default '{"listed":true,"showLocation":true,"showRates":false,"showAudience":true,"showCollabHistory":true}',
  avatar_hue integer not null default 230,
  avatar_file_ref text,
  sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Campaigns, outreach, negotiation
-- ---------------------------------------------------------------------------
create table public.campaigns (
  id text primary key,
  org_id text not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 3 and 120),
  description text not null default '' check (char_length(description) <= 5000),
  product_id text,
  objective text not null check (objective in ('awareness', 'launch', 'engagement', 'traffic', 'leads', 'sales', 'app_downloads', 'community', 'event')),
  audience jsonb not null default '{"genders":["all"],"interests":[]}',
  locations jsonb not null default '[]',
  languages jsonb not null default '[]',
  platforms jsonb not null default '[]',
  categories jsonb not null default '[]',
  budget numeric not null check (budget >= 0),
  currency text not null check (currency in ('NGN', 'USD', 'GBP', 'EUR', 'KES', 'GHS', 'ZAR')),
  start_date date not null,
  end_date date not null,
  deliverables jsonb not null default '[]',
  requirements text not null default '',
  guidelines text not null default '',
  approval jsonb not null default '{"internal":true,"client":false}',
  compensation_model text not null check (compensation_model in ('fixed', 'fixed_plus_bonus', 'milestone', 'negotiated', 'gifting')),
  performance_targets text not null default '',
  visibility text not null default 'public' check (visibility in ('public', 'invite_only')),
  status text not null default 'draft' check (status in ('draft', 'published', 'recruiting', 'active', 'paused', 'under_review', 'completed', 'cancelled')),
  created_by text references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sample boolean not null default false,
  constraint campaign_dates check (end_date >= start_date)
);

create table public.campaign_activity (
  id text primary key,
  org_id text references public.organizations (id) on delete cascade,
  campaign_id text references public.campaigns (id) on delete cascade,
  collaboration_id text,
  creator_id text,
  actor_id text,
  actor_name text not null,
  action text not null check (char_length(action) <= 400),
  at timestamptz not null default now()
);

create table public.invitations (
  id text primary key,
  campaign_id text not null references public.campaigns (id) on delete cascade,
  org_id text not null references public.organizations (id) on delete cascade,
  creator_id text not null references public.creator_profiles (id) on delete cascade,
  message text not null check (char_length(message) <= 4000),
  terms jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn', 'countered')),
  created_by text references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create table public.applications (
  id text primary key,
  campaign_id text not null references public.campaigns (id) on delete cascade,
  org_id text not null references public.organizations (id) on delete cascade,
  creator_id text not null references public.creator_profiles (id) on delete cascade,
  pitch text not null check (char_length(pitch) between 20 and 2000),
  proposed_fee numeric not null check (proposed_fee >= 0),
  currency text not null,
  status text not null default 'submitted' check (status in ('submitted', 'shortlisted', 'offered', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table public.offers (
  id text primary key,
  campaign_id text not null references public.campaigns (id) on delete cascade,
  org_id text not null references public.organizations (id) on delete cascade,
  creator_id text not null references public.creator_profiles (id) on delete cascade,
  from_side text not null check (from_side in ('org', 'creator')),
  terms jsonb not null check ((terms ->> 'fee')::numeric >= 0),
  message text not null default '',
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected', 'superseded', 'withdrawn')),
  created_by text,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create unique index offers_one_open on public.offers (campaign_id, creator_id) where status = 'open';

create table public.messages (
  id text primary key,
  campaign_id text not null references public.campaigns (id) on delete cascade,
  org_id text not null references public.organizations (id) on delete cascade,
  creator_id text not null references public.creator_profiles (id) on delete cascade,
  from_side text not null check (from_side in ('org', 'creator', 'system')),
  sender_id text,
  sender_name text not null,
  body text not null check (char_length(body) between 1 and 4000),
  kind text not null default 'message' check (kind in ('message', 'clarification', 'system')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Collaborations & content
-- ---------------------------------------------------------------------------
create table public.collaborations (
  id text primary key,
  campaign_id text not null references public.campaigns (id) on delete cascade,
  org_id text not null references public.organizations (id) on delete cascade,
  creator_id text not null references public.creator_profiles (id) on delete restrict,
  offer_id text not null references public.offers (id) on delete restrict,
  terms jsonb not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);
create unique index collaborations_one_live on public.collaborations (campaign_id, creator_id) where status <> 'cancelled';

create table public.deliverables (
  id text primary key,
  collaboration_id text not null references public.collaborations (id) on delete cascade,
  org_id text not null references public.organizations (id) on delete cascade,
  creator_id text not null references public.creator_profiles (id) on delete cascade,
  title text not null,
  platform text not null,
  format text not null,
  due_date date not null,
  status text not null default 'not_started' check (status in ('not_started', 'in_review', 'awaiting_client', 'revision_requested', 'approved', 'rejected')),
  revision_count integer not null default 0 check (revision_count >= 0)
);

create table public.files (
  id text primary key,
  owner_user_id text not null references public.profiles (id) on delete cascade,
  org_id text references public.organizations (id) on delete cascade,
  creator_id text,
  name text not null check (char_length(name) <= 200),
  type text not null check (type ~ '^(image/(jpeg|png|webp|gif)|video/(mp4|quicktime|webm)|application/pdf)$'),
  size bigint not null check (size > 0 and size <= 524288000),
  -- Small images (≤ 1 MB) are stored inline so they can be previewed. Larger
  -- media should move to a private Supabase Storage bucket (see docs).
  data_url text check (data_url is null or (data_url like 'data:image/%' and octet_length(data_url) <= 1450000)),
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  created_at timestamptz not null default now()
);

create table public.submissions (
  id text primary key,
  deliverable_id text not null references public.deliverables (id) on delete cascade,
  collaboration_id text not null references public.collaborations (id) on delete cascade,
  org_id text not null references public.organizations (id) on delete cascade,
  creator_id text not null references public.creator_profiles (id) on delete cascade,
  version integer not null check (version >= 1),
  caption text not null default '' check (char_length(caption) <= 4000),
  links jsonb not null default '[]',
  file_ids jsonb not null default '[]',
  note text not null default '',
  status text not null default 'in_review' check (status in ('in_review', 'awaiting_client', 'approved', 'revision_requested', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviews jsonb not null default '[]',        -- [{id, reviewerId, reviewerName, stage, decision, comment, at}]
  unique (deliverable_id, version)
);

-- ---------------------------------------------------------------------------
-- Money (tracking only) & results
-- ---------------------------------------------------------------------------
create table public.payments (
  id text primary key,
  org_id text not null references public.organizations (id) on delete cascade,
  campaign_id text not null references public.campaigns (id) on delete cascade,
  collaboration_id text not null references public.collaborations (id) on delete cascade,
  creator_id text not null references public.creator_profiles (id) on delete restrict,
  label text not null,
  kind text not null check (kind in ('base', 'milestone', 'bonus', 'gifting')),
  amount numeric not null check (amount >= 0),
  currency text not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'pending', 'paid', 'cancelled')),
  due_date date not null,
  paid_at timestamptz,
  reference text check (reference is null or char_length(reference) <= 120),
  updated_by text,
  constraint paid_has_date check (status <> 'paid' or paid_at is not null)
);

create table public.results (
  id text primary key,
  org_id text not null references public.organizations (id) on delete cascade,
  campaign_id text not null references public.campaigns (id) on delete cascade,
  collaboration_id text references public.collaborations (id) on delete cascade,
  creator_id text,
  date date not null,
  platform text not null,
  reach bigint check (reach >= 0),
  impressions bigint check (impressions >= 0),
  engagements bigint check (engagements >= 0),
  clicks bigint check (clicks >= 0),
  conversions bigint check (conversions >= 0),
  source text not null check (source in ('verified', 'creator_submitted', 'imported', 'estimate', 'manual')),
  note text,
  entered_by text,
  created_at timestamptz not null default now(),
  sample boolean not null default false
);

-- ---------------------------------------------------------------------------
-- Relationships
-- ---------------------------------------------------------------------------
create table public.collections (
  id text primary key,
  org_id text not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text,
  creator_ids jsonb not null default '[]',
  shared_with_clients boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);

create table public.crm_records (
  id text primary key,
  org_id text not null references public.organizations (id) on delete cascade,
  creator_id text not null references public.creator_profiles (id) on delete cascade,
  status text not null default 'prospect' check (status in ('prospect', 'contacted', 'negotiating', 'active', 'past', 'do_not_contact')),
  tags jsonb not null default '[]',
  notes jsonb not null default '[]',
  reminders jsonb not null default '[]',
  preferred_contact text,
  updated_at timestamptz not null default now(),
  unique (org_id, creator_id)
);

-- ---------------------------------------------------------------------------
-- Notifications, trust & safety, audit, settings
-- ---------------------------------------------------------------------------
create table public.notifications (
  id text primary key,
  user_id text not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null check (char_length(title) <= 200),
  body text not null default '' check (char_length(body) <= 1000),
  link text check (link is null or link ~ '^/'),
  read boolean not null default false,
  created_at timestamptz not null default now(),
  email_queued boolean not null default false
);

create table public.notification_prefs (
  user_id text primary key references public.profiles (id) on delete cascade,
  in_app jsonb not null,
  email jsonb not null,
  digest text not null default 'instant' check (digest in ('instant', 'daily', 'off'))
);

create table public.verification_requests (
  id text primary key,
  creator_id text not null references public.creator_profiles (id) on delete cascade,
  user_id text not null references public.profiles (id) on delete cascade,
  evidence text not null check (char_length(evidence) between 20 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text,
  note text
);
create unique index one_pending_verification on public.verification_requests (creator_id) where status = 'pending';

create table public.reports (
  id text primary key,
  reporter_id text references public.profiles (id) on delete set null,
  target_type text not null check (target_type in ('creator', 'campaign', 'organization', 'submission')),
  target_id text not null,
  reason text not null check (char_length(reason) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolution text
);

create table public.audit_log (
  id text primary key default ('aud_' || replace(gen_random_uuid()::text, '-', '')),
  at timestamptz not null default now(),
  actor_id text,
  actor_email text,
  org_id text,
  action text not null,
  target text,
  severity text not null default 'info' check (severity in ('info', 'warning', 'security')),
  detail text
);

create table public.platform_settings (
  id boolean primary key default true check (id),     -- single row
  platform_fee_pct numeric not null default 8 check (platform_fee_pct between 0 and 30),
  default_agency_fee_pct numeric not null default 15 check (default_agency_fee_pct between 0 and 40),
  categories jsonb not null default '[]',
  plans jsonb not null default '[]',
  max_upload_mb integer not null default 50 check (max_upload_mb between 1 and 500),
  allowed_upload_types jsonb not null default '[]'
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index on public.memberships (user_id);
create index on public.organizations (parent_org_id);
create index on public.campaigns (org_id, status);
create index on public.campaigns (status) where visibility = 'public';
create index on public.campaign_activity (campaign_id, at desc);
create index on public.campaign_activity (org_id, at desc);
create index on public.invitations (campaign_id, creator_id);
create index on public.invitations (creator_id);
create index on public.applications (campaign_id, creator_id);
create index on public.applications (creator_id);
create index on public.offers (campaign_id, creator_id, created_at);
create index on public.offers (creator_id);
create index on public.messages (campaign_id, creator_id, created_at);
create index on public.collaborations (creator_id);
create index on public.collaborations (org_id);
create index on public.deliverables (collaboration_id);
create index on public.deliverables (org_id, status);
create index on public.submissions (org_id, status);
create index on public.submissions (deliverable_id);
create index on public.payments (org_id, status);
create index on public.payments (creator_id);
create index on public.results (campaign_id, date);
create index on public.notifications (user_id, created_at desc);
create index on public.audit_log (at desc);
create index on public.audit_log (org_id, at desc);
create index on public.crm_records (creator_id);
create index on public.team_invites (lower(email)) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Authorisation helpers (SECURITY DEFINER, pinned search_path)
-- ---------------------------------------------------------------------------
create or replace function public.me() returns text
language sql stable as $$ select auth.uid()::text $$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid()::text and status = 'active');
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid()::text and platform_role = 'admin' and status = 'active');
$$;

-- Effective role in an org. Agency staff inherit their agency role in client
-- workspaces, except client reviewers, who only see the workspace they belong to.
create or replace function public.org_role(target text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select m.role from memberships m join profiles p on p.id = m.user_id
      where m.org_id = target and m.user_id = auth.uid()::text and p.status = 'active'),
    (select m.role from organizations o
      join memberships m on m.org_id = o.parent_org_id and m.user_id = auth.uid()::text
      join profiles p on p.id = m.user_id and p.status = 'active'
      where o.id = target and o.type = 'client' and m.role <> 'client_reviewer')
  );
$$;

-- Same matrix as src/server/access.ts. Suspended orgs grant nothing.
create or replace function public.role_can(r text, perm text) returns boolean
language sql immutable as $$
  select case r
    when 'owner' then true
    when 'admin' then true
    when 'manager' then perm not in ('team.manage', 'settings.manage', 'clients.manage')
    when 'member' then perm in ('org.view', 'campaign.view', 'discover', 'collections.edit', 'crm.view', 'crm.edit', 'budget.view', 'strategist')
    when 'client_reviewer' then perm in ('org.view', 'campaign.view', 'content.review.client')
    else false
  end;
$$;

create or replace function public.has_perm(target text, perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from organizations where id = target and status = 'active')
     and public.role_can(public.org_role(target), perm);
$$;

create or replace function public.my_creator_id() returns text
language sql stable security definer set search_path = public as $$
  select c.id from creator_profiles c join profiles p on p.id = c.user_id
  where c.user_id = auth.uid()::text and p.status = 'active';
$$;

-- Orgs the signed-in creator has a conversation or collaboration with.
create or replace function public.creator_thread_orgs() returns setof text
language sql stable security definer set search_path = public as $$
  select org_id from invitations where creator_id = public.my_creator_id()
  union select org_id from applications where creator_id = public.my_creator_id()
  union select org_id from offers where creator_id = public.my_creator_id()
  union select org_id from collaborations where creator_id = public.my_creator_id();
$$;

-- Creators an org (where the user has `perm`) has a working relationship with.
create or replace function public.related_creator(creator text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from (
      select org_id, creator_id from invitations
      union all select org_id, creator_id from applications
      union all select org_id, creator_id from collaborations
    ) t where t.creator_id = creator and public.has_perm(t.org_id, 'org.view'));
$$;

-- True only for the transaction that created the row (rows default created_at = now()).
create or replace function public.created_in_this_tx(ts timestamptz) returns boolean
language sql stable as $$ select ts = now() $$;

-- Narrow yes/no checks used by policies about rows the caller can't read themselves.
create or replace function public.campaign_in_org(campaign text, org text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from campaigns where id = campaign and org_id = org);
$$;

create or replace function public.campaign_accepts_applications(campaign text, org text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from campaigns c join organizations o on o.id = c.org_id
                 where c.id = campaign and c.org_id = org and c.visibility = 'public'
                   and c.status in ('published', 'recruiting') and o.status = 'active');
$$;

-- A brand/agency workspace created in this very transaction that has no members yet.
create or replace function public.is_new_empty_workspace(org text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from organizations o where o.id = org and o.type in ('brand', 'agency') and o.created_at = now())
     and not exists (select 1 from memberships m where m.org_id = org);
$$;

-- ---------------------------------------------------------------------------
-- Integrity triggers. They run as the caller, so `current_user` is
-- 'authenticated' for app users and 'postgres'/'service_role' for trusted code.
-- ---------------------------------------------------------------------------
create or replace function public.is_app_user() returns boolean
language sql stable as $$ select current_user in ('authenticated', 'anon') $$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger t_creators_touch before update on public.creator_profiles for each row execute function public.touch_updated_at();
create trigger t_campaigns_touch before update on public.campaigns for each row execute function public.touch_updated_at();
create trigger t_crm_touch before update on public.crm_records for each row execute function public.touch_updated_at();

-- Account role, status, kind and email are not self-service.
create or replace function public.guard_profile() returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_app_user() and not public.is_admin() and
     (new.platform_role, new.status, new.kind, new.email, new.email_verified) is distinct from
     (old.platform_role, old.status, old.kind, old.email, old.email_verified) then
    raise exception 'Only administrators can change account role, status or email' using errcode = '42501';
  end if;
  if public.is_app_user() and new.id = auth.uid()::text and new.platform_role is distinct from old.platform_role then
    raise exception 'You cannot change your own platform role' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger t_profiles_guard before update on public.profiles for each row execute function public.guard_profile();

-- Creators can't verify themselves, flip the sample flag, or label figures 'verified'.
create or replace function public.guard_creator() returns trigger language plpgsql set search_path = public as $$
declare old_verified jsonb; new_verified jsonb;
begin
  if not public.is_app_user() or public.is_admin() then return new; end if;
  new_verified := coalesce((select jsonb_agg(s order by s ->> 'platform') from jsonb_array_elements(new.socials) s where s ->> 'source' = 'verified'), '[]');
  if tg_op = 'INSERT' then
    new.identity_verification := 'unverified';
    new.sample := false;
    if new_verified <> '[]' then raise exception 'Only a connected platform can mark figures as verified' using errcode = '42501'; end if;
    if new.audience ->> 'source' = 'verified' then raise exception 'Only a connected platform can mark figures as verified' using errcode = '42501'; end if;
    return new;
  end if;
  old_verified := coalesce((select jsonb_agg(s order by s ->> 'platform') from jsonb_array_elements(old.socials) s where s ->> 'source' = 'verified'), '[]');
  if new_verified is distinct from old_verified
     or (new.audience ->> 'source' = 'verified' and old.audience is distinct from new.audience) then
    raise exception 'Only a connected platform can mark figures as verified' using errcode = '42501';
  end if;
  if new.identity_verification is distinct from old.identity_verification
     and not (old.identity_verification in ('unverified', 'rejected') and new.identity_verification = 'pending') then
    raise exception 'Identity verification is decided by administrators' using errcode = '42501';
  end if;
  if new.sample is distinct from old.sample or new.user_id is distinct from old.user_id then
    raise exception 'This field is managed by administrators' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger t_creators_guard before insert or update on public.creator_profiles for each row execute function public.guard_creator();

create or replace function public.guard_results_source() returns trigger language plpgsql as $$
begin
  if public.is_app_user() and new.source = 'verified' then
    raise exception 'Only a connected platform can mark results as verified' using errcode = '42501';
  end if;
  if public.is_app_user() and new.sample then
    raise exception 'Sample data is managed by administrators' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger t_results_source before insert or update on public.results for each row execute function public.guard_results_source();

-- Plans change only through billing/admins (no billing provider is connected).
create or replace function public.guard_org() returns trigger language plpgsql set search_path = public as $$
begin
  if not public.is_app_user() or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'active';
    new.created_at := now();
    -- Until billing is connected, new workspaces start on the standard plan; nobody picks their own.
    new.plan_id := case
      when new.type = 'client' then (select plan_id from organizations where id = new.parent_org_id)
      when new.type = 'agency' then 'agency_studio'
      else 'brand_growth' end;
    return new;
  end if;
  if new.plan_id is distinct from old.plan_id then
    raise exception 'Plan changes are handled by the Tandem team until billing is connected. Contact support to upgrade.' using errcode = '23514';
  end if;
  if new.status is distinct from old.status or new.type is distinct from old.type or new.parent_org_id is distinct from old.parent_org_id then
    raise exception 'Only administrators can change this' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger t_orgs_guard before insert or update on public.organizations for each row execute function public.guard_org();

-- Campaign lifecycle (mirrors CAMPAIGN_TRANSITIONS) and frozen commercial terms.
create or replace function public.guard_campaign() returns trigger language plpgsql as $$
declare allowed text[];
begin
  if tg_op = 'INSERT' then
    if public.is_app_user() then new.sample := false; end if;
    return new;
  end if;
  if public.is_app_user() and new.sample is distinct from old.sample then
    raise exception 'Sample data is managed by administrators' using errcode = '42501';
  end if;
  if new.status is not distinct from old.status then
    if old.status not in ('draft', 'paused')
       and (new.budget, new.currency, new.compensation_model, new.deliverables, new.start_date)
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
create trigger t_campaign_guard before insert or update on public.campaigns for each row execute function public.guard_campaign();

-- Offers: terms never change; only the receiving side decides; the sender may withdraw/supersede.
create or replace function public.guard_offer() returns trigger language plpgsql set search_path = public as $$
declare is_creator boolean;
begin
  if not public.is_app_user() then
    if new.terms is distinct from old.terms then raise exception 'Offer terms cannot be edited; send a counteroffer instead' using errcode = '23514'; end if;
    return new;
  end if;
  if new.terms is distinct from old.terms or (new.campaign_id, new.org_id, new.creator_id, new.from_side, new.created_by) is distinct from (old.campaign_id, old.org_id, old.creator_id, old.from_side, old.created_by) then
    raise exception 'Offer terms cannot be edited; send a counteroffer instead' using errcode = '23514';
  end if;
  if old.status <> 'open' and new.status is distinct from old.status then
    raise exception 'This offer has already been decided' using errcode = '23514';
  end if;
  is_creator := old.creator_id = public.my_creator_id();
  if new.status = 'accepted' and ((old.from_side = 'org' and not is_creator) or (old.from_side = 'creator' and not public.has_perm(old.org_id, 'outreach.send'))) then
    raise exception 'Only the receiving side can accept an offer' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger t_offer_guard before update on public.offers for each row execute function public.guard_offer();

-- A collaboration must come from an accepted offer, with exactly its terms.
create or replace function public.guard_collaboration() returns trigger language plpgsql set search_path = public as $$
declare o offers;
begin
  if tg_op = 'INSERT' then
    select * into o from offers where id = new.offer_id;
    if o.id is null or o.status <> 'accepted' or o.campaign_id <> new.campaign_id or o.creator_id <> new.creator_id or o.org_id <> new.org_id or o.terms <> new.terms then
      raise exception 'A collaboration needs an accepted offer with the same terms' using errcode = '23514';
    end if;
    if public.is_app_user() then new.status := 'active'; new.created_at := now(); end if;
    return new;
  end if;
  if public.is_app_user() and (new.terms, new.offer_id, new.creator_id, new.org_id, new.campaign_id) is distinct from (old.terms, old.offer_id, old.creator_id, old.org_id, old.campaign_id) then
    raise exception 'Agreed terms cannot be edited' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger t_collab_guard before insert or update on public.collaborations for each row execute function public.guard_collaboration();

-- Creators may only add deliverables/payments while accepting (same transaction as the
-- collaboration) and may only move a deliverable into review.
create or replace function public.guard_deliverable() returns trigger language plpgsql set search_path = public as $$
declare k collaborations;
begin
  if not public.is_app_user() then return new; end if;
  select * into k from collaborations where id = new.collaboration_id;
  if k.id is null or k.org_id <> new.org_id or k.creator_id <> new.creator_id then
    raise exception 'Deliverable does not match its collaboration' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if not public.has_perm(k.org_id, 'outreach.send') and not public.created_in_this_tx(k.created_at) then
      raise exception 'Deliverables are created when terms are agreed' using errcode = '42501';
    end if;
    new.status := 'not_started'; new.revision_count := 0;
    return new;
  end if;
  if new.creator_id = public.my_creator_id() and not public.has_perm(new.org_id, 'content.review.internal') and not public.has_perm(new.org_id, 'content.review.client') then
    if (new.title, new.platform, new.format, new.due_date, new.revision_count) is distinct from (old.title, old.platform, old.format, old.due_date, old.revision_count)
       or (new.status is distinct from old.status and not (new.status = 'in_review' and old.status in ('not_started', 'revision_requested'))) then
      raise exception 'Creators can only submit deliverables for review' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger t_deliverable_guard before insert or update on public.deliverables for each row execute function public.guard_deliverable();

create or replace function public.guard_payment() returns trigger language plpgsql set search_path = public as $$
declare k collaborations; total numeric;
begin
  if not public.is_app_user() then return new; end if;
  select * into k from collaborations where id = new.collaboration_id;
  if k.id is null or k.org_id <> new.org_id or k.creator_id <> new.creator_id or k.campaign_id <> new.campaign_id then
    raise exception 'Payment does not match its collaboration' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and not public.has_perm(k.org_id, 'payments.edit') then
    if not public.created_in_this_tx(k.created_at) then
      raise exception 'Only the brand can add payments' using errcode = '42501';
    end if;
    new.status := 'scheduled'; new.paid_at := null; new.reference := null;
    select coalesce(sum(amount), 0) + new.amount into total from payments where collaboration_id = k.id;
    if total > (k.terms ->> 'fee')::numeric + coalesce((k.terms -> 'bonus' ->> 'amount')::numeric, 0) then
      raise exception 'Payments cannot exceed the agreed fee and bonus' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger t_payment_guard before insert or update on public.payments for each row execute function public.guard_payment();

-- Invitations & applications: each side may only make its own moves.
create or replace function public.guard_thread_status() returns trigger language plpgsql set search_path = public as $$
begin
  if not public.is_app_user() or public.has_perm(old.org_id, 'outreach.send') then return new; end if;
  if old.creator_id = public.my_creator_id() then
    if row(new.*) is not distinct from row(old.*) then return new; end if;
    if tg_table_name = 'invitations' and new.status in ('declined', 'accepted', 'countered') and old.status in ('pending', 'countered', 'accepted')
       and (new.terms, new.message, new.created_by) is not distinct from (old.terms, old.message, old.created_by) then
      return new;
    end if;
    if tg_table_name = 'applications' and new.status = 'withdrawn' and old.status in ('submitted', 'shortlisted') then
      return new;
    end if;
  end if;
  raise exception 'You can’t change this' using errcode = '42501';
end $$;
create trigger t_invitation_guard before update on public.invitations for each row execute function public.guard_thread_status();
create trigger t_application_guard before update on public.applications for each row execute function public.guard_thread_status();

-- Reviews only append; creators can't approve their own work.
create or replace function public.guard_submission() returns trigger language plpgsql set search_path = public as $$
begin
  if not public.is_app_user() then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'in_review'; new.reviews := '[]'; new.submitted_at := now();
    return new;
  end if;
  if (new.caption, new.links, new.file_ids, new.note, new.version, new.deliverable_id, new.creator_id) is distinct from (old.caption, old.links, old.file_ids, old.note, old.version, old.deliverable_id, old.creator_id)
     or jsonb_array_length(new.reviews) < jsonb_array_length(old.reviews)
     or new.reviews -> 0 is distinct from old.reviews -> 0 and jsonb_array_length(old.reviews) > 0 then
    raise exception 'Submitted content and past reviews cannot be edited' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger t_submission_guard before insert or update on public.submissions for each row execute function public.guard_submission();

create or replace function public.guard_payment_paid() returns trigger language plpgsql as $$
begin
  if new.status = 'paid' and new.paid_at is null then new.paid_at := now(); end if;
  return new;
end $$;
create trigger t_payment_paid before insert or update on public.payments for each row execute function public.guard_payment_paid();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['profiles','organizations','memberships','team_invites','creator_profiles','campaigns','campaign_activity',
    'invitations','applications','offers','messages','collaborations','deliverables','files','submissions','payments','results',
    'collections','crm_records','notifications','notification_prefs','verification_requests','reports','audit_log','platform_settings'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Profiles: yourself, people you share a workspace with (incl. agency↔client), admins.
create policy profiles_select on public.profiles for select to authenticated using (
  id = public.me() or public.is_admin()
  or exists (select 1 from memberships b where b.user_id = profiles.id and public.org_role(b.org_id) is not null)
);
create policy profiles_update on public.profiles for update to authenticated using (id = public.me() or public.is_admin());

create policy orgs_select on public.organizations for select to authenticated using (public.org_role(id) is not null or public.is_admin());
create policy orgs_insert on public.organizations for insert to authenticated with check (
  public.is_active_user() and (
    (type in ('brand', 'agency') and exists (select 1 from profiles where id = public.me() and kind in ('brand', 'agency')))
    or (type = 'client' and public.has_perm(parent_org_id, 'clients.manage'))
  )
);
create policy orgs_update on public.organizations for update to authenticated using (public.has_perm(id, 'settings.manage') or public.has_perm(id, 'campaign.edit') or public.is_admin());

create policy memberships_select on public.memberships for select to authenticated using (user_id = public.me() or public.org_role(org_id) is not null or public.is_admin());
create policy memberships_insert on public.memberships for insert to authenticated with check (
  (public.has_perm(org_id, 'team.manage') and role <> 'owner')
  -- The founder of a brand-new workspace becomes its owner, in the same transaction.
  or (user_id = public.me() and role = 'owner'
      and public.is_new_empty_workspace(org_id))
);
create policy memberships_update on public.memberships for update to authenticated using (public.has_perm(org_id, 'team.manage') and role <> 'owner') with check (role <> 'owner');
create policy memberships_delete on public.memberships for delete to authenticated using (public.has_perm(org_id, 'team.manage') and role <> 'owner' and user_id <> public.me());

create policy invites_select on public.team_invites for select to authenticated using (public.has_perm(org_id, 'team.manage') or public.is_admin());
create policy invites_write on public.team_invites for insert to authenticated with check (public.has_perm(org_id, 'team.manage') and invited_by = public.me());
create policy invites_update on public.team_invites for update to authenticated using (public.has_perm(org_id, 'team.manage'));

-- Creator base table (private fields) — owner and admins only. Others use creator_directory.
create policy creators_select on public.creator_profiles for select to authenticated using (user_id = public.me() or public.is_admin());
create policy creators_insert on public.creator_profiles for insert to authenticated with check (
  user_id = public.me() and public.is_active_user() and exists (select 1 from profiles where id = public.me() and kind = 'creator'));
create policy creators_update on public.creator_profiles for update to authenticated using (user_id = public.me() or public.is_admin());
create policy creators_delete on public.creator_profiles for delete to authenticated using (user_id = public.me() or public.is_admin());

-- Campaigns base table (has the total budget) — org members and admins only.
create policy campaigns_select on public.campaigns for select to authenticated using (public.has_perm(org_id, 'campaign.view') or public.is_admin());
create policy campaigns_insert on public.campaigns for insert to authenticated with check (public.has_perm(org_id, 'campaign.edit') and created_by = public.me());
create policy campaigns_update on public.campaigns for update to authenticated using (public.has_perm(org_id, 'campaign.edit') or public.is_admin());
create policy campaigns_delete on public.campaigns for delete to authenticated using (public.has_perm(org_id, 'campaign.edit') and status = 'draft');

create policy activity_select on public.campaign_activity for select to authenticated using (public.has_perm(org_id, 'campaign.view') or public.is_admin());
create policy activity_insert on public.campaign_activity for insert to authenticated with check (
  actor_id = public.me() and (public.has_perm(org_id, 'campaign.view') or (creator_id = public.my_creator_id() and org_id in (select public.creator_thread_orgs()))));

-- Negotiation: org staff with budget access (not client reviewers) and the creator in the thread.
create policy invitations_select on public.invitations for select to authenticated using (public.has_perm(org_id, 'budget.view') or creator_id = public.my_creator_id() or public.is_admin());
create policy invitations_insert on public.invitations for insert to authenticated with check (public.has_perm(org_id, 'outreach.send') and created_by = public.me()
  and public.campaign_in_org(campaign_id, org_id));
create policy invitations_update on public.invitations for update to authenticated using (public.has_perm(org_id, 'outreach.send') or creator_id = public.my_creator_id());

create policy applications_select on public.applications for select to authenticated using (public.has_perm(org_id, 'budget.view') or creator_id = public.my_creator_id() or public.is_admin());
create policy applications_insert on public.applications for insert to authenticated with check (
  creator_id = public.my_creator_id() and status = 'submitted' and public.campaign_accepts_applications(campaign_id, org_id));
create policy applications_update on public.applications for update to authenticated using (public.has_perm(org_id, 'outreach.send') or creator_id = public.my_creator_id());

create policy offers_select on public.offers for select to authenticated using (public.has_perm(org_id, 'budget.view') or creator_id = public.my_creator_id() or public.is_admin());
create policy offers_insert on public.offers for insert to authenticated with check (
  created_by = public.me() and status = 'open' and public.campaign_in_org(campaign_id, org_id) and (
    (from_side = 'org' and public.has_perm(org_id, 'outreach.send'))
    or (from_side = 'creator' and creator_id = public.my_creator_id() and org_id in (select public.creator_thread_orgs()))));
create policy offers_update on public.offers for update to authenticated using (public.has_perm(org_id, 'outreach.send') or creator_id = public.my_creator_id());

create policy messages_select on public.messages for select to authenticated using (public.has_perm(org_id, 'budget.view') or creator_id = public.my_creator_id() or public.is_admin());
create policy messages_insert on public.messages for insert to authenticated with check (
  (sender_id = public.me() or (from_side = 'system' and sender_id is null)) and (
    (from_side in ('org', 'system') and public.has_perm(org_id, 'outreach.send'))
    or (from_side in ('creator', 'system') and creator_id = public.my_creator_id() and org_id in (select public.creator_thread_orgs()))));

-- Collaborations & content: client reviewers see these (not money or negotiation).
create policy collabs_select on public.collaborations for select to authenticated using (public.has_perm(org_id, 'campaign.view') or creator_id = public.my_creator_id() or public.is_admin());
create policy collabs_insert on public.collaborations for insert to authenticated with check (public.has_perm(org_id, 'outreach.send') or creator_id = public.my_creator_id());
create policy collabs_update on public.collaborations for update to authenticated using (public.has_perm(org_id, 'campaign.edit') or public.is_admin());

create policy deliverables_select on public.deliverables for select to authenticated using (public.has_perm(org_id, 'campaign.view') or creator_id = public.my_creator_id());
create policy deliverables_insert on public.deliverables for insert to authenticated with check (public.has_perm(org_id, 'outreach.send') or creator_id = public.my_creator_id());
create policy deliverables_update on public.deliverables for update to authenticated using (
  public.has_perm(org_id, 'content.review.internal') or public.has_perm(org_id, 'content.review.client') or creator_id = public.my_creator_id());

create policy files_select on public.files for select to authenticated using (
  owner_user_id = public.me() or visibility = 'public' or (org_id is not null and public.has_perm(org_id, 'campaign.view')) or public.is_admin());
create policy files_insert on public.files for insert to authenticated with check (owner_user_id = public.me() and (org_id is null or public.has_perm(org_id, 'org.view') or org_id in (select public.creator_thread_orgs())));
create policy files_update on public.files for update to authenticated using (owner_user_id = public.me());
create policy files_delete on public.files for delete to authenticated using (owner_user_id = public.me());

create policy submissions_select on public.submissions for select to authenticated using (public.has_perm(org_id, 'campaign.view') or creator_id = public.my_creator_id());
create policy submissions_insert on public.submissions for insert to authenticated with check (
  creator_id = public.my_creator_id()
  and exists (select 1 from deliverables d join collaborations k on k.id = d.collaboration_id
              where d.id = deliverable_id and k.id = collaboration_id and k.creator_id = submissions.creator_id and k.org_id = submissions.org_id
                and k.status = 'active' and d.status in ('not_started', 'revision_requested', 'in_review'))
  -- One version awaiting review at a time.
  and not exists (select 1 from submissions s where s.deliverable_id = submissions.deliverable_id and s.status in ('in_review', 'awaiting_client')));
-- USING picks who may act at the current stage; WITH CHECK lets that reviewer move it on.
create policy submissions_update on public.submissions for update to authenticated using (
  (status = 'in_review' and public.has_perm(org_id, 'content.review.internal'))
  or (status = 'awaiting_client' and public.has_perm(org_id, 'content.review.client'))
) with check (public.has_perm(org_id, 'content.review.internal') or public.has_perm(org_id, 'content.review.client'));

-- Payments: tracking only. Creators read their own rows.
create policy payments_select on public.payments for select to authenticated using (public.has_perm(org_id, 'budget.view') or creator_id = public.my_creator_id());
create policy payments_insert on public.payments for insert to authenticated with check (public.has_perm(org_id, 'payments.edit') or creator_id = public.my_creator_id());
create policy payments_update on public.payments for update to authenticated using (public.has_perm(org_id, 'payments.edit'));

create policy results_select on public.results for select to authenticated using (public.has_perm(org_id, 'campaign.view') or creator_id = public.my_creator_id());
create policy results_insert on public.results for insert to authenticated with check (
  entered_by = public.me() and (public.has_perm(org_id, 'results.edit') or (creator_id = public.my_creator_id() and source = 'creator_submitted')));
create policy results_update on public.results for update to authenticated using (public.has_perm(org_id, 'results.edit'));
create policy results_delete on public.results for delete to authenticated using (public.has_perm(org_id, 'results.edit'));

create policy collections_select on public.collections for select to authenticated using (public.has_perm(org_id, 'discover') or (shared_with_clients and public.has_perm(org_id, 'org.view')));
create policy collections_insert on public.collections for insert to authenticated with check (public.has_perm(org_id, 'collections.edit'));
create policy collections_update on public.collections for update to authenticated using (public.has_perm(org_id, 'collections.edit'));
create policy collections_delete on public.collections for delete to authenticated using (public.has_perm(org_id, 'collections.edit'));

create policy crm_select on public.crm_records for select to authenticated using (public.has_perm(org_id, 'crm.view'));
create policy crm_insert on public.crm_records for insert to authenticated with check (public.has_perm(org_id, 'crm.edit'));
create policy crm_update on public.crm_records for update to authenticated using (public.has_perm(org_id, 'crm.edit'));
create policy crm_delete on public.crm_records for delete to authenticated using (public.has_perm(org_id, 'crm.edit'));

-- Notifications are created only through deliver_notification() (see 0002).
create policy notifications_select on public.notifications for select to authenticated using (user_id = public.me());
create policy notifications_update on public.notifications for update to authenticated using (user_id = public.me()) with check (user_id = public.me());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = public.me());

create policy prefs_all on public.notification_prefs for all to authenticated using (user_id = public.me()) with check (user_id = public.me());

create policy verif_select on public.verification_requests for select to authenticated using (user_id = public.me() or public.is_admin());
create policy verif_insert on public.verification_requests for insert to authenticated with check (user_id = public.me() and creator_id = public.my_creator_id() and status = 'pending');
create policy verif_update on public.verification_requests for update to authenticated using (public.is_admin());

create policy reports_select on public.reports for select to authenticated using (reporter_id = public.me() or public.is_admin());
create policy reports_insert on public.reports for insert to authenticated with check (reporter_id = public.me() and status = 'open' and public.is_active_user());
create policy reports_update on public.reports for update to authenticated using (public.is_admin());

-- Audit log is written only through write_audit() (see 0002).
create policy audit_select on public.audit_log for select to authenticated using (public.is_admin() or (org_id is not null and public.has_perm(org_id, 'settings.manage')));

create policy settings_select on public.platform_settings for select to authenticated using (true);
create policy settings_update on public.platform_settings for update to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Grants. RLS decides rows; grants decide verbs. `anon` gets nothing.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, public;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.audit_log from authenticated;
revoke insert, delete on public.platform_settings from authenticated;
revoke insert on public.notifications from authenticated;

commit;
