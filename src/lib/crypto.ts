// Password hashing for the in-browser demo backend: PBKDF2-SHA256 via WebCrypto.
// Production delegates all of this to Supabase Auth (bcrypt, server-side).

const enc = new TextEncoder();
const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => new Uint8Array(hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));

export const PBKDF2_ITERATIONS = 120_000;

export function randomHex(bytes = 16): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)).buffer);
}

export async function hashPassword(password: string, saltHex = randomHex(16), iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations }, key, 256);
  return { hash: `pbkdf2$${iterations}$${toHex(bits)}`, salt: saltHex };
}

export async function verifyPassword(password: string, stored: string, saltHex: string): Promise<boolean> {
  const [, iter, expected] = stored.split('$');
  const { hash } = await hashPassword(password, saltHex, Number(iter));
  const actual = hash.split('$')[2];
  // constant-time comparison
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export const newToken = () => randomHex(32);
