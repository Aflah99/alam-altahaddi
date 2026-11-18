# Owner-only setup (Tasks 07–09)

Claude cannot create accounts, accept terms of service or enter payment details for you.
These are the **only** steps that need the project owner. Everything else (database
migrations, security policies, backend functions, auth settings, deployment) is done
by Claude through the secure channels described below.

> Never paste passwords or secret keys into the chat. Secrets go only into the secure
> form Claude opens, or into the Supabase dashboard.

## 1. Create the Supabase project (free plan, ~3 minutes)

1. Sign in at <https://supabase.com/dashboard> (GitHub sign-in is fine).
2. **New project** → organization on the **Free** plan → name `alam-altahaddi`.
3. Region: the closest to your students (e.g. *South Asia (Mumbai)* or *Central EU (Frankfurt)*).
4. Generate a strong database password and keep it in your password manager (Claude does not need it).
5. When the project is ready, copy its **project reference** — the short id in the
   dashboard URL `supabase.com/dashboard/project/<project-ref>`. It is not secret; you can
   type it in the chat.

Free-plan notes: free projects pause after about a week without activity (one click to
resume); storage is 1 GB; no charges unless you upgrade.

## 2. Give Claude deployment access (secure form, revocable)

1. In Supabase: avatar → **Account preferences → Access Tokens → Generate new token**,
   name it `claude-alam-altahaddi`.
2. When Claude opens the **secure credential form** for `api.supabase.com`, paste the token
   there (not in the chat). It is stored as an encrypted network secret of this cloud
   environment and is only sent to `api.supabase.com`.
3. Revoke the token in the same Supabase page whenever you want; deployments already made keep working.

With it Claude applies the SQL migrations, configures the login redirect URLs for
`https://aflah99.github.io/alam-altahaddi/`, deploys the Edge Functions and reads the
**publishable** (public) key for the website.

## 3. Anthropic API key for question generation (only you can do this)

1. At <https://console.anthropic.com> create an API key in a workspace with a **monthly
   spend limit** you are comfortable with (for example US$10).
2. In Supabase: **Edge Functions → Secrets → Add new secret**: name `ANTHROPIC_API_KEY`,
   value = the key. It never goes to GitHub or the browser.
3. Tell Claude in the chat the maximum you authorise for test generations (for example
   «I authorise up to $2 of test generation»). Without that authorisation, Claude will not
   start any paid generation.

## 4. First administrator (after Claude has deployed)

Sign up on the website as a parent with your own email, then tell Claude which email is
yours. Claude promotes it to administrator with a server-side command (admins can never
be created from the website).

## Before a public launch (not needed for testing)

- **Email delivery:** Supabase's built-in email only reaches your own team addresses and
  is heavily rate-limited. Real parents need a custom SMTP provider
  (Supabase → Authentication → Emails → SMTP), e.g. a free tier of an email service.
- **Legal review:** see `docs/backend/PRIVACY.md` (children's data, parental consent,
  data residency).
