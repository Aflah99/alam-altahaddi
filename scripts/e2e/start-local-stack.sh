#!/usr/bin/env bash
# TEST-ONLY: fresh e2e database + seed + emulator + a production build pointed at it.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
TEST_DB_NAME=alam_e2e bash scripts/db/reset-local.sh
node scripts/e2e/seed.mjs
pkill -f local-supabase.mjs 2>/dev/null || true
EMU_FAKE_AI=1 nohup node --experimental-strip-types scripts/e2e/local-supabase.mjs > node_modules/.tmp/emu.log 2>&1 &
sleep 2
ANON=$(curl -s http://localhost:54321/__keys | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).anon))")
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_PUBLISHABLE_KEY="$ANON" npx vite build --outDir node_modules/.tmp/dist-cloud >/dev/null
pkill -f "vite preview --port 4174" 2>/dev/null || true
nohup npx vite preview --port 4174 --strictPort --outDir node_modules/.tmp/dist-cloud > node_modules/.tmp/preview-cloud.log 2>&1 &
sleep 2
echo "local cloud stack: app http://localhost:4174/alam-altahaddi/  api http://localhost:54321"
