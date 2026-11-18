import { describe, expect, it } from 'vitest'
import { lessonInsights, pct, type LessonStat } from './insights'

const base = { subject: 'ديني قيمي', unit: 1, unit_title: 'الوحدة الأولى', number: 1 }
const L = (id: string, title: string, answered: number, first_try: number, assisted: number, missed: number): LessonStat => ({ ...base, id, title, answered, first_try, assisted, missed })

describe('parent revision insights', () => {
  it('suggests revising lessons with repeated mistakes, most urgent first, with the reason', () => {
    const out = lessonInsights([L('a', 'الأناة', 8, 7, 1, 0), L('b', 'أسباب النزول', 8, 3, 2, 3), L('c', 'العمرة', 6, 3, 3, 0)])
    expect(out.map((i) => [i.kind, i.lesson])).toEqual([
      ['revise', 'أسباب النزول'],
      ['revise', 'العمرة'],
    ])
    expect(out[0].reason).toContain('يُنصح بمراجعة درس «أسباب النزول»')
    expect(out[0].reason).toContain('٣ من ٨')
  })
  it('notes strengths only with enough answers, and ignores lessons with too little data', () => {
    expect(lessonInsights([L('a', 'الأناة', 10, 10, 0, 0)])[0].kind).toBe('strength')
    expect(lessonInsights([L('b', 'درس', 2, 0, 0, 2)])).toEqual([])
  })
  it('never uses diagnostic wording', () => {
    const text = lessonInsights([L('b', 'درس', 6, 0, 0, 6)]).map((i) => i.reason).join(' ')
    expect(text).not.toMatch(/صعوبات تعلم|ضعف قدرات|تشخيص|ذكاء/)
  })
  it('percent helper', () => expect([pct(1, 3), pct(0, 0)]).toEqual([33, 0]))
})
