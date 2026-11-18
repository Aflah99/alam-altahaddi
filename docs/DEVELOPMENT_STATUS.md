# Development status — عالم التحدّي

_Last updated: 2026-11-18. Keep this file short; update it before finishing each phase._

## Architecture (one screen)
- Frontend: React 19 + Vite + TS, static on GitHub Pages (`/alam-altahaddi/`). Guest mode works with no backend.
- Backend: Supabase project `alam-altahaddi` (ref `huaaocsahissfbpltcyn`, Tokyo, Postgres 17).
  - `supabase/migrations/` (10 files, all applied): accounts → content → game → legacy_content (600 Qs) → admin_ai →
    parents_groups → hardening → api_grants → function_grants → student_meta_update.
  - All game logic is in SECURITY DEFINER RPCs (fixed `search_path`); RLS on every table.
  - Edge Functions: `parent-children` (v2, child accounts), `ai-worker` (v1, disabled path). Both `verify_jwt`.
- Browser receives only `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (deploy workflow fallback; repo variables override).
- Details: `docs/backend/ARCHITECTURE.md`, `DATABASE.md`, `PRIVACY.md`, `OWNER-SETUP.md`.

## Completed (Tasks 01–09, go-live)
- Tasks 01–09 code (PRs #1–#11); real-project fixes (PRs #12–#16); go-live config (#17).
- PR #18: Auth on the real project requires lower + upper + digit + symbol passwords. The site and
  `parent-children` now check the same rule (`passwordProblem`) with an Arabic message and hint.
- Real-project verification (2026-11-18), synthetic accounts only:
  - DB: 34 tables, all RLS; 600 published questions, 2,400 options, exactly 4 options and 1 correct each;
    4 units, 27 lessons, 73 missions, 15 shop items; 4 academic flags open; no unvalidated constraints;
    `textbooks` bucket private (admin-only read/insert/delete); temporary `http` extension removed.
  - `scripts/e2e/real-api-check.mjs` 40/40 and `scripts/e2e/real-api-extra.mjs` 42/42 pass (roles, isolation,
    server rewards, replay, shop, groups, invite revoke/expiry, rate limit, hidden children, legacy import,
    textbook storage, deletion requests, Edge Function auth + CORS, AI lock).
  - Live site at 5 sizes (375×667, 390×844, 430×932, 768×1024, 1194×834): guest start, sign-in/sign-up,
    student lobby + groups + session persistence, parent and admin dashboards; RTL, Cairo, no overflow,
    no failed assets, real project in use, no secrets in the bundle.
- Synthetic accounts and all their data deleted afterwards.
- First administrator (2026-11-18): the owner's account was created by an official Supabase email link; ownership
  was confirmed from the auth logs (link opened on the owner's phone), then promoted with `grant_admin`. It is the only
  admin and the only account. Server checks: `is_admin`/`admin_dashboard` succeed for it and fail for others.
  To add another admin later: the person signs up, proves the email, then run `grant_admin('<email>')` server-side.

## Security advisor notes (deliberate)
- `authenticated_security_definer_function_executable` (50): intended API RPCs; each checks the caller's role inside.
- `rls_enabled_no_policy` on `group_join_attempts`: server-only table, written by `join_group_with_code`.
- Performance INFO (unindexed FKs, duplicate permissive SELECT policies): negligible at this scale.

## Owner items (blocking or before real families)
1. **Custom SMTP** (Supabase → Authentication → Emails → SMTP): built-in email reaches only project team members.
2. **Leaked-password protection** (Authentication → Passwords) — advisor warning; may need a paid plan.
3. **Legal/privacy review** of `PRIVACY.md` before real children and families use the site.
4. AI generation stays disabled (no `ANTHROPIC_API_KEY`, no spending authorised).
5. The old `api.supabase.com` network secret in the cloud environment is invalid (401); unused, can be deleted.

## Testing quick reference
- `npm run typecheck && npm run lint && npm test && npm run build`
- `npm run test:db` (local Postgres; see `scripts/db/reset-local.sh`). Run it when `supabase/` changes.
- Real project: create synthetic accounts, then `SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… CREDS=creds.json node scripts/e2e/real-api-check.mjs`
  (and `real-api-extra.mjs`); passwords must satisfy the Auth policy. Delete the accounts afterwards.
- Local cloud stack for browser journeys: `bash scripts/e2e/start-local-stack.sh` (test-only emulator, not Supabase).
