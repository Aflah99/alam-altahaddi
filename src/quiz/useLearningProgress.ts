import { useCallback, useState } from 'react'
import type { MissionState, MissionSummary } from './engine'
import { loadProgress, recordMission, saveProgress, type LearningProgress } from './progress'

/** Device-local learning progress for one guest profile. */
export function useLearningProgress(playerId: string) {
  const [stored, setStored] = useState<LearningProgress>(() => loadProgress(playerId))

  // A different (or newly created) profile: switch to its own progress.
  let progress = stored
  if (stored.playerId !== playerId) {
    progress = loadProgress(playerId)
    setStored(progress)
  }

  const record = useCallback((mission: MissionState, summary: MissionSummary) => {
    setStored((prev) => {
      const next = recordMission(prev, mission, summary)
      saveProgress(next)
      return next
    })
  }, [])

  return [progress, record] as const
}
