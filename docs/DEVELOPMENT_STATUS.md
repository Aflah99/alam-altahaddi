# Development status — عالم التحدّي

_Last updated: 2026-11-18. Keep this file short; update it before finishing each phase._

## Architecture (one screen)
- Frontend: React 19 + Vite + TS, static on GitHub Pages (`/alam-altahaddi/`). Guest mode works with no backend.
- Backend: Supabase project `alam-altahaddi` (ref `huaaocsahissfbpltcyn`, Tokyo, Postgres 17).
  - `supabase/migrations/` (6 files, applied in order): accounts → content → game → legacy_content (600 Qs) → admin_ai → parents_groups.
  - All game logic is in SECURITY DEFINER RPCs; RLS on every table.
  - Edge Functions in `supabase/functions/`: `parent-children` (child accounts), `ai-worker` (textbook → draft questions with Claude).
- Browser receives only `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (GitHub Actions *variables*).
- Details: `docs/backend/ARCHITECTURE.md`, `DATABASE.md`, `PRIVACY.md`, `OWNER-SETUP.md`.

## Completed
- Tasks 01–06: game, world, quiz, 600-question bank (27 lessons), XP/coins/shop/locker (PRs #1–#8).
- Tasks 07–09 code: backend, admin + AI generation, parent dashboards, private groups (PRs #9–#11).
- PR #12: pgcrypto schema fix (`extensions.gen_random_bytes`); CI database tests on Postgres 17.
- Real Supabase: all 6 migrations applied (each loaded from merged commit `466ed50` and SHA-256 verified).
  Verified: 34 public tables, all with RLS; 600 published questions / 2400 options / 27 lessons / 4 units /
  73 missions / 15 shop items; 4 academic flags open; private `textbooks` bucket; `ai_settings.enabled = false`.

## Active task — real Supabase integration (Tasks 07–09 deployment)
Remaining steps, in order:
1. Drop the temporary `http` extension (needs the owner's confirmation in the Supabase connector prompt).
2. Run the security advisors and RLS checks with synthetic accounts.
3. Deploy the `parent-children` and `ai-worker` Edge Functions. AI stays off.
4. Set the GitHub variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, then redeploy Pages.
5. Verify the auth redirect URLs; owner signs up, then `select public.grant_admin('<owner email>')` on that exact account.
6. Run the real-service journeys (student, parent, admin, groups) at 5 device sizes; clean up the synthetic accounts.

## Deployment status
- Live: https://aflah99.github.io/alam-altahaddi/. Currently a guest-mode build (no Supabase variables yet).
- Deploy workflow: `.github/workflows/deploy.yml` on push to `main`. PR checks: `.github/workflows/ci.yml`.

## Outstanding problems / owner items
- Anthropic key not set. AI generation stays disabled until the owner adds `ANTHROPIC_API_KEY` as an Edge Function secret and authorises spending.
- Before real families use it: custom SMTP for auth emails, and a legal review of `PRIVACY.md`.
- The old `api.supabase.com` network secret in the cloud environment is invalid (401). Unused; the owner can delete it.

## Testing quick reference
- `npm run typecheck && npm run lint && npm test && npm run build`
- `npm run test:db` (local Postgres; see `scripts/db/reset-local.sh`). Run it when `supabase/` changes.
- Local cloud stack for browser journeys: `bash scripts/e2e/start-local-stack.sh` (test-only emulator, not Supabase).
