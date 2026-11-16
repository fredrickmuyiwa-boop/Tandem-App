// POST /api/meta/brief  { brief: string } → { criteria, model }
// Uses Meta structured output so the model must return our criteria schema.
import { chat, guard, MODEL, SYSTEM_RULES, untrusted, type Req, type Res } from '../_meta';
import { CRITERIA_JSON_SCHEMA, sanitizeCriteria } from '../../src/ai/brief';

export default async function handler(req: Req, res: Res) {
  if (!guard(req, res)) return;
  const brief = (req.body as { brief?: unknown } | undefined)?.brief;
  if (typeof brief !== 'string' || brief.trim().length < 10 || brief.length > 4000) {
    return res.status(400).json({ error: 'Send a brief between 10 and 4,000 characters.' });
  }
  try {
    const content = await chat(
      [
        { role: 'system', content: `${SYSTEM_RULES}\nTask: convert a campaign brief into matching criteria. Use null or [] when the brief does not say. Budgets: amount in whole units of the stated currency (e.g. "₦5 million" → 5000000 NGN).` },
        { role: 'user', content: untrusted('campaign_brief', brief) },
      ],
      { response_format: { type: 'json_schema', json_schema: { name: 'CampaignCriteria', schema: CRITERIA_JSON_SCHEMA } } },
    );
    const criteria = sanitizeCriteria(JSON.parse(content));
    return res.status(200).json({ criteria, model: MODEL });
  } catch {
    return res.status(502).json({ error: 'The Meta model could not interpret this brief right now.' });
  }
}
