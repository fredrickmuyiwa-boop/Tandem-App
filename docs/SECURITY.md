# Security

## Model

Authorisation lives in the backend, never in the UI. In Demo mode, every service call goes through `src/server/access.ts`. In production, Postgres Row Level Security does the same job (`supabase/migrations/0001_init.sql`). Both implement the same permission matrix:

| Permission | owner | admin | manager | member | client_reviewer |
|---|:-:|:-:|:-:|:-:|:-:|
| View org & campaigns | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create / edit campaigns | ✓ | ✓ | ✓ | | |
| Discover creators, collections, CRM | ✓ | ✓ | ✓ | ✓ | |
| Send outreach and offers | ✓ | ✓ | ✓ | | |
| Internal content review | ✓ | ✓ | ✓ | | |
| Client (final) content review | | | | | ✓ |
| View budgets and negotiations | ✓ | ✓ | ✓ | ✓ | |
| Update payments and results | ✓ | ✓ | ✓ | | |
| Team, settings, client workspaces | ✓ | ✓ | | | |

- **Tenant isolation.** A user can only reach orgs they belong to. Requests for other orgs return *not found*, not *forbidden*, so IDs can't be probed.
- **Agencies.** Agency staff inherit their agency role in client workspaces. Client reviewers see only their own workspace.
- **Creators** never receive a campaign's total budget, other creators' data, or anyone's payments but their own.
- **Creator privacy.** Brands read creators through a filtered view (`CreatorView` in the demo, `creator_directory` in SQL). That view leaves out city, rates and audience unless the creator chose to share them, and never includes user IDs.
- **Denials are logged.** Every permission denial writes a `permission.denied` audit event with severity `security`.

## Live mode (Supabase)

- The browser holds only what RLS lets that user read. Other people's creators, campaigns and organisations come through privacy-filtered views: hidden fields are masked, budgets are never sent to creators, and other users' IDs are replaced with `claimed`.
- Every change goes through `apply_changes()`, which runs **as the user** in a single transaction. RLS decides each row, triggers enforce the workflow rules, and a refusal anywhere rolls back the whole batch. A write that RLS filters out counts as a refusal rather than silently doing nothing.
- The audit log and notifications have server-side writers. The audit actor is always the real caller, and notifications only reach people the sender has a working relationship with.
- Uploaded files live in a private Storage bucket. Uploading is limited to the creator in that collaboration, and viewing to them, the brand team and admins, always through links that expire after an hour.
- `supabase/tests/rls_test.sql` (77 checks) and `tests/live/workflow.live.ts` (forged writes made directly against the API) test these rules.
- The browser uses only the public anon/publishable key. Tandem never uses the service-role key.

## Authentication (Demo mode backend)

- Passwords are hashed with PBKDF2-SHA256 (120,000 iterations, random salt, via WebCrypto). They must be at least 10 characters and include letters and numbers.
- A wrong password and an unknown email produce the same message, and sign-up and password reset respond the same whether or not the email exists, so accounts can't be enumerated.
- After 5 failed sign-ins, the account is locked for 5 minutes. Failures and lockouts are audited.
- Sessions expire after 12 hours. Changing your password signs out your other sessions, and suspending an account revokes its sessions.
- Users can export their data (JSON) and delete their account.

In Live mode, Supabase Auth handles all of this: hashing, email confirmation, reset links, sessions, and rate limiting of sign-in attempts.

## Data integrity (enforced in SQL)

- Campaign status follows a fixed lifecycle, and commercial terms (budget, currency, compensation, deliverables) are frozen once a campaign is live.
- Accepted offers can't be edited. A change means a new counteroffer.
- Users can't change their own role or status, creators can't mark their identity verified, and only trusted server code can label figures `verified`.
- The audit log is append-only through `write_audit()`.
- A payment marked `paid` must have a paid date.

## Content and input

- All text is cleaned (`src/lib/sanitize.ts`): control characters are stripped, lengths are limited, and only `https:` / `http:` URLs are allowed. React escapes output, and the Markdown renderer emits no raw HTML.
- CSV exports escape cells starting with `= + - @` to block spreadsheet formula injection.
- Uploads are checked against a type allow-list (JPEG, PNG, WebP, GIF, MP4, MOV, WebM, PDF) and a size limit. In production, store files in a **private** Supabase Storage bucket and serve them through signed URLs.
- External links open with `rel="noopener noreferrer nofollow"`.

## Headers (`vercel.json`)

CSP (`default-src 'self'`, no inline scripts, `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, microphone and geolocation off), and HSTS.

## Payments

Tandem **tracks** payment status. It does not hold, move or escrow money, and it has no wallet or balance. Brands pay creators through their own bank or a licensed provider and record the reference in Tandem.

## Legal

Accepted terms are a record of what both sides agreed in the app. The UI says so wherever terms appear, and states that this is **not a signed legal contract**. Tandem makes no claim of regulatory compliance. Before launch, review data-protection obligations (for example NDPA in Nigeria, POPIA in South Africa, UK and EU GDPR) and advertising-disclosure rules with counsel.

## Secrets

- `.env*` files are git-ignored. Only `VITE_` variables reach the browser, and none of them is secret.
- `META_MODEL_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are server-only.
- The Supabase anon key is public by design; RLS is what protects the data.

## Reporting

Please report vulnerabilities privately to the repository owner rather than in a public issue.
