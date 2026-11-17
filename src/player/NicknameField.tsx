import { useId } from 'react'
import { NICKNAME_MAX, suggestNickname } from './playerProfile'

interface NicknameFieldProps {
  value: string
  onChange: (value: string) => void
  error: string | null
}

/** Nickname input with an anonymous-name suggestion button. Never asks for real names. */
export function NicknameField({ value, onChange, error }: NicknameFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  return (
    <div className="nickname">
      <label htmlFor={id} className="nickname__label">
        لقبك في اللعبة
      </label>
      <div className="nickname__row">
        <input
          id={id}
          className="nickname__input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={NICKNAME_MAX + 4}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="مثال: نجم_٢٣"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${errorId} ${hintId}` : hintId}
        />
        <button type="button" className="nickname__suggest" onClick={() => onChange(suggestNickname())}>
          اقتراح
        </button>
      </div>
      {error ? (
        <p id={errorId} className="nickname__error" role="alert">
          {error}
        </p>
      ) : null}
      <p id={hintId} className="nickname__hint">
        لقب مرح، لا تكتب اسمك الحقيقي.
      </p>
    </div>
  )
}
