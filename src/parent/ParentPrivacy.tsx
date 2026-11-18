import { useEffect, useState } from 'react'
import { invokeFunction } from '../cloud/api'
import { arabicError, supabase } from '../cloud/client'
import type { ChildRow } from './ParentApp'

interface Activity {
  at: string
  action: string
  entity: string
}
const ACTION_AR: Record<string, string> = {
  child_create: 'إنشاء حساب ابن',
  child_reset_password: 'تغيير كلمة مرور ابن',
  child_delete: 'حذف حساب ابن',
  group_create: 'إنشاء مجموعة',
  group_close: 'إغلاق مجموعة',
  group_membership_approved: 'موافقة على انضمام إلى مجموعة',
  group_membership_rejected: 'رفض طلب انضمام',
  group_membership_removed: 'إخراج من مجموعة',
  mission_completed: 'أكمل مهمة',
  mission_started: 'بدأ مهمة',
}

/** الخصوصية والحساب — leaderboard visibility, group requests, activity, deletion. */
export function ParentPrivacy({ kids, reload }: { kids: ChildRow[]; reload: () => Promise<void> }) {
  const [allowGroups, setAllowGroups] = useState<boolean | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmFor, setConfirmFor] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')

  useEffect(() => {
    const c = supabase()
    if (!c) return
    void c
      .from('parent_settings')
      .select('allow_group_requests')
      .maybeSingle()
      .then(({ data }) => setAllowGroups(data?.allow_group_requests ?? true))
    void c.rpc('parent_activity').then(({ data }) => setActivity((data as Activity[]) ?? []))
  }, [])

  const run = async (fn: () => PromiseLike<{ error: unknown } | unknown>, ok: string) => {
    setMsg(null)
    try {
      const r = (await fn()) as { error?: unknown }
      if (r && r.error) throw r.error
      setMsg({ ok: true, text: ok })
      await reload()
    } catch (e) {
      setMsg({ ok: false, text: /[؀-ۿ]/.test(String((e as Error).message)) ? (e as Error).message : arabicError(e) })
    }
  }

  return (
    <>
      <h1 className="area__h1">الخصوصية والحساب</h1>
      {msg && <p className={msg.ok ? 'area__ok' : 'area__error'}>{msg.text}</p>}
      <div className="area__card area__form">
        <h2 className="area__h2" style={{ marginTop: 0 }}>الظهور في لوحات الصدارة الخاصة</h2>
        {kids.map((k) => (
          <label key={k.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={k.show_in_leaderboards}
              onChange={(e) =>
                void run(() => supabase()!.from('student_profiles').update({ show_in_leaderboards: e.target.checked }).eq('id', k.id), 'حُفظ الإعداد.')
              }
            />
            إظهار «{k.nickname}» في لوحات الصدارة للمجموعات التي وافقت عليها
          </label>
        ))}
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={allowGroups ?? true}
            onChange={(e) => {
              const v = e.target.checked
              setAllowGroups(v)
              void run(() => supabase()!.from('parent_settings').update({ allow_group_requests: v }).neq('parent_id', '00000000-0000-0000-0000-000000000000'), 'حُفظ الإعداد.')
            }}
          />
          السماح لأبنائي بطلب الانضمام إلى مجموعات (تبقى موافقتي مطلوبة لكل طلب)
        </label>
      </div>

      <div className="area__card">
        <h2 className="area__h2" style={{ marginTop: 0 }}>نشاط الحساب</h2>
        {activity.length === 0 ? (
          <p className="area__muted">لا يوجد نشاط مسجّل بعد.</p>
        ) : (
          <ul>
            {activity.slice(0, 30).map((a, i) => (
              <li key={i}>
                {new Date(a.at).toLocaleString('ar')} — {ACTION_AR[a.action] ?? a.action}
                {a.entity && !['student', 'group', 'profile'].includes(a.entity) ? ` (${a.entity})` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="area__card">
        <h2 className="area__h2" style={{ marginTop: 0 }}>حذف البيانات</h2>
        <p className="area__muted">حذف حساب الابن نهائي: تُحذف نتائجه وعملاته وأغراضه وعضوياته في المجموعات. لا يمكن التراجع عنه.</p>
        {kids.map((k) => (
          <div key={k.id} className="area__row" style={{ marginBottom: 8 }}>
            <span>{k.nickname}</span>
            {confirmFor === k.id ? (
              <>
                <input className="area__input" dir="ltr" placeholder={`اكتب ${k.username} للتأكيد`} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
                <button
                  type="button"
                  className="area__btn area__btn--danger"
                  disabled={confirmText.trim() !== k.username}
                  onClick={() => void run(() => invokeFunction('parent-children', { action: 'delete', student_id: k.id, confirm_username: confirmText }), 'حُذف الحساب نهائيًّا.')}
                >
                  حذف نهائي
                </button>
              </>
            ) : (
              <button type="button" className="area__btn area__btn--ghost" onClick={() => (setConfirmFor(k.id), setConfirmText(''))}>
                حذف حساب الابن
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="area__btn area__btn--ghost"
          onClick={async () => {
            const { data } = await supabase()!.auth.getUser()
            void run(() => supabase()!.from('deletion_requests').insert({ requested_by: data.user!.id, scope: 'family', reason: 'طلب من لوحة ولي الأمر' }), 'أُرسل طلب حذف حساب العائلة إلى إدارة المنصة.')
          }}
        >
          طلب حذف حساب العائلة بالكامل
        </button>
      </div>
      <p className="area__muted">
        <a href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noreferrer">
          إشعار الخصوصية
        </a>
      </p>
    </>
  )
}
