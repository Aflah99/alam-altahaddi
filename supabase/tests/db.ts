// Helpers for database tests against the LOCAL Supabase-compatible PostgreSQL
// (scripts/db/reset-local.sh). Each helper runs SQL exactly as PostgREST would:
// as the `authenticated` (or `anon`) role with JWT claims, so Row Level Security,
// grants and SECURITY DEFINER functions behave as they do in production.
import pg from 'pg'

export const DB_URL = process.env.TEST_DB_URL_FULL ?? 'postgres://postgres@localhost:54329/alam_test'

export const pool = new pg.Pool({ connectionString: DB_URL, max: 4 })

export async function dbAvailable(): Promise<boolean> {
  try {
    await pool.query('select 1 from public.subjects limit 1')
    return true
  } catch {
    return false
  }
}

/** Runs `sql` as an API caller. `uid` null = anonymous. Rolled back unless `commit`. */
export async function as<T = Record<string, unknown>>(
  uid: string | null,
  sql: string,
  params: unknown[] = [],
  { commit = true } = {},
): Promise<T[]> {
  const c = await pool.connect()
  try {
    await c.query('begin')
    const claims = uid ? { sub: uid, role: 'authenticated' } : { role: 'anon' }
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await c.query(`set local role ${uid ? 'authenticated' : 'anon'}`)
    const r = await c.query(sql, params)
    await c.query(commit ? 'commit' : 'rollback')
    return r.rows as T[]
  } catch (e) {
    await c.query('rollback').catch(() => {})
    throw e
  } finally {
    c.release()
  }
}

/** Calls an RPC as a user and returns its single value. */
export async function rpc<T = unknown>(uid: string | null, fn: string, ...args: unknown[]): Promise<T> {
  const ph = args.map((_, i) => `$${i + 1}`).join(', ')
  const rows = await as<{ v: T }>(uid, `select public.${fn}(${ph}) as v`, args)
  return rows[0].v
}

/** Superuser query (test setup only). */
export async function root<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await pool.query(sql, params)).rows as T[]
}

let seq = 0
const tag = () => `${Date.now().toString(36)}${(seq++).toString(36)}`

/** Simulates Supabase Auth creating a user (what the sign-up page / backend function does). */
export async function createParent(): Promise<string> {
  const [r] = await root<{ id: string }>(`insert into auth.users (email, raw_user_meta_data) values ($1, '{"role":"admin"}') returning id`, [
    `parent_${tag()}@example.test`,
  ])
  return r.id
}

export async function createStudent(parentId: string | null, nickname = 'نجم'): Promise<string> {
  const username = `s_${tag()}`.slice(0, 20)
  const meta = { role: 'student', username, nickname, parent_id: parentId }
  const [r] = await root<{ id: string }>(`insert into auth.users (email, raw_app_meta_data) values ($1, $2) returning id`, [
    `${username}@students.alam-altahaddi.invalid`,
    JSON.stringify(meta),
  ])
  return r.id
}

export async function createAdmin(): Promise<string> {
  const id = await createParent()
  const [{ email }] = await root<{ email: string }>('select email from auth.users where id = $1', [id])
  await root('select public.grant_admin($1)', [email])
  return id
}

/** First playable mission of a legacy lesson (e.g. 'u1-l1'), plus its correct options (test-only peek). */
export async function missionOf(legacyLesson: string, number = 1) {
  const [m] = await root<{ id: string }>(
    `select m.id from public.missions m join public.lessons l on l.id = m.lesson_id where l.legacy_id = $1 and m.number = $2`,
    [legacyLesson, number],
  )
  const answers = await root<{ question_id: string; option_id: string }>(
    `select o.question_id, o.option_id from public.mission_questions mq join public.question_options o on o.question_id = mq.question_id and o.is_correct where mq.mission_id = $1`,
    [m.id],
  )
  return { id: m.id, correct: new Map(answers.map((a) => [a.question_id, a.option_id])) }
}

export const wrongOf = (correct: string) => ['a', 'b', 'c', 'd'].filter((o) => o !== correct)
