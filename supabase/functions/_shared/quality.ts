// Question-quality checks for AI drafts. Pure TypeScript (Deno + Vitest).
// The same Arabic-aware comparison rules as the Task 05 validator
// (src/questions/arabic.ts, src/questions/validate.ts).
//
// A schema-valid answer is not necessarily a correct one: these checks catch
// structural problems (rejected) and doubts (kept, but marked for human review).
// Nothing generated is ever published without an administrator.

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g
const TATWEEL = /ـ/g
const PREFIX = /^(وال|بال|فال|كال|لل|ال|و|ف|ب|ل)(?=...)/

export function normalizeArabic(text: string): string {
  return String(text ?? '')
    .replace(DIACRITICS, '')
    .replace(TATWEEL, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[«»"'(){}[\]﴿﴾:؛،,.!?؟\-–—/…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function words(text: string): Set<string> {
  return new Set(
    normalizeArabic(text)
      .split(' ')
      .map((w) => w.replace(PREFIX, ''))
      .filter((w) => w.length >= 3),
  )
}

export function wordSequence(text: string): string {
  return normalizeArabic(text)
    .split(' ')
    .map((w) => w.replace(PREFIX, ''))
    .filter(Boolean)
    .join(' ')
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1
  let inter = 0
  for (const w of a) if (b.has(w)) inter++
  return inter / (a.size + b.size - inter)
}

/** Share of `part`'s words that appear in `whole` (0–1). */
export function coverage(part: string, whole: string): number {
  const p = words(part)
  if (!p.size) return 0
  const w = words(whole)
  let hit = 0
  for (const x of p) if (w.has(x)) hit++
  return hit / p.size
}

export function suspiciousChars(text: string): boolean {
  for (const ch of String(text ?? '')) {
    const c = ch.codePointAt(0) ?? 0
    if (c === 0xfffd) return true
    if (c >= 0xfb50 && c <= 0xfdff && c !== 0xfdfa && c !== 0xfd3e && c !== 0xfd3f) return true
    if (c >= 0xfe70 && c <= 0xfeff) return true
    if ((c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) return true
  }
  return false
}

/** The JSON a model must return for each drafted question (see the worker's output schema). */
export interface DraftQuestion {
  question: string
  options: string[]
  correct_index: number
  hint: string
  explanation: string
  difficulty: number
  source_page: number
  source_quote: string
  /** true when converted from a question printed in the source, false when newly written. */
  from_source_question: boolean
}

export interface QualityResult {
  /** Structural problems: the draft is discarded. */
  errors: string[]
  /** Doubts: the draft is kept with status «needs review» and these notes. */
  warnings: string[]
}

export interface QualityContext {
  /** Allowed source pages (inclusive). */
  pageFrom: number
  pageTo: number
  /** Extracted text per page number. */
  pages: Record<number, string>
  /** Texts of questions already in the lesson (any status) and earlier drafts in this job. */
  existing: string[]
}

export function checkDraft(d: DraftQuestion, ctx: QualityContext): QualityResult {
  const errors: string[] = []
  const warnings: string[] = []
  const q = String(d?.question ?? '').trim()
  const opts = Array.isArray(d?.options) ? d.options.map((o) => String(o ?? '').trim()) : []

  if (q.length < 8) errors.push('نص السؤال قصير جدًّا أو فارغ')
  if (opts.length !== 4) errors.push('يجب أن يكون للسؤال أربعة خيارات بالضبط')
  if (!Number.isInteger(d?.correct_index) || d.correct_index < 0 || d.correct_index > 3) errors.push('رقم الإجابة الصحيحة غير صالح')
  if (opts.some((o) => !o)) errors.push('أحد الخيارات فارغ')
  const seqs = opts.map(wordSequence)
  if (new Set(seqs).size !== seqs.length) errors.push('يوجد خياران متطابقان في المعنى')
  if (!Number.isInteger(d?.source_page) || d.source_page < ctx.pageFrom || d.source_page > ctx.pageTo)
    errors.push(`مرجع الصفحة خارج النطاق ${ctx.pageFrom}–${ctx.pageTo}`)
  for (const other of ctx.existing) {
    if (jaccard(words(q), words(other)) >= 0.8) {
      errors.push('السؤال مكرر أو شبه مكرر لسؤال موجود')
      break
    }
  }
  if (errors.length) return { errors, warnings }

  const correct = opts[d.correct_index]
  const hint = String(d.hint ?? '')
  const explanation = String(d.explanation ?? '')
  if (!hint.trim()) warnings.push('لا يوجد تلميح')
  if (words(correct).size >= 2 && normalizeArabic(hint).includes(normalizeArabic(correct))) warnings.push('التلميح يكشف الإجابة')
  if (!explanation.trim()) warnings.push('لا يوجد شرح')
  else if (words(correct).size && coverage(correct, explanation) === 0) warnings.push('الشرح لا يذكر الإجابة الصحيحة')

  const pageText = ctx.pages[d.source_page] ?? ''
  const quote = String(d.source_quote ?? '').trim()
  if (!quote) warnings.push('لا يوجد مقتطف داعم من المصدر')
  else if (!pageText) warnings.push('نص الصفحة المرجعية غير متوفر للتحقق')
  else if (coverage(quote, pageText) < 0.85) warnings.push('المقتطف الداعم غير موجود حرفيًّا في الصفحة المذكورة')
  if (pageText && coverage(correct, pageText) < 0.5 && coverage(correct, quote) < 0.5) warnings.push('الإجابة الصحيحة غير مدعومة بوضوح من نص الصفحة')

  const lens = opts.map((o) => o.length)
  const others = lens.filter((_, i) => i !== d.correct_index)
  const avg = others.reduce((s, x) => s + x, 0) / others.length
  if (avg > 0 && lens[d.correct_index] > 2.2 * avg) warnings.push('الإجابة الصحيحة أطول بوضوح من المشتّتات')
  if ([q, ...opts, hint, explanation].some(suspiciousChars)) warnings.push('أحرف غير سليمة في النص')
  if (/[A-Za-z]{3,}/.test([q, ...opts].join(' '))) warnings.push('يحتوي على حروف لاتينية')
  if (![1, 2, 3].includes(d.difficulty)) warnings.push('مستوى الصعوبة غير محدد')
  return { errors, warnings }
}
