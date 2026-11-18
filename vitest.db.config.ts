import { defineConfig } from 'vitest/config'

// Database tests: run against the LOCAL Supabase-compatible PostgreSQL created by
// scripts/db/reset-local.sh (see `npm run test:db`). Never against real data.
export default defineConfig({
  test: {
    include: ['supabase/tests/**/*.dbtest.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
})
