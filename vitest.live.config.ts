// Live-mode integration tests: real Postgres + the Supabase migrations.
// LIVE_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:live
import { defineConfig } from 'vite';

export default defineConfig({
  test: { include: ['tests/live/**/*.live.ts'], testTimeout: 120_000, hookTimeout: 120_000, fileParallelism: false },
} as never);
