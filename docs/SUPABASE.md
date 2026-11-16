# Supabase (production backend)

`supabase/migrations/0001_init.sql` creates the full schema: 27 tables, two privacy-filtered views, the indexes, the integrity triggers and Row Level Security on every table. `supabase/tests/rls_test.sql` checks it with 59 assertions.

> The frontend still talks to the in-browser demo backend (`src/server`). Connecting it to Supabase is the main remaining engineering task (see below).

## Apply the schema

With the Supabase CLI:

```bash
supabase link --project-ref <ref>
supabase db push                      # applies supabase/migrations/*
```

Or paste `0001_init.sql` into **SQL Editor** and run it.

## Run the RLS tests

On a local Supabase stack (`supabase start`):

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
```

On plain Postgres 15+ (this is how they were run during development, on Postgres 16), load the small auth stub first:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/00_local_auth_stub.sql \
  -f supabase/migrations/0001_init.sql \
  -f supabase/tests/rls_test.sql
```

The test runs inside a transaction and rolls back, so it leaves no data behind.

What's covered: anon access, tenant isolation, member/manager/owner limits, agency inheritance, the client reviewer's scope, creator isolation, the creator directory's privacy filter, the marketplace view not exposing budgets, self-verification and self-promotion being blocked, fake "verified" figures being blocked, the campaign lifecycle, frozen commercial terms, immutable offers, payment rules, the audit log being append-only, suspended users, and admin access.

## Design notes

- **`org_role(org)`, `has_perm(org, perm)` and `is_admin()`** are `SECURITY DEFINER` helpers with a pinned `search_path`. They implement the same matrix as `src/server/access.ts`. A suspended user or org gets no permissions.
- **`creator_directory` and `campaign_marketplace`** are owner-rights views marked `security_barrier`. They are the only way other users read creators and campaigns, and they return only shareable columns. The Supabase linter will flag them as "security definer views"; that is intentional here. Keep their column lists reviewed.
- **Notifications** are inserted by server code (service role), not by clients.
- **Storage:** create a private bucket called `submissions` with a size limit and the MIME types from `files.mime_type`. Add storage policies that mirror `files_select` and `files_insert`.

## Connecting the frontend (remaining work)

1. `npm install @supabase/supabase-js` and create a client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. Replace `src/server/services/auth.ts` with Supabase Auth (sign up, sign in, email confirmation, reset, sign out). On sign-up, create the `profiles` row with a database trigger.
3. Re-implement each service in `src/server/services/*` with the same function signatures, using Supabase queries. The pages call `api.*` only, so they don't need to change.
4. Move multi-step writes into Postgres functions (RPC) so each runs in one transaction: accepting an offer (creates the collaboration, deliverables and payment schedule), reviewing a submission, and completing a collaboration.
5. Send notification emails from a server job (a Supabase Edge Function or Vercel cron) using a provider such as Resend or Postmark. Until then, emails show as "queued".
