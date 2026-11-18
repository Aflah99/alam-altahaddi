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

## Admin content workflow (no code, no deploy)

1. **المواد:** create a subject (name, slug, world preset, colour) and its units and lessons.
2. **الكتب:** upload a textbook (PDF, DOCX or Markdown) into the private `textbooks` bucket.
   The `ai-worker` function counts its pages.
3. **التوليد:** choose a book, a page range and a lesson. The dashboard shows an estimate
   (tokens and cost) from `ai_estimate`. Confirming checks that AI is enabled, the daily
   page/question limits, concurrent jobs and the monthly budget.
4. **المهام:** the worker processes batches of pages (extraction, then generation with
   Claude using a strict JSON schema). Already extracted pages are skipped on a rerun.
   Each draft is checked automatically (`_shared/quality.ts`: 4 distinct options, one
   correct answer, page in range, duplicates, hints that give the answer away, quotes that
   are not on the page) and saved as **needs_review**. Nothing is published automatically.
5. **المراجعة:** edit, approve, reject, flag for academic review, or publish. Publishing
   rebuilds the lesson's missions. Students see the change on their next catalogue
   refresh, with no deploy.

AI is **off by default** (`ai_settings.enabled = false`). The Anthropic key exists only as
an Edge Function secret. Without it the worker reports a clear configuration error.

## Parents and private groups

* **Dashboard (النتائج):** `parent_child_report(child, days)` returns accuracy, first-try
  accuracy, assisted and missed counts, missions, estimated time, verified XP, results by
  subject, unit and lesson, eight weeks of progress and the most-missed questions. The
  revision suggestions (`src/parent/insights.ts`) are simple, explained rules over those
  numbers. Imported device history is shown separately and marked unverified.
* **Groups (المجموعات):** a parent (or admin) creates a group and invitation codes (expiry
  and revoke). A child enters a code → **pending** → one of the child's own parents
  approves. The owner sees members, invites and weekly participation. They can remove
  members or close the group.
* **Leaderboards (لوحة الأبطال):** weekly and all-time, verified XP only, nicknames and
  characters only, visible only to members, the owner, member parents and admins.
* **Privacy (الخصوصية والحساب):** hide a child from leaderboards, turn off group requests,
  view activity, delete a child account, or request family deletion. See `PRIVACY.md`.
