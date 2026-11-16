# Meta AI integration

Tandem's AI features go through one provider layer (`src/ai/provider.ts`) with two implementations:

| Provider | When | What it does |
|---|---|---|
| `local` (default) | `VITE_AI_PROVIDER` unset or `local` | Deterministic, in-browser logic: a regex brief parser, explainable 7-factor matching, template outreach drafts, and a rule-based strategist over the workspace's own data. No network calls. |
| `meta` | `VITE_AI_PROVIDER=meta` and `META_MODEL_API_KEY` set on the server | Brief interpretation and the AI strategist call `/api/meta/brief` and `/api/meta/assist`, which call the Meta Model API. |

**Matching scores are always computed locally** (`src/ai/matching.ts`), whichever provider is set. The model only turns a free-text brief into structured criteria, and those criteria are validated before use. Scores therefore stay explainable and reproducible, and a model can't make up a creator's statistics.

## API details (from dev.meta.ai)

- Endpoint: `POST https://api.meta.ai/v1/chat/completions` (OpenAI-compatible Chat Completions)
- Auth: `Authorization: Bearer <key>`
- Model: `muse-spark-1.3` by default. Override it with `META_MODEL`, and check the Models page on dev.meta.ai for what your key can use.
- Structured output: `response_format: { type: "json_schema", json_schema: { name, schema } }`. The schema used is `CRITERIA_JSON_SCHEMA` in `src/ai/brief.ts`.

Server environment variables (Vercel → Settings → Environment Variables):

```
META_MODEL_API_KEY=...            # required for the meta provider
META_MODEL=muse-spark-1.3         # optional
META_API_BASE_URL=https://api.meta.ai/v1   # optional
```

Then set `VITE_AI_PROVIDER=meta` and redeploy, because Vite bakes `VITE_` variables in at build time.

## Safety

- **The key stays on the server.** It's read only in `api/_meta.ts`. Nothing prefixed `VITE_` holds a secret.
- **Prompt-injection defence.** All user, brand and creator text is wrapped in `<untrusted>` tags, and spoofed closing tags are stripped first. The system prompt says never to follow instructions inside those tags, never to invent statistics, prices or results, and never to claim it sent or paid anything.
- **Output validation.** `sanitizeCriteria()` clamps and whitelists every field (categories, countries, ages, budget, platforms). Anything unexpected is dropped.
- **Fallback.** If the endpoint fails, times out (20s) or isn't configured (HTTP 501), the app uses the local provider and tells the user so.
- **No automatic sending.** Outreach drafts are only drafts. A person reviews and clicks **Send invitation**.
- **Rate limit.** 20 requests per minute per IP, per serverless instance. That's best-effort; see the known gaps below.

## Known gaps

- `/api/meta/*` doesn't yet check that the caller is signed in. Before going live with real users, require a Supabase session JWT in these functions and move rate limiting to a shared store (such as Vercel KV or Upstash).
- The meta provider was not called live during development, because no key was available. The request and response shapes follow the published docs, and the fallback path is tested.
