/**
 * Reward and level settings. Change values here; no UI code needs to change.
 *
 * Rewards are earned only by answering real questions correctly. There is no
 * random chance and no real-money purchase anywhere in the game.
 */
export interface Reward {
  xp: number
  coins: number
}

export const REWARDS: Readonly<Record<'firstTry' | 'assisted' | 'missed' | 'missionPass', Reward>> = {
  /** Correct on the first attempt without a hint. */
  firstTry: { xp: 10, coins: 10 },
  /** Correct after a hint or on the second attempt. */
  assisted: { xp: 5, coins: 5 },
  /** Not answered correctly. */
  missed: { xp: 0, coins: 0 },
  /** First completion of a mission with a passing score. */
  missionPass: { xp: 20, coins: 20 },
}

/** Passing score for the mission bonus: first-attempt accuracy, in percent (same as the quiz's «أحسنت» threshold). */
export const PASS_ACCURACY = 70

/**
 * XP needed to go from `level` to `level + 1`: 50, 75, 100, 125, …
 * A strong 10-question mission (≈120 XP) is worth one or two early levels.
 */
export const LEVEL_BASE_XP = 50
export const LEVEL_STEP_XP = 25
export const MAX_LEVEL = 99

export function xpToNext(level: number): number {
  return LEVEL_BASE_XP + LEVEL_STEP_XP * (level - 1)
}

export interface LevelInfo {
  level: number
  /** Total XP ever earned. */
  xp: number
  /** XP earned inside the current level. */
  into: number
  /** XP the current level needs in total (0 at the max level). */
  needed: number
  /** 0–1 progress through the current level. */
  ratio: number
}

export function levelInfo(totalXp: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp))
  let level = 1
  let floor = 0
  while (level < MAX_LEVEL && xp >= floor + xpToNext(level)) {
    floor += xpToNext(level)
    level++
  }
  const needed = level >= MAX_LEVEL ? 0 : xpToNext(level)
  const into = xp - floor
  return { level, xp, into, needed, ratio: needed ? into / needed : 1 }
}
