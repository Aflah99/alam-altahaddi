import { describe, expect, it } from 'vitest'
import { checkDraft, type DraftQuestion } from './quality.ts'
import { splitTextPages } from '../ai-worker/handler.ts'

const page = 'تثبت مشروعية العمرة بالقرآن والسنة والإجماع، قال تعالى: وأتموا الحج والعمرة لله. والعمرة واجبة مرة واحدة في العمر على المستطيع.'
const ctx = { pageFrom: 10, pageTo: 12, pages: { 10: page }, existing: ['ما معنى العمرة؟'] }
const good: DraftQuestion = {
  question: 'كم مرة تجب العمرة على المسلم المستطيع؟',
  options: ['مرة واحدة في العمر', 'مرة كل عام', 'مرتين في العمر', 'لا تجب أبدًا'],
  correct_index: 0,
  hint: 'مثل الحج في عدد مرات الوجوب.',
  explanation: 'العمرة واجبة مرة واحدة في العمر على المستطيع.',
  difficulty: 1,
  source_page: 10,
  source_quote: 'والعمرة واجبة مرة واحدة في العمر على المستطيع',
  from_source_question: false,
}

describe('AI draft quality checks', () => {
  it('accepts a grounded draft without warnings', () => expect(checkDraft(good, ctx)).toEqual({ errors: [], warnings: [] }))

  it('rejects structural problems', () => {
    expect(checkDraft({ ...good, options: good.options.slice(0, 3) }, ctx).errors).toContain('يجب أن يكون للسؤال أربعة خيارات بالضبط')
    expect(checkDraft({ ...good, correct_index: 4 }, ctx).errors.length).toBe(1)
    expect(checkDraft({ ...good, options: ['مرة واحدة في العمر', 'مرةً واحدةً في العُمُر', 'ب', 'ج'] }, ctx).errors).toContain('يوجد خياران متطابقان في المعنى')
    expect(checkDraft({ ...good, source_page: 40 }, ctx).errors[0]).toMatch(/خارج النطاق/)
    expect(checkDraft({ ...good, question: 'ما معنى العمرة؟' }, ctx).errors).toContain('السؤال مكرر أو شبه مكرر لسؤال موجود')
  })

  it('flags doubts for human review instead of publishing', () => {
    expect(checkDraft({ ...good, source_quote: 'نص غير موجود في الصفحة إطلاقًا هنا' }, ctx).warnings).toContain('المقتطف الداعم غير موجود حرفيًّا في الصفحة المذكورة')
    expect(checkDraft({ ...good, hint: 'الجواب: مرة واحدة في العمر' }, ctx).warnings).toContain('التلميح يكشف الإجابة')
    expect(checkDraft({ ...good, explanation: 'بحسب الدرس.' }, ctx).warnings).toContain('الشرح لا يذكر الإجابة الصحيحة')
    expect(checkDraft({ ...good, options: ['مرة واحدة في العمر على كل مسلم بالغ عاقل مستطيع ماليًّا وبدنيًّا', 'سنة', 'شهر', 'يوم'] }, ctx).warnings).toContain('الإجابة الصحيحة أطول بوضوح من المشتّتات')
    expect(checkDraft({ ...good, source_page: 11 }, ctx).warnings).toContain('نص الصفحة المرجعية غير متوفر للتحقق')
  })
})

describe('Markdown pages', () => {
  it('uses explicit page markers when present', () => {
    expect(splitTextPages('<!-- page: 3 -->\nأ\n<!-- page: 4 -->\nب')).toEqual([
      { page: 3, text: 'أ' },
      { page: 4, text: 'ب' },
    ])
  })
  it('otherwise splits long text at paragraph breaks', () => {
    const t = Array.from({ length: 12 }, (_, i) => `فقرة ${i} `.repeat(60)).join('\n\n')
    const pages = splitTextPages(t)
    expect(pages.length).toBeGreaterThan(1)
    expect(pages.every((p, i) => p.page === i + 1)).toBe(true)
  })
})
