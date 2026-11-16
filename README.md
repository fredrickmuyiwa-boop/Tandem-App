# Tandem

**The operating system for creator-led marketing.** Brands, agencies and creators work in one place, from the first brief through matching, negotiation, content approval, payment tracking and results.

> **Status: working product in Demo mode.** Every screen and workflow runs end to end against an in-browser backend that enforces the same permission rules as the production database. The Supabase schema and Row Level Security are written and tested, but the frontend is **not yet wired to Supabase**. See [docs/DEVELOPMENT_REPORT.md](docs/DEVELOPMENT_REPORT.md) for exactly what is and isn't done.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Open **Explore the demo** or sign in with any demo account. The password for all of them is `Tandem-demo-2026`.

| Account | Who | What to try |
|---|---|---|
| `brand@tandem.demo` | Ada, owner of Lumi Skincare | AI matching from a brief, campaigns, approvals, budget |
| `agency@tandem.demo` | Zainab, owner of Northbeam (agency) | Client workspaces (Kora Foods, Velo Fitness) and the agency fee |
| `client@tandem.demo` | Kwame, client reviewer at Kora | Final approval only; no budgets or negotiations |
| `creator@tandem.demo` | Ife Balogun, creator | Opportunities, offers and counteroffers, submitting content, earnings |
| `admin@tandem.demo` | Platform admin | Verification, moderation, audit log, fees and plans |

Extra accounts: `kemi@` (Lumi member), `dami@` (Northbeam manager), `sable@` (a second brand on the Starter plan) and `seun@` (a creator with a pending verification).

All creators, brands, results and payments in the demo are **fictional sample data**, and the app labels them that way. Nothing is emailed, posted or paid. Demo data is saved in your browser; use **Settings → Data & privacy → Reset demo data** to start over.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Build to `dist/` |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Vitest: auth, permissions, the end-to-end workflow, AI and security (35 tests) |
| `npm run check` | Type-check, then test |

RLS tests (needs `psql` and a Postgres 15+ database):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/00_local_auth_stub.sql \
  -f supabase/migrations/0001_init.sql \
  -f supabase/tests/rls_test.sql      # → "RLS tests passed: 59"
```

## Stack

Vite 6, React 19, TypeScript (strict) and Tailwind CSS v4. `lucide-react` is the only runtime UI dependency. Hash routing, no state library. Vercel serverless functions in `api/` hold the Meta Model API key. Supabase (Postgres, Auth, Storage) is the production target.

```
src/
  domain/      types, constants, creator stats helpers
  server/      demo backend: db, access control (RLS equivalent), audit, services/*
  ai/          brief parsing, explainable matching, outreach drafts, strategist, provider layer
  pages/       public · org (brand/agency) · creator · admin
  components/  ui primitives, charts, app components
api/meta/      serverless functions → Meta Model API (server-side key)
supabase/      migration with RLS + SQL tests
tests/         Vitest suites
docs/          architecture, security, Meta AI, Supabase, development report
```

## Environment

Everything is optional; with nothing set, the app runs in Demo mode. See [.env.example](.env.example).

- `VITE_AI_PROVIDER=meta` routes brief interpretation and the AI strategist through `/api/meta/*`. This needs `META_MODEL_API_KEY` set **on the server** (Vercel environment variables), never in a `VITE_` variable. See [docs/META_AI.md](docs/META_AI.md).
- The Supabase variables are for the production backend. See [docs/SUPABASE.md](docs/SUPABASE.md).

## Deploying

On Vercel: import the repo. The framework is detected as Vite, the build command is `npm run build` and the output folder is `dist`. `vercel.json` sets security headers and a CSP.

## Uploading to GitHub through the website

1. Create the repository on GitHub.
2. **Add file → Create new file**, name it `.github/workflows/unpack.yml`, paste in the contents of that file from this project, and commit.
3. **Add file → Upload files**, drop in `tandem.zip`, and commit.
4. The **Actions** tab shows "Unpack uploaded zip". About a minute later, the files are in the repo in their folders and the zip is gone.

## Docs

- [Development report](docs/DEVELOPMENT_REPORT.md): what's implemented, tested, incomplete, and what needs credentials
- [Security](docs/SECURITY.md)
- [Meta AI integration](docs/META_AI.md)
- [Supabase setup](docs/SUPABASE.md)
