import { useMemo, useState } from 'react'
import { importQuestions, saveLesson, saveUnit, type CourseDetail } from '../../community/api'
import { compareKey, EXAMPLE_TEXT, hasErrors, LETTER_AR, LETTERS, parseQuestions, toItem, validateQuestion, type ParsedQuestion } from '../../community/parser'
import { copyPrompt, PROMPT_NOTICE, PROMPT_TEXT } from '../../community/prompt'
import { useAsyncMsg, useDraft, useUnsavedWarning, uuid } from '../../community/util'

interface Props {
  detail: CourseDetail
  lessonId: string | null
  batchMax: number
  onDone: () => void
  onClose: () => void
}

interface Row extends ParsedQuestion {
  id: string
  include: boolean
}

/** لصق أسئلة: parse pasted text with plain code, review and fix every question, then import in one atomic step. */
export function BulkImport({ detail, lessonId, batchMax, onDone, onClose }: Props) {
  const courseId = detail.course.id
  const [text, setText, clearText, restored] = useDraft(`cc-draft:paste:${courseId}`, '')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [ignored, setIgnored] = useState(0)
  const [target, setTarget] = useState<string>(lessonId ?? detail.units[0]?.lessons[0]?.id ?? '')
  const [byHeaders, setByHeaders] = useState(false)
  const [onlyProblems, setOnlyProblems] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [copied, setCopied] = useState<boolean | null>(null)
  const [help, setHelp] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const { msg, setMsg, busy, run } = useAsyncMsg()
  const [requestId] = useState(uuid)
  useUnsavedWarning(!!rows && !result)

  const existing = useMemo(() => {
    const set = new Set<string>()
    for (const u of detail.units) for (const l of u.lessons) for (const q of l.questions) set.add(compareKey(q.text))
    return set
  }, [detail])
  const lessons = detail.units.flatMap((u) => u.lessons.map((l) => ({ id: l.id, label: `${u.title} ← ${l.title}` })))

  /** Re-checks every row (including duplicates against each other and against the course). */
  const recheck = (list: Row[]): Row[] => {
    const seen: { key: string }[] = []
    return list.map((r) => {
      const v = validateQuestion(r, seen, existing)
      const key = compareKey(r.text)
      if (key) seen.push({ key })
      return { ...r, issues: v.issues }
    })
  }

  const analyse = () => {
    const parsed = parseQuestions(text)
    setIgnored(parsed.ignored.length)
    const list: Row[] = parsed.questions.map((q) => ({ ...q, id: uuid(), include: true }))
    const checked = recheck(list).map((r) => ({ ...r, include: !hasErrors(r) && !r.uncertain && !r.issues.some((i) => i.code === 'duplicate_existing' || i.code === 'duplicate_in_batch') }))
    setRows(checked)
    setByHeaders(checked.some((r) => r.lesson))
    setResult(null)
    setMsg(parsed.questions.length === 0 ? { ok: false, text: 'لم نجد أي سؤال في النص. تأكد أن كل سؤال يبدأ بـ «السؤال 1:» واطّلع على مثال الصيغة.' } : null)
  }

  const update = (id: string, patch: Partial<Row>) =>
    setRows((rs) => {
      if (!rs) return rs
      const was = rs.find((r) => r.id === id)
      const next = recheck(rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
      // A question the parent has just repaired is selected for import (duplicates and unconfirmed answers stay off).
      return next.map((r) =>
        r.id === id && was && hasErrors(was) && !hasErrors(r) && !r.uncertain && !r.issues.some((i) => i.code === 'duplicate_existing' || i.code === 'duplicate_in_batch') && !('include' in patch)
          ? { ...r, include: true }
          : r,
      )
    })
  const move = (i: number, d: number) =>
    setRows((rs) => {
      if (!rs || i + d < 0 || i + d >= rs.length) return rs
      const c = [...rs]
      ;[c[i], c[i + d]] = [c[i + d], c[i]]
      return c
    })

  const stats = useMemo(() => {
    const r = rows ?? []
    const errors = r.filter(hasErrors).length
    const dups = r.filter((x) => x.issues.some((i) => i.code === 'duplicate_in_batch' || i.code === 'duplicate_existing')).length
    const uncertain = r.filter((x) => x.uncertain).length
    return { total: r.length, valid: r.length - errors, errors, dups, uncertain, selected: r.filter((x) => x.include && !hasErrors(x)).length }
  }, [rows])

  const doImport = async () => {
    if (!rows) return
    const chosen = rows.filter((r) => r.include && !hasErrors(r))
    if (chosen.length === 0) return setMsg({ ok: false, text: 'لا توجد أسئلة محددة وصالحة للاستيراد.' })
    if (chosen.length > batchMax) return setMsg({ ok: false, text: `الحد الأقصى ${batchMax} سؤالًا في كل عملية استيراد. ألغِ تحديد بعض الأسئلة واستوردها على دفعات.` })
    if (!byHeaders && !target) return setMsg({ ok: false, text: 'اختر الدرس الذي ستُضاف إليه الأسئلة، أو أنشئ درسًا أولًا.' })
    const r = await run(async () => {
      if (!byHeaders) return [await importQuestions(target, chosen.map(toItem), requestId)]
      // One atomic call per lesson heading; lessons and units are matched by title or created. Request ids make retries safe.
      const out = []
      const groups = new Map<string, Row[]>()
      for (const q of chosen) {
        const k = `${q.unit}\u0001${q.lesson}`
        groups.set(k, [...(groups.get(k) ?? []), q])
      }
      const units = new Map(detail.units.map((u) => [compareKey(u.title), u.id]))
      const lessonIds = new Map<string, string>(detail.units.flatMap((u) => u.lessons.map((l): [string, string] => [`${u.id}\u0001${compareKey(l.title)}`, l.id])))
      let n = 0
      for (const [k, qs] of groups) {
        const [unitTitle, lessonTitle] = k.split('\u0001')
        const uKey = compareKey(unitTitle || 'الوحدة الأولى')
        let unitId = units.get(uKey)
        if (!unitId) {
          unitId = await saveUnit(courseId, null, unitTitle || 'الوحدة الأولى')
          units.set(uKey, unitId)
        }
        const lKey = `${unitId}\u0001${compareKey(lessonTitle || 'الدرس الأول')}`
        let lessonKey = lessonIds.get(lKey)
        if (!lessonKey) {
          lessonKey = await saveLesson(unitId, null, lessonTitle || 'الدرس الأول')
          lessonIds.set(lKey, lessonKey)
        }
        out.push(await importQuestions(lessonKey, qs.map(toItem), `${requestId.slice(0, 24)}${String(n++).padStart(12, '0')}`))
      }
      return out
    })
    if (r) {
      const imported = r.reduce((s, x) => s + x.imported, 0)
      const skipped = r.reduce((s, x) => s + x.skipped_duplicates, 0)
      setResult(`تم استيراد ${imported} سؤالًا${skipped ? ` وتخطّي ${skipped} مكررًا` : ''}.`)
      clearText()
      onDone()
    }
  }

  const visible = (rows ?? []).filter((r) => !onlyProblems || r.issues.length > 0)

  return (
    <section className="cc-bulk area__card" data-testid="bulk-import" aria-label="لصق أسئلة">
      <div className="cc-bulk__head">
        <h3 className="area__h2" style={{ margin: 0 }}>لصق أسئلة دفعة واحدة</h3>
        <button type="button" className="area__btn area__btn--ghost" onClick={() => (!rows || result || window.confirm('تجاهل الأسئلة غير المستوردة؟')) && onClose()}>
          إغلاق
        </button>
      </div>

      {!rows && (
        <>
          <p className="area__muted">
            جهّز الأسئلة بأي أداة ذكاء اصطناعي مجانية تختارها، ثم الصق الناتج هنا. يحلّل الموقع النص بشيفرة عادية دون أي ذكاء اصطناعي ودون إرسال نصك إلى أي جهة.
          </p>
          <div className="area__row">
            <button
              type="button"
              className="area__btn"
              onClick={() => void copyPrompt().then(setCopied)}
              data-testid="copy-prompt"
            >
              انسخ تعليمات إعداد الأسئلة
            </button>
            <button type="button" className="area__btn area__btn--ghost" onClick={() => setHelp((h) => !h)} aria-expanded={help}>
              {help ? 'إخفاء الصيغة' : 'ما الصيغة المقبولة؟'}
            </button>
            <button type="button" className="area__btn area__btn--ghost" onClick={() => setText(EXAMPLE_TEXT)}>
              ضع مثالًا
            </button>
          </div>
          {copied === true && <p className="area__ok" role="status">نُسخت التعليمات. الصقها في الأداة التي تفضّلها مع النص التعليمي، ثم الصق الأسئلة الناتجة هنا.</p>}
          {copied === false && <p className="area__error" role="status">تعذّر النسخ تلقائيًا في هذا المتصفح. حدّد النص يدويًا من مربع «تعليمات الأداة» أدناه ثم انسخه.</p>}
          {copied === false && <PromptBox />}
          <p className="area__info" role="note">{PROMPT_NOTICE}</p>
          {help && (
            <pre className="cc-format" dir="rtl">{EXAMPLE_TEXT}</pre>
          )}
          {restored && <p className="area__muted">استُعيد النص الذي كنت تكتبه سابقًا.</p>}
          <label className="area__form">
            <span className="area__label">الصق الأسئلة هنا</span>
            <textarea
              className="cc-paste"
              value={text}
              rows={12}
              dir="rtl"
              spellCheck={false}
              onChange={(e) => setText(e.target.value)}
              placeholder={'السؤال 1: ...\nأ: ...\nب: ...\nج: ...\nد: ...\nالإجابة الصحيحة: ب'}
              data-testid="paste-box"
            />
          </label>
          <div className="area__row">
            <button type="button" className="area__btn" disabled={!text.trim()} onClick={analyse} data-testid="analyse">
              تحليل الأسئلة
            </button>
            {text && (
              <button type="button" className="area__btn area__btn--ghost" onClick={() => window.confirm('مسح النص؟') && clearText()}>
                مسح
              </button>
            )}
          </div>
        </>
      )}

      {rows && (
        <>
          <div className="cc-summary" role="status" data-testid="parse-summary">
            <b>تم التعرّف على {stats.total} سؤالًا</b>
            <span className="area__chip area__chip--ok">{stats.valid} صالح</span>
            {stats.errors > 0 && <span className="area__chip area__chip--bad">{stats.errors} فيه أخطاء</span>}
            {stats.dups > 0 && <span className="area__chip area__chip--warn">{stats.dups} مكرر</span>}
            {stats.uncertain > 0 && <span className="area__chip area__chip--warn">{stats.uncertain} للمراجعة</span>}
            {ignored > 0 && <span className="area__muted">({ignored} سطرًا خارج الأسئلة تم تجاهله)</span>}
          </div>
          {stats.errors > 0 && <p className="area__info">الأسئلة التي فيها أخطاء لن تُستورد حتى تصحّحها بزر «تعديل». لا نخمّن الإجابات الناقصة أبدًا.</p>}

          {rows.some((r) => r.lesson) ? (
            <label className="area__check">
              <input type="checkbox" checked={byHeaders} onChange={(e) => setByHeaders(e.target.checked)} />
              إنشاء الدروس والوحدات حسب العناوين الموجودة في النص (وإضافة الأسئلة إلى الدروس المطابقة)
            </label>
          ) : null}
          {!byHeaders && (
            <label className="area__form">
              <span className="area__label">أضف الأسئلة إلى الدرس</span>
              {lessons.length === 0 ? (
                <span className="area__error">أنشئ وحدة ودرسًا أولًا من تبويب «المحتوى».</span>
              ) : (
                <select value={target} onChange={(e) => setTarget(e.target.value)} data-testid="target-lesson">
                  {lessons.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              )}
            </label>
          )}
          <div className="area__row">
            <label className="area__check">
              <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> عرض الأسئلة التي فيها ملاحظات فقط
            </label>
            <button type="button" className="area__btn area__btn--ghost" onClick={() => setRows((rs) => rs && rs.map((r) => ({ ...r, include: !hasErrors(r) })))}>
              تحديد كل الصالح
            </button>
            <button type="button" className="area__btn area__btn--ghost" onClick={() => setRows((rs) => rs && rs.map((r) => ({ ...r, include: false })))}>
              إلغاء التحديد
            </button>
          </div>

          <ol className="cc-rows">
            {visible.map((r) => {
              const i = rows.indexOf(r)
              const bad = hasErrors(r)
              return (
                <li key={r.id} className={`cc-row ${bad ? 'cc-row--bad' : r.issues.length ? 'cc-row--warn' : ''}`} data-testid="preview-row">
                  <div className="cc-row__top">
                    <label className="area__check">
                      <input type="checkbox" checked={r.include && !bad} disabled={bad} onChange={(e) => update(r.id, { include: e.target.checked })} aria-label={`استيراد السؤال ${i + 1}`} />
                      <b>{i + 1}.</b>
                    </label>
                    <span className="cc-row__type">{r.qtype === 'written' ? 'كتابي' : r.qtype === 'mcq' ? 'اختيار من متعدد' : 'غير محدد'}</span>
                    {r.lesson && <span className="area__chip">{r.lesson}</span>}
                    <span className="cc-row__spacer" />
                    <button type="button" className="area__btn area__btn--ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="تحريك للأعلى">↑</button>
                    <button type="button" className="area__btn area__btn--ghost" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="تحريك للأسفل">↓</button>
                    <button type="button" className="area__btn area__btn--ghost" onClick={() => setEditing(editing === r.id ? null : r.id)} aria-expanded={editing === r.id}>
                      {editing === r.id ? 'إغلاق' : 'تعديل'}
                    </button>
                    <button type="button" className="area__btn area__btn--danger" onClick={() => setRows((rs) => rs && recheck(rs.filter((x) => x.id !== r.id)))}>حذف</button>
                  </div>
                  <p className="cc-row__text">{r.text || '— نص السؤال مفقود —'}</p>
                  {r.qtype === 'mcq' && (
                    <ul className="cc-row__opts">
                      {LETTERS.map((l, k) => (
                        <li key={l} className={r.correct === l ? 'is-correct' : ''}>
                          {LETTER_AR[l]}: {r.options[k] || '—'} {r.correct === l && <b>✓</b>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.qtype === 'written' && <p className="cc-row__opts">الإجابات: {r.accepted.join(' | ') || '—'}</p>}
                  {r.issues.map((s, k) => (
                    <p key={k} className={s.level === 'error' ? 'area__error' : 'cc-warn'} role="note">
                      {s.level === 'error' ? '⛔ ' : '⚠ '}
                      {s.message}
                    </p>
                  ))}
                  {editing === r.id && <RowEditor row={r} onChange={(p) => update(r.id, p)} />}
                </li>
              )
            })}
          </ol>

          {msg && <p className={msg.ok ? 'area__ok' : 'area__error'} role="status">{msg.text}</p>}
          {result && <p className="area__ok" role="status" data-testid="import-result">{result}</p>}
          <div className="area__row cc-sticky">
            {!result ? (
              <>
                <button type="button" className="area__btn" disabled={busy || stats.selected === 0} onClick={() => void doImport()} data-testid="do-import">
                  {busy ? 'جارٍ الاستيراد…' : `استيراد ${stats.selected} سؤالًا`}
                </button>
                <button type="button" className="area__btn area__btn--ghost" onClick={() => setRows(null)}>
                  رجوع إلى النص
                </button>
              </>
            ) : (
              <button type="button" className="area__btn" onClick={onClose}>
                تم
              </button>
            )}
          </div>
          <p className="area__muted">الاستيراد عملية واحدة متكاملة: إن فشل أي سؤال لا يُضاف شيء، ولا يتكرر الاستيراد إذا ضغطت الزر مرتين. أقصى عدد {batchMax} سؤالًا في العملية.</p>
        </>
      )}
    </section>
  )
}

function PromptBox() {
  return <textarea readOnly className="cc-paste" rows={6} dir="rtl" value={PROMPT_TEXT} aria-label="تعليمات الأداة" onFocus={(e) => e.currentTarget.select()} />
}

function RowEditor({ row, onChange }: { row: Row; onChange: (p: Partial<Row>) => void }) {
  return (
    <div className="area__form cc-roweditor">
      <label>
        النوع
        <select value={row.qtype ?? ''} onChange={(e) => onChange({ qtype: (e.target.value || null) as Row['qtype'] })}>
          <option value="">— اختر —</option>
          <option value="mcq">اختيار من متعدد</option>
          <option value="written">كتابي</option>
        </select>
      </label>
      <label>
        نص السؤال
        <textarea rows={2} value={row.text} onChange={(e) => onChange({ text: e.target.value })} />
      </label>
      {row.qtype === 'mcq' && (
        <fieldset className="cc-options">
          <legend>الخيارات والإجابة الصحيحة</legend>
          {LETTERS.map((l, k) => (
            <div key={l} className="cc-option">
              <input type="radio" name={`c-${row.id}`} aria-label={`الإجابة الصحيحة ${LETTER_AR[l]}`} checked={row.correct === l} onChange={() => onChange({ correct: l })} />
              <span className="cc-option__letter">{LETTER_AR[l]}</span>
              <input value={row.options[k]} aria-label={`الخيار ${LETTER_AR[l]}`} onChange={(e) => onChange({ options: row.options.map((o, j) => (j === k ? e.target.value : o)) })} />
            </div>
          ))}
        </fieldset>
      )}
      {row.qtype === 'written' && (
        <label>
          الإجابات (النموذجية أولًا، وافصل بين المقبولة بـ |)
          <input value={row.accepted.join(' | ')} onChange={(e) => onChange({ accepted: e.target.value.split('|').map((a) => a.trim()).filter(Boolean) })} />
        </label>
      )}
      <label>
        تلميح
        <input value={row.hint} onChange={(e) => onChange({ hint: e.target.value })} />
      </label>
      <label>
        شرح
        <input value={row.explanation} onChange={(e) => onChange({ explanation: e.target.value })} />
      </label>
      {row.uncertain && (
        <label className="area__check">
          <input type="checkbox" checked={row.include} onChange={(e) => onChange({ include: e.target.checked, uncertain: !e.target.checked })} /> راجعتُ الإجابة وأنا متأكد منها
        </label>
      )}
    </div>
  )
}
