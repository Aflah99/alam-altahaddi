#!/usr/bin/env bash
# Recreates a LOCAL PostgreSQL test database with a Supabase-compatible shim and every
# migration in supabase/migrations. Used by `npm run test:db`. Never point this at a
# real Supabase project.
set -euo pipefail
: "${TEST_DB_URL:=postgres://postgres@localhost:54329}"
DB=${TEST_DB_NAME:-alam_test}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
psql "$TEST_DB_URL/postgres" -qX -v ON_ERROR_STOP=1 -c "drop database if exists $DB with (force)" -c "create database $DB" >/dev/null
psql "$TEST_DB_URL/$DB" -qX -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/supabase_shim.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do
  psql "$TEST_DB_URL/$DB" -qX -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "FAILED: $f" >&2; exit 1; }
done
echo "local test database $DB ready"
