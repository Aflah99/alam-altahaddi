import { useState } from 'react'
import { importLegacyProgress } from '../cloud/api'
import { arabicError } from '../cloud/client'
import { CornerButton } from '../components/CornerButton'
import { Sky } from '../components/Sky'
import { PlayArrow } from '../components/sprites'
import { loadWallet, viewOf } from '../economy/wallet'
import { rememberLegacyChoice } from './legacyImport'
import type { LocalPlayerProfile } from '../player/playerProfile'
import { ar } from '../quiz/format'
import { loadProgress } from '../quiz/progress'
import './account.css'

interface LegacyImportScreenProps {
  local: LocalPlayerProfile
  studentId: string
  onDone: () => void
}

/**
 * Moves device-local history into the account as UNVERIFIED historical records.
 * Local coins, XP and items are not transferred: browser data can be edited, so it
 * cannot become trusted currency or leaderboard points. Local data is not deleted.
 */
export function LegacyImportScreen({ local, studentId, onDone }: LegacyImportScreenProps) {
  const progress = loadProgress(local.id)
  const wallet = loadWallet(local.id)
  const view = viewOf(wallet)
  const missions = Object.keys(progress.missions).length
  const questions = Object.keys(progress.questions).length
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const doImport = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await importLegacyProgress({
        source: 'device-local',
        exported_at: new Date().toISOString(),
        device_profile: { nickname: local.nickname, character_id: local.characterId },
        progress,
        // Recorded for reference only; never credited.
        local_wallet: { xp: view.xp, coins: view.coins, items: [...view.owned] },
      })
      rememberLegacyChoice(studentId, 'imported')
      setDone(
        r.already_imported
          ? 'سبق استيراد سجلّ هذا الجهاز إلى حسابك.'
          : `تم حفظ سجلّك القديم (${ar(r.missions)} مهمة و${ar(r.questions)} سؤالًا) بوصفه سجلًّا تاريخيًّا غير موثّق.`,
      )
    } catch (e) {
      setError(arabicError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="acct">
      <Sky />
      <div className="acct__scroll">
        <header className="acct__header">
          <CornerButton icon={<PlayArrow className="icon-back" />} label="لاحقًا" onClick={onDone} />
          <h1 className="acct__title">تقدّمك على هذا الجهاز</h1>
        </header>
        <main className="acct__panel">
          <p className="acct__note">
            وجدنا تقدّمًا محفوظًا على هذا الجهاز فقط باسم «{local.nickname}». هذا السجل لم يكن محفوظًا في حساب، ويمكن تعديله من المتصفح.
          </p>
          <ul className="acct__summary">
            <li>المهمات المكتملة: {ar(missions)}</li>
            <li>الأسئلة المجاب عنها: {ar(questions)}</li>
            <li>
              نقاط وعملات الجهاز: {ar(view.xp)} خبرة و{ar(view.coins)} عملة، و{ar(view.owned.size)} غرضًا
            </li>
          </ul>
          <p className="acct__note">
            <strong>ما الذي يحدث عند الاستيراد؟</strong> يُحفظ سجلّ التعلّم في حسابك بوصفه سجلًّا تاريخيًّا غير موثّق يراه ولي أمرك منفصلًا عن
            النتائج الموثّقة. أمّا العملات ونقاط الخبرة والأغراض المحلية فلا تُنقل؛ لأن الخادم لا يستطيع التحقق منها. أعد حلّ المهمات وأنت مسجّل
            الدخول لتكسبها من جديد بأمان (كل سؤال يمنح مكافأته مرة واحدة في حسابك). لن نحذف بيانات هذا الجهاز.
          </p>
          {error && <p className="acct__error" role="alert">{error}</p>}
          {done ? (
            <>
              <p className="acct__notice" role="status">{done}</p>
              <button type="button" className="pixel-button acct__wide" onClick={onDone}>
                متابعة اللعب
              </button>
            </>
          ) : (
            <>
              <button type="button" className="pixel-button acct__wide" disabled={busy} onClick={() => void doImport()}>
                استيراد السجل بوصفه غير موثّق
              </button>
              <button
                type="button"
                className="pause-menu__item acct__wide"
                disabled={busy}
                onClick={() => {
                  rememberLegacyChoice(studentId, 'skipped')
                  onDone()
                }}
              >
                عدم الاستيراد
              </button>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
