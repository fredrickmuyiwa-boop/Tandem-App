// Replaceable AI provider layer.
//
// "local" (default): deterministic, explainable logic in the browser.
// "meta": calls /api/meta/* serverless functions, which hold the Meta Model
//         API key server-side. Model output is validated before use and the
//         app falls back to local logic if the backend is unavailable.
import { interpretLocally, sanitizeCriteria, type Interpretation } from './brief';
import { localStrategist, type StrategistContext, type StrategistReply } from './strategist';

export type ProviderId = 'local' | 'meta';
export const AI_PROVIDER: ProviderId = (import.meta.env?.VITE_AI_PROVIDER as ProviderId) === 'meta' ? 'meta' : 'local';
export const AI_PROVIDER_LABEL = AI_PROVIDER === 'meta' ? 'Meta Muse Spark via secure backend' : 'Local intelligence (Demo mode)';

async function post<T>(path: string, body: unknown, timeoutMs = 20000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
    return data as T;
  } finally {
    clearTimeout(t);
  }
}

export async function interpretBrief(text: string): Promise<Interpretation & { notice?: string }> {
  if (AI_PROVIDER === 'meta') {
    try {
      const data = await post<{ criteria: unknown; model: string }>('/api/meta/brief', { brief: text.slice(0, 4000) });
      const local = interpretLocally(text);
      return { criteria: sanitizeCriteria(data.criteria), interpretedBy: 'meta', model: data.model, detected: [], assumptions: local.assumptions.filter((a) => a.startsWith('No ')) };
    } catch (e) {
      return { ...interpretLocally(text), notice: `Meta model unavailable (${(e as Error).message}). Used local interpretation instead.` };
    }
  }
  await new Promise((r) => setTimeout(r, 350));
  return interpretLocally(text);
}

export async function askStrategist(question: string, ctx: StrategistContext): Promise<StrategistReply & { provider: ProviderId; notice?: string }> {
  if (AI_PROVIDER === 'meta') {
    try {
      const data = await post<{ text: string; model: string }>('/api/meta/assist', { task: 'strategist', question: question.slice(0, 2000), context: ctx });
      return { text: data.text, intent: 'meta', basedOn: ['Workspace data sent with this question'], provider: 'meta' };
    } catch (e) {
      return { ...localStrategist(question, ctx), provider: 'local', notice: `Meta model unavailable (${(e as Error).message}). Answered with local logic.` };
    }
  }
  await new Promise((r) => setTimeout(r, 420));
  return { ...localStrategist(question, ctx), provider: 'local' };
}
