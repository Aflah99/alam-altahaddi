# CLAUDE.md — عالم التحدّي

Arabic RTL pixel-art educational game for Grade 8, played mainly on iPhones and iPads.
Stack: React + Vite + TypeScript, plain CSS, npm, Node 22 (`.nvmrc`). See `README.md`.

- Repo: https://github.com/Aflah99/alam-altahaddi
- Live site: https://aflah99.github.io/alam-altahaddi/ (Vite `base: '/alam-altahaddi/'`)
- Deploy: `.github/workflows/deploy.yml` runs on every push to `main`.

## Standing workflow (from the project owner)

For every task the owner explicitly assigns, run the whole GitHub workflow yourself:

1. Inspect the repository, then implement the change.
2. Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`; fix any errors.
3. Commit, push to a working branch, and open a pull request into `main`.
4. Review the diff, then merge the PR yourself once checks pass. The owner has given
   standing permission to merge and deploy tested changes for assigned tasks.
   Never bypass branch protection or required checks.
5. Confirm the "Deploy to GitHub Pages" run succeeds; fix failures and regressions.
6. Open the live site and check it at iPhone and iPad sizes (no failed assets, no
   horizontal scroll, Arabic text and Cairo font render).
7. Report: what was implemented, what was tested, which PRs/commits were merged,
   whether deployment succeeded, the live URL, and anything that truly needs the owner.

Don't ask the owner to create branches, commit, push, open or merge PRs, run Actions,
or deploy. Only ask when an action really needs owner permissions, account login,
billing, external credentials, or an important product decision. If blocked, say exactly
which setting or permission is needed and what you already tried. Never ask for
passwords or tokens in chat.

Do not start a new numbered task until the owner assigns or approves it.

## Efficient workflow (from the project owner)

- Start from `docs/DEVELOPMENT_STATUS.md` and the current repository, not old conversation
  history. Update that file (keep it short) before finishing each phase.
- Read only the files the task needs; search with grep/glob before opening large files.
- Don't reprocess the textbook PDFs or the 600-question bank unless the task requires it.
- Supabase: use targeted SQL and migration checks; don't dump whole tables or schemas. Use
  the connector only for real database actions or verification.
- Run focused tests while developing. Before a merge or deploy, run the full set: typecheck,
  lint, unit, `test:db` and the relevant browser journeys.
- Don't retest unchanged features or take redundant screenshots. Keep the final deployment
  check at iPhone and iPad sizes.
- For large content, use scripts and intermediate files instead of passing it through the model.
- Reports: key findings, changed files, test results, open issues. No long code or log dumps.
- Never skip security checks, source validation or backups to save effort.

## Project rules

- All UI text is Arabic, right-to-left. Readable for Grade 8 students.
- Retro 8/16-bit pixel-art style; original assets only.
- No secrets, API keys, textbooks or student data in the repo. Backend is Supabase
  (`supabase/`, docs in `docs/backend/`); only `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY` may reach the browser. Secret keys and the Anthropic key
  live only in Edge Function secrets.
- Run `npm run test:db` too when touching `supabase/` (needs local PostgreSQL 16).
- Don't rewrite the academic questions; keep the 4 academic review flags open until a
  teacher resolves them.
- Never start paid AI generation without the owner's explicit spending authorisation.
