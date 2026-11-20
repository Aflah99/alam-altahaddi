import type { AnswerResult, SessionSummary } from '../cloud/types'
import { levelInfo } from '../economy/config'
import type { MissionReward } from '../economy/wallet'
import type { OptionId } from '../questions/types'

/**
 * Server-side quiz (cloud mode): the client never holds the answer key. Correctness,
 * hints, explanations and rewards come from the server one step at a time.
 */
export interface QuizDriver {
  submit: (questionId: string, option: OptionId) => Promise<AnswerResult>
  submitWritten: (questionId: string, text: string) => Promise<AnswerResult>
  hint: (questionId: string) => Promise<string>
  complete: () => Promise<SessionSummary>
}

/** Server summary → the shapes the results screen already uses. */
export function rewardFromServer(s: SessionSummary): MissionReward {
  const r = s.reward
  const v = (x: { xp: number; coins: number }) => ({ xp: x.xp, coins: x.coins, level: levelInfo(x.xp), owned: new Set<string>(), unlockedCharacters: new Set<never>() })
  return {
    applied: [],
    xp: r.xp,
    coins: r.coins,
    bonus: r.bonus,
    bonusEarlier: r.bonus_earlier,
    alreadyRewarded: r.already_rewarded,
    community: s.community,
    dailyLimitReached: s.daily_limit_reached,
    before: v(r.before),
    after: v(r.after),
  }
}

