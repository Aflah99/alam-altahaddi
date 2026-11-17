import type { MissionState, MissionSummary, QuestionResult } from './engine'

/**
 * Learning progress, stored ONLY in this browser for the local guest profile.
 * Not secure, not synced, and not trustworthy for rewards or rankings: a later
 * task will move this onto server-validated student accounts (same shape).
 */
export interface MissionRecord {
  timesCompleted: number
  lastCompletedAt: string
  total: number
  lastFirstTry: number
  bestFirstTry: number
  lastHintsUsed: number
}

export interface QuestionRecord {
  timesAnswered: number
  timesFirstTry: number
  timesHintUsed: number
  lastResult: QuestionResult
  /** True while the last attempt was assisted or missed. */
  needsRevision: boolean
}

export interface LearningProgress {
  version: 1
  /** The local guest profile this progress belongs to. */
  playerId: string
  missions: Record<string, MissionRecord>
  questions: Record<string, QuestionRecord>
  lastLessonId: string | null
  updatedAt: string
}

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const keyFor = (playerId: string) => `alam-altahaddi:progress:v1:${playerId}`

export function emptyProgress(playerId: string): LearningProgress {
  return { version: 1, playerId, missions: {}, questions: {}, lastLessonId: null, updatedAt: new Date(0).toISOString() }
}

function defaultStore(): KeyValueStore | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function loadProgress(playerId: string, store: KeyValueStore | null = defaultStore()): LearningProgress {
  try {
    const raw = store?.getItem(keyFor(playerId))
    if (!raw) return emptyProgress(playerId)
    const data = JSON.parse(raw) as Partial<LearningProgress>
    if (data.version !== 1 || data.playerId !== playerId) return emptyProgress(playerId)
    return {
      ...emptyProgress(playerId),
      ...data,
      missions: data.missions ?? {},
      questions: data.questions ?? {},
    }
  } catch {
    return emptyProgress(playerId)
  }
}

export function saveProgress(progress: LearningProgress, store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.setItem(keyFor(progress.playerId), JSON.stringify(progress))
  } catch {
    // Storage full or unavailable: progress still works for this visit.
  }
}

/** Folds a finished mission into the progress record (pure). */
export function recordMission(
  progress: LearningProgress,
  mission: MissionState,
  summary: MissionSummary,
  now: Date = new Date(),
): LearningProgress {
  if (!mission.finished) return progress
  const prev = progress.missions[mission.missionId]
  const missions = {
    ...progress.missions,
    [mission.missionId]: {
      timesCompleted: (prev?.timesCompleted ?? 0) + 1,
      lastCompletedAt: now.toISOString(),
      total: summary.total,
      lastFirstTry: summary.firstTry,
      bestFirstTry: Math.max(prev?.bestFirstTry ?? 0, summary.firstTry),
      lastHintsUsed: summary.hintsUsed,
    },
  }
  const questions = { ...progress.questions }
  for (const q of mission.questions) {
    if (!q.result) continue
    const p = questions[q.questionId]
    questions[q.questionId] = {
      timesAnswered: (p?.timesAnswered ?? 0) + 1,
      timesFirstTry: (p?.timesFirstTry ?? 0) + (q.result === 'first' ? 1 : 0),
      timesHintUsed: (p?.timesHintUsed ?? 0) + (q.hintUsed ? 1 : 0),
      lastResult: q.result,
      needsRevision: q.result !== 'first',
    }
  }
  return { ...progress, missions, questions, lastLessonId: mission.lessonId, updatedAt: now.toISOString() }
}

/** Ids of questions whose latest attempt was assisted or missed. */
export function questionsToRevise(progress: LearningProgress): string[] {
  return Object.entries(progress.questions)
    .filter(([, r]) => r.needsRevision)
    .map(([id]) => id)
}
