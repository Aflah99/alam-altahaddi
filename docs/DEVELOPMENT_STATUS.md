# Development status — عالم التحدّي

_Last updated: 2026-11-18. Keep this file short; update it before finishing each phase._

## Architecture (one screen)
- Frontend: React 19 + Vite + TS, static on GitHub Pages (`/alam-altahaddi/`). Guest mode works with no backend.
- Backend: Supabase project `alam-altahaddi` (ref `huaaocsahissfbpltcyn`, Tokyo, Postgres 17).
  - `supabase/migrations/` (7 files, applied in order): accounts → content → game → legacy_content (600 Qs) → admin_ai → parents_groups → hardening.
  - All game logic is in SECURITY DEFINER RPCs; RLS on every table.
  - Edge Functions in `supabase/functions/`: `parent-children` (child accounts), `ai-worker` (textbook → draft questions with Claude).
- Browser receives only `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (GitHub Actions *variables*).
- Details: `docs/backend/ARCHITECTURE.md`, `DATABASE.md`, `PRIVACY.md`, `OWNER-SETUP.md`.

## Completed
- Tasks 01–06: game, world, quiz, 600-question bank (27 lessons), XP/coins/shop/locker (PRs #1–#8).
- Tasks 07–09 code: backend, admin + AI generation, parent dashboards, private groups (PRs #9–#11).
- Real-project fixes found by synthetic-account testing (PRs #12–#16):
  pgcrypto in the `extensions` schema; explicit table grants (0800) and function grants (0900),
  because current Supabase gives the API roles no automatic grants; children created by Supabase
  Auth (insert first, then an `app_metadata` update) now become students (1000). The test shim
  matches these real defaults.
- Real Supabase: migrations 0100–1000 applied and verified. Privileges match the local tested
  setup exactly (anon: no table access). 600 published questions, 27 lessons, 4 academic flags
  open, AI disabled. Edge Functions `parent-children` and `ai-worker` deployed (verify_jwt on).
- `scripts/e2e/real-api-check.mjs`: 40/40 checks pass on the real project (roles, isolation,
  rewards, replay, shop, groups, publishing, AI lock). Browser journeys against the real backend
  pass at 5 device sizes.

## Active task — go live with cloud mode (Tasks 07–09 deployment)
1. Merge the deploy-config PR: the deploy workflow falls back to the public project URL and
   publishable key (no tool here sets GitHub variables; repository variables override them).
2. Verify the live site at 5 sizes; the guest regression must still pass.
3. Owner signs up on the live site, then `select public.grant_admin('<owner email>')` for that exact account.
4. Delete the synthetic accounts (`synthetic.*@alam-test.invalid`, `syn_*@students…`) and their data.

## Deployment status
- Live: https://aflah99.github.io/alam-altahaddi/. Becomes cloud-enabled once step 1 is merged.
- Supabase project `huaaocsahissfbpltcyn`; Site URL and redirect URLs set by the owner and verified.
- Deploy workflow: `.github/workflows/deploy.yml` on push to `main`. PR checks: `.github/workflows/ci.yml`.

## Outstanding problems / owner items
- Anthropic key not set. AI generation stays disabled until the owner adds `ANTHROPIC_API_KEY` as an Edge Function secret and authorises spending.
- Auth email: built-in Supabase email reaches only the project team. Real parents need custom SMTP.
- Legal review of `PRIVACY.md` before real families use the site.
- The old `api.supabase.com` network secret in the cloud environment is invalid (401). Unused; the owner can delete it.

## Testing quick reference
- `npm run typecheck && npm run lint && npm test && npm run build`
- `npm run test:db` (local Postgres; see `scripts/db/reset-local.sh`). Run it when `supabase/` changes.
- Local cloud stack for browser journeys: `bash scripts/e2e/start-local-stack.sh` (test-only emulator, not Supabase).
