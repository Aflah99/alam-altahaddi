import type { CatalogSubject } from '../cloud/types'
import type { QuestionBank } from '../questions/types'
import { missionId, planMissions } from './engine'
import { ar } from './format'
import type { LearningProgress } from './progress'

/** What the lesson screen shows, whether content comes from the bundled bank or the cloud. */
export interface MissionView {
  number: number
  size: number
  /** e.g. «٧/٨» or «٨٠٪»; undefined when never completed. */
  best?: string
}
export interface LessonView {
  id: string
  number: number
  title: string
  questionCount: number
  missions: MissionView[]
}
export interface UnitView {
  id: string
  title: string
  lessons: LessonView[]
}

export function treeFromBank(bank: QuestionBank, progress: LearningProgress): UnitView[] {
  return bank.units.map((u) => ({
    id: u.id,
    title: u.title,
    lessons: u.lessons.map((l) => ({
      id: l.id,
      number: l.number,
      title: l.title,
      questionCount: l.questions.length,
      missions: planMissions(l).map((qs, i) => {
        const rec = progress.missions[missionId(l.id, i + 1)]
        return { number: i + 1, size: qs.length, best: rec ? `${ar(rec.bestFirstTry)}/${ar(rec.total)}` : undefined }
      }),
    })),
  }))
}

/** Cloud catalogue → lesson tree. `best` maps mission uuid → best first-try accuracy (%). */
export function treeFromCatalog(subject: CatalogSubject, best: Record<string, number>): UnitView[] {
  return subject.units.map((u) => ({
    id: u.id,
    title: u.title,
    lessons: u.lessons.map((l) => ({
      id: l.id,
      number: l.number,
      title: l.title,
      questionCount: l.missions.reduce((s, m) => s + m.question_count, 0),
      missions: l.missions.map((m) => ({
        number: m.number,
        size: m.question_count,
        best: m.id in best ? `${ar(best[m.id])}٪` : undefined,
      })),
    })),
  }))
}
