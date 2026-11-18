import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cloudEnabled, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config'

let client: SupabaseClient | null = null

/** The shared Supabase client, or null when the cloud is not configured. */
export function supabase(): SupabaseClient | null {
  if (!cloudEnabled) return null
  client ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  })
  return client
}

/** Arabic, user-facing message for a backend error (never shows raw server details). */
export function arabicError(e: unknown): string {
  const msg = String((e as { message?: string })?.message ?? e)
  if (/rate_limited|too many|rate limit/i.test(msg)) return 'محاولات كثيرة في وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.'
  if (/weak_password|password should contain|password is known to be weak/i.test(msg))
    return 'كلمة المرور ضعيفة: استخدم ٨ أحرف على الأقل فيها حرف إنجليزي صغير وكبير ورقم ورمز.'
  if (/invalid login credentials/i.test(msg)) return 'اسم الدخول أو كلمة المرور غير صحيحة.'
  if (/email not confirmed/i.test(msg)) return 'لم يُؤكَّد البريد الإلكتروني بعد. افتح رسالة التأكيد في بريدك.'
  if (/insufficient coins/i.test(msg)) return 'رصيدك من العملات لا يكفي.'
  if (/already owned/i.test(msg)) return 'تملك هذا الغرض بالفعل.'
  if (/character locked/i.test(msg)) return 'هذه الشخصية مقفلة؛ يمكن فتحها من المتجر.'
  if (/jwt|session|not authenticated|401/i.test(msg)) return 'انتهت الجلسة. سجّل الدخول مرة أخرى.'
  if (/failed to fetch|network|load failed/i.test(msg)) return 'تعذّر الاتصال بالخادم. تحقّق من الإنترنت ثم حاول مرة أخرى.'
  if (/permission denied|row-level security|42501/i.test(msg)) return 'لا تملك صلاحية لهذا الإجراء.'
  return 'حدث خطأ غير متوقّع. حاول مرة أخرى.'
}

export function isSessionError(e: unknown): boolean {
  return /jwt|session|not authenticated|401|refresh token/i.test(String((e as { message?: string })?.message ?? e))
}
