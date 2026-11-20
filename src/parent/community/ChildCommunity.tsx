import { useCallback, useEffect, useState } from 'react'
import { childCourses, setCommunityAllowed, setCourseBlock, VISIBILITY_AR, type ChildCourse } from '../../community/api'
import { errText, useAsyncMsg } from '../../community/util'
import { ar } from '../../quiz/format'

/** المواد المجتمعية — which community courses a child uses, with an easy way to remove or restrict them. */
export function ChildCommunity({ studentId }: { studentId: string }) {
  const [data, setData] = useState<{ community_allowed: boolean; courses: ChildCourse[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { msg, busy, run } = useAsyncMsg()

  const load = useCallback(async () => {
    try {
      setData(await childCourses(studentId))
      setError(null)
    } catch (e) {
      setError(errText(e))
    }
  }, [studentId])
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(t)
  }, [load])

  const act = (fn: () => Promise<unknown>, ok: string) => run(async () => { await fn(); await load() }, ok)

  return (
    <section className="area__card" aria-labelledby="child-comm" data-testid="child-community">
      <h2 className="area__h2" id="child-comm">المواد المجتمعية</h2>
      <p className="area__muted">مواد أنشأها أولياء أمور ويشترك فيها طفلك بنفسه. لم تُراجَع أكاديميًا من المنصة. يمكنك إزالة أي مادة أو إيقاف المواد المجتمعية كلها لهذا الطفل.</p>
      {error && <p className="area__error">{error}</p>}
      {msg && <p className={msg.ok ? 'area__ok' : 'area__error'} role="status">{msg.text}</p>}
      {data && (
        <>
          <label className="area__check">
            <input type="checkbox" checked={data.community_allowed} disabled={busy}
              onChange={(e) => void act(() => setCommunityAllowed(studentId, e.target.checked), e.target.checked ? 'سُمح بالمواد المجتمعية.' : 'أُوقفت المواد المجتمعية لهذا الطفل.')} />
            السماح بالمواد المجتمعية لهذا الطفل
          </label>
          {data.courses.length === 0 ? (
            <p className="area__muted">لم يشترك في أي مادة مجتمعية بعد.</p>
          ) : (
            <ul className="cc-children">
              {data.courses.map((c) => (
                <li key={c.id} className="area__row">
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <b>{c.name_ar}</b>
                    <div className="area__muted">
                      {c.creator_name} · {VISIBILITY_AR[c.visibility]} · أجاب عن {ar(c.answered)} سؤالًا · {ar(c.missions_done)} مهمة مكتملة
                      {c.last_played ? ` · آخر لعب ${new Date(c.last_played).toLocaleDateString('ar-OM')}` : ''}
                    </div>
                  </div>
                  {c.blocked ? <span className="area__chip area__chip--bad">موقوفة من ولي الأمر</span> : c.status === 'removed' ? <span className="area__chip">أزالها الطفل</span> : !c.available ? <span className="area__chip area__chip--warn">غير متاحة حاليًا</span> : <span className="area__chip area__chip--ok">فعّالة</span>}
                  <button type="button" className={`area__btn ${c.blocked ? 'area__btn--ghost' : 'area__btn--danger'}`} disabled={busy}
                    onClick={() => void act(() => setCourseBlock(studentId, c.id, !c.blocked), c.blocked ? 'أُعيد السماح بالمادة.' : 'أُزيلت المادة من مكتبة الطفل ولن يستطيع الاشتراك فيها.')}>
                    {c.blocked ? 'إلغاء الإيقاف' : 'إزالة وإيقاف'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
