# Architecture — عالم التحدّي (Tasks 07–09)

```
 Browser (GitHub Pages, static)                Supabase project (owner's account)
 ┌───────────────────────────────┐            ┌───────────────────────────────────────────┐
 │ React + Vite game (unchanged  │  HTTPS     │ Auth (email for adults, username→internal │
 │ engine, quiz UI, shop, locker)│──────────▶ │   address for children)                    │
 │ src/cloud/*  publishable key  │  RLS-only  │ PostgreSQL + Row Level Security            │
 │ #/parent  #/admin (lazy)      │            │   SECURITY DEFINER functions (RPC):        │
 └───────────────────────────────┘            │   quiz sessions, rewards, shop, groups     │
                                               │ Storage: private bucket «textbooks»       │
                                               │ Edge Functions (Deno, secret key here):    │
                                               │   parent-children, ai-worker                │
                                               └───────────────┬───────────────────────────┘
                                                               │ server-side only
                                                               ▼
                                                       Anthropic API (Claude)
```

* The frontend stays a static Vite build on GitHub Pages (`base: /alam-altahaddi/`).
  Only **public** values reach it: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
  (GitHub repository *variables*, not secrets). Without them the site runs in guest mode.
* Everything valuable is decided by the database: answer checking, XP, coins, purchases,
  inventory, equipment, group membership and leaderboards. The browser only sends the
  option a student chose.
* Work that needs the secret key or the Anthropic key runs in Edge Functions. Secrets are
  set in the Supabase dashboard (Edge Functions → Secrets) and never appear in GitHub.

## Two play modes

| | Guest (no account) | Signed-in student |
| --- | --- | --- |
| Content | bundled «ديني قيمي» bank (Task 05) | published subjects from the database |
| Scoring | in the browser (Task 06 engine) | server (`submit_answer`) |
| XP / coins | device-local, editable, **never competitive** | ledger in the database, verified |
| Shop / locker | device-local | server (`purchase_item`, `equip_item`) |
| Devices | this browser only | any device after sign-in |

The same React screens serve both modes: the lesson screen takes a lesson tree, and the
quiz arena takes an optional *driver* (`src/quiz/driver.ts`) that asks the server for each
verdict, hint and explanation.

## Roles

| Role | How it is created | Can |
| --- | --- | --- |
| الطالب | by a parent, through the `parent-children` function (no email; username + password) | play, earn verified rewards, buy/equip, join groups with parent approval, read own records |
| ولي الأمر | self sign-up with email confirmation (role is always *parent*) | create/manage children, read only their own children's records, approve groups, privacy and deletion requests |
| المشرف | only by the owner: `select public.grant_admin('email')` in the SQL editor | manage content, books, AI generation, review/publish, reports, moderation |

Roles live in `profiles.role`, are assigned by a trigger from server-controlled
`app_metadata`, can never be changed through the API (trigger), and are re-checked inside
every function and policy. Hiding a button is never the only protection.

## Main flows

* **Quiz:** `start_quiz_session(mission)` returns the questions *without* answers, hints
  or explanations → `request_hint` / `submit_answer` per question → `complete_quiz_session`
  adds the mission bonus once. Rewards are rows in `reward_transactions` with a unique key
  per student (`question:<id>`, `mission:<id>`, `purchase:<item>`), so replays, double taps
  and concurrent requests can never pay twice. Rate limits: answers per minute and sessions
  per hour (`game_settings`).
* **Content:** subjects → units → lessons → missions → questions. Publishing a subject and
  its lessons/questions in the admin dashboard makes it appear on the adventure map
  (catalogue refreshed when stale or when the tab regains focus). World look comes from a
  preset (`meadow`, `forest`, `desert`, `castle`, `future`); no code changes.
* **Legacy device data:** after a student signs in on a device with Task 05/06 guest
  data, the game offers to import the learning history once as **unverified** records
  (`legacy_imports`). Local coins, XP and items are recorded for reference but never
  credited (browser data can be edited). Local data is not deleted.

## Testing

| Layer | How |
| --- | --- |
| Unit | `npm test` (Vitest): engine, rewards, validation, shared function helpers |
| Database / RLS | `npm run test:db`: every migration on a fresh PostgreSQL with a Supabase-compatible shim (`supabase/tests/supabase_shim.sql`), tests run as the real `authenticated`/`anon` roles. Also runs in GitHub Actions with a Postgres service. |
| Browser (cloud) | `scripts/e2e/start-local-stack.sh` starts a **test-only emulator** of the Supabase HTTP APIs (`scripts/e2e/local-supabase.mjs`) over the same database, running the real Edge Function handlers, then Playwright journeys at five device sizes. |
| Production | the same journeys against the real Supabase project once it is configured (see `OWNER-SETUP.md`). |

The emulator is not Supabase: Auth emails, rate limiting of Auth itself, Storage
limits and the Deno runtime are only verified on the real project.
