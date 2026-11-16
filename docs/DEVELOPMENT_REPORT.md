# Development report

_Last updated 16 November 2026 · version 0.1.0_

This report says what works, how it was checked, and what's still missing. "Implemented" means it works end to end in Demo mode, with permission checks in the backend layer. It doesn't just mean the screen exists.

## 1. Implemented

**Accounts and access**
- Sign-up for brands, agencies and creators, with email verification and password reset (demo token flow), sign-in, lockout, sessions, password change, signing out other sessions, data export and account deletion.
- Organisations with five roles (owner, admin, manager, member, client reviewer), team invites, role changes and removal.
- Agency client workspaces, where agency roles are inherited. An org switcher appears for people in more than one workspace.
- Plans (Starter, Growth, Agency, Enterprise) with feature gates such as AI matching, analytics and seat limits. Billing is not connected; see section 4.

**Discovery and AI**
- Creator discovery with filters for category, platform, audience size, location, language, engagement and rate. Includes compare (up to 3), collections, and a creator profile with privacy controls.
- AI matching from a free-text brief. The brief is turned into editable criteria, and creators are scored on 7 weighted factors with a reason for every point, a confidence level that drops when data is missing, and a suggested role. Recommendations also appear inside each campaign.
- Outreach drafts written from the campaign and the creator's own profile. A person always reviews and sends them.
- An AI strategist that answers from the workspace's own campaigns, budget and results, and says when data is missing or sample.
- A provider layer: local by default, or the Meta Model API through server functions, falling back to local if that fails.

**Campaigns and collaboration**
- Campaign builder: objective, audience, markets, deliverables, budget, compensation model, dates, approval chain and visibility. Campaigns can be duplicated.
- Lifecycle: draft → published/recruiting → active → under review → completed, plus paused and cancelled. Commercial terms lock once live.
- Creator marketplace and applications. Brands can shortlist, reject or make an offer.
- Negotiation: offers, counteroffers, questions, declines and a message thread. Accepting creates the collaboration, its deliverables and a payment schedule, with a budget-overrun guard.
- Content: versioned submissions (files and links) with internal review, then optional client review. Reviewers can approve, request a revision (limited by the agreed revision count) or reject, with comments. Deliverables can be reopened.
- Deadline reminders and in-app notifications with per-type preferences. Emails show as "queued".

**Money and results (tracking only)**
- Campaign budget: committed fees, bonuses, platform and agency fees, open offers, and a projected total marked as an estimate.
- Cross-campaign budget overview, payment schedule, mark pending or paid with a reference, and CSV export.
- Scenario comparison for allocating a budget across creator tiers, using only rates that creators chose to share.
- Creator earnings by currency.
- Results entry with a data source on every row, and analytics with totals, derived engagement rate, CPE and CPC, per-creator breakdowns and charts. Sample rows are labelled.

**Relationships and admin**
- Creator CRM: relationship status, tags, notes and history.
- Admin: platform overview, account and org suspension (sessions revoked), campaign list, the identity-verification queue, moderation reports (with unlist or pause), the audit log with CSV export, fees, plans and categories.

**Data honesty**
- Every creator, result and campaign in the demo is fictional and labelled "Sample".
- Audience and performance figures carry a source label (verified, creator-submitted, imported, estimate or manual). None of the demo data is labelled verified.
- Estimates are marked as estimates. There are no testimonials, customer logos or claimed customer numbers.

## 2. Tested

| What | How | Result |
|---|---|---|
| Type safety | `tsc --noEmit`, strict, for the app, tests and `api/` | 0 errors |
| Backend logic | 35 tests: auth (9), permissions (8), workflow (4, including the full brand → match → invite → counter → collaborate → submit → revise → approve → pay → results loop and the agency/client path), AI (9) and security (5) | 35/35 pass |
| Database RLS | `supabase/tests/rls_test.sql` on Postgres 16 | 59/59 assertions pass |
| UI, every route | Playwright signed in as brand, agency, client reviewer, creator and admin; 41 signed-in routes plus 7 public pages | All render; no app console errors |
| UI, full workflow | Playwright: brief → AI match → create & publish campaign → invite → creator counteroffer → brand accepts → creator submits → brand approves → payment recorded as paid | Passes |
| Access in the UI | Creator opening `/app` or `/admin`; client reviewer opening budget, team or discover; member opening `/admin` | Redirected or shown "not available to your role" |
| Account enumeration | Wrong password for a real email vs an unknown email | Identical message |
| Mobile | 390px viewport, 36 pages, checked for horizontal overflow | No overflow |
| Performance | Local static build, throttled to 16 Mbps / 150 ms RTT | First contentful paint ~1.7 s; sign-in → dashboard 0.85 s; entry chunk 62 KB gzipped, with routes lazy-loaded |

**How it was tested here:** the npm registry was unreachable from the build sandbox, so the checks ran on the same source with stand-in tooling. TypeScript type-checking used DefinitelyTyped sources. Each Vitest suite was bundled with esbuild and run on Node with a minimal `vitest` shim; the assertions are unchanged. The browser checks ran on an esbuild + Tailwind v4 `compile()` build, using an icon shim generated from the official Lucide SVGs.

**Not yet run with the real toolchain:** `npm install`, `npm run build` (Vite) and `npm test` (Vitest). Run `npm run check && npm run build` first after cloning. Setting up `docs/github-ci.yml` as a workflow makes that automatic.

## 3. Incomplete / not built

- **The frontend isn't wired to Supabase.** The schema and RLS are done and tested, but the app still uses the in-browser backend, so data lives in each visitor's browser. See docs/SUPABASE.md for the steps. This is the main thing between the demo and a multi-user production app.
- **No real email.** Notification emails are recorded as "queued" and never sent.
- **No social platform connections.** There's no Instagram, TikTok or YouTube OAuth or insights import, so no figure in the app is "verified" by a platform. The schema allows only trusted server code to set that label.
- **File storage in the demo.** Images up to 1 MB are stored inline so they can be previewed; other files keep only their name and size. Production needs a private Supabase Storage bucket.
- **No billing provider.** Changing plan takes effect immediately and charges nothing.
- **The Meta provider wasn't exercised live**, because there was no API key. It follows the published API, and the fallback is tested.
- **Outreach drafting is template-based (local)** even when the Meta provider is on. A model-written draft could be added through `/api/meta/assist`.
- **Not done:** multi-language UI, contract e-signature, tax and invoicing, and social listening.

## 4. Integrations needing credentials

| Integration | Variables | Status |
|---|---|---|
| Meta Model API | `META_MODEL_API_KEY` (server), `VITE_AI_PROVIDER=meta` | Code ready; needs a key |
| Supabase | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server) | Schema ready; frontend adapter not built |
| Email (Resend, Postmark…) | provider key (server) | Not built |
| Social platforms | OAuth app credentials per platform | Not built |
| Billing (Stripe, Paystack…) | provider keys (server) | Not built |

## 5. Known issues and limits

- `/api/meta/*` accepts calls from anyone who can reach the deployment, limited to 20 per minute per IP per instance. Add session checks before going live.
- The demo backend runs in the browser, so a determined user could change their own local demo data in devtools. That only affects their own browser. Production security comes from RLS, not from the demo layer.
- Currency conversion for comparing rates uses fixed reference rates and is labelled as an estimate.
- Fonts load from Google Fonts. When they're blocked, the app falls back to system fonts, which is expected.

## 6. Security summary

Permission checks happen in the backend layer (and in RLS in SQL), tenants are isolated, and users can't be enumerated. Passwords are hashed with PBKDF2, with lockout. Denials are audited, input is cleaned, CSV exports block formula injection, and uploads are checked against an allow-list. Security headers and a CSP are set. Untrusted text sent to the AI is wrapped and the output validated. No secrets reach the browser, nothing is sent without a person clicking, and payments are tracked, not held. Details are in docs/SECURITY.md.

## 7. Deployment status

**Not deployed.** The project is ready for Vercel as a static Vite app plus the `api/` functions. In Demo mode it needs no environment variables.
