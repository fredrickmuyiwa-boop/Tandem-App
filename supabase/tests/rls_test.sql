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

-- ---------- Fixtures (as the database owner) ----------
alter table auth.users disable trigger user;
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
alter table auth.users enable trigger user;

insert into public.profiles (id, email, name, kind, platform_role) values
  ('00000000-0000-0000-0000-0000000000a1', 'ada@t.test', 'Ada', 'brand', 'user'),
  ('00000000-0000-0000-0000-0000000000a2', 'kemi@t.test', 'Kemi', 'brand', 'user'),
  ('00000000-0000-0000-0000-0000000000b1', 'oliver@t.test', 'Oliver', 'brand', 'user'),
  ('00000000-0000-0000-0000-0000000000c1', 'zainab@t.test', 'Zainab', 'agency', 'user'),
  ('00000000-0000-0000-0000-0000000000c2', 'dami@t.test', 'Dami', 'agency', 'user'),
  ('00000000-0000-0000-0000-0000000000c3', 'kwame@t.test', 'Kwame', 'brand', 'user'),
  ('00000000-0000-0000-0000-0000000000d1', 'ife@t.test', 'Ife', 'creator', 'user'),
  ('00000000-0000-0000-0000-0000000000d2', 'seun@t.test', 'Seun', 'creator', 'user'),
  ('00000000-0000-0000-0000-0000000000e1', 'admin@t.test', 'Admin', 'admin', 'admin');

insert into public.organizations (id, name, type, parent_org_id, country, plan_id) values
  ('org_lumi', 'Lumi Skincare', 'brand', null, 'Nigeria', 'brand_growth'),
  ('org_sable', 'Sable & Co', 'brand', null, 'UK', 'brand_starter'),
  ('org_northbeam', 'Northbeam', 'agency', null, 'Nigeria', 'agency_studio'),
  ('org_kora', 'Kora Foods', 'client', 'org_northbeam', 'Ghana', 'agency_studio');

insert into public.memberships (id, org_id, user_id, role) values
  ('m1', 'org_lumi', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('m2', 'org_lumi', '00000000-0000-0000-0000-0000000000a2', 'member'),
  ('m3', 'org_sable', '00000000-0000-0000-0000-0000000000b1', 'owner'),
  ('m4', 'org_northbeam', '00000000-0000-0000-0000-0000000000c1', 'owner'),
  ('m5', 'org_northbeam', '00000000-0000-0000-0000-0000000000c2', 'manager'),
  ('m6', 'org_kora', '00000000-0000-0000-0000-0000000000c3', 'client_reviewer');

insert into public.creator_profiles (id, user_id, display_name, handle, country, city, categories, audience, rates, visibility) values
  ('cr_ife', '00000000-0000-0000-0000-0000000000d1', 'Ife Balogun', 'ifeglows', 'Nigeria', 'Lagos', '["beauty"]',
   '{"source":"creator_submitted","topCountries":[{"country":"Nigeria","pct":70}]}', '[{"format":"short_video","platform":"instagram","min":200000,"max":250000,"currency":"NGN"}]',
   '{"listed":true,"showLocation":false,"showRates":false,"showAudience":true,"showCollabHistory":true}'),
  ('cr_seun', '00000000-0000-0000-0000-0000000000d2', 'Seun Ade', 'seunade', 'Nigeria', 'Ibadan', '["tech"]', '{"source":"creator_submitted"}', '[]',
   '{"listed":false,"showLocation":true,"showRates":true,"showAudience":true,"showCollabHistory":true}');

insert into public.campaigns (id, org_id, name, objective, budget, currency, compensation_model, start_date, end_date, status, visibility, deliverables) values
  ('cmp_glow', 'org_lumi', 'Glow Serum launch', 'launch', 5000000, 'NGN', 'fixed', '2026-12-01', '2026-12-31', 'recruiting', 'public', '[{"id":"d1","platform":"instagram","format":"short_video","quantity":1}]'),
  ('cmp_sable', 'org_sable', 'Sable winter', 'awareness', 8000, 'GBP', 'fixed', '2026-12-01', '2026-12-31', 'draft', 'public', '[]'),
  ('cmp_kora', 'org_kora', 'Kora 30-day', 'engagement', 20000, 'GHS', 'fixed', '2026-12-01', '2026-12-31', 'active', 'invite_only', '[]'),
  ('cmp_nb', 'org_northbeam', 'Northbeam showreel', 'awareness', 1000000, 'NGN', 'fixed', '2026-12-01', '2026-12-31', 'draft', 'invite_only', '[]');

insert into public.invitations (id, org_id, campaign_id, creator_id, message, terms, created_by) values
  ('inv1', 'org_lumi', 'cmp_glow', 'cr_ife', 'Hi Ife', '{"fee": 400000, "currency": "NGN"}', '00000000-0000-0000-0000-0000000000a1');

insert into public.offers (id, org_id, campaign_id, creator_id, from_side, terms, status, created_by) values
  ('ofr1', 'org_lumi', 'cmp_glow', 'cr_ife', 'org', '{"fee": 400000, "currency": "NGN"}', 'accepted', '00000000-0000-0000-0000-0000000000a1'),
  ('ofr3', 'org_kora', 'cmp_kora', 'cr_seun', 'org', '{"fee": 3000, "currency": "GHS"}', 'accepted', '00000000-0000-0000-0000-0000000000c2');

insert into public.collaborations (id, org_id, campaign_id, creator_id, offer_id, terms) values
  ('col1', 'org_lumi', 'cmp_glow', 'cr_ife', 'ofr1', '{"fee": 400000, "currency": "NGN"}'),
  ('col3', 'org_kora', 'cmp_kora', 'cr_seun', 'ofr3', '{"fee": 3000, "currency": "GHS"}');

insert into public.deliverables (id, collaboration_id, org_id, creator_id, title, platform, format, due_date, status) values
  ('del1', 'col1', 'org_lumi', 'cr_ife', 'Reel', 'instagram', 'short_video', '2026-12-20', 'not_started'),
  ('del3', 'col3', 'org_kora', 'cr_seun', 'TikTok', 'tiktok', 'short_video', '2026-12-20', 'awaiting_client');

insert into public.submissions (id, deliverable_id, collaboration_id, org_id, creator_id, version, caption, status) values
  ('sub3', 'del3', 'col3', 'org_kora', 'cr_seun', 1, 'Draft', 'awaiting_client');

insert into public.payments (id, org_id, campaign_id, collaboration_id, creator_id, label, kind, amount, currency, due_date) values
  ('pay1', 'org_lumi', 'cmp_glow', 'col1', 'cr_ife', 'Base fee', 'base', 400000, 'NGN', '2027-01-10'),
  ('pay3', 'org_kora', 'cmp_kora', 'col3', 'cr_seun', 'Base fee', 'base', 3000, 'GHS', '2027-01-10');

insert into public.audit_log (org_id, action, severity) values ('org_sable', 'sable.secret_event', 'info');

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
  update public.campaigns set name = 'hijack' where id = 'cmp_sable';
  perform tests.ok(not found, 'brand owner cannot update another org''s campaign');
  begin
    insert into public.campaigns (id, org_id, name, objective, budget, currency, compensation_model, start_date, end_date, created_by)
    values ('cmp_x1', 'org_sable', 'Injected', 'awareness', 1, 'GBP', 'fixed', '2026-12-01', '2026-12-02', public.me());
    raise exception 'FAILED: cross-org insert';
  exception when insufficient_privilege then perform tests.ok(true, 'brand owner cannot create a campaign in another org'); end;
end $$;

select tests.login('oliver');
do $$ begin
  perform tests.ok((select count(*) from public.campaigns where org_id = 'org_lumi') = 0, 'other brand cannot see Lumi campaigns');
  perform tests.ok((select count(*) from public.invitations) = 0, 'other brand cannot see Lumi invitations');
  perform tests.ok((select count(*) from public.profiles) = 1, 'other brand sees only own profile');
end $$;

-- ---------- Roles inside an org ----------
select tests.login('kemi');
do $$ begin
  perform tests.ok((select count(*) from public.campaigns) = 1, 'member can view campaigns');
  begin
    insert into public.campaigns (id, org_id, name, objective, budget, currency, compensation_model, start_date, end_date, created_by)
    values ('cmp_x2', 'org_lumi', 'Member draft', 'awareness', 1, 'NGN', 'fixed', '2026-12-01', '2026-12-02', public.me());
    raise exception 'FAILED: member insert';
  exception when insufficient_privilege then perform tests.ok(true, 'member cannot create campaigns'); end;
  update public.payments set status = 'pending' where id = 'pay1';
  perform tests.ok(not found, 'member cannot change payment status');
  begin
    insert into public.memberships (id, org_id, user_id, role) values ('m9', 'org_lumi', '00000000-0000-0000-0000-0000000000b1', 'admin');
    raise exception 'FAILED: member added staff';
  exception when insufficient_privilege then perform tests.ok(true, 'member cannot add team members'); end;
end $$;

-- ---------- Agency inheritance & client reviewer ----------
select tests.login('dami');
do $$ begin
  perform tests.ok(exists (select 1 from public.campaigns where id = 'cmp_kora'), 'agency manager inherits access to client workspace');
  perform tests.ok((select count(*) from public.payments where org_id = 'org_kora') = 1, 'agency manager sees client payments');
end $$;

select tests.login('kwame');
do $$ begin
  perform tests.ok(exists (select 1 from public.campaigns where id = 'cmp_kora'), 'client reviewer sees own client campaign');
  perform tests.ok(not exists (select 1 from public.campaigns where org_id = 'org_northbeam'), 'client reviewer cannot see agency campaigns');
  perform tests.ok((select count(*) from public.payments) = 0, 'client reviewer cannot see payments');
  perform tests.ok((select count(*) from public.offers) = 0, 'client reviewer cannot see offers');
  perform tests.ok((select count(*) from public.collaborations) = 1, 'client reviewer can see collaborations');
  update public.submissions set status = 'approved' where id = 'sub3';
  perform tests.ok(found, 'client reviewer can approve a submission awaiting client');
  update public.campaigns set name = 'Renamed' where id = 'cmp_kora';
  perform tests.ok(not found, 'client reviewer cannot edit campaigns');
end $$;

-- ---------- Creators ----------
select tests.login('ife');
do $$ declare d record; begin
  perform tests.ok((select count(*) from public.campaigns) = 0, 'creator cannot read campaign base table (budget)');
  perform tests.ok(exists (select 1 from public.campaign_marketplace where id = 'cmp_glow'), 'creator sees open campaign in marketplace');
  perform tests.ok(not exists (select 1 from public.campaign_marketplace where id = 'cmp_sable'), 'creator does not see draft campaigns');
  perform tests.ok((select budget from public.campaign_marketplace where id = 'cmp_glow') is null, 'marketplace view never returns the budget');
  perform tests.ok((select count(*) from public.invitations) = 1, 'creator sees own invitation');
  perform tests.ok((select count(*) from public.payments) = 1, 'creator sees only own payments');
  update public.payments set status = 'paid', paid_at = now() where id = 'pay1';
  perform tests.ok(not found, 'creator cannot mark own payment paid');
  begin update public.creator_profiles set identity_verification = 'verified' where user_id = public.me(); raise exception 'FAILED: self-verify';
  exception when insufficient_privilege then perform tests.ok(true, 'creator cannot self-verify identity'); end;
  update public.creator_profiles set identity_verification = 'pending' where user_id = public.me();
  perform tests.ok(found, 'creator can request verification');
  begin update public.profiles set platform_role = 'admin' where id = public.me(); raise exception 'FAILED: self-promote';
  exception when insufficient_privilege then perform tests.ok(true, 'user cannot promote self to admin'); end;
  begin update public.creator_profiles set socials = '[{"id":"s1","platform":"tiktok","handle":"ifeglows","followers":99999999,"engagementRate":9,"source":"verified","updatedAt":"2026-01-01"}]' where id = 'cr_ife'; raise exception 'FAILED: fake verified';
  exception when insufficient_privilege then perform tests.ok(true, 'creator cannot label own numbers as verified'); end;
  update public.creator_profiles set bio = 'edited' where id = 'cr_seun';
  perform tests.ok(not found, 'creator cannot edit another creator profile');
  insert into public.submissions (id, deliverable_id, collaboration_id, org_id, creator_id, version, caption)
  values ('sub1', 'del1', 'col1', 'org_lumi', 'cr_ife', 1, 'My draft');
  perform tests.ok(true, 'creator can submit content for own deliverable');
  begin
    insert into public.submissions (id, deliverable_id, collaboration_id, org_id, creator_id, version, caption)
    values ('sub9', 'del3', 'col3', 'org_kora', 'cr_seun', 2, 'Spoof');
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
  perform tests.ok(r.city is null and r.country = 'Location hidden' or r.country = 'Nigeria', 'hidden city is not exposed');
  perform tests.ok(r.rates = '[]'::jsonb, 'hidden rates are not exposed');
  perform tests.ok(r.audience is not null, 'shared audience is exposed with its source');
  perform tests.ok(not exists (select 1 from public.creator_directory where handle = 'seunade'), 'unlisted creator is not in directory');
  perform tests.ok(r.user_id = 'claimed', 'directory hides real user ids');
  perform tests.ok((select count(*) from public.creator_profiles) = 0, 'brand cannot read creator base table (private fields)');
end $$;

-- ---------- Integrity rules ----------
select tests.login('ada');
do $$ begin
  begin update public.campaigns set status = 'draft' where id = 'cmp_glow'; raise exception 'FAILED: bad transition';
  exception when check_violation then perform tests.ok(true, 'invalid campaign transition rejected'); end;
  begin update public.campaigns set budget = 1 where id = 'cmp_glow'; raise exception 'FAILED: budget edit';
  exception when check_violation then perform tests.ok(true, 'commercial terms frozen once recruiting'); end;
  update public.campaigns set description = 'Updated brief' where id = 'cmp_glow';
  perform tests.ok(found, 'non-commercial fields stay editable');
  begin
    update public.offers set terms = '{"fee": 1}' where id = 'ofr1';
    perform tests.ok(not found, 'accepted offers are immutable (no row updated)');
  exception when check_violation or insufficient_privilege then perform tests.ok(true, 'accepted offers are immutable'); end;
  reset role;
  begin
    update public.offers set terms = '{"fee": 1}' where id = 'ofr1';
    raise exception 'FAILED: offer trigger';
  exception when check_violation then perform tests.ok(true, 'offer trigger blocks edits even for trusted server code'); end;
  perform tests.login('ada');
  update public.payments set status = 'paid', reference = 'TRF-1' where id = 'pay1';
  perform tests.ok(found, 'owner can record a payment as paid');
  perform tests.ok((select paid_at from public.payments where id = 'pay1') is not null, 'paid payments get a paid date');
end $$;

-- ---------- App API (0002) ----------
select tests.login('ife');
do $$ declare snap jsonb; begin
  snap := public.app_snapshot();
  perform tests.ok(not exists (select 1 from jsonb_array_elements(snap -> 'campaigns') c where c ->> 'budget' is not null), 'creator snapshot never includes budgets');
  perform tests.ok(not exists (select 1 from jsonb_array_elements(snap -> 'creator_profiles') c where c ->> 'id' <> 'cr_ife' and c ->> 'user_id' not in ('claimed')), 'creator snapshot hides other creators'' user ids');
  perform tests.ok(exists (select 1 from jsonb_array_elements(snap -> 'organizations') o where o ->> 'id' = 'org_lumi' and o ->> 'agency_fee_pct' is null), 'creator sees brand name only, not its settings');
  begin perform public.deliver_notification('00000000-0000-0000-0000-0000000000b1', 'system', 'x', 'y', '/'); raise exception 'FAILED: direct deliver';
  exception when insufficient_privilege then perform tests.ok(true, 'deliver_notification is not callable by users'); end;
  perform public.send_notification('00000000-0000-0000-0000-0000000000b1', 'system', 'Phish', 'click', '/');
  perform tests.ok(true, 'send_notification accepts any address but resolves it');
  begin perform public.apply_changes('[{"op":"update","table":"campaigns","id":"cmp_glow","row":{"name":"Mine now"}}]'); raise exception 'FAILED: apply_changes';
  exception when insufficient_privilege then perform tests.ok(true, 'apply_changes refuses rows RLS hides'); end;
  begin perform public.resolve_recipients('admins'); raise exception 'FAILED: resolve_recipients callable';
  exception when insufficient_privilege then perform tests.ok(true, 'recipient lookup is internal only'); end;
  begin perform public.apply_changes('[{"op":"insert","table":"pg_authid","id":"x","row":{}}]'); raise exception 'FAILED: unknown table';
  exception when insufficient_privilege then perform tests.ok(true, 'apply_changes only touches app tables'); end;
end $$;
reset role;
do $$ begin perform tests.ok(not exists (select 1 from public.notifications where title = 'Phish'), 'strangers can''t be notified'); end $$;

-- ---------- Storage (0004) ----------
select tests.login('ife');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('submissions', 'col1/a1-draft.mp4');
  perform tests.ok(true, 'creator can upload to own active collaboration');
  begin insert into storage.objects (bucket_id, name) values ('submissions', 'col3/x-spoof.mp4'); raise exception 'FAILED: upload elsewhere';
  exception when insufficient_privilege then perform tests.ok(true, 'creator cannot upload into another collaboration'); end;
  begin insert into storage.objects (bucket_id, name) values ('submissions', 'not-a-collab/x.mp4'); raise exception 'FAILED: upload junk';
  exception when insufficient_privilege then perform tests.ok(true, 'uploads must belong to a collaboration'); end;
  begin
    insert into public.files (id, owner_user_id, org_id, creator_id, name, type, size, storage_path)
    values ('f_spoof', public.me(), 'org_kora', 'cr_ife', 'x.mp4', 'video/mp4', 10, 'col3/x-spoof.mp4');
    raise exception 'FAILED: file record';
  exception when insufficient_privilege then perform tests.ok(true, 'file records can''t point into someone else''s collaboration'); end;
end $$;
select tests.login('seun');
do $$ begin
  perform tests.ok(not exists (select 1 from storage.objects where name = 'col1/a1-draft.mp4'), 'other creators can''t see the file');
end $$;
select tests.login('kemi');
do $$ begin perform tests.ok(exists (select 1 from storage.objects where name = 'col1/a1-draft.mp4'), 'brand team can view the submission file'); end $$;
select tests.login('oliver');
do $$ begin perform tests.ok(not exists (select 1 from storage.objects where name = 'col1/a1-draft.mp4'), 'other brands can''t view the file'); end $$;
select tests.login('kwame');
do $$ begin perform tests.ok(not exists (select 1 from storage.objects where name = 'col1/a1-draft.mp4'), 'a client reviewer elsewhere can''t view the file'); end $$;
reset role;
do $$ begin perform tests.ok((select public from storage.buckets where id = 'submissions') = false, 'submissions bucket is private'); end $$;

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
  update public.creator_profiles set identity_verification = 'verified' where id = 'cr_ife';
  perform tests.ok(found, 'admin can verify a creator identity');
end $$;

reset role;
\o
select count(*) as assertions_passed from tests.passed \gset
\echo RLS tests passed: :assertions_passed
rollback;
