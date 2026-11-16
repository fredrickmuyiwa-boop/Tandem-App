-- Tandem — the API the web app calls.
--
--   app_snapshot()          everything the signed-in user may see (RLS-filtered)
--   apply_changes(changes)  one atomic batch of inserts/updates/deletes, checked by RLS
--   delete_my_account(...)  self-service account deletion
--
-- Plus sign-up provisioning, team-invite redemption, privacy-filtered views of
-- other people's creators/campaigns/orgs, and server-side notification delivery.

begin;

-- ---------------------------------------------------------------------------
-- Sign-up: create the profile from Supabase Auth. `kind` can never be 'admin'.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text := coalesce(new.raw_user_meta_data ->> 'kind', 'brand');
begin
  if k not in ('brand', 'agency', 'creator') then k := 'brand'; end if;
  insert into profiles (id, email, name, kind, email_verified, created_at)
  values (new.id::text, lower(new.email),
          left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)), 120),
          k, new.email_confirmed_at is not null, now())
  on conflict (id) do nothing;
  perform public.redeem_team_invites(new.id::text);
  return new;
end $$;

create or replace function public.handle_user_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update profiles set email_verified = true where id = new.id::text;
  end if;
  if new.last_sign_in_at is distinct from old.last_sign_in_at then
    update profiles set last_login_at = new.last_sign_in_at where id = new.id::text;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated after update on auth.users for each row execute function public.handle_user_confirmed();

-- Pending team invites for this email become memberships (brand/agency accounts only).
create or replace function public.redeem_team_invites(uid text) returns void
language plpgsql security definer set search_path = public as $$
declare inv record; p profiles;
begin
  select * into p from profiles where id = uid;
  if p.id is null or p.kind = 'creator' then return; end if;
  for inv in select * from team_invites where lower(email) = lower(p.email) and status = 'pending' loop
    insert into memberships (id, org_id, user_id, role, created_at)
    values ('mem_' || replace(gen_random_uuid()::text, '-', ''), inv.org_id, uid, inv.role, now())
    on conflict (org_id, user_id) do nothing;
    update team_invites set status = 'accepted' where id = inv.id;
  end loop;
end $$;

-- Inviting someone who already has an account adds them straight away.
create or replace function public.on_team_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid text;
begin
  select id into uid from profiles where lower(email) = lower(new.email) and kind <> 'creator';
  if uid is not null then
    perform public.redeem_team_invites(uid);
    perform public.deliver_notification(uid, 'team', 'You were added to ' || (select name from organizations where id = new.org_id),
      'You were added as ' || replace(new.role, '_', ' ') || '.', '/app/dashboard');
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Notifications: delivered server-side, honouring the recipient's preferences.
-- ---------------------------------------------------------------------------
create or replace function public.deliver_notification(recipient text, n_type text, n_title text, n_body text, n_link text)
returns void language plpgsql security definer set search_path = public as $$
declare pr notification_prefs; in_app boolean := true; by_email boolean := n_type not in ('campaign', 'team');
begin
  if recipient is null or not exists (select 1 from profiles where id = recipient) then return; end if;
  select * into pr from notification_prefs where user_id = recipient;
  if pr.user_id is not null then
    in_app := coalesce((pr.in_app ->> n_type)::boolean, true);
    by_email := coalesce((pr.email ->> n_type)::boolean, false) and pr.digest <> 'off';
  end if;
  if not in_app and not by_email then return; end if;
  -- Collapse duplicates within 10 minutes.
  if exists (select 1 from notifications where user_id = recipient and title = left(n_title, 200) and created_at > now() - interval '10 minutes') then return; end if;
  insert into notifications (id, user_id, type, title, body, link, read, created_at, email_queued)
  values ('ntf_' || replace(gen_random_uuid()::text, '-', ''), recipient, n_type, left(n_title, 200), left(coalesce(n_body, ''), 1000),
          case when n_link ~ '^/' then left(n_link, 300) end, not in_app, now(), by_email);
end $$;
revoke all on function public.deliver_notification(text, text, text, text, text) from public, anon, authenticated;

-- Who the signed-in user may notify. Recipients may be a user id, or an address
-- the app can't resolve itself: 'creator:<creatorId>', 'org:<orgId>:<permission>', 'admins'.
create or replace function public.resolve_recipients(addr text) returns setof text
language plpgsql stable security definer set search_path = public as $$
declare parts text[]; me text := auth.uid()::text;
begin
  if not public.is_active_user() then return; end if;
  if addr = me then return next addr; return; end if;
  if addr = 'admins' then
    return query select id from profiles where platform_role = 'admin' and status = 'active';
    return;
  end if;
  if addr like 'creator:%' then
    parts := string_to_array(addr, ':');
    if public.is_admin() or exists (
      select 1 from (select org_id, creator_id from invitations union all select org_id, creator_id from applications
                     union all select org_id, creator_id from offers union all select org_id, creator_id from collaborations) t
      where t.creator_id = parts[2] and public.has_perm(t.org_id, 'campaign.view')) then
      return query select user_id from creator_profiles where id = parts[2] and user_id is not null;
    end if;
    return;
  end if;
  if addr like 'org:%' then
    parts := string_to_array(addr, ':');
    if public.is_admin() or public.org_role(parts[2]) is not null or parts[2] in (select public.creator_thread_orgs()) then
      return query select u from (
        select m.user_id as u from memberships m where m.org_id = parts[2] and public.role_can(m.role, coalesce(parts[3], 'org.view'))
        union
        select m.user_id from memberships m join organizations o on o.parent_org_id = m.org_id
        where o.id = parts[2] and m.role <> 'client_reviewer' and public.role_can(m.role, coalesce(parts[3], 'org.view'))
      ) r where r.u <> me;   -- don't notify people about their own actions
    end if;
    return;
  end if;
  -- A plain user id: allowed when you share a workspace, or you're an admin.
  if public.is_admin() or exists (select 1 from memberships m where m.user_id = addr and public.org_role(m.org_id) is not null) then
    return next addr;
  end if;
  -- Creators may notify a creator user they're already working with via 'creator:' only.
end $$;

-- The only way app users create notifications: the address is resolved and
-- checked by resolve_recipients(), then delivered with the recipient's preferences.
create or replace function public.send_notification(addr text, n_type text, n_title text, n_body text, n_link text)
returns void language plpgsql security definer set search_path = public as $$
declare rcpt text;
begin
  if n_type not in ('invitation', 'application', 'offer', 'collaboration', 'submission', 'review', 'revision', 'deadline', 'payment', 'campaign', 'team', 'system', 'verification') then return; end if;
  for rcpt in select * from public.resolve_recipients(addr) loop
    perform public.deliver_notification(rcpt, n_type, n_title, n_body, n_link);
  end loop;
end $$;
revoke all on function public.send_notification(text, text, text, text, text) from public, anon;
grant execute on function public.send_notification(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Audit log: append-only. The actor is always the caller, never client-supplied.
-- ---------------------------------------------------------------------------
create or replace function public.write_audit(p_action text, p_target text default null, p_severity text default 'info', p_org text default null, p_detail text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_severity is null or p_severity not in ('info', 'warning', 'security') then p_severity := 'info'; end if;
  if coalesce(trim(p_action), '') = '' then return; end if;
  insert into audit_log (actor_id, actor_email, org_id, action, target, severity, detail)
  values (auth.uid()::text, (select email from profiles where id = auth.uid()::text),
          case when p_org is not null and (public.org_role(p_org) is not null or public.is_admin()) then p_org end,
          left(p_action, 80), left(p_target, 200), p_severity, left(p_detail, 1000));
end $$;
grant execute on function public.write_audit(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Side effects the creator can't write themselves.
-- ---------------------------------------------------------------------------
-- When terms are agreed, the brand's CRM record moves to "active" (unless "do not contact").
create or replace function public.on_collaboration_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into crm_records (id, org_id, creator_id, status, updated_at)
  values ('crm_' || replace(gen_random_uuid()::text, '-', ''), new.org_id, new.creator_id, 'active', now())
  on conflict (org_id, creator_id) do update set status = 'active', updated_at = now() where crm_records.status <> 'do_not_contact';
  return null;
end $$;
create trigger t_collab_crm after insert on public.collaborations for each row execute function public.on_collaboration_created();
create trigger t_team_invite after insert on public.team_invites for each row execute function public.on_team_invite();

-- ---------------------------------------------------------------------------
-- What other people's records look like to you. Owner-rights views that only
-- return shareable columns; their column names match the base tables.
-- ---------------------------------------------------------------------------
create or replace view public.creator_directory with (security_barrier = true) as
  select c.id,
         case when c.user_id is null then null else 'claimed' end as user_id,
         c.display_name, c.handle, c.bio,
         case when (c.visibility ->> 'showLocation')::boolean or public.related_creator(c.id) then c.country else 'Location hidden' end as country,
         case when (c.visibility ->> 'showLocation')::boolean then c.city end as city,
         c.languages, c.categories, c.formats, c.socials,
         case when (c.visibility ->> 'showAudience')::boolean then c.audience else jsonb_build_object('source', c.audience ->> 'source') end as audience,
         case when (c.visibility ->> 'showRates')::boolean then c.rates else '[]'::jsonb end as rates,
         c.portfolio, c.preferred_collabs, c.availability, c.identity_verification, c.visibility,
         c.avatar_hue, c.avatar_file_ref, c.sample, c.created_at, c.updated_at
  from public.creator_profiles c
  left join public.profiles p on p.id = c.user_id
  where public.is_active_user()
    and (c.user_id is null or p.status = 'active')
    and ((c.visibility ->> 'listed')::boolean or public.related_creator(c.id) or public.is_admin());

create or replace view public.campaign_marketplace with (security_barrier = true) as
  select c.id, c.org_id, c.name, c.description, c.product_id, c.objective, c.audience, c.locations, c.languages, c.platforms, c.categories,
         null::numeric as budget, c.currency, c.start_date, c.end_date, c.deliverables, c.requirements, c.guidelines, c.approval,
         c.compensation_model, ''::text as performance_targets, c.visibility, c.status, null::text as created_by, c.created_at, c.updated_at, c.sample
  from public.campaigns c join public.organizations o on o.id = c.org_id
  where public.my_creator_id() is not null and o.status = 'active'
    and ((c.visibility = 'public' and c.status in ('published', 'recruiting'))
      or c.id in (select campaign_id from invitations where creator_id = public.my_creator_id()
                  union select campaign_id from applications where creator_id = public.my_creator_id()
                  union select campaign_id from collaborations where creator_id = public.my_creator_id()));

create or replace view public.org_directory with (security_barrier = true) as
  select o.id, o.name, o.type, null::text as parent_org_id, o.country, o.industry, o.website, o.description, o.plan_id,
         null::numeric as agency_fee_pct, o.status, o.created_at,
         coalesce((select jsonb_agg(jsonb_build_object('id', p ->> 'id', 'name', p ->> 'name', 'description', coalesce(p ->> 'description', ''))) from jsonb_array_elements(o.products) p), '[]') as products
  from public.organizations o
  where o.id in (select org_id from public.campaign_marketplace);

revoke all on public.creator_directory, public.campaign_marketplace, public.org_directory from anon, public;
grant select on public.creator_directory, public.campaign_marketplace, public.org_directory to authenticated;

-- ---------------------------------------------------------------------------
-- app_snapshot(): every row the caller may read, keyed by table. Runs with the
-- caller's rights, so RLS filters each table.
-- ---------------------------------------------------------------------------
create or replace function public.app_snapshot() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare out jsonb := '{}'; t text; rows jsonb;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  foreach t in array array['profiles','memberships','team_invites','campaign_activity','invitations','applications','offers','messages',
    'collaborations','deliverables','files','submissions','payments','results','collections','crm_records','notifications',
    'notification_prefs','verification_requests','reports'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from public.%I x', t) into rows;
    out := out || jsonb_build_object(t, rows);
  end loop;
  -- Your own rows from the base tables, plus what others share with you.
  out := out || jsonb_build_object('organizations', (
    select coalesce(jsonb_agg(x), '[]') from (
      select to_jsonb(o) x from organizations o
      union all select to_jsonb(d) from org_directory d where d.id not in (select id from organizations)) s));
  out := out || jsonb_build_object('creator_profiles', (
    select coalesce(jsonb_agg(x), '[]') from (
      select to_jsonb(c) x from creator_profiles c
      union all select to_jsonb(d) from creator_directory d where d.id not in (select id from creator_profiles)) s));
  out := out || jsonb_build_object('campaigns', (
    select coalesce(jsonb_agg(x), '[]') from (
      select to_jsonb(c) x from campaigns c
      union all select to_jsonb(m) from campaign_marketplace m where m.id not in (select id from campaigns)) s));
  out := out || jsonb_build_object('audit_log', (select coalesce(jsonb_agg(to_jsonb(a) order by a.at desc), '[]') from (select * from audit_log order by at desc limit 400) a));
  out := out || jsonb_build_object('platform_settings', (select to_jsonb(s) from platform_settings s limit 1));
  out := out || jsonb_build_object('me', auth.uid()::text, 'server_time', now());
  return out;
end $$;
grant execute on function public.app_snapshot() to authenticated;

-- ---------------------------------------------------------------------------
-- apply_changes(changes): apply one batch atomically, as the caller (RLS applies).
--   changes: [{ "op": "insert"|"update"|"delete", "table": "...", "id": "...", "row": {...} }]
--   `row` uses column names; for updates it holds only the changed columns.
-- A write that RLS filters out (0 rows) fails the whole batch.
-- ---------------------------------------------------------------------------
create or replace function public.apply_changes(changes jsonb) returns jsonb
language plpgsql volatile security invoker set search_path = public as $$
declare
  ch jsonb; op text; tbl text; rid text; r jsonb; n int; cols text; sets text;
  writable constant text[] := array['profiles','organizations','memberships','team_invites','creator_profiles','campaigns',
    'campaign_activity','invitations','applications','offers','messages','collaborations','deliverables','files','submissions',
    'payments','results','collections','crm_records','notifications','notification_prefs','verification_requests','reports','platform_settings'];
  applied int := 0;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not public.is_active_user() then raise exception 'This account is suspended' using errcode = '42501'; end if;
  if jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) > 500 then
    raise exception 'Invalid change set' using errcode = '22023';
  end if;

  for ch in select * from jsonb_array_elements(changes) loop
    op := ch ->> 'op'; tbl := ch ->> 'table'; rid := ch ->> 'id'; r := coalesce(ch -> 'row', '{}');

    -- Audit entries and notifications go through their server-side writers.
    if tbl = 'audit_log' and op = 'insert' then
      perform public.write_audit(r ->> 'action', r ->> 'target', r ->> 'severity', r ->> 'org_id', r ->> 'detail');
      applied := applied + 1; continue;
    end if;
    if tbl = 'notifications' and op = 'insert' then
      perform public.send_notification(r ->> 'user_id', r ->> 'type', r ->> 'title', r ->> 'body', r ->> 'link');
      applied := applied + 1; continue;
    end if;
    -- CRM is the brand's own data; creator-side actions don't write it (a trigger handles agreed terms).
    if tbl = 'crm_records' and not public.has_perm(coalesce(r ->> 'org_id', (select org_id from crm_records where id = rid)), 'crm.edit') then
      continue;
    end if;
    if not (tbl = any (writable)) then raise exception 'Unknown table %', tbl using errcode = '42501'; end if;
    if rid is null and tbl <> 'platform_settings' then raise exception 'Missing id' using errcode = '22023'; end if;

    if op = 'insert' then
      select string_agg(format('%I', k), ', ') into cols
        from jsonb_object_keys(r) k
        where exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = tbl and c.column_name = k);
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', tbl, cols, cols, tbl) using r;
    elsif op = 'update' then
      select string_agg(format('%I = x.%I', k, k), ', ') into sets
        from jsonb_object_keys(r) k
        where k <> 'id' and exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = tbl and c.column_name = k);
      if sets is null then continue; end if;
      if tbl = 'platform_settings' then
        execute format('update public.platform_settings t set %s from jsonb_populate_record(null::public.platform_settings, $1) x where t.id', sets) using r;
      elsif tbl = 'notification_prefs' then
        execute format('update public.notification_prefs t set %s from jsonb_populate_record(null::public.notification_prefs, $1) x where t.user_id = $2', sets) using r, rid;
      else
        execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) x where t.id = $2', tbl, sets, tbl) using r, rid;
      end if;
      get diagnostics n = row_count;
      if n = 0 then raise exception 'You don’t have permission to change this (% %)', tbl, rid using errcode = '42501'; end if;
    elsif op = 'delete' then
      if tbl = 'notification_prefs' then
        execute 'delete from public.notification_prefs where user_id = $1' using rid;
      else
        execute format('delete from public.%I where id = $1', tbl) using rid;
      end if;
      get diagnostics n = row_count;
      if n = 0 then raise exception 'You don’t have permission to delete this (% %)', tbl, rid using errcode = '42501'; end if;
    else
      raise exception 'Unknown operation %', op using errcode = '22023';
    end if;
    applied := applied + 1;
  end loop;
  return jsonb_build_object('applied', applied, 'server_time', now());
end $$;
grant execute on function public.apply_changes(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Account deletion (removes the Supabase Auth user; profile rows cascade).
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account(confirm_email text) returns void
language plpgsql security definer set search_path = public, auth as $$
declare me text := auth.uid()::text; p profiles; cid text;
begin
  select * into p from profiles where id = me;
  if p.id is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if lower(trim(confirm_email)) <> lower(p.email) then raise exception 'Type your email address exactly to confirm.' using errcode = '22023'; end if;
  if exists (select 1 from memberships m where m.user_id = me and m.role = 'owner'
             and (select count(*) from memberships x where x.org_id = m.org_id) > 1
             and (select count(*) from memberships x where x.org_id = m.org_id and x.role = 'owner') = 1) then
    raise exception 'Transfer ownership of your workspace to another member before deleting your account.' using errcode = '23514';
  end if;
  select id into cid from creator_profiles where user_id = me;
  if cid is not null and exists (select 1 from collaborations where creator_id = cid and status = 'active') then
    raise exception 'Finish or cancel your active collaborations before deleting your account.' using errcode = '23514';
  end if;
  -- Workspaces you own alone go with you.
  delete from organizations o where o.id in (select org_id from memberships where user_id = me and role = 'owner')
    and (select count(*) from memberships x where x.org_id = o.id) = 1;
  if cid is not null then
    -- Past collaborations keep their records for the counterparty; the profile is anonymised.
    if exists (select 1 from collaborations where creator_id = cid) then
      update creator_profiles set user_id = null, display_name = 'Deleted creator', handle = 'deleted_' || substr(md5(cid), 1, 10), bio = '',
        city = null, socials = '[]', audience = '{"source":"creator_submitted"}', rates = '[]', portfolio = '[]',
        visibility = '{"listed":false,"showLocation":false,"showRates":false,"showAudience":false,"showCollabHistory":false}' where id = cid;
    else
      delete from creator_profiles where id = cid;
    end if;
  end if;
  insert into audit_log (actor_email, action, severity) values (p.email, 'account.deleted', 'security');
  delete from auth.users where id = me::uuid;
end $$;
grant execute on function public.delete_my_account(text) to authenticated;

-- Internal helpers: only callable from the functions and triggers above.
revoke all on function public.resolve_recipients(text) from public, anon, authenticated;
revoke all on function public.redeem_team_invites(text) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_user_confirmed() from public, anon, authenticated;
revoke all on function public.on_team_invite() from public, anon, authenticated;
revoke all on function public.on_collaboration_created() from public, anon, authenticated;
revoke all on function public.app_snapshot() from public, anon;
revoke all on function public.apply_changes(jsonb) from public, anon;
revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.app_snapshot() to authenticated;
grant execute on function public.apply_changes(jsonb) to authenticated;
grant execute on function public.delete_my_account(text) to authenticated;

commit;
