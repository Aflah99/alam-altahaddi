import { useState, type FormEvent } from 'react'
import { saveQuestion, type EditorQuestion } from '../../community/api'
import { useAsyncMsg, useUnsavedWarning } from '../../community/util'

const LETTERS = ['a', 'b', 'c', 'd'] as const
const LETTER_AR = ['أ', 'ب', 'ج', 'د']

interface Props {
  lessonId: string
  question?: EditorQuestion
  onSaved: () => void
  onCancel: () => void
}

/** Manual entry: multiple choice (four options, exactly one correct) or written answer (model answer + alternatives). */
export function QuestionForm({ lessonId, question, onSaved, onCancel }: Props) {
  const [qtype, setQtype] = useState<'mcq' | 'written'>(question?.qtype ?? 'mcq')
  const [text, setText] = useState(question?.text ?? '')
  const [options, setOptions] = useState<string[]>(question?.options ?? ['', '', '', ''])
  const [correct, setCorrect] = useState<string>(question?.correct_option ?? '')
  const [model, setModel] = useState(question?.accepted_answers?.[0] ?? '')
  const [alts, setAlts] = useState<string[]>(question?.accepted_answers?.slice(1) ?? [])
  const [hint, setHint] = useState(question?.hint ?? '')
  const [explanation, setExplanation] = useState(question?.explanation ?? '')
  const [dirty, setDirty] = useState(false)
  const { msg, setMsg, busy, run } = useAsyncMsg()
  useUnsavedWarning(dirty)
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    setDirty(true)
    set(v)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const local = qtype === 'mcq' && (options.some((o) => !o.trim()) || !correct) ? 'أكمل الخيارات الأربعة واختر الإجابة الصحيحة.' : qtype === 'written' && !model.trim() ? 'اكتب الإجابة النموذجية.' : null
    if (local) return setMsg({ ok: false, text: local })
    const r = await run(
      () =>
        saveQuestion({
          id: question?.id,
          lesson_id: lessonId,
          qtype,
          text,
          hint,
          explanation,
          ...(qtype === 'mcq' ? { options, correct_option: correct } : { accepted_answers: [model, ...alts.filter((a) => a.trim())] }),
        }),
      (res) => (res.versioned ? 'تم الحفظ كنسخة جديدة من السؤال لأن طلابًا أجابوا عن النسخة السابقة؛ نتائجهم السابقة لم تتغيّر.' : 'تم حفظ السؤال.'),
    )
    if (r) {
      setDirty(false)
      onSaved()
    }
  }

  return (
    <form className="cc-qform area__form" onSubmit={(e) => void submit(e)} data-testid="question-form">
      <div className="area__tabs" role="group" aria-label="نوع السؤال">
        <button type="button" className="area__tab" aria-pressed={qtype === 'mcq'} onClick={() => touch(setQtype)('mcq')} disabled={!!question}>
          اختيار من متعدد
        </button>
        <button type="button" className="area__tab" aria-pressed={qtype === 'written'} onClick={() => touch(setQtype)('written')} disabled={!!question}>
          إجابة كتابية
        </button>
      </div>
      <label>
        نص السؤال
        <textarea value={text} maxLength={600} required rows={3} onChange={(e) => touch(setText)(e.target.value)} />
      </label>
      {qtype === 'mcq' ? (
        <fieldset className="cc-options">
          <legend>الخيارات (اختر الدائرة بجانب الإجابة الصحيحة)</legend>
          {LETTERS.map((l, i) => (
            <div key={l} className="cc-option">
              <input type="radio" name="correct" aria-label={`الإجابة الصحيحة ${LETTER_AR[i]}`} checked={correct === l} onChange={() => touch(setCorrect)(l)} />
              <span className="cc-option__letter">{LETTER_AR[i]}</span>
              <input
                value={options[i]}
                maxLength={300}
                aria-label={`الخيار ${LETTER_AR[i]}`}
                onChange={(e) => touch(setOptions)(options.map((o, j) => (j === i ? e.target.value : o)))}
              />
            </div>
          ))}
        </fieldset>
      ) : (
        <>
          <label>
            الإجابة النموذجية
            <input value={model} maxLength={100} onChange={(e) => touch(setModel)(e.target.value)} />
          </label>
          <fieldset className="cc-options">
            <legend>إجابات أخرى مقبولة (اختياري، أضف فقط ما هو صحيح بوضوح)</legend>
            {alts.map((a, i) => (
              <div key={i} className="cc-option">
                <input value={a} maxLength={100} aria-label={`إجابة مقبولة ${i + 1}`} onChange={(e) => touch(setAlts)(alts.map((x, j) => (j === i ? e.target.value : x)))} />
                <button type="button" className="area__btn area__btn--ghost" onClick={() => touch(setAlts)(alts.filter((_, j) => j !== i))}>
                  حذف
                </button>
              </div>
            ))}
            {alts.length < 7 && (
              <button type="button" className="area__btn area__btn--ghost" onClick={() => touch(setAlts)([...alts, ''])}>
                + إضافة إجابة مقبولة
              </button>
            )}
            <p className="area__muted">يتم التصحيح على الخادم مع تجاهل التشكيل والهمزات وبعض الأخطاء الإملائية الطفيفة؛ لا يمكنك تغيير قواعد التصحيح.</p>
          </fieldset>
        </>
      )}
      <label>
        تلميح (اختياري)
        <input value={hint} maxLength={300} onChange={(e) => touch(setHint)(e.target.value)} />
      </label>
      <label>
        شرح الإجابة (اختياري)
        <textarea value={explanation} maxLength={1200} rows={2} onChange={(e) => touch(setExplanation)(e.target.value)} />
      </label>
      {msg && <p className={msg.ok ? 'area__ok' : 'area__error'} role="status">{msg.text}</p>}
      <div className="area__row">
        <button type="submit" className="area__btn" disabled={busy}>
          {busy ? 'جارٍ الحفظ…' : 'حفظ السؤال'}
        </button>
        <button type="button" className="area__btn area__btn--ghost" onClick={() => (!dirty || window.confirm('تجاهل التعديلات غير المحفوظة؟')) && onCancel()}>
          إلغاء
        </button>
      </div>
    </form>
  )
}
