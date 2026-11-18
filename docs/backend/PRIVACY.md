# Privacy and safety design — for review

This document describes what the system does with children's data. **It is not legal
advice, and no legal review has been done.** Before inviting real families, the owner
should have it checked against the laws that apply where the students live (for example
the country's personal-data protection law, and COPPA/GDPR-K if children in the US or EU
take part).

## What is stored

| Data | Why | Where |
| --- | --- | --- |
| Parent email, display name | sign-in, password reset | Supabase Auth, `profiles` |
| Child username, nickname, chosen character | sign-in and display | `student_profiles` |
| Child password | sign-in (hashed by Supabase Auth) | Supabase Auth |
| Answers, hints used, time per question, mission results | scoring and the parent dashboard | `question_attempts`, `quiz_sessions` |
| XP / coin ledger, purchases, equipment | rewards and the shop | `reward_transactions`, `inventory`, `equipped_items` |
| Group memberships | private leaderboards | `group_members` |
| Audit events | security and the parent's activity view | `audit_log` |
| Imported device history (optional, once) | parent information, marked unverified | `legacy_imports` |

Not stored: children's email addresses, real names, birth dates, photos, location,
contacts, free-text messages or chat. There is no chat feature and no public profile.

## Controls in the product

* **Parental creation and consent:** only a parent account can create a child account.
  Children cannot sign up by themselves.
* **Group approval:** a group code only creates a *pending* request. A child becomes a
  member only after one of their own linked parents approves. The group owner cannot
  approve on another family's behalf. Parents can turn off group requests entirely.
* **Leaderboards:** only inside private groups, never public. They show nickname,
  character and verified XP only. Parents can hide their child from all leaderboards;
  admins can exclude a student.
* **Access isolation:** RLS policies and function checks ensure parents read only their
  own children, students read only their own records, and outsiders cannot read a group.
  The database tests cover these rules (`supabase/tests/phaseC.dbtest.ts`).
* **Deletion:** a parent can permanently delete a child account (typed confirmation). This
  cascades to all of the child's records. A parent can also send a family deletion request
  to the platform admin.
* **Activity view:** parents see account and group events and their children's mission
  activity.
* **Minimal processing by AI:** only textbook pages uploaded by an admin are sent to the
  Anthropic API to draft questions. No student data is ever sent to an AI service.

## Items the owner must decide or verify

1. **Lawful basis and consent wording** for parents creating child accounts, with the age
   ranges of the students.
2. **Data residency:** the Supabase region (chosen at project creation) and Anthropic's
   processing location, and whether the school or ministry has requirements.
3. **Retention periods:** how long attempts and audit logs are kept. The system keeps them
   until an account is deleted; there is no automatic expiry yet.
4. **Processor agreements:** Supabase and Anthropic data processing terms, if required.
5. **Email delivery:** a custom SMTP provider before real parents sign up.
6. **Privacy notice:** `public/privacy.html` is a draft and is marked as not legally
   reviewed.
7. **Breach and request handling:** who answers deletion and access requests and how fast
   (the admin «التقارير» page lists deletion requests and records when each is handled).
8. **Textbook rights:** permission to upload and process the textbooks used for
   generation.

## Known limits

* Server checks reduce cheating a lot (answers are checked on the server, rewards are paid
  once, rate limits apply), but the system is **not** fully cheat-proof. For example, a
  student could look answers up in the book or get help from someone else.
* Guest mode (no account) keeps data only in the browser. It never reaches leaderboards.
* Time-on-task is an estimate from mission start and end times.
