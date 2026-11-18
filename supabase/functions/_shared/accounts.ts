// Pure validation helpers shared by Edge Functions (Deno) and unit tests (Vitest).
// No Deno or Node globals here.

/** Must match STUDENT_EMAIL_DOMAIN in src/cloud/config.ts. */
export const DEFAULT_STUDENT_EMAIL_DOMAIN = 'students.alam-altahaddi.invalid'
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/
export const PASSWORD_MIN = 8
export const MAX_CHILDREN_PER_PARENT = 8
export const BASE_CHARACTERS = ['human-boy', 'human-girl']

export type Check = { ok: true } | { ok: false; error: string }

/** Matches the Supabase Auth policy of the production project (length 8+, lower, upper, digit, symbol).
 *  Must match passwordProblem in src/cloud/auth.ts. Returns an Arabic message, or null when acceptable. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `كلمة المرور قصيرة؛ استخدم ${PASSWORD_MIN} أحرف على الأقل.`
  if (password.length > 72) return 'كلمة المرور طويلة جدًّا.'
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password))
    return 'كلمة المرور يجب أن تحتوي حرفًا إنجليزيًّا صغيرًا وحرفًا كبيرًا ورقمًا ورمزًا مثل ! أو #.'
  return null
}

export function normalizeNickname(raw: string): string {
  return String(raw ?? '').replace(/\s+/gu, ' ').trim()
}

export function checkChildInput(input: { username?: unknown; nickname?: unknown; password?: unknown; character_id?: unknown }): Check {
  const username = String(input.username ?? '').trim().toLowerCase()
  const nickname = normalizeNickname(String(input.nickname ?? ''))
  const password = String(input.password ?? '')
  if (!USERNAME_RE.test(username)) return { ok: false, error: 'اسم الدخول من ٣ إلى ٢٠ حرفًا إنجليزيًّا صغيرًا أو رقمًا أو شرطة سفلية.' }
  if ([...nickname].length < 2 || [...nickname].length > 12 || !/^[\p{L}\p{N}_ ]+$/u.test(nickname))
    return { ok: false, error: 'اللقب من حرفين إلى ١٢ حرفًا (حروف وأرقام فقط).' }
  const pw = passwordProblem(password)
  if (pw) return { ok: false, error: pw }
  if (password.toLowerCase().includes(username)) return { ok: false, error: 'لا تجعل كلمة المرور تحتوي اسم الدخول.' }
  if (input.character_id !== undefined && !BASE_CHARACTERS.includes(String(input.character_id)))
    return { ok: false, error: 'شخصية غير متاحة.' }
  return { ok: true }
}

export function studentEmail(username: string, domain = DEFAULT_STUDENT_EMAIL_DOMAIN): string {
  return `${username.trim().toLowerCase()}@${domain}`
}

/** Allowed browser origins for CORS (the GitHub Pages site plus local development). */
export function allowedOrigin(origin: string | null, configured: string | undefined): string | null {
  const list = (configured ?? 'https://aflah99.github.io,http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return origin && list.includes(origin) ? origin : null
}
