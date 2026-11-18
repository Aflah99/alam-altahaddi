const AR = new Intl.NumberFormat('ar-EG')

/** Arabic-Indic digits, as used in the booklet. */
export const ar = (n: number) => AR.format(n)

/** «سؤال واحد / سؤالان / ٣ أسئلة / ١١ سؤالًا» */
export function questionsLabel(n: number): string {
  if (n === 1) return 'سؤال واحد'
  if (n === 2) return 'سؤالان'
  if (n >= 3 && n <= 10) return `${ar(n)} أسئلة`
  return `${ar(n)} سؤالًا`
}

/** «مهمة واحدة / مهمتان / ٣ مهمات» */
export function missionsLabel(n: number): string {
  if (n === 1) return 'مهمة واحدة'
  if (n === 2) return 'مهمتان'
  return `${ar(n)} مهمات`
}

export const OPTION_LETTERS = ['أ', 'ب', 'ج', 'د'] as const

/** «المصدر: كتيّب ديني قيمي، صفحة ٢٦» (page omitted when unknown). */
export function sourceLine(q: { sourceLabel?: string; sourcePdfPage: number }): string {
  const label = q.sourceLabel || 'كتيّب ديني قيمي'
  return q.sourcePdfPage > 0 ? `المصدر: ${label}، صفحة ${ar(q.sourcePdfPage)}` : `المصدر: ${label}`
}
