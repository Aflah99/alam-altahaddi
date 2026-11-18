// TEST-ONLY: synthetic accounts for the local e2e database (never real data).
import pg from 'pg'
const pool = new pg.Pool({ connectionString: process.env.EMU_DB_URL ?? 'postgres://postgres@localhost:54329/alam_e2e' })
await pool.query(`alter table auth.users add column if not exists encrypted_password text`)
const users = [
  ['parent.one@example.test', 'parent-pass-1', 'parent'],
  ['parent.two@example.test', 'parent-pass-2', 'parent'],
  ['admin.owner@example.test', 'admin-pass-1', 'admin'],
]
for (const [email, password, role] of users) {
  await pool.query(
    `insert into auth.users (email, encrypted_password, email_confirmed_at) values ($1, crypt($2, gen_salt('bf')), now()) on conflict (email) do nothing`,
    [email, password],
  )
  if (role === 'admin') await pool.query('select public.grant_admin($1)', [email])
}
console.log('seeded', users.length, 'synthetic adult accounts')
await pool.end()
