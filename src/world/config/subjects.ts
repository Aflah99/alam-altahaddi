/**
 * Subjects available on the adventure map. Adding a subject = adding an entry
 * here (and a level in levels.ts); the map, world and chapter screens read this.
 */
export type SubjectId = 'religion-values'

/** A chapter of a subject. Filled from the revision booklet in Task 05. */
export interface ChapterConfig {
  id: string
  title: string
}

export interface SubjectConfig {
  id: SubjectId
  /** Arabic subject name shown on the map, portal and chapter screen. */
  title: string
  /** One honest sentence about what the region is for. */
  summary: string
  levelId: string
  /** Empty until lessons are imported (Task 05). */
  chapters: readonly ChapterConfig[]
}

export const SUBJECTS: readonly SubjectConfig[] = [
  {
    id: 'religion-values',
    title: 'ديني قيمي',
    summary: 'منطقة مراجعة كتيّب مادة ديني قيمي للصف الثامن. ادخل العالم وابحث عن البوابة.',
    levelId: 'meadow',
    chapters: [],
  },
]

export function findSubject(id: string): SubjectConfig | undefined {
  return SUBJECTS.find((s) => s.id === id)
}
