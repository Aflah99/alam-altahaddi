// Parent-only management of child (student) accounts. Needs the service role, so it
// runs here and never in the browser.
//   create          { username, nickname, password, character_id? }
//   reset_password  { student_id, password }
//   delete          { student_id, confirm_username }
// Children get a username login with a non-routable internal email; no personal email is collected.
import { BASE_CHARACTERS, checkChildInput, MAX_CHILDREN_PER_PARENT, normalizeNickname, PASSWORD_MIN, studentEmail } from '../_shared/accounts.ts'
import { audit, caller, corsHeaders, json as jsonEnv, type Ctx } from '../_shared/respond.ts'

export async function handleParentChildren(req: Request, { admin, env }: Ctx): Promise<Response> {
  const json = (r: Request, body: unknown, status = 200) => jsonEnv(r, env, body, status)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req, env) })
  if (req.method !== 'POST') return json(req, { error: 'method not allowed' }, 405)
  const me = await caller(req, admin)
  if (!me) return json(req, { error: 'سجّل الدخول أولًا.' }, 401)
  if (me.role !== 'parent') return json(req, { error: 'هذه العملية لأولياء الأمور فقط.' }, 403)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  // Rate limit: at most 20 account operations per parent per hour.
  const since = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await admin.from('audit_log').select('id', { count: 'exact', head: true })
    .eq('actor_id', me.user.id).like('action', 'child_%').gte('created_at', since)
  if ((count ?? 0) >= 20) return json(req, { error: 'محاولات كثيرة. حاول بعد ساعة.' }, 429)

  const ownsChild = async (studentId: unknown) => {
    const { data } = await admin.from('parent_children').select('student_id').eq('parent_id', me.user.id).eq('student_id', String(studentId)).maybeSingle()
    return !!data
  }

  if (body.action === 'create') {
    const check = checkChildInput(body)
    if (!check.ok) return json(req, { error: check.error }, 400)
    const { count: children } = await admin.from('parent_children').select('student_id', { count: 'exact', head: true }).eq('parent_id', me.user.id)
    if ((children ?? 0) >= MAX_CHILDREN_PER_PARENT) return json(req, { error: `الحد الأقصى ${MAX_CHILDREN_PER_PARENT} أبناء لكل حساب.` }, 400)
    const username = String(body.username).trim().toLowerCase()
    const { data: taken } = await admin.from('student_profiles').select('id').eq('username', username).maybeSingle()
    if (taken) return json(req, { error: 'اسم الدخول مستخدم؛ اختر اسمًا آخر.' }, 409)
    const { data, error } = await admin.auth.admin.createUser({
      email: studentEmail(username, env('STUDENT_EMAIL_DOMAIN')),
      password: String(body.password),
      email_confirm: true,
      // app_metadata is server-controlled: the database trigger reads the role from here.
      app_metadata: {
        role: 'student',
        username,
        nickname: normalizeNickname(String(body.nickname)),
        character_id: BASE_CHARACTERS.includes(String(body.character_id)) ? String(body.character_id) : 'green-slime',
        parent_id: me.user.id,
      },
    })
    if (error || !data.user) return json(req, { error: 'تعذّر إنشاء الحساب.', detail: error?.message }, 400)
    await audit(admin, me.user.id, 'child_create', 'student', data.user.id, { username })
    return json(req, { student_id: data.user.id, username })
  }

  if (body.action === 'reset_password') {
    if (!(await ownsChild(body.student_id))) return json(req, { error: 'لا تملك صلاحية على هذا الحساب.' }, 403)
    const password = String(body.password ?? '')
    if (password.length < PASSWORD_MIN || password.length > 72) return json(req, { error: `كلمة المرور من ${PASSWORD_MIN} أحرف على الأقل.` }, 400)
    const { error } = await admin.auth.admin.updateUserById(String(body.student_id), { password })
    if (error) return json(req, { error: 'تعذّر تغيير كلمة المرور.' }, 400)
    await audit(admin, me.user.id, 'child_reset_password', 'student', String(body.student_id))
    return json(req, { ok: true })
  }

  if (body.action === 'delete') {
    if (!(await ownsChild(body.student_id))) return json(req, { error: 'لا تملك صلاحية على هذا الحساب.' }, 403)
    const { data: sp } = await admin.from('student_profiles').select('username').eq('id', String(body.student_id)).maybeSingle()
    if (!sp || sp.username !== String(body.confirm_username ?? '').trim().toLowerCase())
      return json(req, { error: 'اكتب اسم الدخول للتأكيد.' }, 400)
    const { error } = await admin.auth.admin.deleteUser(String(body.student_id))
    if (error) return json(req, { error: 'تعذّر حذف الحساب.' }, 400)
    await audit(admin, me.user.id, 'child_delete', 'student', String(body.student_id), { username: sp.username })
    return json(req, { ok: true })
  }

  return json(req, { error: 'عملية غير معروفة.' }, 400)
}
