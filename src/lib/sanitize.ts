// Untrusted-text handling. React escapes output, so the main job here is to
// normalise input, cap lengths and strip control characters before storage.

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;

export function cleanText(input: unknown, max = 5000): string {
  if (typeof input !== 'string') return '';
  return input.replace(CONTROL, '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

export function cleanLine(input: unknown, max = 200): string {
  return cleanText(input, max).replace(/\s+/g, ' ');
}

export function cleanEmail(input: unknown): string {
  return cleanLine(input, 254).toLowerCase();
}

/** Only allow http(s) links. Blocks javascript:, data:, etc. */
export function safeUrl(input: unknown): string | null {
  const s = cleanLine(input, 2048);
  if (!s) return null;
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Wrap untrusted content before it goes to a language model so the model can
 * tell data from instructions. Used by the Meta provider (see api/meta/*).
 */
export function asUntrustedData(label: string, value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const neutralised = text.replace(/<\/?untrusted[^>]*>/gi, '');
  return `<untrusted source="${label}">\n${neutralised}\n</untrusted>`;
}
