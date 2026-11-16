-- Row Level Security tests for supabase/migrations/0001_init.sql.
--
-- Run (local Postgres):  psql -v ON_ERROR_STOP=1 -f supabase/tests/00_local_auth_stub.sql \
--                             -f supabase/migrations/0001_init.sql -f supabase/tests/rls_test.sql
-- Run (Supabase local):  supabase db reset && psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
--
-- Every check raises on failure, so a clean run means every assertion passed.
-- Everything happens inside one transaction that is rolled back at the end.

\set ON_ERROR_STOP 1
\o /dev/null
begin;

create schema tests;
create table tests.passed (n serial, name text);
grant usage on schema tests to anon, authenticated;

-- Switch identity for the rest of the current transaction (or until next login).
create function tests.login(who text) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', coalesce((select id::text from auth.users where email = who || '@t.test'), ''), true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;
create function tests.anon() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); execute 'set local role anon'; end $$;
create function tests.ok(cond boolean, name text) returns void language plpgsql security definer as $$
begin
  if cond is not true then raise exception 'FAILED: %', name; end if;
  insert into tests.passed (name) values (name);
end $$;
grant execute on all functions in schema tests to anon, authenticated;

-- ---------- Fixtures (as superuser) ----------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ada@t.test'),     -- Lumi owner
  ('00000000-0000-0000-0000-0000000000a2', 'kemi@t.test'),    -- Lumi member
  ('00000000-0000-0000-0000-0000000000b1', 'oliver@t.test'),  -- Sable owner (other brand)
  ('00000000-0000-0000-0000-0000000000c1', 'zainab@t.test'),  -- Northbeam (agency) owner
  ('00000000-0000-0000-0000-0000000000c2', 'dami@t.test'),    -- Northbeam manager
  ('00000000-0000-0000-0000-0000000000c3', 'kwame@t.test'),   -- Kora client reviewer
  ('00000000-0000-0000-0000-0000000000d1', 'ife@t.test'),     -- creator
  ('00000000-0000-0000-0000-0000000000d2', 'seun@t.test'),    -- creator (unlisted)
  ('00000000-0000-0000-0000-0000000000e1', 'admin@t.test');

insert into public.profiles (id, name, kind, platform_role) values
  ('00000000-0000-0000-0000-0000000000a1', 'Ada', 'brand', 'user'),
  ('00000000-0000-0000-0000-0000000000a2', 'Kemi', 'brand', 'user'),
  ('00000000-0000-0000-0000-0000000000b1', 'Oliver', 'brand', 'user'),
  ('00000000-0000-0000-0000-0000000000c1', 'Zainab', 'agency', 'user'),
  ('00000000-0000-0000-0000-0000000000c2', 'Dami', 'agency', 'user'),
  ('00000000-0000-0000-0000-0000000000c3', 'Kwame', 'brand', 'user'),
  ('00000000-0000-0000-0000-0000000000d1', 'Ife', 'creator', 'user'),
  ('00000000-0000-0000-0000-0000000000d2', 'Seun', 'creator', 'user'),
  ('00000000-0000-0000-0000-0000000000e1', 'Admin', 'admin', 'admin');

insert into public.organizations (id, name, type, parent_org_id, country, plan_id) values
  ('10000000-0000-0000-0000-000000000001', 'Lumi Skincare', 'brand', null, 'Nigeria', 'brand_growth'),
  ('10000000-0000-0000-0000-000000000002', 'Sable & Co', 'brand', null, 'UK', 'brand_starter'),
  ('10000000-0000-0000-0000-000000000003', 'Northbeam', 'agency', null, 'Nigeria', 'agency_pro'),
  ('10000000-0000-0000-0000-000000000004', 'Kora Foods', 'client', '10000000-0000-0000-0000-000000000003', 'Ghana', 'agency_pro');

insert into public.memberships (org_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'member'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'owner'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c1', 'owner'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c2', 'manager'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000c3', 'client_reviewer');

insert into public.creator_profiles (id, user_id, display_name, handle, country, city, categories, audience, rates, visibility) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'Ife Balogun', 'ifeglows', 'Nigeria', 'Lagos', '{beauty}',
   '{"source":"creator_submitted","topCountries":[{"country":"Nigeria","pct":70}]}', '[{"format":"short_video","amount":250000,"currency":"NGN"}]',
   '{"listed": true, "show_rates": false, "show_audience": true, "show_city": false}'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d2', 'Seun Ade', 'seunade', 'Nigeria', 'Ibadan', '{tech}', null, null,
   '{"listed": false, "show_rates": true, "show_audience": true, "show_city": true}');

insert into public.campaigns (id, org_id, name, objective, budget, currency, compensation_model, start_date, end_date, status, visibility, deliverables) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Glow Serum launch', 'launch', 5000000, 'NGN', 'fixed', '2026-12-01', '2026-12-31', 'recruiting', 'public', '[{"platform":"instagram","format":"short_video","quantity":1}]'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Sable winter', 'awareness', 8000, 'GBP', 'fixed', '2026-12-01', '2026-12-31', 'draft', 'public', '[]'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', 'Kora 30-day', 'engagement', 20000, 'GHS', 'fixed', '2026-12-01', '2026-12-31', 'active', 'invite_only', '[]'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', 'Northbeam showreel', 'awareness', 1000000, 'NGN', 'fixed', '2026-12-01', '2026-12-31', 'draft', 'invite_only', '[]');

insert into public.invitations (id, org_id, campaign_id, creator_id, message, sent_by) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Hi Ife', '00000000-0000-0000-0000-0000000000a1');

insert into public.offers (id, org_id, campaign_id, creator_id, from_side, terms, status, created_by) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'org', '{"fee": 400000, "currency": "NGN"}', 'accepted', '00000000-0000-0000-0000-0000000000a1'),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'org', '{"fee": 3000, "currency": "GHS"}', 'accepted', '00000000-0000-0000-0000-0000000000c2');

insert into public.collaborations (id, org_id, campaign_id, creator_id, offer_id, terms) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '{"fee": 400000}'),
  ('60000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000003', '{"fee": 3000}');

insert into public.deliverables (id, collaboration_id, org_id, creator_id, title, platform, format, due_date, status) values
  ('70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Reel', 'instagram', 'short_video', '2026-12-20', 'not_started'),
  ('70000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 'TikTok', 'tiktok', 'short_video', '2026-12-20', 'awaiting_client');

insert into public.submissions (id, deliverable_id, collaboration_id, org_id, creator_id, version, caption, status) values
  ('80000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 1, 'Draft', 'awaiting_client');

insert into public.payments (id, org_id, campaign_id, collaboration_id, creator_id, label, kind, amount, currency, due_date) values
  ('90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Base fee', 'base', 400000, 'NGN', '2027-01-10'),
  ('90000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'Base fee', 'base', 3000, 'GHS', '2027-01-10');

insert into public.audit_log (org_id, action, severity) values ('10000000-0000-0000-0000-000000000002', 'sable.secret_event', 'info');

-- ---------- Anonymous ----------
select tests.anon();
do $$ begin
  begin perform 1 from public.campaigns; raise exception 'FAILED: anon read campaigns';
  exception when insufficient_privilege then perform tests.ok(true, 'anon cannot read campaigns'); end;
  begin perform 1 from public.creator_directory; raise exception 'FAILED: anon read directory';
  exception when insufficient_privilege then perform tests.ok(true, 'anon cannot read creator directory'); end;
end $$;

-- ---------- Tenant isolation ----------
select tests.login('ada');
do $$ begin
  perform tests.ok((select count(*) from public.campaigns) = 1, 'brand owner sees only own campaigns');
  perform tests.ok((select count(*) from public.organizations) = 1, 'brand owner sees only own org');
  perform tests.ok((select count(*) from public.payments) = 1, 'brand owner sees only own payments');
  perform tests.ok((select count(*) from public.audit_log) = 0, 'brand owner cannot read another org''s audit events');
  update public.campaigns set name = 'hijack' where id = '30000000-0000-0000-0000-000000000002';
  perform tests.ok(not found, 'brand owner cannot update another org''s campaign');
  begin
    insert into public.campaigns (org_id, name, objective, budget, currency, compensation_model, start_date, end_date, created_by)
    values ('10000000-0000-0000-0000-000000000002', 'Injected', 'awareness', 1, 'GBP', 'fixed', '2026-12-01', '2026-12-02', auth.uid());
    raise exception 'FAILED: cross-org insert';
  exception when insufficient_privilege then perform tests.ok(true, 'brand owner cannot create a campaign in another org'); end;
end $$;

select tests.login('oliver');
do $$ begin
  perform tests.ok((select count(*) from public.campaigns where org_id = '10000000-0000-0000-0000-000000000001') = 0, 'other brand cannot see Lumi campaigns');
  perform tests.ok((select count(*) from public.invitations) = 0, 'other brand cannot see Lumi invitations');
  perform tests.ok((select count(*) from public.profiles) = 1, 'other brand sees only own profile');
end $$;

-- ---------- Roles inside an org ----------
select tests.login('kemi');
do $$ begin
  perform tests.ok((select count(*) from public.campaigns) = 1, 'member can view campaigns');
  begin
    insert into public.campaigns (org_id, name, objective, budget, currency, compensation_model, start_date, end_date, created_by)
    values ('10000000-0000-0000-0000-000000000001', 'Member draft', 'awareness', 1, 'NGN', 'fixed', '2026-12-01', '2026-12-02', auth.uid());
    raise exception 'FAILED: member insert';
  exception when insufficient_privilege then perform tests.ok(true, 'member cannot create campaigns'); end;
  update public.payments set status = 'pending' where id = '90000000-0000-0000-0000-000000000001';
  perform tests.ok(not found, 'member cannot change payment status');
  begin
    insert into public.memberships (org_id, user_id, role) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'admin');
    raise exception 'FAILED: member added staff';
  exception when insufficient_privilege then perform tests.ok(true, 'member cannot add team members'); end;
end $$;

-- ---------- Agency inheritance & client reviewer ----------
select tests.login('dami');
do $$ begin
  perform tests.ok(exists (select 1 from public.campaigns where id = '30000000-0000-0000-0000-000000000003'), 'agency manager inherits access to client workspace');
  perform tests.ok((select count(*) from public.payments where org_id = '10000000-0000-0000-0000-000000000004') = 1, 'agency manager sees client payments');
end $$;

select tests.login('kwame');
do $$ begin
  perform tests.ok(exists (select 1 from public.campaigns where id = '30000000-0000-0000-0000-000000000003'), 'client reviewer sees own client campaign');
  perform tests.ok(not exists (select 1 from public.campaigns where org_id = '10000000-0000-0000-0000-000000000003'), 'client reviewer cannot see agency campaigns');
  perform tests.ok((select count(*) from public.payments) = 0, 'client reviewer cannot see payments');
  perform tests.ok((select count(*) from public.offers) = 0, 'client reviewer cannot see offers');
  perform tests.ok((select count(*) from public.collaborations) = 1, 'client reviewer can see collaborations');
  update public.submissions set status = 'approved' where id = '80000000-0000-0000-0000-000000000003';
  perform tests.ok(found, 'client reviewer can approve a submission awaiting client');
  update public.campaigns set name = 'Renamed' where id = '30000000-0000-0000-0000-000000000003';
  perform tests.ok(not found, 'client reviewer cannot edit campaigns');
end $$;

-- ---------- Creators ----------
select tests.login('ife');
do $$ declare d record; begin
  perform tests.ok((select count(*) from public.campaigns) = 0, 'creator cannot read campaign base table (budget)');
  perform tests.ok(exists (select 1 from public.campaign_marketplace where id = '30000000-0000-0000-0000-000000000001'), 'creator sees open campaign in marketplace');
  perform tests.ok(not exists (select 1 from public.campaign_marketplace where id = '30000000-0000-0000-0000-000000000002'), 'creator does not see draft campaigns');
  perform tests.ok(not exists (select 1 from information_schema.columns where table_name = 'campaign_marketplace' and column_name = 'budget'), 'marketplace view has no budget column');
  perform tests.ok((select count(*) from public.invitations) = 1, 'creator sees own invitation');
  perform tests.ok((select count(*) from public.payments) = 1, 'creator sees only own payments');
  update public.payments set status = 'paid', paid_at = now() where id = '90000000-0000-0000-0000-000000000001';
  perform tests.ok(not found, 'creator cannot mark own payment paid');
  begin update public.creator_profiles set identity_verification = 'verified' where user_id = auth.uid(); raise exception 'FAILED: self-verify';
  exception when insufficient_privilege then perform tests.ok(true, 'creator cannot self-verify identity'); end;
  update public.creator_profiles set identity_verification = 'pending' where user_id = auth.uid();
  perform tests.ok(found, 'creator can request verification');
  begin update public.profiles set platform_role = 'admin' where id = auth.uid(); raise exception 'FAILED: self-promote';
  exception when insufficient_privilege then perform tests.ok(true, 'user cannot promote self to admin'); end;
  begin insert into public.social_accounts (creator_id, platform, handle, followers, source) values ('20000000-0000-0000-0000-000000000001', 'tiktok', 'ifeglows', 99999999, 'verified'); raise exception 'FAILED: fake verified';
  exception when insufficient_privilege then perform tests.ok(true, 'creator cannot label own numbers as verified'); end;
  update public.creator_profiles set bio = 'edited' where id = '20000000-0000-0000-0000-000000000002';
  perform tests.ok(not found, 'creator cannot edit another creator profile');
  insert into public.submissions (deliverable_id, collaboration_id, org_id, creator_id, version, caption)
  values ('70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 'My draft');
  perform tests.ok(true, 'creator can submit content for own deliverable');
  begin
    insert into public.submissions (deliverable_id, collaboration_id, org_id, creator_id, version, caption)
    values ('70000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 2, 'Spoof');
    raise exception 'FAILED: spoof submission';
  exception when insufficient_privilege then perform tests.ok(true, 'creator cannot submit for another creator'); end;
  begin
    insert into public.audit_log (action) values ('forged'); raise exception 'FAILED: audit insert';
  exception when insufficient_privilege then perform tests.ok(true, 'users cannot write audit log directly'); end;
  perform public.write_audit('creator.test', 'self');
  perform tests.ok(true, 'write_audit() appends for any signed-in user');
end $$;

-- Directory privacy, seen by a brand.
select tests.login('ada');
do $$ declare r record; begin
  select * into r from public.creator_directory where handle = 'ifeglows';
  perform tests.ok(r.id is not null, 'brand sees listed creator in directory');
  perform tests.ok(r.city is null, 'hidden city is not exposed');
  perform tests.ok(r.rates is null, 'hidden rates are not exposed');
  perform tests.ok(r.audience is not null, 'shared audience is exposed with its source');
  perform tests.ok(not exists (select 1 from public.creator_directory where handle = 'seunade'), 'unlisted creator is not in directory');
  perform tests.ok(not exists (select 1 from information_schema.columns where table_name = 'creator_directory' and column_name = 'user_id'), 'directory does not expose user ids');
  perform tests.ok((select count(*) from public.creator_profiles) = 0, 'brand cannot read creator base table (private fields)');
end $$;

-- ---------- Integrity rules ----------
select tests.login('ada');
do $$ begin
  begin update public.campaigns set status = 'draft' where id = '30000000-0000-0000-0000-000000000001'; raise exception 'FAILED: bad transition';
  exception when check_violation then perform tests.ok(true, 'invalid campaign transition rejected'); end;
  begin update public.campaigns set budget = 1 where id = '30000000-0000-0000-0000-000000000001'; raise exception 'FAILED: budget edit';
  exception when check_violation then perform tests.ok(true, 'commercial terms frozen once recruiting'); end;
  update public.campaigns set description = 'Updated brief' where id = '30000000-0000-0000-0000-000000000001';
  perform tests.ok(found, 'non-commercial fields stay editable');
  begin
    update public.offers set terms = '{"fee": 1}' where id = '50000000-0000-0000-0000-000000000001';
    perform tests.ok(not found, 'accepted offers are immutable (no row updated)');
  exception when check_violation or insufficient_privilege then perform tests.ok(true, 'accepted offers are immutable'); end;
  reset role;
  begin
    update public.offers set terms = '{"fee": 1}' where id = '50000000-0000-0000-0000-000000000001';
    raise exception 'FAILED: offer trigger';
  exception when check_violation then perform tests.ok(true, 'offer trigger blocks edits even for trusted server code'); end;
  perform tests.login('ada');
  begin update public.payments set status = 'paid' where id = '90000000-0000-0000-0000-000000000001'; raise exception 'FAILED: paid without date';
  exception when check_violation then perform tests.ok(true, 'paid payments require a paid date'); end;
  update public.payments set status = 'paid', paid_at = now(), reference = 'TRF-1' where id = '90000000-0000-0000-0000-000000000001';
  perform tests.ok(found, 'owner can record a payment as paid');
end $$;

-- ---------- Suspension ----------
reset role;
update public.profiles set status = 'suspended' where id = '00000000-0000-0000-0000-0000000000b1';
select tests.login('oliver');
do $$ begin
  perform tests.ok((select count(*) from public.campaigns) = 0, 'suspended user loses org access');
  perform tests.ok((select count(*) from public.creator_directory) = 0, 'suspended user cannot browse creators');
end $$;

-- ---------- Admin ----------
select tests.login('admin');
do $$ begin
  perform tests.ok((select count(*) from public.campaigns) = 4, 'admin sees all campaigns');
  perform tests.ok((select count(*) from public.audit_log) >= 2, 'admin reads the full audit log');
  update public.creator_profiles set identity_verification = 'verified' where id = '20000000-0000-0000-0000-000000000001';
  perform tests.ok(found, 'admin can verify a creator identity');
end $$;

reset role;
\o
select count(*) as assertions_passed from tests.passed \gset
\echo RLS tests passed: :assertions_passed
rollback;
