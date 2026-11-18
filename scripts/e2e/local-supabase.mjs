// TEST-ONLY local stand-in for the Supabase HTTP APIs, used by browser end-to-end
// tests when no real Supabase project is available. It is NOT Supabase and is never
// deployed. It implements the small subset the app uses — Auth (password sign-in,
// sign-up, refresh, user, admin users), PostgREST (table CRUD with simple filters, RPC),
// Edge Functions (runs the real handler modules) and Storage (private bucket upload/
// download) — on top of the same PostgreSQL database, executing every request as the
// `anon` / `authenticated` / `service_role` database role with JWT claims, so Row Level
// Security, grants and SECURITY DEFINER functions behave exactly as in production.
//
// Run: node --experimental-strip-types scripts/e2e/local-supabase.mjs
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const PORT = Number(process.env.EMU_PORT ?? 54321)
const DB_URL = process.env.EMU_DB_URL ?? 'postgres://postgres@localhost:54329/alam_e2e'
const SECRET = process.env.EMU_JWT_SECRET ?? 'local-test-secret-not-for-production-0123456789'
const BASE = `http://localhost:${PORT}`
const STORAGE_DIR = process.env.EMU_STORAGE_DIR ?? join(ROOT, 'node_modules/.tmp/emu-storage')
const pool = new pg.Pool({ connectionString: DB_URL, max: 8 })

/* ---------- JWT (HS256) ---------- */
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url')
function sign(payload) {
  const h = b64({ alg: 'HS256', typ: 'JWT' })
  const p = b64(payload)
  return `${h}.${p}.${createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`
}
function verify(token) {
  const [h, p, s] = String(token ?? '').split('.')
  if (!s || createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url') !== s) return null
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString())
  if (claims.exp && claims.exp < Date.now() / 1000) return null
  return claims
}
export const ANON_KEY = sign({ role: 'anon', iss: 'emu' })
export const SERVICE_KEY = sign({ role: 'service_role', iss: 'emu' })
const ACCESS_TTL = Number(process.env.EMU_ACCESS_TTL ?? 3600)

/* ---------- helpers ---------- */
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer, accept, accept-profile, content-profile, range, x-upsert, cache-control, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, HEAD, OPTIONS',
  'Access-Control-Expose-Headers': 'content-range, x-supabase-api-version',
}
function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body)
  res.writeHead(status, { ...cors, ...(body === undefined || isBuf ? {} : { 'Content-Type': 'application/json' }), ...headers })
  res.end(body === undefined ? undefined : isBuf ? body : JSON.stringify(body))
}
const readBody = (req) =>
  new Promise((ok) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => ok(Buffer.concat(chunks)))
  })
const jsonBody = async (req) => {
  const b = await readBody(req)
  try {
    return b.length ? JSON.parse(b.toString()) : {}
  } catch {
    return {}
  }
}
function claimsOf(req) {
  const auth = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  return verify(auth) ?? verify(req.headers.apikey) ?? { role: 'anon' }
}
/** Runs SQL as the API role of the request (RLS applies). */
async function asRole(claims, sql, params = []) {
  const c = await pool.connect()
  try {
    await c.query('begin')
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    const role = claims.role === 'service_role' ? 'service_role' : claims.role === 'authenticated' ? 'authenticated' : 'anon'
    await c.query(`set local role ${role}`)
    const r = await c.query(sql, params)
    await c.query('commit')
    return r
  } catch (e) {
    await c.query('rollback').catch(() => {})
    throw e
  } finally {
    c.release()
  }
}
function pgError(res, e, claims) {
  const code = e.code ?? 'XX000'
  let status = 400
  if (code === '42501') status = claims.role === 'authenticated' ? 403 : 401
  if (code === 'P0002' || code === '42P01' || code === '42883') status = 404
  if (code === '23505') status = 409
  send(res, status, { code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null })
}
const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Object.assign(new Error(`bad identifier ${s}`), { code: '42601' })
  return `"${s}"`
}

/* ---------- auth ---------- */
async function ensureAuthColumns() {
  await pool.query(`alter table auth.users add column if not exists encrypted_password text`)
  await pool.query(`create table if not exists auth.refresh_tokens (token text primary key, user_id uuid, revoked boolean default false)`)
}
async function userRow(id) {
  return (await pool.query('select * from auth.users where id = $1', [id])).rows[0]
}
const userJson = (u) => ({
  id: u.id,
  aud: 'authenticated',
  role: 'authenticated',
  email: u.email,
  email_confirmed_at: u.email_confirmed_at ?? u.created_at,
  app_metadata: u.raw_app_meta_data ?? {},
  user_metadata: u.raw_user_meta_data ?? {},
  created_at: u.created_at,
})
async function session(u) {
  const now = Math.floor(Date.now() / 1000)
  const refresh = randomBytes(24).toString('hex')
  await pool.query('insert into auth.refresh_tokens (token, user_id) values ($1, $2)', [refresh, u.id])
  return {
    access_token: sign({ sub: u.id, role: 'authenticated', aud: 'authenticated', email: u.email, exp: now + ACCESS_TTL, iat: now }),
    token_type: 'bearer',
    expires_in: ACCESS_TTL,
    expires_at: now + ACCESS_TTL,
    refresh_token: refresh,
    user: userJson(u),
  }
}

async function handleAuth(req, res, path, url) {
  const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await jsonBody(req)
  if (path === '/token' && url.searchParams.get('grant_type') === 'password') {
    const r = await pool.query(`select * from auth.users where lower(email) = lower($1) and encrypted_password = extensions.crypt($2, encrypted_password)`, [body.email ?? '', body.password ?? ''])
    if (!r.rows[0]) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials', code: 'invalid_credentials' })
    return send(res, 200, await session(r.rows[0]))
  }
  if (path === '/token' && url.searchParams.get('grant_type') === 'refresh_token') {
    const r = await pool.query('update auth.refresh_tokens set revoked = true where token = $1 and not revoked returning user_id', [body.refresh_token ?? ''])
    const u = r.rows[0] && (await userRow(r.rows[0].user_id))
    if (!u) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token', code: 'refresh_token_not_found' })
    return send(res, 200, await session(u))
  }
  if (path === '/signup') {
    if (!body.email || !body.password || String(body.password).length < 6) return send(res, 422, { code: 'weak_password', msg: 'Password too short' })
    try {
      const r = await pool.query(
        `insert into auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at) values ($1, extensions.crypt($2, extensions.gen_salt('bf')), $3, now()) returning *`,
        [body.email, body.password, JSON.stringify(body.data ?? {})],
      )
      return send(res, 200, await session(r.rows[0]))
    } catch {
      return send(res, 422, { code: 'user_already_exists', msg: 'User already registered' })
    }
  }
  if (path === '/recover') return send(res, 200, {})
  if (path === '/logout') {
    const c = claimsOf(req)
    if (c.sub) await pool.query('update auth.refresh_tokens set revoked = true where user_id = $1', [c.sub])
    return send(res, 204)
  }
  if (path === '/user') {
    const c = claimsOf(req)
    const u = c.sub && (await userRow(c.sub))
    if (!u) return send(res, 401, { code: 'bad_jwt', msg: 'invalid JWT' })
    if (req.method === 'PUT' && body.password) await pool.query(`update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')) where id = $1`, [u.id, body.password])
    return send(res, 200, userJson(await userRow(u.id)))
  }
  // Admin API (service role only)
  if (path.startsWith('/admin/users')) {
    if (claimsOf(req).role !== 'service_role') return send(res, 403, { msg: 'not admin' })
    const id = path.split('/')[3]
    if (req.method === 'POST') {
      try {
        // Like Supabase Auth: insert the user first, then write app_metadata in a second statement.
        const ins = await pool.query(
          `insert into auth.users (email, encrypted_password, raw_app_meta_data, raw_user_meta_data, email_confirmed_at) values ($1, extensions.crypt($2, extensions.gen_salt('bf')), '{"provider":"email","providers":["email"]}', $3, now()) returning id`,
          [body.email, body.password, JSON.stringify(body.user_metadata ?? {})],
        )
        const r = await pool.query(
          `update auth.users set raw_app_meta_data = raw_app_meta_data || $2::jsonb where id = $1 returning *`,
          [ins.rows[0].id, JSON.stringify(body.app_metadata ?? {})],
        )
        return send(res, 200, userJson(r.rows[0]))
      } catch (e) {
        return send(res, 422, { code: 'email_exists', msg: String(e.message) })
      }
    }
    if (req.method === 'PUT' && id) {
      if (body.password) await pool.query(`update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')) where id = $1`, [id, body.password])
      const u = await userRow(id)
      return u ? send(res, 200, userJson(u)) : send(res, 404, { msg: 'not found' })
    }
    if (req.method === 'DELETE' && id) {
      await pool.query('delete from auth.users where id = $1', [id])
      return send(res, 200, {})
    }
  }
  return send(res, 404, { msg: `auth route ${path} not emulated` })
}

/* ---------- PostgREST subset ---------- */
function filters(url, params) {
  const where = []
  for (const [k, v] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue
    const [op, ...rest] = v.split('.')
    const val = rest.join('.')
    const col = ident(k)
    if (op === 'eq') where.push(`${col} = $${params.push(val)}`)
    else if (op === 'neq') where.push(`${col} <> $${params.push(val)}`)
    else if (op === 'gte') where.push(`${col} >= $${params.push(val)}`)
    else if (op === 'lte') where.push(`${col} <= $${params.push(val)}`)
    else if (op === 'gt') where.push(`${col} > $${params.push(val)}`)
    else if (op === 'lt') where.push(`${col} < $${params.push(val)}`)
    else if (op === 'like') where.push(`${col}::text like $${params.push(val.replace(/\*/g, '%'))}`)
    else if (op === 'ilike') where.push(`${col}::text ilike $${params.push(val.replace(/\*/g, '%'))}`)
    else if (op === 'is') where.push(`${col} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`)
    else if (op === 'in') {
      const items = val.replace(/^\(|\)$/g, '').split(',').filter(Boolean).map((x) => x.replace(/^"|"$/g, ''))
      where.push(items.length ? `${col}::text in (${items.map((x) => `$${params.push(x)}`).join(', ')})` : 'false')
    } else throw Object.assign(new Error(`operator ${op} not emulated`), { code: '42601' })
  }
  return where.length ? ` where ${where.join(' and ')}` : ''
}
function orderLimit(url) {
  let s = ''
  const order = url.searchParams.get('order')
  if (order)
    s += ' order by ' + order.split(',').map((o) => {
      const [c, dir, nulls] = o.split('.')
      return `${ident(c)} ${dir === 'desc' ? 'desc' : 'asc'}${nulls === 'nullslast' ? ' nulls last' : nulls === 'nullsfirst' ? ' nulls first' : ''}`
    }).join(', ')
  const limit = url.searchParams.get('limit')
  if (limit) s += ` limit ${Number(limit)}`
  const offset = url.searchParams.get('offset')
  if (offset) s += ` offset ${Number(offset)}`
  return s
}
function selectList(url) {
  const sel = url.searchParams.get('select') ?? '*'
  if (sel === '*') return '*'
  return sel.split(',').map((c) => ident(c.trim())).join(', ')
}

async function handleRest(req, res, path, url) {
  const claims = claimsOf(req)
  const prefer = req.headers.prefer ?? ''
  try {
    if (path.startsWith('/rpc/')) {
      const fn = ident(path.slice(5))
      const args = await jsonBody(req)
      const keys = Object.keys(args)
      // Like PostgREST: JSON arrays become PostgreSQL arrays, other objects stay JSON.
      const params = keys.map((k) => (Array.isArray(args[k]) ? args[k] : args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]))
      const sql = `select public.${fn}(${keys.map((k, i) => `${ident(k)} := $${i + 1}`).join(', ')}) as v`
      const r = await asRole(claims, sql, params)
      const v = r.rows[0]?.v
      return v === null || v === undefined ? send(res, 204) : send(res, 200, v)
    }
    const table = ident(path.slice(1))
    const params = []
    if (req.method === 'GET' || req.method === 'HEAD') {
      const where = filters(url, params)
      if (req.method === 'HEAD' || /count=exact/.test(prefer)) {
        const r = await asRole(claims, `select count(*)::int as n from public.${table}${where}`, params)
        const n = r.rows[0].n
        if (req.method === 'HEAD') return send(res, 200, undefined, { 'Content-Range': `*/${n}` })
      }
      const r = await asRole(claims, `select ${selectList(url)} from public.${table}${where}${orderLimit(url)}`, params)
      if ((req.headers.accept ?? '').includes('vnd.pgrst.object')) {
        if (r.rows.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })
        return send(res, 200, r.rows[0])
      }
      return send(res, 200, r.rows, { 'Content-Range': `0-${Math.max(0, r.rows.length - 1)}/*` })
    }
    if (req.method === 'POST') {
      const body = await jsonBody(req)
      const rows = Array.isArray(body) ? body : [body]
      if (!rows.length) return send(res, 201, [])
      const cols = Object.keys(rows[0])
      const values = rows.map((row) => `(${cols.map((c) => `$${params.push(row[c] !== null && typeof row[c] === 'object' ? JSON.stringify(row[c]) : row[c])}`).join(', ')})`)
      const conflict = url.searchParams.get('on_conflict')
      const upsert = /resolution=merge-duplicates/.test(prefer) && conflict
      const ignore = /resolution=ignore-duplicates/.test(prefer)
      const sql =
        `insert into public.${table} (${cols.map(ident).join(', ')}) values ${values.join(', ')}` +
        (upsert ? ` on conflict (${conflict.split(',').map(ident).join(', ')}) do update set ${cols.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(', ')}` : ignore ? ' on conflict do nothing' : '') +
        ` returning ${selectList(url)}`
      const r = await asRole(claims, sql, params)
      if ((req.headers.accept ?? '').includes('vnd.pgrst.object')) return r.rows.length === 1 ? send(res, 201, r.rows[0]) : send(res, 406, { code: 'PGRST116', message: 'not one row' })
      return /return=representation/.test(prefer) ? send(res, 201, r.rows) : send(res, 201)
    }
    if (req.method === 'PATCH') {
      const body = await jsonBody(req)
      const sets = Object.keys(body).map((c) => `${ident(c)} = $${params.push(body[c] !== null && typeof body[c] === 'object' ? JSON.stringify(body[c]) : body[c])}`)
      const r = await asRole(claims, `update public.${table} set ${sets.join(', ')}${filters(url, params)} returning ${selectList(url)}`, params)
      if ((req.headers.accept ?? '').includes('vnd.pgrst.object')) return r.rows.length === 1 ? send(res, 200, r.rows[0]) : send(res, 406, { code: 'PGRST116', message: 'not one row' })
      return /return=representation/.test(prefer) ? send(res, 200, r.rows) : send(res, 204)
    }
    if (req.method === 'DELETE') {
      const r = await asRole(claims, `delete from public.${table}${filters(url, params)} returning ${selectList(url)}`, params)
      return /return=representation/.test(prefer) ? send(res, 200, r.rows) : send(res, 204)
    }
  } catch (e) {
    return pgError(res, e, claims)
  }
  return send(res, 405, { message: 'method not emulated' })
}

/* ---------- Storage (private bucket subset) ---------- */
/** The file part of a multipart upload (the part that is not a plain field such as cacheControl). */
function fileFromMultipart(buf, boundary) {
  const sep = Buffer.from(`--${boundary}`)
  let pos = buf.indexOf(sep)
  while (pos !== -1) {
    const next = buf.indexOf(sep, pos + sep.length)
    if (next === -1) break
    const part = buf.subarray(pos + sep.length + 2, next - 2)
    const headerEnd = part.indexOf('\r\n\r\n')
    const headers = part.subarray(0, headerEnd).toString()
    if (!/name="cacheControl"|name="metadata"/.test(headers)) return part.subarray(headerEnd + 4)
    pos = next
  }
  return buf
}

async function handleStorage(req, res, path) {
  const claims = claimsOf(req)
  const m = path.match(/^\/object\/(?:authenticated\/)?([^/]+)\/(.+)$/)
  if (!m) return send(res, 404, { message: 'storage route not emulated' })
  const [, bucket, name] = m
  const file = join(STORAGE_DIR, bucket, name)
  try {
    if (req.method === 'POST' || req.method === 'PUT') {
      let body = await readBody(req)
      const ct = req.headers['content-type'] ?? ''
      const boundary = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/)
      if (ct.startsWith('multipart/form-data') && boundary) body = fileFromMultipart(body, boundary[1] ?? boundary[2])
      await asRole(claims, `insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3) on conflict (bucket_id, name) do nothing`, [bucket, name, claims.sub ?? null])
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, body)
      return send(res, 200, { Key: `${bucket}/${name}`, Id: randomUUID() })
    }
    if (req.method === 'GET') {
      const r = await asRole(claims, `select name from storage.objects where bucket_id = $1 and name = $2`, [bucket, name])
      if (!r.rows.length || !existsSync(file)) return send(res, 404, { statusCode: '404', error: 'not_found', message: 'Object not found' })
      return send(res, 200, readFileSync(file), { 'Content-Type': 'application/octet-stream' })
    }
    if (req.method === 'DELETE') {
      await asRole(claims, `delete from storage.objects where bucket_id = $1 and name = $2`, [bucket, name])
      return send(res, 200, [])
    }
  } catch (e) {
    return send(res, 403, { statusCode: '403', error: 'Unauthorized', message: e.message })
  }
  return send(res, 405, {})
}

/* ---------- Edge Functions: run the real handlers ---------- */
const handlers = {}
async function handleFunction(req, res, name) {
  const fileUrl = pathToFileURL(join(ROOT, 'supabase/functions', name, 'handler.ts')).href
  if (!handlers[name]) {
    const mod = await import(fileUrl)
    handlers[name] = Object.values(mod).find((v) => typeof v === 'function')
  }
  const body = req.method === 'GET' || req.method === 'OPTIONS' ? undefined : await readBody(req)
  const request = new Request(`${BASE}/functions/v1/${name}`, { method: req.method, headers: req.headers, body })
  const admin = createClient(BASE, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const env = (k) => ({ ALLOWED_ORIGINS: 'http://localhost:4173,http://localhost:4174,http://localhost:5173', SUPABASE_URL: BASE, ...process.env })[k]
  const extras = name === 'ai-worker' ? await workerExtras() : {}
  try {
    const response = await handlers[name](request, { admin, env, ...extras })
    const buf = Buffer.from(await response.arrayBuffer())
    // The function sets its own CORS headers (as on Supabase); don't add a second Allow-Origin.
    const headers = Object.fromEntries(response.headers)
    res.writeHead(response.status, { ...Object.fromEntries(Object.entries(cors).filter(([k]) => k.toLowerCase() !== 'access-control-allow-origin')), ...headers })
    res.end(buf)
  } catch (e) {
    send(res, 500, { error: String(e.message ?? e) })
  }
}

/* ---------- ai-worker dependencies (PDF tools are real; the model is a labelled fake) ---------- */
async function workerExtras() {
  const { PDFDocument } = await import('pdf-lib')
  const ai = process.env.EMU_FAKE_AI === '1' ? (await import('./fake-ai.mjs')).fakeAi : null
  return {
    ai,
    pdf: {
      pageCount: async (b) => (await PDFDocument.load(b)).getPageCount(),
      slice: async (b, from, to) => {
        const src = await PDFDocument.load(b)
        const out = await PDFDocument.create()
        for (const pg of await out.copyPages(src, Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i))) out.addPage(pg)
        return out.save()
      },
    },
    docxToText: async () => {
      throw new Error('DOCX conversion is not available in the local test emulator')
    },
  }
}

/* ---------- server ---------- */
await ensureAuthColumns()
createServer(async (req, res) => {
  const url = new URL(req.url, BASE)
  if (req.method === 'OPTIONS') return send(res, 204)
  try {
    if (url.pathname.startsWith('/auth/v1')) return await handleAuth(req, res, url.pathname.slice(8), url)
    if (url.pathname.startsWith('/rest/v1')) return await handleRest(req, res, url.pathname.slice(8), url)
    if (url.pathname.startsWith('/storage/v1')) return await handleStorage(req, res, url.pathname.slice(11))
    if (url.pathname.startsWith('/functions/v1/')) return await handleFunction(req, res, url.pathname.slice(14))
    if (url.pathname === '/__keys') return send(res, 200, { anon: ANON_KEY, service: SERVICE_KEY })
    send(res, 404, { message: 'not found' })
  } catch (e) {
    send(res, 500, { message: String(e.message ?? e) })
  }
}).listen(PORT, () => console.log(`local supabase emulator on ${BASE}`))
