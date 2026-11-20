/**
 * Deterministic parser for pasted question batches (no AI, no network).
 *
 * Documented format (one block per question; blank lines are optional):
 *
 *   السؤال 1: ما عاصمة سلطنة عمان؟
 *   أ: صحار
 *   ب: مسقط
 *   ج: نزوى
 *   د: صلالة
 *   الإجابة الصحيحة: ب
 *
 *   السؤال 2: اكتب عاصمة سلطنة عمان.
 *   النوع: كتابي
 *   الإجابة النموذجية: مسقط
 *   إجابات مقبولة: مدينة مسقط | مسقط العاصمة
 *
 * Optional lines per question: الشرح، تلميح، للمراجعة (marks an answer the author is unsure of).
 * Optional headers: «الوحدة: …» and «الدرس: …» group the questions that follow.
 *
 * The parser never guesses: a missing or invalid correct answer is reported as an error and the question
 * cannot be imported until the parent fixes it in the preview.
 */

export type QType = 'mcq' | 'written'
export type Letter = 'a' | 'b' | 'c' | 'd'
export const LETTERS: readonly Letter[] = ['a', 'b', 'c', 'd']
export const LETTER_AR: Record<Letter, string> = { a: 'أ', b: 'ب', c: 'ج', d: 'د' }

export type IssueCode =
  | 'missing_text'
  | 'missing_options'
  | 'missing_correct'
  | 'invalid_correct'
  | 'multiple_correct'
  | 'duplicate_options'
  | 'missing_model_answer'
  | 'missing_type'
  | 'unknown_type'
  | 'too_long'
  | 'duplicate_in_batch'
  | 'duplicate_existing'
  | 'uncertain'
  | 'too_many_answers'

export interface Issue {
  code: IssueCode
  /** Errors block the import of this question; warnings do not. */
  level: 'error' | 'warning'
  message: string
}

export interface ParsedQuestion {
  /** Position in the pasted text (1-based). */
  position: number
  /** The number written in the text, when present. */
  number: number | null
  qtype: QType | null
  text: string
  options: string[] // always 4 entries (missing ones are '')
  correct: Letter | null
  accepted: string[] // written: [model answer, ...alternatives]
  hint: string
  explanation: string
  unit: string
  lesson: string
  uncertain: boolean
  issues: Issue[]
}

export interface ParseResult {
  questions: ParsedQuestion[]
  /** Text before the first question that was ignored. */
  ignored: string[]
}

export const LIMITS = { text: 600, option: 300, answer: 100, hint: 300, explanation: 1200, maxChars: 300_000 }

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

/** Removes direction marks, zero-width and control characters; normalises full-width colons. Question content keeps its own digits. */
export function cleanLine(raw: string): string {
  // oxlint-disable-next-line no-control-regex
  let s = raw.replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
  s = s.replace(/：/g, ':').replace(/ /g, ' ')
  // markdown decoration an AI tool may add
  s = s.replace(/^\s*(?:#{1,6}\s+|>\s+)/, '').replace(/\*\*|__|`/g, '')
  s = s.replace(/^\s*(?:[-•·●▪*]\s+)(?=\S)/, '')
  return s.replace(/[ \t]+/g, ' ').trim()
}

/** Comparison key for duplicate detection: ignores diacritics, tatweel, hamza/alef/yaa/taa-marbuta forms, punctuation, spacing. */
export function compareKey(s: string): string {
  return s
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const DIG = '[0-9٠-٩۰-۹]'
const QSTART = new RegExp(`^(?:(?:السؤال|سؤال|Question|Q)\\s*[(\\[]?\\s*(${DIG}+)|س\\s*[(\\[]?(${DIG}+))\\s*[)\\]]?\\s*[:.\\-–—]?\\s*(.*)$`, 'i')
const BARE_QSTART = new RegExp(`^(${DIG}{1,3})\\s*[.)\\-–—:]\\s+(.+)$`)
/** Question numbers may be written with Arabic-Indic or Persian digits. */
const toNum = (s: string) => Number(s.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d))).replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d))))
const OPTION = /^[([]?\s*(أ|ا|ب|ج|د|[A-Da-d])\s*[)\].:\-–—]\s*(.*)$/
const FIELD = /^(.{2,30}?)\s*:\s*(.*)$/

type Field = 'type' | 'correct' | 'answer' | 'accepted' | 'explanation' | 'hint' | 'lesson' | 'unit' | 'uncertain'
const FIELD_NAMES: [RegExp, Field][] = [
  [/^(?:النوع|نوع السؤال|Type)$/i, 'type'],
  [/^(?:الاجابه الصحيحه|الاجابه الصحيحة|الجواب الصحيح|الاجابة الصحيحة|الإجابة الصحيحة|الاجابه|الإجابة|الاجابة|الجواب|Correct(?: answer)?|Answer)$/i, 'correct'],
  [/^(?:الاجابه النموذجيه|الإجابة النموذجية|الاجابة النموذجية|الجواب النموذجي|Model answer)$/i, 'answer'],
  [/^(?:اجابات مقبوله|إجابات مقبولة|اجابات مقبولة|إجابة مقبولة|اجابه مقبوله|بدائل مقبولة|اجابات بديلة|إجابات بديلة|Accepted(?: answers)?)$/i, 'accepted'],
  [/^(?:الشرح|التوضيح|التفسير|Explanation)$/i, 'explanation'],
  [/^(?:تلميح|التلميح|Hint)$/i, 'hint'],
  [/^(?:الدرس|Lesson)$/i, 'lesson'],
  [/^(?:الوحدة|Unit)$/i, 'unit'],
  [/^(?:للمراجعة|مشكوك فيه|غير متاكد|غير متأكد|تحقق|Uncertain|Review)$/i, 'uncertain'],
]

function fieldOf(line: string): { field: Field; value: string } | null {
  const m = FIELD.exec(line)
  if (!m) return null
  const key = m[1].replace(/[\u064b-\u065f\u0640]/g, '').replace(/^\u26a0\ufe0f?\s*/u, '').trim()
  for (const [re, f] of FIELD_NAMES) if (re.test(key) || re.test(m[1].trim())) return { field: f, value: m[2].trim() }
  return null
}

const WRITTEN_WORDS = /^(?:كتابي|كتابيه|كتابية|مقالي|اجابه قصيره|إجابة قصيرة|written|short|text)$/i
const MCQ_WORDS = /^(?:اختيار من متعدد|اختياري|اختيار|متعدد|موضوعي|mcq|multiple choice|choice)$/i

const letterOf = (s: string): Letter | null => {
  const t = s.trim()
  if (/^[أاAa]$/.test(t)) return 'a'
  if (/^[بBb]$/.test(t)) return 'b'
  if (/^[جCc]$/.test(t)) return 'c'
  if (/^[دDd]$/.test(t)) return 'd'
  return null
}

interface Draft {
  position: number
  number: number | null
  qtype: QType | null
  explicitType: string | null
  textLines: string[]
  options: string[]
  correctRaw: string[]
  answerRaw: string
  acceptedRaw: string[]
  hint: string
  explanation: string
  unit: string
  lesson: string
  uncertain: boolean
  uncertainNote: string
  last: { kind: 'text' } | { kind: 'option'; i: number } | { kind: 'field'; f: Field } | null
}

const newDraft = (position: number, number: number | null, unit: string, lesson: string): Draft => ({
  position, number, qtype: null, explicitType: null, textLines: [], options: ['', '', '', ''], correctRaw: [], answerRaw: '', acceptedRaw: [],
  hint: '', explanation: '', unit, lesson, uncertain: false, uncertainNote: '', last: null,
})

const splitAnswers = (v: string) => v.split(/\s*[|؛;]\s*/).map((x) => x.trim()).filter(Boolean)

export function parseQuestions(input: string): ParseResult {
  const text = input.length > LIMITS.maxChars ? input.slice(0, LIMITS.maxChars) : input
  const lines = text.split(/\r?\n/)
  const drafts: Draft[] = []
  const ignored: string[] = []
  let cur: Draft | null = null
  let unit = ''
  let lesson = ''
  const hasExplicit = lines.some((l) => QSTART.test(cleanLine(l)))

  for (const raw of lines) {
    const line = cleanLine(raw)
    if (!line || /^[-=_*~─━]{3,}$/.test(line)) continue

    const qs = QSTART.exec(line)
    const bare = !hasExplicit ? BARE_QSTART.exec(line) : null
    if (qs || bare) {
      const number = qs ? toNum(qs[1] ?? qs[2]) : toNum(bare![1])
      cur = newDraft(drafts.length + 1, Number.isFinite(number) ? number : null, unit, lesson)
      const rest = qs ? qs[3] : bare![2]
      if (rest) cur.textLines.push(rest)
      cur.last = { kind: 'text' }
      drafts.push(cur)
      continue
    }

    const fld = fieldOf(line)
    // «الوحدة:» / «الدرس:» lines. After a finished question they are group headers for the questions that follow;
    // directly under a question's text they label that question only.
    if (fld && (fld.field === 'unit' || fld.field === 'lesson')) {
      const finished = cur && (cur.options.some(Boolean) || cur.correctRaw.length > 0 || cur.answerRaw !== '')
      if (cur && !finished) {
        if (fld.field === 'unit') cur.unit = fld.value
        else cur.lesson = fld.value
        continue
      }
      if (fld.field === 'unit') {
        unit = fld.value
        lesson = ''
      } else lesson = fld.value
      cur = null
      continue
    }
    if (!cur) {
      ignored.push(line)
      continue
    }

    const opt = OPTION.exec(line)
    if (opt) {
      const l = letterOf(opt[1])
      if (l) {
        const i = LETTERS.indexOf(l)
        // The same label twice is a malformed batch: keep the first, treat the repeat as text of the previous option.
        if (cur.options[i] === '') {
          cur.options[i] = opt[2].trim()
          cur.last = { kind: 'option', i }
          continue
        }
      }
    }
    if (fld) {
      cur.last = { kind: 'field', f: fld.field }
      switch (fld.field) {
        case 'type':
          cur.explicitType = fld.value
          if (WRITTEN_WORDS.test(fld.value.trim())) cur.qtype = 'written'
          else if (MCQ_WORDS.test(fld.value.trim())) cur.qtype = 'mcq'
          break
        case 'correct':
          cur.correctRaw.push(fld.value)
          break
        case 'answer':
          cur.answerRaw = fld.value
          break
        case 'accepted':
          cur.acceptedRaw.push(...splitAnswers(fld.value))
          break
        case 'explanation':
          cur.explanation = fld.value
          break
        case 'hint':
          cur.hint = fld.value
          break
        case 'uncertain':
          cur.uncertain = true
          cur.uncertainNote = fld.value
          break
      }
      continue
    }
    // Continuation of the previous element (multi-line text, option or field).
    const last = cur.last
    if (!last || last.kind === 'text') cur.textLines.push(line)
    else if (last.kind === 'option') cur.options[last.i] = `${cur.options[last.i]} ${line}`.trim()
    else if (last.f === 'explanation') cur.explanation = `${cur.explanation} ${line}`.trim()
    else if (last.f === 'hint') cur.hint = `${cur.hint} ${line}`.trim()
    else if (last.f === 'answer') cur.answerRaw = `${cur.answerRaw} ${line}`.trim()
    else if (last.f === 'accepted') cur.acceptedRaw.push(...splitAnswers(line))
    else if (last.f === 'correct' && cur.correctRaw.length) cur.correctRaw[cur.correctRaw.length - 1] += ` ${line}`
    else cur.textLines.push(line)
  }

  return { questions: drafts.map(finish), ignored }
}

function finish(d: Draft): ParsedQuestion {
  const issues: Issue[] = []
  const err = (code: IssueCode, message: string) => issues.push({ code, level: 'error', message })
  const warn = (code: IssueCode, message: string) => issues.push({ code, level: 'warning', message })
  const text = d.textLines.join('\n').trim()
  const filled = d.options.filter(Boolean).length

  // Type: explicit, else inferred from what is present (never from guesses about content).
  let qtype: QType | null = d.qtype
  if (d.explicitType && !qtype) err('unknown_type', `نوع السؤال «${d.explicitType}» غير معروف. استخدم: اختيار من متعدد أو كتابي.`)
  if (!qtype && !d.explicitType) {
    if (filled > 0) qtype = 'mcq'
    else if (d.answerRaw) qtype = 'written'
    else if (d.correctRaw.length && !/^[([]?\s*[أابجدA-Da-d]\s*[)\]]?\s*$/.test(d.correctRaw[0])) qtype = 'written'
    else err('missing_type', 'لم نتمكن من معرفة نوع السؤال: أضف خيارات (أ، ب، ج، د) أو سطر «النوع: كتابي».')
  }

  if (!text) err('missing_text', 'نص السؤال مفقود.')
  else if (text.length > LIMITS.text) err('too_long', `نص السؤال أطول من ${LIMITS.text} حرفًا.`)

  let correct: Letter | null = null
  let accepted: string[] = []

  if (qtype === 'mcq') {
    const missing = LETTERS.filter((_, i) => !d.options[i]).map((l) => LETTER_AR[l])
    if (missing.length) err('missing_options', `الخيارات الناقصة: ${missing.join('، ')}. يلزم أربعة خيارات.`)
    if (d.options.some((o) => o.length > LIMITS.option)) err('too_long', `أحد الخيارات أطول من ${LIMITS.option} حرفًا.`)
    const keys = d.options.filter(Boolean).map(compareKey)
    if (new Set(keys).size < keys.length) err('duplicate_options', 'يوجد خياران متطابقان.')
    if (d.correctRaw.length === 0) err('missing_correct', 'الإجابة الصحيحة غير مذكورة.')
    else if (d.correctRaw.length > 1) err('multiple_correct', 'ذُكرت أكثر من إجابة صحيحة. يجب اختيار إجابة واحدة فقط.')
    else {
      const v = d.correctRaw[0].trim()
      const m = /^[([]?\s*(أ|ا|ب|ج|د|[A-Da-d])\s*(?:[)\].:\-–—]|$|\s)/.exec(v)
      const byLetter = m ? letterOf(m[1]) : null
      if (/^[([]?\s*[أابجدA-Da-d]\s*[،,و&]\s*[([]?\s*[أابجدA-Da-d]/.test(v)) err('multiple_correct', 'ذُكرت أكثر من إجابة صحيحة. يجب اختيار إجابة واحدة فقط.')
      else if (byLetter) {
        if (!d.options[LETTERS.indexOf(byLetter)]) err('invalid_correct', `الإجابة الصحيحة (${LETTER_AR[byLetter]}) تشير إلى خيار غير موجود.`)
        else correct = byLetter
      } else {
        // The answer is written out in full: accept it only when it equals exactly one option.
        const hits = LETTERS.filter((_, i) => d.options[i] && compareKey(d.options[i]) === compareKey(v))
        if (hits.length === 1) correct = hits[0]
        else err('invalid_correct', `لم نفهم الإجابة الصحيحة «${v.slice(0, 30)}». استخدم حرف الخيار: أ أو ب أو ج أو د.`)
      }
    }
  } else if (qtype === 'written') {
    const model = d.answerRaw || (d.correctRaw.length ? d.correctRaw.join(' ') : '')
    if (!model) err('missing_model_answer', 'الإجابة النموذجية مفقودة.')
    else {
      accepted = [model, ...d.acceptedRaw]
      const seen = new Set<string>()
      accepted = accepted.filter((a) => {
        const k = compareKey(a)
        if (!k || seen.has(k)) return false
        seen.add(k)
        return true
      })
      if (accepted.some((a) => a.length > LIMITS.answer)) err('too_long', `إحدى الإجابات أطول من ${LIMITS.answer} حرفًا.`)
      if (accepted.length > 8) err('too_many_answers', 'الحد الأقصى ثماني إجابات مقبولة.')
    }
    if (filled > 0) warn('missing_options', 'السؤال كتابي، لذلك سيتم تجاهل الخيارات.')
  }
  if (d.uncertain) warn('uncertain', d.uncertainNote ? `وُسم للمراجعة: ${d.uncertainNote}` : 'وُسم هذا السؤال للمراجعة: تحقق من صحة الإجابة قبل الاستيراد.')

  return {
    position: d.position, number: d.number, qtype, text,
    options: qtype === 'written' ? ['', '', '', ''] : d.options,
    correct, accepted, hint: d.hint.slice(0, LIMITS.hint), explanation: d.explanation.slice(0, LIMITS.explanation),
    unit: d.unit, lesson: d.lesson, uncertain: d.uncertain, issues,
  }
}

/** Re-checks one (possibly edited) question and refreshes its issues; also flags duplicates. */
export function validateQuestion(q: ParsedQuestion, others: { key: string }[], existingKeys: ReadonlySet<string>): ParsedQuestion {
  const re = parseQuestions(serialize(q)).questions[0]
  const issues = re ? re.issues.filter((i) => i.code !== 'missing_type' || !q.qtype) : q.issues
  const next = { ...q, issues: [...issues] }
  const key = compareKey(q.text)
  if (key && others.some((o) => o.key === key)) next.issues.push({ code: 'duplicate_in_batch', level: 'warning', message: 'هذا السؤال مكرر داخل الدفعة.' })
  if (key && existingKeys.has(key)) next.issues.push({ code: 'duplicate_existing', level: 'warning', message: 'يوجد سؤال بالنص نفسه في هذه المادة، وسيتم تخطيه.' })
  return next
}

/** Back to the documented text form (used to re-validate edits with exactly the same rules). */
export function serialize(q: ParsedQuestion): string {
  const out = [`السؤال ${q.number ?? q.position}: ${q.text.replace(/\n/g, ' ')}`]
  if (q.qtype === 'written') {
    out.push('النوع: كتابي', `الإجابة النموذجية: ${q.accepted[0] ?? ''}`)
    if (q.accepted.length > 1) out.push(`إجابات مقبولة: ${q.accepted.slice(1).join(' | ')}`)
  } else {
    LETTERS.forEach((l, i) => {
      if (q.options[i]) out.push(`${LETTER_AR[l]}: ${q.options[i]}`)
    })
    if (q.correct) out.push(`الإجابة الصحيحة: ${LETTER_AR[q.correct]}`)
  }
  if (q.hint) out.push(`تلميح: ${q.hint}`)
  if (q.explanation) out.push(`الشرح: ${q.explanation}`)
  return out.join('\n')
}

export const hasErrors = (q: ParsedQuestion) => q.issues.some((i) => i.level === 'error')

/** The server's question shape. */
export function toItem(q: ParsedQuestion) {
  return q.qtype === 'written'
    ? { qtype: 'written', text: q.text, accepted_answers: q.accepted, hint: q.hint, explanation: q.explanation }
    : { qtype: 'mcq', text: q.text, options: q.options, correct_option: q.correct, hint: q.hint, explanation: q.explanation }
}

export const EXAMPLE_TEXT = `الوحدة: الوحدة الأولى
الدرس: الدرس الأول

السؤال 1: ما عاصمة سلطنة عمان؟
أ: صحار
ب: مسقط
ج: نزوى
د: صلالة
الإجابة الصحيحة: ب
الشرح: مسقط هي العاصمة.

السؤال 2: ما عدد أيام الأسبوع؟
أ: خمسة
ب: ستة
ج: سبعة
د: ثمانية
الإجابة الصحيحة: ج

السؤال 3: اكتب عاصمة سلطنة عمان.
النوع: كتابي
الإجابة النموذجية: مسقط
إجابات مقبولة: مدينة مسقط`
