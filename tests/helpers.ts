import { api, resetDemo, type Ctx } from '../src/server/api';
import { DEMO_PASSWORD } from '../src/data/seed';
import { AppError } from '../src/server/errors';

export async function fresh() {
  await resetDemo();
}

export async function login(email: string): Promise<Ctx> {
  const { token } = await api.auth.signIn({ email, password: DEMO_PASSWORD });
  return { token };
}

export async function errorCode(p: Promise<unknown> | (() => unknown)): Promise<string | null> {
  try {
    await (typeof p === 'function' ? p() : p);
    return null;
  } catch (e) {
    return e instanceof AppError ? e.code : `non-app:${(e as Error).message}`;
  }
}

export const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
