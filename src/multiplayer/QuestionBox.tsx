import { useState } from 'react'
import { OPTION_LETTERS } from '../quiz/format'
import type { MpQuestion } from './api'

/** One multiplayer question (multiple choice or written). The server decides if it is right. */
export function QuestionBox({
  question,
  onAnswer,
  disabled,
}: {
  question: MpQuestion
  onAnswer: (answer: string) => Promise<'correct' | 'wrong' | 'unsure' | 'error'>
  disabled?: boolean
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [unsure, setUnsure] = useState(false)
  // The parent re-mounts this box (key) for every new question, which resets the input.
  const key = `${question.idx}:${question.round}`

  const send = async (a: string) => {
    if (busy || disabled || !a.trim()) return
    setBusy(true)
    const r = await onAnswer(a)
    setBusy(false)
    if (r === 'unsure') setUnsure(true)
  }

  return (
    <section className="mpq" aria-labelledby={`mpq-${key}`}>
      <h3 id={`mpq-${key}`} className="mpq__text">
        {question.text}
      </h3>
      {question.type === 'written' ? (
        <form
          className="mpq__write"
          onSubmit={(e) => {
            e.preventDefault()
            void send(text)
          }}
        >
          <input
            className="qwrite__input"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setUnsure(false)
            }}
            aria-label="اكتب إجابتك"
            placeholder="اكتب إجابتك"
            maxLength={200}
            autoComplete="off"
            spellCheck={false}
            disabled={busy || disabled}
            dir="rtl"
          />
          <button type="submit" className="pixel-button" disabled={busy || disabled || !text.trim()}>
            إرسال
          </button>
          {unsure && <p className="qfb qfb--unsure">لم نتأكد من إجابتك؛ تحقّق من الكتابة وأرسلها مرة أخرى.</p>}
        </form>
      ) : (
        <ul className="mpq__options">
          {question.options.map((o, i) => (
            <li key={o.id}>
              <button type="button" className="qopt" disabled={busy || disabled} onClick={() => void send(o.id)}>
                <span className="qopt__letter" aria-hidden="true">
                  {OPTION_LETTERS[i]}
                </span>
                <span className="qopt__text">{o.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
