/** Arabic text helpers used for validation (not for display). */

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g
const TATWEEL = /ـ/g

/** Normalises Arabic for comparison: no diacritics/tatweel, unified alef/ya/ta marbuta, no punctuation. */
export function normalizeArabic(text: string): string {
  return text
    .replace(DIACRITICS, '')
    .replace(TATWEEL, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[«»"'(){}[\]﴿﴾:؛،,.!?؟\-–—/…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Significant words (3+ letters) after normalisation. */
export function words(text: string): Set<string> {
  return new Set(
    normalizeArabic(text)
      .split(' ')
      .map((w) => w.replace(/^(وال|بال|فال|كال|لل|ال|و|ف|ب|ل)(?=...)/, ''))
      .filter((w) => w.length >= 3),
  )
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1
  let inter = 0
  for (const w of a) if (b.has(w)) inter++
  return inter / (a.size + b.size - inter)
}

/**
 * Characters that indicate broken PDF extraction or rendering problems:
 * replacement char, Arabic presentation forms (except ﷺ U+FDFA and the Quranic brackets ﴿﴾), bidi controls.
 */
export function suspiciousChars(text: string): string[] {
  const bad: string[] = []
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0
    if (c === 0xfffd) bad.push('U+FFFD')
    else if (c >= 0xfb50 && c <= 0xfdff && c !== 0xfdfa && c !== 0xfd3e && c !== 0xfd3f) bad.push(`U+${c.toString(16).toUpperCase()}`)
    else if (c >= 0xfe70 && c <= 0xfeff) bad.push(`U+${c.toString(16).toUpperCase()}`)
    else if ((c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) bad.push(`bidi U+${c.toString(16)}`)
  }
  return bad
}

/**
 * Every token in order (prefixes stripped). Keeps digits and short words such
 * as «لا» / «لم», because order, numbers and negation all change the meaning.
 */
export function wordSequence(text: string): string {
  return normalizeArabic(text)
    .split(' ')
    .map((w) => w.replace(/^(وال|بال|فال|كال|لل|ال|و|ف|ب|ل)(?=...)/, ''))
    .filter(Boolean)
    .join(' ')
}
