/**
 * Subjects available on the adventure map. Adding a subject = adding an entry
 * here (and a level in levels.ts); the map, world and chapter screens read this.
 */
export type SubjectId = 'religion-values'

export interface SubjectConfig {
  id: SubjectId
  /** Arabic subject name shown on the map, portal and chapter screen. */
  title: string
  /** One honest sentence about what the region is for. */
  summary: string
  levelId: string
  /** Question bank with the subject's units, lessons and quiz questions. */
  bankId: string
}

export const SUBJECTS: readonly SubjectConfig[] = [
  {
    id: 'religion-values',
    title: 'ديني قيمي',
    summary: 'دروس ومهمات أسئلة من كتيّب مراجعة ديني قيمي للصف الثامن. ادخل العالم وابحث عن البوابة.',
    levelId: 'meadow',
    bankId: 'religion-values-g8',
  },
]

export function findSubject(id: string): SubjectConfig | undefined {
  return SUBJECTS.find((s) => s.id === id)
}
