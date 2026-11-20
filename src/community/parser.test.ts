import { describe, expect, it } from 'vitest'
import { compareKey, EXAMPLE_TEXT, hasErrors, parseQuestions, serialize, toItem, validateQuestion } from './parser'

const one = (t: string) => parseQuestions(t).questions[0]
const codes = (t: string) => one(t).issues.map((i) => i.code)

describe('bulk question parser', () => {
  it('parses the documented format: MCQ, written, units and lessons', () => {
    const r = parseQuestions(EXAMPLE_TEXT)
    expect(r.questions).toHaveLength(3)
    const [a, b, c] = r.questions
    expect(a).toMatchObject({ qtype: 'mcq', number: 1, correct: 'b', text: 'ما عاصمة سلطنة عمان؟', unit: 'الوحدة الأولى', lesson: 'الدرس الأول', explanation: 'مسقط هي العاصمة.' })
    expect(a.options).toEqual(['صحار', 'مسقط', 'نزوى', 'صلالة'])
    expect(b.correct).toBe('c')
    expect(c).toMatchObject({ qtype: 'written', accepted: ['مسقط', 'مدينة مسقط'] })
    expect(r.questions.every((q) => !hasErrors(q))).toBe(true)
  })

  it('handles Arabic-Indic numbers, alternative labels, markdown and direction marks', () => {
    const t = `‏**السؤال ١٢:** ما ناتج ٢+٢؟\n- A) اثنان\n- B) ثلاثة\n- C) أربعة\n- D) خمسة\n**Answer: C**`
    const q = one(t)
    expect(q.number).toBe(12)
    expect(q.options).toEqual(['اثنان', 'ثلاثة', 'أربعة', 'خمسة'])
    expect(q.correct).toBe('c')
    expect(one('س1) ما هذا؟\nأ) واحد\nب) اثنان\nج) ثلاثة\nد) أربعة\nالجواب: د').correct).toBe('d')
    expect(one('1. ما هذا؟\nأ- واحد\nب- اثنان\nج- ثلاثة\nد- أربعة\nالإجابة الصحيحة: (أ)').correct).toBe('a')
  })

  it('supports multi-line question text and options, and spacing variations', () => {
    const q = one('السؤال 1 :   اقرأ النص\nثم أجب عن السؤال التالي\nما المقصود؟\nأ :   الأول\nيكمل هنا\nب:الثاني\nج :الثالث\nد : الرابع\n\n\nالإجابة الصحيحة :  أ  ')
    expect(q.text).toBe('اقرأ النص\nثم أجب عن السؤال التالي\nما المقصود؟')
    expect(q.options[0]).toBe('الأول يكمل هنا')
    expect(q.correct).toBe('a')
    expect(hasErrors(q)).toBe(false)
  })

  it('reports missing options, missing and invalid correct answers without guessing', () => {
    expect(codes('السؤال 1: س؟\nأ: واحد\nب: اثنان\nج: ثلاثة\nالإجابة الصحيحة: أ')).toContain('missing_options')
    const none = one('السؤال 1: س؟\nأ: واحد\nب: اثنان\nج: ثلاثة\nد: أربعة')
    expect(none.correct).toBeNull()
    expect(none.issues.map((i) => i.code)).toContain('missing_correct')
    for (const bad of ['هـ', 'E', '5', 'كلها', 'أ و ب', 'أ، ج']) {
      const q = one(`السؤال 1: س؟\nأ: واحد\nب: اثنان\nج: ثلاثة\nد: أربعة\nالإجابة الصحيحة: ${bad}`)
      expect(q.correct, bad).toBeNull()
      expect(hasErrors(q), bad).toBe(true)
    }
    expect(codes('السؤال 1: س؟\nأ: واحد\nب: اثنان\nج: ثلاثة\nد: أربعة\nالإجابة الصحيحة: أ\nالإجابة الصحيحة: ب')).toContain('multiple_correct')
    expect(codes('السؤال 1: س؟\nأ: واحد\nب: واحد\nج: ثلاثة\nد: أربعة\nالإجابة الصحيحة: أ')).toContain('duplicate_options')
  })

  it('accepts a written-out correct answer only when it equals exactly one option', () => {
    const q = one('السؤال 1: عاصمة عمان؟\nأ: صحار\nب: مسقط\nج: نزوى\nد: صلالة\nالإجابة الصحيحة: مسقط')
    expect(q.correct).toBe('b')
    expect(hasErrors(one('السؤال 1: عاصمة عمان؟\nأ: صحار\nب: مسقط\nج: نزوى\nد: صلالة\nالإجابة الصحيحة: الرستاق'))).toBe(true)
  })

  it('parses written questions with alternatives, de-duplicated, and flags missing model answers', () => {
    const q = one('السؤال 3: اكتب عاصمة عمان\nالنوع: كتابي\nالإجابة النموذجية: مَسْقَط\nإجابات مقبولة: مسقط | مدينة مسقط ؛ مسقط العاصمة')
    expect(q.accepted).toEqual(['مَسْقَط', 'مدينة مسقط', 'مسقط العاصمة'])
    expect(codes('السؤال 3: اكتب عاصمة عمان\nالنوع: كتابي')).toContain('missing_model_answer')
    expect(codes('السؤال 3: س؟\nالنوع: مقال طويل')).toContain('unknown_type')
    expect(one('السؤال 4: ما هي؟\nالإجابة النموذجية: كذا').qtype).toBe('written')
    expect(codes('السؤال 5: س؟')).toContain('missing_type')
  })

  it('keeps uncertain markers as warnings for the parent to review', () => {
    const q = one('السؤال 1: س؟\nأ: ١\nب: ٢\nج: ٣\nد: ٤\nالإجابة الصحيحة: ب\nللمراجعة: لست متأكدًا من الإجابة')
    expect(q.uncertain).toBe(true)
    expect(q.issues.find((i) => i.code === 'uncertain')?.level).toBe('warning')
    expect(hasErrors(q)).toBe(false)
  })

  it('ignores introductory chatter and separators', () => {
    const r = parseQuestions('بالتأكيد! إليك الأسئلة:\n\n---\nالسؤال 1: س؟\nأ: ١\nب: ٢\nج: ٣\nد: ٤\nالإجابة الصحيحة: أ\n---\nآمل أن يفيدك ذلك')
    expect(r.questions).toHaveLength(1)
    expect(r.ignored[0]).toContain('بالتأكيد')
  })

  it('handles malformed and empty text safely', () => {
    expect(parseQuestions('').questions).toEqual([])
    expect(parseQuestions('نص عشوائي بلا أسئلة\nسطر آخر').questions).toEqual([])
    expect(parseQuestions('السؤال 1:').questions[0].issues.map((i) => i.code)).toContain('missing_text')
    const html = one('السؤال 1: <script>alert(1)</script>\nأ: ١\nب: ٢\nج: ٣\nد: ٤\nالإجابة الصحيحة: أ')
    expect(html.text).toContain('<script>') // kept as inert text; the server rejects it and React never renders it as HTML
  })

  it('processes large batches quickly and keeps order', () => {
    const big = Array.from({ length: 500 }, (_, i) => `السؤال ${i + 1}: سؤال عربي رقم ${i + 1}؟\nأ: ١\nب: ٢\nج: ٣\nد: ٤\nالإجابة الصحيحة: ${'أبجد'[i % 4]}`).join('\n\n')
    const t0 = performance.now()
    const r = parseQuestions(big)
    expect(performance.now() - t0).toBeLessThan(1000)
    expect(r.questions).toHaveLength(500)
    expect(r.questions.map((q) => q.number)).toEqual(Array.from({ length: 500 }, (_, i) => i + 1))
    expect(r.questions.every((q) => !hasErrors(q))).toBe(true)
  })

  it('detects duplicates inside a batch and against existing questions, ignoring diacritics and hamza', () => {
    expect(compareKey('ما هي عاصِمةُ عُمان؟')).toBe(compareKey('ما هي عاصمه عمان'))
    const [a, b] = parseQuestions('السؤال 1: ما هي عاصمة عمان؟\nأ: ١\nب: ٢\nج: ٣\nد: ٤\nالإجابة الصحيحة: أ\nالسؤال 2: ما هي عاصِمةُ عُمان\nأ: ١\nب: ٢\nج: ٣\nد: ٤\nالإجابة الصحيحة: ب').questions
    expect(validateQuestion(b, [{ key: compareKey(a.text) }], new Set()).issues.map((i) => i.code)).toContain('duplicate_in_batch')
    expect(validateQuestion(a, [], new Set([compareKey(a.text)])).issues.map((i) => i.code)).toContain('duplicate_existing')
  })

  it('re-validates edited questions with the same rules and round-trips to the server shape', () => {
    const q = one('السؤال 1: س؟\nأ: ١\nب: ٢\nج: ٣\nد: ٤')
    expect(hasErrors(q)).toBe(true)
    const fixed = validateQuestion({ ...q, correct: 'c' }, [], new Set())
    expect(hasErrors(fixed)).toBe(false)
    expect(toItem(fixed)).toMatchObject({ qtype: 'mcq', correct_option: 'c', options: ['١', '٢', '٣', '٤'] })
    const w = one('السؤال 2: س؟\nالنوع: كتابي\nالإجابة النموذجية: ج\nإجابات مقبولة: د')
    expect(serialize(w)).toContain('إجابات مقبولة: د')
    expect(toItem(w)).toMatchObject({ qtype: 'written', accepted_answers: ['ج', 'د'] })
  })
})
