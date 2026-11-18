/**
 * Question-bank schema. Approved content lives in JSON authoring files
 * (src/questions/data/<bank>/uX-lY.json) and is normalised into these types.
 * In the authoring files the FIRST option is the correct one; the quiz engine
 * always shuffles options before showing them.
 */

export type OptionId = 'a' | 'b' | 'c' | 'd'
export type Difficulty = 1 | 2 | 3
export type ReviewStatus = 'approved' | 'flagged'

export interface QuestionOption {
  id: OptionId
  text: string
}

export interface Question {
  /** Stable, globally unique id, e.g. "rv8.u1.l6.21b". */
  id: string
  subjectId: string
  unitId: string
  lessonId: string
  /** Question number as printed in the booklet (with sub-part), e.g. "16ب" → "16b". */
  sourceQuestionNumber: string
  /** Page of the PDF file (1-based). The booklet has no printed page numbers. */
  sourcePdfPage: number
  question: string
  options: readonly QuestionOption[]
  correctOptionId: OptionId
  hint: string
  explanation: string
  /** Source shown under the explanation, e.g. «كتيّب ديني قيمي» (defaults to that). */
  sourceLabel?: string
  difficulty: Difficulty
  reviewStatus: ReviewStatus
}

export interface ExclusionRecord {
  source: string
  reason: string
  detail: string
}

export interface Lesson {
  id: string
  unitId: string
  /** Lesson number within its unit, as in the booklet. */
  number: number
  title: string
  /** Inclusive PDF page range of the lesson. */
  pages: readonly [number, number]
  /** Numbered questions found in the source for this lesson. */
  sourceQuestionCount: number
  excluded: readonly ExclusionRecord[]
  questions: readonly Question[]
}

export interface Unit {
  id: string
  number: number
  title: string
  lessons: readonly Lesson[]
}

export interface QuestionBank {
  id: string
  subjectId: string
  source: {
    title: string
    /** Pages actually provided and processed. */
    pdfPages: number
    pageNumbering: 'pdf'
  }
  units: readonly Unit[]
}

/** Shape of one authoring file. */
export interface AuthoringLessonFile {
  unit: number
  lesson: number
  title: string
  pages: [number, number]
  sourceQuestions: number
  notes?: string[]
  excluded: ExclusionRecord[]
  questions: {
    id: string
    page: number
    q: string
    options: string[]
    hint: string
    explain: string
    difficulty: number
    status?: ReviewStatus
  }[]
}
