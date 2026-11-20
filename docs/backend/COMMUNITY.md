# المواد المجتمعية — Community courses (Feature 6)

Parents create structured courses (Subject → Units → Lessons → Questions), publish them immediately and share them.
Students find public courses in **اكتشف المواد**, enrol directly and play them through the normal mission flow.
No AI service is used anywhere in this feature; parents may prepare questions with any external tool and paste the result.

## Model (reuses the existing curriculum tables)
- `subjects.kind` = `official` (default; all existing subjects) or `community`. Only administrators can change `kind`
  (`admin_set_course_kind`). `owner_id`, `visibility` (`public|private|invite`), `moderation` (`ok|suspended|removed`),
  `category`, `published_at`, `version` are new columns. Units, lessons, questions, missions, sessions and grading are the
  same objects the official curriculum uses (`questions.origin = 'community'`).
- New tables (all RLS-closed, API access only through functions): `community_settings`, `community_blocklist`,
  `creator_profiles`, `course_enrollments`, `course_invites`, `course_access`, `course_invite_attempts`, `course_ratings`,
  `course_favorites`, `course_reports`, `course_actions` (rate-limit ledger), `course_import_batches`, `child_community_controls`.
- Ordinary table reads (`subjects`, `units`, `lessons`, `missions`) return **official** content only. Community content is
  reached only through SECURITY DEFINER functions that check owner, visibility, enrolment, parent restriction and moderation.

## Visibility
| Setting | Search | Who can enrol/play |
|---|---|---|
| عام public | yes | any signed-in student |
| خاص private | no | the creator's family only |
| بالدعوة invite | no | family + people who redeemed the current code (parents redeem for all their children) |
Changing public → private keeps enrolments and progress but `community_can_play` fails for outsiders at once (also in a
running session); making it public again restores access. Invite codes: 10 characters (CSPRNG), expiry 1–90 days, max uses,
a new code revokes the old one, revoke can also remove granted access, failed redemptions are rate limited.

## Authoring safety
- All text is cleaned on the server (control and bidi-override characters removed) and rejected if it contains HTML tags,
  `javascript:`/`data:` URIs, links or domain names, HTML entities, words on `community_blocklist`, or claims to be
  "official / approved / verified / staff". These are **rule-based checks, not a guarantee of safety**.
- Rate limits (adjustable in `community_settings`): 20 courses per parent, 1000 question writes/day, 100 questions per import,
  10 imports/hour, 10 publish actions/day, 500 questions/course, 30 units, 30 lessons per unit.
- Creator names are pseudonyms (`مبدع 1234` by default, editable, no `@`); emails are never returned to students or parents.
- Courses are labelled «مادة مجتمعية · غير معتمدة رسميًا» everywhere students see them.

## Editing and history
Used questions are never rewritten: correcting a question that students have answered archives the old row and inserts a new
version in the same position (`derived_from`, shared `lineage_id`). Recorded attempts keep their original result. Deleting a unit,
lesson, question or course that students used **archives** it instead; only unused content is hard-deleted.

## Rewards (server-verified, capped, idempotent)
Ledger kinds `community_question` and `community_mission` (official kinds are untouched). Defaults: 2 XP + 1 coin per
first-try answer (half when assisted), mission bonus 5 XP + 3 coins, **daily cap 40 XP / 25 coins per student across all courses**,
at most 60 rewarded questions per course per student, each question lineage pays once ever (edits cannot re-pay), no rewards
inside the creator's own family, community XP excluded from group leaderboards. Multiplayer: community questions only from
public courses the host plays, and matches containing them pay nothing.

## Moderation
Public courses publish immediately; control is after the fact: `report_course` → admin queue (`admin_course_reports`),
`admin_moderate_course` (suspend / restore / remove / unpublish), creator blocking, insights for suspicious reward or
publishing patterns, editable settings and blocklist. Reports never auto-suspend (mass-report abuse); reporter identity is admin-only.

## Bulk paste format (parser: `src/community/parser.ts`, runs in the browser, no AI)
```
الوحدة: عنوان الوحدة            (optional group headers)
الدرس: عنوان الدرس
السؤال 1: نص السؤال؟
أ: خيار   ب: خيار   ج: خيار   د: خيار    (one per line)
الإجابة الصحيحة: ب
الشرح: ...   تلميح: ...         (optional)
السؤال 2: ...
النوع: كتابي
الإجابة النموذجية: ...
إجابات مقبولة: بديل | بديل
للمراجعة: ...                    (marks an uncertain answer; not imported until confirmed)
```
Accepts Arabic/Latin numbering and labels, markdown noise, multi-line text, spacing variations. Missing or invalid correct answers are
errors (never guessed). The import RPC is atomic and idempotent per request id; duplicates are skipped.
The copyable prompt for external AI tools is `src/community/prompt.ts`.

## ⚠ Owner note: residual risk of immediate public publication
Because courses publish without review, a malicious or careless parent can briefly expose children to wrong or inappropriate
content before a report is acted on. Automatic checks are basic. Before a broad launch to children, decide who monitors the
report queue (daily), consider keeping courses «private/by invitation» by default for new creators, and review PRIVACY.md /
terms for user-generated content and copyright takedowns.
