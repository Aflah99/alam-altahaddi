import { useEffect, useState, type CSSProperties } from 'react'
import { REWARDS } from '../economy/config'
import { Coin, CoinAmount } from '../economy/ui/Coin'
import { LevelBar } from '../economy/ui/LevelBar'
import type { MissionReward } from '../economy/wallet'
import type { Question } from '../questions/types'
import type { MissionSummary } from './engine'
import { ar } from './format'

interface MissionResultsProps {
  summary: MissionSummary
  lessonTitle: string
  missionNumber: number
  missionCount: number
  reviewQuestions: Question[]
  reducedMotion: boolean
  /** Rewards applied for this attempt (null when rewards are unavailable). */
  reward?: MissionReward | null
  /** The mission was completed before the reward system existed. */
  legacy?: boolean
  onShop?: () => void
  onReview: () => void
  onRetry: () => void
  onLessons: () => void
  onWorld: () => void
}

function verdict(accuracy: number): string {
  if (accuracy >= 90) return 'أداء رائع! أنت بطل هذه المهمة.'
  if (accuracy >= 70) return 'أحسنت! أداء جيد جدًّا.'
  if (accuracy >= 40) return 'بداية طيبة، راجع الأسئلة التي احتجت فيها إلى مساعدة.'
  return 'لا بأس، المراجعة طريق التفوّق. جرّب المهمة مرة أخرى.'
}

/** نتائج المهمة — scores, what to revise, and where to go next. */
export function MissionResults({
  summary,
  lessonTitle,
  missionNumber,
  missionCount,
  reviewQuestions,
  reducedMotion,
  reward = null,
  legacy = false,
  onShop,
  onReview,
  onRetry,
  onLessons,
  onWorld,
}: MissionResultsProps) {
  const celebrate = summary.firstTryAccuracy >= 70 && !reducedMotion
  return (
    <section className="results" aria-labelledby="results-title">
      {celebrate && (
        <div className="results__confetti" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      )}
      <h2 id="results-title" className="results__title">
        نتائج المهمة
      </h2>
      <p className="results__sub">
        {lessonTitle} — المهمة {ar(missionNumber)} من {ar(missionCount)}
      </p>
      <p className="results__verdict">{verdict(summary.firstTryAccuracy)}</p>

      <div className="results__score" aria-label={`دقة المحاولة الأولى ${ar(summary.firstTryAccuracy)}٪`}>
        <span className="results__pct">{ar(summary.firstTryAccuracy)}٪</span>
        <span className="results__pct-label">دقة المحاولة الأولى</span>
      </div>

      <dl className="results__stats">
        <div>
          <dt>إجمالي الأسئلة</dt>
          <dd>{ar(summary.total)}</dd>
        </div>
        <div className="results__stat--first">
          <dt>صحيحة من المحاولة الأولى</dt>
          <dd>{ar(summary.firstTry)}</dd>
        </div>
        <div className="results__stat--assisted">
          <dt>صحيحة بعد تلميح أو محاولة ثانية</dt>
          <dd>{ar(summary.assisted)}</dd>
        </div>
        <div className="results__stat--missed">
          <dt>لم تُجب عنها إجابة صحيحة</dt>
          <dd>{ar(summary.missed)}</dd>
        </div>
      </dl>

      {reward && (
        <RewardPanel reward={reward} correct={summary.firstTry + summary.assisted} total={summary.total} legacy={legacy} reducedMotion={reducedMotion} onShop={onShop} />
      )}

      <div className="results__revise">
        <h3>مفاهيم تحتاج إلى مراجعة</h3>
        {reviewQuestions.length === 0 ? (
          <p>لا توجد أسئلة تحتاج إلى مراجعة في هذه المهمة. أحسنت!</p>
        ) : (
          <ul>
            {reviewQuestions.map((q) => (
              <li key={q.id}>{q.question}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="results__actions">
        <button type="button" className="pixel-button" onClick={onReview}>
          مراجعة الأخطاء
        </button>
        <button type="button" className="pause-menu__item" onClick={onRetry}>
          إعادة التحدّي
        </button>
        <button type="button" className="pause-menu__item" onClick={onLessons}>
          اختيار درس آخر
        </button>
        <button type="button" className="pause-menu__item" onClick={onWorld}>
          العودة إلى العالم
        </button>
      </div>
      <p className="results__note">تُحفظ نتائجك ومكافآتك على هذا الجهاز فقط.</p>
    </section>
  )
}

interface RewardPanelProps {
  reward: MissionReward
  correct: number
  total: number
  legacy: boolean
  reducedMotion: boolean
  onShop?: () => void
}

/** المكافآت — XP and coins from this attempt, the level bar and an honest note when nothing new was earned. */
function RewardPanel({ reward, correct, total, legacy, reducedMotion, onShop }: RewardPanelProps) {
  const { before, after } = reward
  const levelUp = after.level.level > before.level.level
  // Start from the old value, then let the bar fill up to the new one.
  const [shown, setShown] = useState(() => (levelUp ? { ...after.level, into: 0, ratio: 0 } : before.level))
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setShown(after.level))
    return () => window.cancelAnimationFrame(id)
  }, [after.level])

  const earned = reward.xp > 0 || reward.coins > 0
  let note: string | null = null
  if (!earned && reward.alreadyRewarded > 0) {
    note = 'حصلت من قبل على مكافآت هذه الأسئلة. يمكنك المراجعة متى شئت لتقوية فهمك، لكن العملات لا تتكرر للأسئلة نفسها.'
  } else if (!earned) {
    note = 'المكافآت تُمنح للإجابات الصحيحة فقط. راجع الأسئلة وحاول مرة أخرى لتكسب نقاط الخبرة والعملات.'
  } else if (reward.alreadyRewarded > 0) {
    note = `${ar(reward.alreadyRewarded)} من إجاباتك الصحيحة حصلت على مكافأتها من قبل، فلم تُحتسب مرة أخرى.`
  }

  return (
    <section className="results__rewards" aria-labelledby="rewards-title">
      {earned && reward.coins > 0 && !reducedMotion && (
        <div className="results__coins" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} style={{ '--i': i } as CSSProperties}>
              <Coin />
            </span>
          ))}
        </div>
      )}
      <h3 id="rewards-title">المكافآت</h3>
      <dl className="results__reward-list">
        <div>
          <dt>الإجابات الصحيحة</dt>
          <dd>
            {ar(correct)} من {ar(total)}
          </dd>
        </div>
        <div>
          <dt>نقاط الخبرة المكتسبة</dt>
          <dd data-testid="xp-earned">+{ar(reward.xp)}</dd>
        </div>
        <div>
          <dt>العملات المكتسبة</dt>
          <dd data-testid="coins-earned">
            <CoinAmount value={reward.coins} />
          </dd>
        </div>
      </dl>
      {reward.bonus && (
        <p className="results__bonus">
          مكافأة إتمام المهمة لأول مرة بنجاح: +{ar(REWARDS.missionPass.xp)} خبرة و+{ar(REWARDS.missionPass.coins)} عملة
        </p>
      )}
      {!reward.bonus && reward.bonusEarlier && earned && <p className="results__small">مكافأة إتمام هذه المهمة حصلت عليها من قبل.</p>}
      {levelUp && <p className="results__levelup">ارتقيت إلى المستوى {ar(after.level.level)}!</p>}
      <div className="results__level">
        <span className="results__level-label">المستوى الحالي والتقدم نحو المستوى التالي</span>
        <LevelBar info={shown} />
      </div>
      <p className="results__balance">
        رصيدك الآن: <CoinAmount value={after.coins} />
        {onShop && (
          <button type="button" className="results__shop" onClick={onShop}>
            زيارة المتجر
          </button>
        )}
      </p>
      {note && <p className="results__reward-note">{note}</p>}
      {legacy && (
        <p className="results__reward-note">
          أكملت هذه المهمة قبل إضافة نظام المكافآت. لا تُضاف مكافآت عن المحاولات السابقة؛ تبدأ المكافآت من المحاولات الجديدة.
        </p>
      )}
    </section>
  )
}
