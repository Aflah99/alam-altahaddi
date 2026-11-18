import { lazy, Suspense, useCallback, useMemo } from 'react'
import { AccountScreen } from './account/AccountScreen'
import { shouldOfferLegacyImport } from './account/legacyImport'
import { LegacyImportScreen } from './account/LegacyImportScreen'
import { sfx, type SfxName } from './audio/sfx'
import { getCharacter, isCharacterId } from './characters/roster'
import { useAuth } from './cloud/auth'
import { cloudEnabled } from './cloud/config'
import { CloudQuizScreen } from './cloud/CloudQuizScreen'
import { useCloudGame } from './cloud/useCloudGame'
import { Sky } from './components/Sky'
import { CATEGORIES, type ShopCategory } from './economy/catalog'
import { useWallet } from './economy/useWallet'
import { useSettings } from './hooks/useSettings'
import { useHashRoute } from './navigation/useHashRoute'
import type { PlayerIdentity } from './player/playerProfile'
import { usePlayerProfile } from './player/usePlayerProfile'
import { missionId } from './quiz/engine'
import { LessonSelectScreen } from './quiz/LessonSelectScreen'
import { treeFromBank, treeFromCatalog } from './quiz/lessonTree'
import { QuizScreen } from './quiz/QuizScreen'
import { useLearningProgress } from './quiz/useLearningProgress'
import { useQuestionBank } from './quiz/useQuestionBank'
import type { LearningProgress } from './quiz/progress'
import { CharacterSelectScreen } from './screens/CharacterSelectScreen'
import { LobbyScreen } from './screens/LobbyScreen'
import { StartScreen } from './screens/StartScreen'
import { LockerScreen } from './shop/LockerScreen'
import { ShopScreen } from './shop/ShopScreen'
import { AdventureMapScreen } from './world/AdventureMapScreen'
import { LEVELS } from './world/config/levels'
import { LOCAL_SUBJECTS, subjectFromCatalog, type SubjectView } from './world/config/subjects'
import { WorldScreen } from './world/WorldScreen'

// The parent and admin areas are separate bundles: the game never downloads them.
const ParentApp = lazy(() => import('./parent/ParentApp'))
const AdminApp = lazy(() => import('./admin/AdminApp'))
const GroupsScreen = lazy(() => import('./groups/StudentGroupsScreen'))

/**
 * Two ways to play:
 *  - Guest (no account, or cloud not configured): everything stays on this device, as in Tasks 02–06.
 *  - Signed-in student: content comes from the database and every answer, reward,
 *    purchase and piece of equipment is validated by the server.
 * Parents and administrators use their own areas (#/parent, #/admin).
 */
export function App() {
  const [settings, updateSettings] = useSettings()
  const { route, navigate, back } = useHashRoute()
  const auth = useAuth()
  const signedIn = auth.state.status === 'signed-in' ? auth.state : null
  const isStudent = signedIn?.role === 'student'

  const [localProfile, saveLocalProfile] = usePlayerProfile()
  const [progress, recordProgress] = useLearningProgress(localProfile?.id ?? 'no-profile')
  const localWallet = useWallet(localProfile?.id ?? 'no-profile')
  const cloud = useCloudGame(isStudent)

  const play = useCallback(
    (name: SfxName) => {
      if (settings.sound) sfx[name]()
    },
    [settings.sound],
  )
  const goBack = useCallback<typeof back>(
    (to) => {
      play('back')
      back(to)
    },
    [back, play],
  )

  // ---- who is playing
  const identity: PlayerIdentity | null = isStudent
    ? cloud.state
      ? { id: cloud.state.student_id, nickname: cloud.state.nickname, characterId: isCharacterId(cloud.state.character_id) ? cloud.state.character_id : 'green-slime' }
      : null
    : localProfile
  const view = isStudent ? cloud.view : localWallet.view
  const outfit = isStudent ? cloud.outfit : localWallet.outfit
  const equipped = isStudent ? cloud.equipped : localWallet.wallet.equipped
  const subjects: readonly SubjectView[] = useMemo(
    () => (isStudent ? (cloud.catalog ?? []).map(subjectFromCatalog) : LOCAL_SUBJECTS),
    [isStudent, cloud.catalog],
  )

  const afterSignIn = (role: string | null) => {
    if (role === 'parent') navigate({ name: 'parent', path: [] })
    else if (role === 'admin') navigate({ name: 'admin', path: [] })
    else if (role === 'student') navigate({ name: 'lobby' })
  }

  // ---- screen selection
  const gameRoutes = ['lobby', 'map', 'world', 'chapters', 'quiz', 'shop', 'locker']
  const subject = 'subject' in route ? subjects.find((s) => s.id === route.subject) : undefined
  const level = subject ? LEVELS[subject.levelId] : undefined

  let screen: string = route.name
  if (gameRoutes.includes(route.name) || route.name === 'select') {
    if (isStudent && (!cloud.state || !view)) screen = cloud.stateError ? 'cloud-error' : 'loading'
    else if (gameRoutes.includes(route.name) && !identity) screen = 'select'
    else if ((route.name === 'world' || route.name === 'chapters' || route.name === 'quiz') && (!subject || !level))
      screen = isStudent && !cloud.catalog ? 'loading' : 'map'
  }
  if (screen === 'lobby' && isStudent && cloud.state && shouldOfferLegacyImport(localProfile, cloud.state.student_id, cloud.state.legacy_imported)) {
    screen = 'import'
  }

  const character = identity ? getCharacter(identity.characterId) : null
  const shopCategory: ShopCategory | undefined = route.name === 'shop' ? CATEGORIES.find((c) => c.id === route.category)?.id : undefined
  const key =
    route.name === 'quiz' && screen === 'quiz'
      ? `quiz:${route.subject}:${route.lesson}:${route.mission}`
      : screen === 'shop'
        ? `shop:${shopCategory ?? ''}`
        : screen === 'world' || screen === 'chapters'
          ? `${screen}:${subject?.id}`
          : screen

  const cloudSubject = isStudent && subject?.cloudId ? cloud.catalog?.find((c) => c.id === subject.cloudId) : undefined

  return (
    <div key={key} className="screen">
      {screen === 'loading' && <Waiting text="جارٍ تحميل تقدّمك…" />}
      {screen === 'cloud-error' && (
        <Waiting text={cloud.stateError ?? 'تعذّر الاتصال.'} actionLabel="إعادة المحاولة" onAction={() => void cloud.reloadState()} />
      )}
      {screen === 'start' && (
        <StartScreen
          settings={settings}
          onSettingsChange={updateSettings}
          onStartSolo={() => navigate(isStudent ? { name: 'lobby' } : cloudEnabled ? { name: 'account' } : { name: 'select' })}
          onParent={cloudEnabled ? () => navigate(signedIn && signedIn.role !== 'student' ? { name: 'parent', path: [] } : { name: 'account' }) : undefined}
        />
      )}
      {screen === 'account' && (
        <AccountScreen onGuest={() => navigate({ name: 'select' })} onBack={() => goBack({ name: 'start' })} onSignedIn={afterSignIn} />
      )}
      {screen === 'import' && isStudent && cloud.state && localProfile && (
        <LegacyImportScreen
          local={localProfile}
          studentId={cloud.state.student_id}
          onDone={() => {
            void cloud.reloadState()
            navigate({ name: 'lobby' }, { replace: true })
          }}
        />
      )}
      {(screen === 'parent' || screen === 'admin') && route.name === screen && (
        <Suspense fallback={<Waiting text="جارٍ التحميل…" />}>
          {screen === 'parent' ? (
            <ParentApp path={route.path} navigate={(path) => navigate({ name: 'parent', path })} onExit={() => navigate({ name: 'start' })} />
          ) : (
            <AdminApp path={route.path} navigate={(path) => navigate({ name: 'admin', path })} onExit={() => navigate({ name: 'start' })} />
          )}
        </Suspense>
      )}
      {screen === 'groups' &&
        (isStudent ? (
          <Suspense fallback={<Waiting text="جارٍ التحميل…" />}>
            <GroupsScreen onBack={() => goBack({ name: 'lobby' })} />
          </Suspense>
        ) : auth.state.status === 'loading' || (signedIn && !signedIn.role) ? (
          <Waiting text="جارٍ التحميل…" />
        ) : (
          <Waiting
            text="لوحة الأبطال متاحة للطلاب بعد تسجيل الدخول بحساب أنشأه ولي الأمر."
            actionLabel={signedIn ? 'العودة' : 'تسجيل الدخول'}
            onAction={() => navigate(signedIn ? { name: 'start' } : { name: 'account' })}
          />
        ))}
      {screen === 'select' && (
        <CharacterSelectScreen
          profile={identity}
          onConfirm={(characterId, nickname) => {
            if (isStudent) {
              void (async () => {
                if (nickname !== identity?.nickname) await cloud.setNickname(nickname).catch(() => {})
                await cloud.setCharacter(characterId)
              })()
            } else {
              saveLocalProfile(characterId, nickname)
            }
            if (gameRoutes.includes(route.name)) navigate(route, { replace: true })
            else navigate({ name: 'lobby' })
          }}
          onBack={() => goBack({ name: 'start' })}
          play={play}
          reducedMotion={settings.reducedMotion}
          available={[...(view?.unlockedCharacters ?? [])]}
          outfit={outfit}
        />
      )}
      {screen === 'lobby' && identity && view && (
        <LobbyScreen
          profile={identity}
          view={view}
          outfit={outfit}
          storageNote={isStudent ? 'حساب طالب · تقدّمك محفوظ في حسابك' : undefined}
          onChangeCharacter={() => navigate({ name: 'select' })}
          onOpenMap={() => navigate({ name: 'map' })}
          onOpenShop={() => navigate({ name: 'shop' })}
          onOpenLocker={() => navigate({ name: 'locker' })}
          onOpenBoard={isStudent ? () => navigate({ name: 'groups' }) : undefined}
          onAccount={cloudEnabled ? () => navigate({ name: 'account' }) : undefined}
          onHome={() => goBack({ name: 'start' })}
          play={play}
          reducedMotion={settings.reducedMotion}
        />
      )}
      {screen === 'shop' && identity && character && view && (
        <ShopScreen
          character={character}
          view={view}
          outfit={outfit}
          initialCategory={shopCategory}
          onPurchase={isStudent ? cloud.purchase : localWallet.purchase}
          onLocker={() => navigate({ name: 'locker' })}
          onBack={() => goBack({ name: 'lobby' })}
          play={play}
          reducedMotion={settings.reducedMotion}
        />
      )}
      {screen === 'locker' && identity && character && view && (
        <LockerScreen
          character={character}
          nickname={identity.nickname}
          view={view}
          equipped={equipped}
          outfit={outfit}
          onEquip={(id) => (isStudent ? void cloud.equip(id) : localWallet.equip(id))}
          onUnequip={(slot) => (isStudent ? void cloud.unequip(slot) : localWallet.unequip(slot))}
          onSelectCharacter={(id) => (isStudent ? void cloud.setCharacter(id) : saveLocalProfile(id, identity.nickname))}
          onShop={(category) => navigate({ name: 'shop', category })}
          onBack={() => goBack({ name: 'lobby' })}
          play={play}
        />
      )}
      {screen === 'map' && character && (
        <AdventureMapScreen
          character={character}
          outfit={outfit}
          subjects={subjects}
          loading={isStudent && !cloud.catalog}
          error={isStudent ? cloud.catalogError : null}
          onRetry={() => void cloud.reloadCatalog(true)}
          onEnter={(id) => {
            play('confirm')
            navigate({ name: 'world', subject: id })
          }}
          onBack={() => goBack({ name: 'lobby' })}
        />
      )}
      {screen === 'world' && character && subject && level && (
        <WorldScreen
          subject={subject}
          level={level}
          character={character}
          outfit={outfit}
          settings={settings}
          onSettingsChange={updateSettings}
          play={play}
          onOpenChapters={() => navigate({ name: 'chapters', subject: subject.id })}
          onMap={() => goBack({ name: 'map' })}
        />
      )}
      {screen === 'chapters' && subject &&
        (isStudent ? (
          <LessonSelectScreen
            subjectTitle={subject.title}
            units={cloudSubject ? treeFromCatalog(cloudSubject, missionBestById(cloud.state?.mission_best)) : null}
            error={!!cloud.catalogError && !cloud.catalog}
            lastLessonId={null}
            sourceNote={`الأسئلة من «${cloudSubject?.source_label || subject.title}». تقدّمك ومكافآتك محفوظة في حسابك ويتحقق منها الخادم.`}
            onRetry={() => void cloud.reloadCatalog(true)}
            onStartMission={(lesson, mission) => {
              play('confirm')
              navigate({ name: 'quiz', subject: subject.id, lesson, mission })
            }}
            onBackToWorld={() => goBack({ name: 'world', subject: subject.id })}
          />
        ) : (
          <LocalLessons
            subject={subject}
            progress={progress}
            onStartMission={(lesson, mission) => {
              play('confirm')
              navigate({ name: 'quiz', subject: subject.id, lesson, mission })
            }}
            onBackToWorld={() => goBack({ name: 'world', subject: subject.id })}
          />
        ))}
      {screen === 'quiz' && route.name === 'quiz' && subject && character && isStudent && cloudSubject && (
        <CloudQuizScreen
          subject={cloudSubject}
          lessonId={route.lesson}
          missionNumber={route.mission}
          character={character}
          outfit={outfit}
          reducedMotion={settings.reducedMotion}
          play={play}
          onFinished={() => void cloud.reloadState()}
          onShop={() => navigate({ name: 'shop' })}
          onLessons={() => goBack({ name: 'chapters', subject: subject.id })}
          onWorld={() => navigate({ name: 'world', subject: subject.id })}
        />
      )}
      {screen === 'quiz' && route.name === 'quiz' && subject && character && !isStudent && (
        <QuizScreen
          subject={subject}
          lessonId={route.lesson}
          missionNumber={route.mission}
          character={character}
          outfit={outfit}
          reducedMotion={settings.reducedMotion}
          play={play}
          onRecord={recordProgress}
          onReward={(mission, summary) => localWallet.awardMissionRewards(subject.bankId ?? subject.id, mission, summary)}
          previousCompletions={progress.missions[missionId(route.lesson, route.mission)]?.timesCompleted ?? 0}
          onShop={() => navigate({ name: 'shop' })}
          onLessons={() => goBack({ name: 'chapters', subject: subject.id })}
          onWorld={() => navigate({ name: 'world', subject: subject.id })}
        />
      )}
    </div>
  )
}

function missionBestById(best: Record<string, number> | undefined): Record<string, number> {
  return best ?? {}
}

/** Guest mode: lessons from the bundled question bank, progress on this device. */
function LocalLessons({
  subject,
  progress,
  onStartMission,
  onBackToWorld,
}: {
  subject: SubjectView
  progress: LearningProgress
  onStartMission: (lesson: string, mission: number) => void
  onBackToWorld: () => void
}) {
  const { bank, error } = useQuestionBank(subject.bankId ?? '')
  const units = useMemo(() => (bank ? treeFromBank(bank, progress) : null), [bank, progress])
  return (
    <LessonSelectScreen
      subjectTitle={subject.title}
      units={units}
      error={error}
      lastLessonId={progress.lastLessonId}
      sourceNote="الأسئلة مأخوذة من كتيّب «زاد الطالب» للصف الثامن. يُحفظ تقدّمك على هذا الجهاز فقط."
      onStartMission={onStartMission}
      onBackToWorld={onBackToWorld}
    />
  )
}

function Waiting({ text, actionLabel, onAction }: { text: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="waiting">
      <Sky />
      <div className="waiting__box" role="status">
        <p>{text}</p>
        {actionLabel && onAction && (
          <button type="button" className="pixel-button" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}
