import { useState } from 'react'
import { deleteLesson, deleteQuestion, deleteUnit, reorder, saveLesson, saveUnit, type CourseDetail, type EditorLesson, type EditorQuestion } from '../../community/api'
import { useAsyncMsg } from '../../community/util'
import { BulkImport } from './BulkImport'
import { QuestionForm } from './QuestionForm'

const LETTER_AR = ['أ', 'ب', 'ج', 'د']

function move<T extends { id: string }>(list: T[], i: number, d: number): string[] {
  const ids = list.map((x) => x.id)
  ;[ids[i], ids[i + d]] = [ids[i + d], ids[i]]
  return ids
}

/** المحتوى: Subject → Units → Lessons → Questions. */
export function ContentTab({ detail, batchMax, reload }: { detail: CourseDetail; batchMax: number; reload: () => Promise<void> }) {
  const { msg, busy, run } = useAsyncMsg()
  const [newUnit, setNewUnit] = useState('')
  const [newLesson, setNewLesson] = useState<Record<string, string>>({})
  const [renaming, setRenaming] = useState<{ id: string; kind: 'unit' | 'lesson'; unit?: string; value: string } | null>(null)
  const [open, setOpen] = useState<string | null>(detail.units[0]?.lessons[0]?.id ?? null)
  const [form, setForm] = useState<{ lesson: string; question?: EditorQuestion } | null>(null)
  const [bulk, setBulk] = useState<string | null | undefined>(undefined)
  const act = (fn: () => Promise<unknown>, ok?: string) => run(async () => { await fn(); await reload() }, ok)
  const used = (r: 'deleted' | 'archived') => (r === 'archived' ? 'أُخفيت لأن طلابًا لعبوها؛ نتائجهم محفوظة.' : 'تم الحذف.')

  const totalLessons = detail.units.reduce((n, u) => n + u.lessons.length, 0)

  return (
    <div className="cc-content">
      {msg && <p className={msg.ok ? 'area__ok' : 'area__error'} role="status">{msg.text}</p>}
      <div className="area__row">
        <button type="button" className="area__btn" onClick={() => setBulk(open)} disabled={totalLessons === 0} data-testid="open-bulk">
          لصق أسئلة دفعة واحدة
        </button>
        {totalLessons === 0 && <span className="area__muted">أضف وحدة ودرسًا أولًا (أو الصق أسئلة بعناوين «الوحدة:» و«الدرس:» لإنشائها تلقائيًا).</span>}
      </div>
      {bulk !== undefined && (
        <BulkImport detail={detail} lessonId={bulk} batchMax={batchMax} onDone={() => void reload()} onClose={() => setBulk(undefined)} />
      )}
      {totalLessons === 0 && bulk === undefined && (
        <button type="button" className="area__btn area__btn--ghost" onClick={() => setBulk(null)}>
          لصق أسئلة بعناوين الوحدات والدروس
        </button>
      )}

      {detail.units.map((u, ui) => (
        <section key={u.id} className="area__card cc-unit" aria-label={u.title}>
          <header className="cc-unit__head">
            {renaming?.id === u.id ? (
              <form className="cc-inline" onSubmit={(e) => { e.preventDefault(); void act(() => saveUnit(detail.course.id, u.id, renaming.value)).then(() => setRenaming(null)) }}>
                <input value={renaming.value} maxLength={80} autoFocus aria-label="عنوان الوحدة" onChange={(e) => setRenaming({ ...renaming, value: e.target.value })} />
                <button className="area__btn" type="submit" disabled={busy}>حفظ</button>
                <button className="area__btn area__btn--ghost" type="button" onClick={() => setRenaming(null)}>إلغاء</button>
              </form>
            ) : (
              <h3 className="cc-unit__title">الوحدة {ui + 1}: {u.title}</h3>
            )}
            <div className="cc-actions">
              <button type="button" className="area__btn area__btn--ghost" disabled={ui === 0 || busy} aria-label="تحريك الوحدة للأعلى" onClick={() => void act(() => reorder('unit', detail.course.id, move(detail.units, ui, -1)))}>↑</button>
              <button type="button" className="area__btn area__btn--ghost" disabled={ui === detail.units.length - 1 || busy} aria-label="تحريك الوحدة للأسفل" onClick={() => void act(() => reorder('unit', detail.course.id, move(detail.units, ui, 1)))}>↓</button>
              <button type="button" className="area__btn area__btn--ghost" onClick={() => setRenaming({ id: u.id, kind: 'unit', value: u.title })}>إعادة تسمية</button>
              <button type="button" className="area__btn area__btn--danger" disabled={busy} onClick={() => window.confirm(`حذف «${u.title}» بكل دروسها وأسئلتها؟`) && void run(async () => { const r = await deleteUnit(u.id); await reload(); return r }, used)}>حذف</button>
            </div>
          </header>

          {u.lessons.map((l, li) => (
            <LessonBlock
              key={l.id}
              lesson={l}
              index={li}
              count={u.lessons.length}
              open={open === l.id}
              busy={busy}
              renaming={renaming?.id === l.id ? renaming : null}
              onToggle={() => setOpen(open === l.id ? null : l.id)}
              onRename={(v) => setRenaming(v ? { id: l.id, kind: 'lesson', unit: u.id, value: v } : null)}
              onRenameValue={(v) => renaming && setRenaming({ ...renaming, value: v })}
              onSaveRename={() => renaming && void act(() => saveLesson(u.id, l.id, renaming.value)).then(() => setRenaming(null))}
              onMove={(d) => void act(() => reorder('lesson', u.id, move(u.lessons, li, d)))}
              onDelete={() => window.confirm(`حذف الدرس «${l.title}» وأسئلته؟`) && void run(async () => { const r = await deleteLesson(l.id); await reload(); return r }, used)}
              onAdd={() => setForm({ lesson: l.id })}
              onEdit={(q) => setForm({ lesson: l.id, question: q })}
              onBulk={() => setBulk(l.id)}
              onMoveQ={(qi, d) => void act(() => reorder('question', l.id, move(l.questions, qi, d)))}
              onDeleteQ={(q) => window.confirm('حذف هذا السؤال؟') && void run(async () => { const r = await deleteQuestion(q.id); await reload(); return r }, used)}
              form={form?.lesson === l.id ? form : null}
              onFormClose={() => setForm(null)}
              onSaved={() => { setForm(null); void reload() }}
            />
          ))}

          <form className="cc-inline" onSubmit={(e) => { e.preventDefault(); const t = (newLesson[u.id] ?? '').trim(); if (t) void run(async () => { const id = await saveLesson(u.id, null, t); await reload(); setOpen(id); setNewLesson({ ...newLesson, [u.id]: '' }) }, 'أُضيف الدرس.') }}>
            <input value={newLesson[u.id] ?? ''} maxLength={120} placeholder="عنوان درس جديد" aria-label="عنوان درس جديد" onChange={(e) => setNewLesson({ ...newLesson, [u.id]: e.target.value })} />
            <button type="submit" className="area__btn" disabled={busy || !(newLesson[u.id] ?? '').trim()}>+ إضافة درس</button>
          </form>
        </section>
      ))}

      <form className="area__card cc-inline" onSubmit={(e) => { e.preventDefault(); if (newUnit.trim()) void act(() => saveUnit(detail.course.id, null, newUnit.trim()), 'أُضيفت الوحدة.').then(() => setNewUnit('')) }}>
        <input value={newUnit} maxLength={80} placeholder="عنوان وحدة جديدة" aria-label="عنوان وحدة جديدة" onChange={(e) => setNewUnit(e.target.value)} data-testid="new-unit" />
        <button type="submit" className="area__btn" disabled={busy || !newUnit.trim()}>+ إضافة وحدة</button>
      </form>
    </div>
  )
}

interface LessonProps {
  lesson: EditorLesson
  index: number
  count: number
  open: boolean
  busy: boolean
  renaming: { value: string } | null
  onToggle: () => void
  onRename: (v: string | null) => void
  onRenameValue: (v: string) => void
  onSaveRename: () => void
  onMove: (d: number) => void
  onDelete: () => void
  onAdd: () => void
  onEdit: (q: EditorQuestion) => void
  onBulk: () => void
  onMoveQ: (i: number, d: number) => void
  onDeleteQ: (q: EditorQuestion) => void
  form: { lesson: string; question?: EditorQuestion } | null
  onFormClose: () => void
  onSaved: () => void
}

function LessonBlock(p: LessonProps) {
  const l = p.lesson
  return (
    <div className="cc-lesson">
      <div className="cc-lesson__head">
        {p.renaming ? (
          <form className="cc-inline" onSubmit={(e) => { e.preventDefault(); p.onSaveRename() }}>
            <input value={p.renaming.value} maxLength={120} autoFocus aria-label="عنوان الدرس" onChange={(e) => p.onRenameValue(e.target.value)} />
            <button className="area__btn" type="submit">حفظ</button>
            <button className="area__btn area__btn--ghost" type="button" onClick={() => p.onRename(null)}>إلغاء</button>
          </form>
        ) : (
          <button type="button" className="cc-lesson__toggle" aria-expanded={p.open} onClick={p.onToggle}>
            <span aria-hidden="true">{p.open ? '▾' : '◂'}</span> الدرس {p.index + 1}: {l.title} <span className="area__chip">{l.questions.length} سؤالًا</span>
          </button>
        )}
        <div className="cc-actions">
          <button type="button" className="area__btn area__btn--ghost" disabled={p.index === 0 || p.busy} aria-label="تحريك الدرس للأعلى" onClick={() => p.onMove(-1)}>↑</button>
          <button type="button" className="area__btn area__btn--ghost" disabled={p.index === p.count - 1 || p.busy} aria-label="تحريك الدرس للأسفل" onClick={() => p.onMove(1)}>↓</button>
          <button type="button" className="area__btn area__btn--ghost" onClick={() => p.onRename(l.title)}>إعادة تسمية</button>
          <button type="button" className="area__btn area__btn--danger" disabled={p.busy} onClick={p.onDelete}>حذف</button>
        </div>
      </div>
      {p.open && (
        <div className="cc-lesson__body">
          <ol className="cc-questions">
            {l.questions.map((q, qi) => (
              <li key={q.id} className="cc-q">
                <div className="cc-q__main">
                  <p className="cc-q__text"><span className="area__chip">{q.qtype === 'mcq' ? 'اختيار' : 'كتابي'}</span> {q.text}</p>
                  {q.qtype === 'mcq' ? (
                    <ul className="cc-row__opts">
                      {q.options?.map((o, k) => (
                        <li key={k} className={q.correct_option === 'abcd'[k] ? 'is-correct' : ''}>{LETTER_AR[k]}: {o} {q.correct_option === 'abcd'[k] && <b>✓</b>}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="cc-row__opts">الإجابات: {q.accepted_answers.join(' | ')}</p>
                  )}
                </div>
                <div className="cc-actions">
                  <button type="button" className="area__btn area__btn--ghost" disabled={qi === 0 || p.busy} aria-label="تحريك السؤال للأعلى" onClick={() => p.onMoveQ(qi, -1)}>↑</button>
                  <button type="button" className="area__btn area__btn--ghost" disabled={qi === l.questions.length - 1 || p.busy} aria-label="تحريك السؤال للأسفل" onClick={() => p.onMoveQ(qi, 1)}>↓</button>
                  <button type="button" className="area__btn area__btn--ghost" onClick={() => p.onEdit(q)}>تعديل</button>
                  <button type="button" className="area__btn area__btn--danger" disabled={p.busy} onClick={() => p.onDeleteQ(q)}>حذف</button>
                </div>
              </li>
            ))}
          </ol>
          {l.questions.length === 0 && !p.form && <p className="area__muted">لا توجد أسئلة في هذا الدرس بعد.</p>}
          {p.form ? (
            <QuestionForm key={p.form.question?.id ?? 'new'} lessonId={l.id} question={p.form.question} onSaved={p.onSaved} onCancel={p.onFormClose} />
          ) : (
            <div className="area__row">
              <button type="button" className="area__btn" onClick={p.onAdd} data-testid="add-question">+ إضافة سؤال</button>
              <button type="button" className="area__btn area__btn--ghost" onClick={p.onBulk}>لصق أسئلة لهذا الدرس</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
