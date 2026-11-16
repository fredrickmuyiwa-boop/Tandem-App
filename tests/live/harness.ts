// Live-mode test harness: runs the real services against Postgres with the
// Supabase migrations applied, acting as each user the way PostgREST does
// (SET ROLE authenticated + JWT claims). Needs `psql` and LIVE_TEST_DATABASE_URL
// pointing at a server where we may create/drop the `tandem_live_test` database.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSeed, DEMO_PASSWORD } from '../../src/data/seed';
import { TABLES, toRow } from '../../src/server/remote/mapping';
import type { Change, Transport } from '../../src/server/remote/replica';
import type { AuthProvider } from '../../src/server/remote/liveApi';
import { AppError } from '../../src/lib/errors';

const ROOT = process.cwd(); // run from the repo root
const ADMIN_URL = process.env.LIVE_TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:5432/postgres';
const DB = 'tandem_live_test';
const dbUrl = () => ADMIN_URL.replace(/\/[^/?]*(\?|$)/, `/${DB}$1`);

export class PgError extends Error { constructor(public code: string, message: string) { super(message); } }

function psql(url: string, sql: string, opts: { file?: string[] } = {}): string {
  const args = [url, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
  for (const f of opts.file ?? []) args.push('-f', f);
  const r = spawnSync('psql', args, { input: opts.file ? undefined : `\\set VERBOSITY verbose\n${sql}`, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    const m = /ERROR:\s+([0-9A-Z]{5}):\s+([^\n]*)/.exec(r.stderr) ?? /ERROR:\s+([^\n]*)/.exec(r.stderr);
    if (m && m.length === 3) throw new PgError(m[1], m[2]);
    throw new PgError('XX000', (m?.[1] ?? r.stderr ?? 'psql failed').trim());
  }
  return r.stdout;
}

const lit = (s: string) => `$q$${s.replace(/\$q\$/g, '')}$q$`;
export const uuidFor = (id: string) => {
  const h = createHash('md5').update(id).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/** Sample-data user ids are remapped to UUIDs like Supabase Auth's. */
export const idMap = new Map<string, string>();

export async function setupDatabase() {
  psql(ADMIN_URL, `drop database if exists ${DB} with (force); create database ${DB};`);
  psql(dbUrl(), '', { file: [
    resolve(ROOT, 'supabase/tests/00_local_auth_stub.sql'),
    resolve(ROOT, 'supabase/migrations/0001_init.sql'),
    resolve(ROOT, 'supabase/migrations/0002_app_api.sql'),
    resolve(ROOT, 'supabase/migrations/0003_settings_seed.sql'),
  ] });
  // Load the demo dataset (fictional) so the tests exercise realistic data.
  const seed = await buildSeed();
  let json = JSON.stringify(seed);
  for (const u of seed.users) { idMap.set(u.id, uuidFor(u.id)); json = json.split(`"${u.id}"`).join(`"${uuidFor(u.id)}"`); }
  const d = JSON.parse(json) as Record<string, Record<string, unknown>[]>;
  const stmts: string[] = ['begin;', 'alter table auth.users disable trigger user;'];
  for (const u of d.users) {
    stmts.push(`insert into auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at) values ('${u.id}', ${lit(String(u.email))}, crypt(${lit(DEMO_PASSWORD)}, gen_salt('bf', 4)), '{}', now());`);
  }
  for (const t of TABLES) {
    const rows = (d[t.collection] ?? []).map((r) => toRow(t, r));
    if (!rows.length) continue;
    stmts.push(`alter table public.${t.table} disable trigger user;`);
    stmts.push(`insert into public.${t.table} select * from jsonb_populate_recordset(null::public.${t.table}, ${lit(JSON.stringify(rows))}::jsonb);`);
    stmts.push(`alter table public.${t.table} enable trigger user;`);
  }
  stmts.push('alter table auth.users enable trigger user;', 'commit;');
  psql(dbUrl(), stmts.join('\n'));
}

function asUser(userId: string, sql: string): string {
  return psql(dbUrl(), `begin;\nset local role authenticated;\nselect set_config('request.jwt.claim.sub', '${userId}', true);\n${sql}\ncommit;`);
}

let signedIn: string | null = null;

export const transport: Transport = {
  async snapshot(userId: string) {
    return JSON.parse(asUser(userId, 'select public.app_snapshot();').trim().split('\n').pop()!);
  },
  async apply(changes: Change[], userId: string) {
    try {
      asUser(userId, `select public.apply_changes(${lit(JSON.stringify(changes))}::jsonb);`);
    } catch (e) {
      if (process.env.LIVE_DEBUG) console.error('  apply_changes rejected:', (e as Error).message, '\n   ', JSON.stringify(changes.map((c) => [c.op, c.table, c.id, Object.keys(c.row ?? {}).join('|')])));
      throw e;
    }
  },
};

export const authProvider: AuthProvider = {
  async signUp({ email, password, name, kind }) {
    psql(dbUrl(), `insert into auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at) values (${lit(email)}, crypt(${lit(password)}, gen_salt('bf', 4)), ${lit(JSON.stringify({ name, kind }))}::jsonb, now()) on conflict (email) do nothing;`);
  },
  async signIn(email, password) {
    const id = psql(dbUrl(), `select id from auth.users where lower(email) = lower(${lit(email)}) and encrypted_password = crypt(${lit(password)}, encrypted_password);`).trim();
    if (!id) throw new AppError('unauthenticated', 'Email or password is incorrect.');
    signedIn = id;
    return id;
  },
  async signOut(scope) { if (scope !== 'others') signedIn = null; },
  async currentUserId() { return signedIn; },
  async sendPasswordReset() { /* no email in tests */ },
  async updatePassword(password) {
    if (!signedIn) throw new Error('Not signed in');
    psql(dbUrl(), `update auth.users set encrypted_password = crypt(${lit(password)}, gen_salt('bf', 4)) where id = '${signedIn}';`);
  },
  async rpc(fn, args) {
    if (!signedIn) throw new Error('Not signed in');
    const list = Object.entries(args).map(([k, v]) => `${k} => ${lit(String(v))}`).join(', ');
    return asUser(signedIn, `select public.${fn}(${list});`);
  },
};

/** Switch the harness identity (tests act as several users in turn). */
export const actAs = (userId: string) => { signedIn = userId; };

/** Run SQL as the database owner (for assertions only). */
export const sqlAsOwner = (sql: string) => psql(dbUrl(), sql).trim();
export const readSql = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
