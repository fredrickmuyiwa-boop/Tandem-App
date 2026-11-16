// POST /api/meta/assist { task: 'strategist', question, context } → { text, model }
// The context is the caller's own workspace snapshot. In Demo mode it comes from
// the browser; with Supabase it must be loaded server-side using the user's
// JWT (see docs/META_AI.md) so a client can't inject another org's data.
import { chat, guard, MODEL, SYSTEM_RULES, untrusted, type Req, type Res } from '../_meta';

export default async function handler(req: Req, res: Res) {
  if (!guard(req, res)) return;
  const body = (req.body ?? {}) as { task?: unknown; question?: unknown; context?: unknown };
  if (body.task !== 'strategist') return res.status(400).json({ error: 'Unknown task.' });
  if (typeof body.question !== 'string' || !body.question.trim() || body.question.length > 2000) return res.status(400).json({ error: 'Ask a question up to 2,000 characters.' });
  const ctx = JSON.stringify(body.context ?? {});
  if (ctx.length > 60_000) return res.status(413).json({ error: 'Workspace context is too large.' });
  try {
    const text = await chat([
      { role: 'system', content: `${SYSTEM_RULES}\nTask: act as a creator-marketing campaign strategist for the workspace described in the data. Answer in concise Markdown (headings, short bullet lists). Label every number with where it came from (e.g. "creator-submitted", "recorded results"). Do not guarantee results.` },
      { role: 'user', content: `${untrusted('workspace_data', ctx)}\n\n${untrusted('question', body.question)}` },
    ]);
    return res.status(200).json({ text: text.slice(0, 8000), model: MODEL });
  } catch {
    return res.status(502).json({ error: 'The Meta model is unavailable right now.' });
  }
}
