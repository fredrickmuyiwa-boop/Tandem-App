# Connecting Supabase (Live mode)

Tandem runs in one of two modes:

| | Demo mode | Live mode |
|---|---|---|
| When | No Supabase keys set | `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set |
| Data | Fictional sample data in each visitor's browser | Your Supabase database, shared by all users |
| Accounts | Built-in demo accounts | Real sign-up with email confirmation (Supabase Auth) |
| Security | Checks in the app's backend layer | Postgres Row Level Security and integrity triggers |

## Setup (about 15 minutes)

### 1. Create the database

1. In Supabase, open your project, then **SQL Editor → New query**.
2. Open `supabase/setup.sql` from this repo, copy **all** of it, paste it in, and click **Run**. It should finish with "Success. No rows returned".
3. *Optional:* to try discovery and matching before real creators join, run `supabase/seed/sample_creators.sql` the same way. It adds 46 **fictional** creator profiles. Each one is flagged `sample` and labelled "Sample" in the app, and none can receive invitations. You can remove them later with `delete from public.creator_profiles where sample and user_id is null;`

**Already set up before uploads existed?** Run `supabase/migrations/0004_storage.sql` once the same way. It adds the private `submissions` storage bucket and its access rules. New projects get it as part of `setup.sql`.

### 2. Configure sign-in

In **Authentication → URL Configuration**:

- **Site URL:** your Vercel address, e.g. `https://tandem-app.vercel.app`
- **Redirect URLs:** add `https://tandem-app.vercel.app/**` (and `http://localhost:5173/**` if you run it on your own computer)

In **Authentication → Providers → Email**, leave **Confirm email** turned on.

> Supabase's built-in email sender only allows a few emails per hour and is meant for testing. Before inviting real users, add your own SMTP provider under **Authentication → Emails → SMTP Settings** (Resend, Postmark, Brevo, Amazon SES and others work).

### 3. Connect the website

1. In Supabase, open **Project Settings → API Keys** (or **API** on older dashboards). Copy the **Project URL** and the **anon / publishable** key. That key is meant to be public, because Row Level Security protects the data.
2. In Vercel, open **Project → Settings → Environment Variables** and add:
   - `VITE_SUPABASE_URL` = the Project URL
   - `VITE_SUPABASE_ANON_KEY` = the anon / publishable key
3. Under **Deployments**, open the ⋯ menu on the latest deployment and choose **Redeploy**. Vite reads these variables at build time, so the redeploy is required.

**Never** put the `service_role` / secret key into Vercel or anywhere in this app. Tandem doesn't need it.

### 4. Make yourself the platform admin

1. Open your site and sign up with your own email, then confirm it from the email you receive.
2. In the Supabase SQL Editor, run (using your email):
   ```sql
   update public.profiles set platform_role = 'admin' where email = 'you@example.com';
   ```
3. Sign out and back in. You'll land in the admin area, which covers verification, moderation, the audit log and platform settings.

Admin accounts are for running the platform. Use a different email for your own brand or creator account.

## How it works

```
Browser                                   Supabase
───────                                   ────────
Supabase Auth (sign-up, sign-in,  ──────▶  auth.users ─(trigger)─▶ public.profiles
  email confirmation, reset)

app_snapshot()  ◀───────────────────────  every row RLS lets this user read,
                                          plus privacy-filtered views of other
   in-memory copy                         people's creators, campaigns, orgs
   + the app's services
   (validation, workflow rules)

apply_changes([...])  ──────────────────▶  one transaction, run AS the user:
  one batch per action                    RLS + integrity triggers decide;
                                          any refusal rolls back the whole batch
```

- **The database is the authority.** The browser runs the same business logic as Demo mode, but every write is checked again in Postgres. If the server refuses, the app reloads from the server and shows the reason.
- **Privacy-filtered views.** `creator_directory`, `campaign_marketplace` and `org_directory` are how users see records they don't own. Hidden rates, audience and location are masked; budgets are never sent to creators; other people's user IDs are replaced with `claimed`.
- **Server-side notifications.** The browser asks for "the brand's team" or "this creator" and the database works out who that is. It checks the sender actually has a relationship with them and applies each recipient's notification preferences.
- **Rules the database enforces**, even against someone calling the API directly with a valid session:
  - **Campaigns:** the status lifecycle is enforced, and commercial terms are frozen once a campaign is live.
  - **Offers and collaborations:** offers can't be edited and only the receiving side can accept them. A collaboration must come from an accepted offer with identical terms.
  - **Creators:** a creator can only move their own work into review, can't add payments (except the schedule created at acceptance, capped at the agreed fee and bonus), can't mark themselves verified, and can't label their numbers "verified".
  - **Accounts and plans:** no one can change their own role or status, and plans can't be self-upgraded.
  - **Audit log:** entries are append-only and always record the real caller.
- **Freshness.** The app reloads its copy every 30 seconds and whenever the window regains focus.

## Testing

```bash
# Row Level Security, API and storage checks (77 assertions), plain SQL
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/00_local_auth_stub.sql \
  -f supabase/setup.sql -f supabase/tests/rls_test.sql

# The app's real services in Live mode against Postgres (8 scenarios, including forged writes and uploads)
LIVE_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run test:live
```

`00_local_auth_stub.sql` is only for plain Postgres. Supabase already has the `auth` schema.

## Limits to know about

- **Scale:** each user loads everything they're allowed to see when they sign in. That's fine for pilots and small teams (thousands of rows). Before large organisations or a big creator directory, move the heaviest lists (discovery, audit log, notifications) to paged queries.
- **Two people editing the same record at once:** the last save wins, per field. Critical steps (accepting offers, one open offer per conversation, one submission in review at a time) are protected by database constraints.
- **Files:** creators' drafts (video, images, PDF) are uploaded to the private `submissions` bucket, stored under their collaboration. Only that creator can upload, and only they, the brand's team (including its client reviewers) and admins can open the files, through links that expire after an hour. Submitted files can't be replaced or deleted. The limit is 50 MB per file on Supabase's Free plan, and Free projects include 1 GB of storage in total. On Pro, raise the bucket's limit under **Storage → submissions → Edit bucket**. Profile photos and portfolio images (up to 1 MB) are still stored in the database.
- **Not connected yet:** emails beyond Supabase Auth's own (invite and notification emails stay in-app), billing (plan changes go through an admin), Meta AI (needs `META_MODEL_API_KEY`), and social platform connections.
- **Changing an existing database:** `setup.sql` is for a new, empty project. Later changes should be added as new numbered files in `supabase/migrations/`.
