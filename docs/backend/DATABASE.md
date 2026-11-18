# Database — عالم التحدّي

PostgreSQL on Supabase. Every table has Row Level Security (RLS) enabled. Anything that
changes scores, money, inventory, membership or published content goes through a
`SECURITY DEFINER` function that checks the caller's role itself. Migrations are in
`supabase/migrations/` and run in file-name order.

| Migration | Contents |
| --- | --- |
| `…0100_accounts.sql` | roles, profiles, parent–child links, parent settings, deletion requests, audit log |
| `…0200_content.sql` | subjects → units → lessons → questions/options, missions, textbooks, reviews, academic flags, private Storage bucket |
| `…0300_game.sql` | reward rules, game settings, quiz sessions and attempts, reward ledger, shop, inventory, equipment, legacy imports |
| `…0400_legacy_content.sql` | generated: the 600 «ديني قيمي» questions, 27 lessons, 15 shop items, 4 academic flags (idempotent) |
| `…0500_admin_ai.sql` | AI settings, generation jobs and batches, audit triggers, admin RPCs, reports, moderation |
| `…0600_parents_groups.sql` | private groups, invite codes, memberships, join attempts, group leaderboards, parent reports |

## Accounts

| Table | Purpose | Who can read |
| --- | --- | --- |
| `profiles` | one row per auth user: `role` (`student`/`parent`/`admin`), display name | self, admin |
| `student_profiles` | username, nickname, character, `show_in_leaderboards`, `leaderboard_excluded` | self, linked parents, admin |
| `parent_children` | parent ↔ child links | the parent, admin |
| `parent_settings` | `allow_group_requests` | the parent |
| `deletion_requests` | child or family deletion requests | requester, admin |
| `audit_log` | who did what (account, content, settings, groups) | admin; parents see their own via `parent_activity()` |

* The role comes only from server-controlled `app_metadata` (trigger `handle_new_user`).
  Self sign-up is always `parent`. Children are created by the `parent-children` Edge
  Function. Admins are created only by `grant_admin(email)` run by the project owner.
* Triggers stop `anon`/`authenticated` from changing a role, username, character
  ownership, `leaderboard_excluded` or `legacy_imported_at`.
* Deleting a user cascades to their profile, attempts, ledger, inventory and memberships.

## Content

`subjects` → `units` → `lessons` → `questions` (+ 4 `question_options`, exactly one
correct, enforced by a unique partial index and a publish trigger) → `missions`
(balanced chunks of at most 10 published questions, rebuilt by `refresh_lesson_missions`).

* Status: `draft` → `needs_review` → `approved` → `published` (or `rejected` / `archived`).
  Students only ever read **published** rows of **published** lessons and subjects.
* Each question keeps its source: textbook, page, quote, `origin` (`legacy`, `manual`, `ai`),
  `needs_academic_review` and an `academic_note`.
* `academic_flags` holds unresolved academic questions (the four legacy flags: pages 26,
  82, 119 q16 situation د, Umrah q21).
* `textbooks` / `textbook_pages`: metadata and extracted page text; files live in the
  private Storage bucket `textbooks` (admin-only policies).

## Game and rewards

| Table | Notes |
| --- | --- |
| `reward_rules` | 10/10 first try, 5/5 assisted, 0 missed, 20/20 mission bonus at ≥ 70 % |
| `game_settings` | pass accuracy, answers per minute, sessions per hour |
| `quiz_sessions`, `session_questions`, `question_attempts` | server-side quiz state; answers are checked here |
| `reward_transactions` | the ledger: `unique(student_id, kind, ref)` so nothing pays twice |
| `shop_items`, `inventory`, `equipped_items` | purchases with row locks, one item per slot |
| `legacy_imports` | device history imported once as **unverified** (never credited) |

Main RPCs: `get_catalog`, `start_quiz_session`, `request_hint`, `submit_answer`,
`complete_quiz_session`, `purchase_item`, `equip_item`, `unequip_slot`, `set_character`,
`set_nickname`, `get_my_game_state`, `import_legacy_progress`.

## Admin and AI generation

| Table | Notes |
| --- | --- |
| `ai_settings` | **disabled by default**; model, effort, batch sizes, daily page/question limits, max concurrent jobs, monthly budget (USD), token prices |
| `ai_jobs`, `ai_job_batches` | one job per textbook range; batches of pages; usage and cost per batch |
| `content_reviews` | review decisions and notes |

Admin RPCs (all call `require_admin()`): `admin_save_question`, `admin_set_question_status`,
`admin_flag_question`, `admin_get_question`, `ai_estimate`, `admin_create_ai_job`,
`admin_confirm_ai_job` (checks enabled, concurrency, daily limits and the monthly budget),
`admin_cancel_ai_job`, `admin_retry_ai_job`, `admin_dashboard`, `admin_coverage`,
`admin_anomalies`, `admin_set_leaderboard_excluded`, `admin_resolve_flag`,
`admin_refresh_missions`. The worker-only functions `ai_claim_batch` and `ai_finish_batch`
are granted to the service role, not to signed-in users.

## Parents and groups

| Table | Notes |
| --- | --- |
| `groups` | created by a parent or admin (max 10 active per owner) |
| `group_invites` | 10-character codes from an unambiguous alphabet, optional expiry, revocable, use count |
| `group_members` | `pending` → `active` (only after a **linked parent** approves) / `rejected` / `removed` / `left` |
| `group_join_attempts` | failed code attempts; 8 failures per hour per student, then `rate_limited` |

RPCs: `create_group`, `create_group_invite`, `revoke_group_invite`, `owner_remove_member`,
`close_group`, `group_manager_view`, `my_managed_groups`, `join_group_with_code`, `my_groups`,
`leave_group`, `parent_decide_membership`, `parent_remove_from_group`, `parent_child_groups`,
`group_leaderboard`, `parent_child_report`, `parent_activity`.

* `group_leaderboard(group, 'week' | 'all')` sums only `question` and `mission` ledger rows
  (verified XP). Purchases and imported device history never count. The week starts on
  Sunday 00:00 UTC. It returns rank, nickname, character, outfit, XP and `is_me`; no
  usernames, ids or real names. Only active members, the owner, parents of active members
  and admins can read it. Students hidden by a parent or excluded by an admin are left out.
* `parent_child_report(student, days)` is refused unless the caller is a linked parent.

## Running the tests

```bash
npm run test:db
```

This creates a fresh database (`TEST_DB_URL`, default `postgres://postgres@localhost:54329`),
loads `supabase/tests/supabase_shim.sql` (Supabase roles, `auth.uid()`, Storage schema),
applies every migration and runs `supabase/tests/*.dbtest.ts` as the real
`authenticated`/`anon` roles. GitHub Actions runs the same suite with a Postgres 16 service.
