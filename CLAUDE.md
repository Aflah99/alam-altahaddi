# CLAUDE.md — عالم التحدّي

Arabic RTL pixel-art educational game for Grade 8, played mainly on iPhones and iPads.
Stack: React + Vite + TypeScript, plain CSS, npm, Node 22 (`.nvmrc`). See `README.md`.

- Repo: https://github.com/Aflah99/alam-altahaddi
- Live site: https://aflah99.github.io/alam-altahaddi/ (Vite `base: '/alam-altahaddi/'`)
- Deploy: `.github/workflows/deploy.yml` runs on every push to `main`.

## Standing workflow (from the project owner)

For every task the owner explicitly assigns, run the whole GitHub workflow yourself:

1. Inspect the repository, then implement the change.
2. Run `npm run typecheck`, `npm run lint` and `npm run build`; fix any errors.
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

## Project rules

- All UI text is Arabic, right-to-left. Readable for Grade 8 students.
- Retro 8/16-bit pixel-art style; original assets only.
- No secrets, API keys, textbooks or student data in the repo. Backend will be Supabase
  with server-side functions; only public `VITE_` values may reach the browser.
