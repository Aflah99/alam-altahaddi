import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AccountScreen } from './account/AccountScreen'
import { shouldOfferLegacyImport } from './account/legacyImport'
import { LegacyImportScreen } from './account/LegacyImportScreen'
import { installAudio } from './audio/engine'
import { playMusic, type TrackId } from './audio/music'
import { playSfx, type SfxName } from './audio/sfx'
import { AudioButton } from './components/AudioButton'
import { isCharacterId, ROSTER } from './characters/roster'
import * as api from './cloud/api'
import { useAuth } from './cloud/auth'
import { CloudQuizScreen } from './cloud/CloudQuizScreen'
import { useCloudGame } from './cloud/useCloudGame'
import { Sky } from './components/Sky'
import { CATEGORIES, type ShopCategory } from './economy/catalog'
import { sanitizeSettings, useSettings, type Settings } from './hooks/useSettings'
import { useHashRoute, type Route } from './navigation/useHashRoute'
import type { PlayerIdentity } from './player/playerProfile'
import { usePlayerProfile } from './player/usePlayerProfile'
import { LessonSelectScreen } from './quiz/LessonSelectScreen'
import { treeFromCatalog } from './quiz/lessonTree'
import { AvatarEditorScreen } from './screens/AvatarEditorScreen'
import { LobbyScreen } from './screens/LobbyScreen'
import { LockerScreen } from './shop/LockerScreen'
import { ShopScreen } from './shop/ShopScreen'
import { AdventureMapScreen } from './world/AdventureMapScreen'
import { LEVELS } from './world/config/levels'
import { subjectFromCatalog, type SubjectView } from './world/config/subjects'
import { WorldScreen } from './world/WorldScreen'

// The parent and admin areas are separate bundles: students never download them.
const ParentApp = lazy(() => import('./parent/ParentApp'))
const AdminApp = lazy(() => import('./admin/AdminApp'))
const GroupsScreen = lazy(() => import('./groups/StudentGroupsScreen'))
const DiscoverScreen = lazy(() => import('./community/DiscoverScreen'))
const RoomsHub = lazy(() => import('./multiplayer/RoomsHub').then((m) => ({ default: m.RoomsHub })))
const RoomScreen = lazy(() => import('./multiplayer/RoomScreen').then((m) => ({ default: m.RoomScreen })))

installAudio()

/**
 * Everyone signs in first. The sign-in page is the first screen; there is no guest mode.
 *  - Students play: content, answers, rewards, purchases and equipment are validated by the server.
 *  - Parents use #/parent, administrators #/admin. Each role is sent to its own area, and the
 *    database (RLS + role checks in every function) enforces the same rules.
 */
export function App() {
  const [settings, updateSettings] = useSettings()
  const { route, navigate, back } = useHashRoute()
  const auth = useAuth()
  const st = auth.state
  const signedIn = st.status === 'signed-in' ? st : null
  const role = signedIn?.role ?? null

  usePreferenceSync(signedIn?.userId ?? null, settings, updateSettings)
  const joinCode = route.name === 'joincourse' ? route.code : ''

  // Signed-in adults are kept inside their own area.
  useEffect(() => {
    if (!signedIn || signedIn.recovery || !role) return
    if (role === 'parent' && route.name === 'joincourse') navigate({ name: 'parent', path: ['courses', 'join', joinCode] }, { replace: true })
    else if (role === 'parent' && route.name !== 'parent' && route.name !== 'account') navigate({ name: 'parent', path: [] }, { replace: true })
    if (role === 'admin' && route.name !== 'admin' && route.name !== 'account') navigate({ name: 'admin', path: [] }, { replace: true })
  }, [signedIn, role, route.name, joinCode, navigate])

  const afterSignIn = useCallback(
    (r: string | null) => {
      if (r === 'parent') navigate({ name: 'parent', path: [] }, { replace: true })
      else if (r === 'admin') navigate({ name: 'admin', path: [] }, { replace: true })
      else if (r === 'student') navigate(route.name === 'start' || route.name === 'account' ? { name: 'lobby' } : route, { replace: true })
    },
    [navigate, route],
  )

  let content
  let track: TrackId | null = null
  if (st.status === 'loading') {
    content = <Waiting text="جارٍ التحقّق من الجلسة…" />
    track = 'login'
  } else if (st.status === 'disabled' || st.status === 'signed-out' || (signedIn && signedIn.recovery)) {
    // Every route, including direct links into the game, lands on the sign-in page.
    content = <AccountScreen onSignedIn={afterSignIn} />
    track = 'login'
  } else if (signedIn && !role) {
    content = (
      <Waiting text="جارٍ تحميل حسابك…" actionLabel="تسجيل الخروج" onAction={() => void auth.signOut()} />
    )
  } else if (route.name === 'account') {
    content = <AccountScreen onBack={() => back(role === 'student' ? { name: 'lobby' } : role === 'admin' ? { name: 'admin', path: [] } : { name: 'parent', path: [] })} onSignedIn={afterSignIn} />
    track = 'login'
  } else if (role === 'parent' || role === 'admin') {
    content =
      route.name === role ? (
        <Suspense fallback={<Waiting text="جارٍ التحميل…" />}>
          {role === 'parent' ? (
            <ParentApp path={route.path} navigate={(path) => navigate({ name: 'parent', path })} onExit={() => navigate({ name: 'account' })} />
          ) : (
            <AdminApp path={route.path} navigate={(path) => navigate({ name: 'admin', path })} onExit={() => navigate({ name: 'account' })} />
          )}
        </Suspense>
      ) : (
        <Waiting text="جارٍ التحميل…" />
      )
  } else {
    content = <StudentGame route={route} navigate={navigate} back={back} settings={settings} updateSettings={updateSettings} />
  }

  // Student screens pick their own music inside StudentGame.
  useEffect(() => {
    if (role !== 'student' || route.name === 'account') playMusic(track)
  }, [role, track, route.name])

  return (
    <>
      {content}
      <AudioButton settings={settings} onChange={updateSettings} />
    </>
  )
}

type Navigate = ReturnType<typeof useHashRoute>['navigate']
type Back = ReturnType<typeof useHashRoute>['back']

const MUSIC: Partial<Record<string, TrackId>> = {
  loading: 'lobby',
  select: 'avatar',
  lobby: 'lobby',
  map: 'adventure',
  world: 'adventure',
  chapters: 'quiz',
  quiz: 'quiz',
  shop: 'shop',
  locker: 'shop',
  groups: 'lobby',
  rooms: 'room',
  discover: 'lobby',
  joincourse: 'lobby',
  import: 'lobby',
}

/** The game for a signed-in student. */
function StudentGame({
  route,
  navigate,
  back,
  settings,
  updateSettings,
}: {
  route: Route
  navigate: Navigate
  back: Back
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
}) {
  const [localProfile] = usePlayerProfile()
  const cloud = useCloudGame(true)
  const [override, setOverride] = useState<{ screen: string; track: TrackId } | null>(null)

  const play = useCallback((name: SfxName) => playSfx(name), [])
  // The site root (or an adult-only link) opens the lobby for students.
  useEffect(() => {
    if (route.name === 'start' || route.name === 'parent' || route.name === 'admin') navigate({ name: 'lobby' }, { replace: true })
  }, [route.name, navigate])
  const goBack = useCallback<Back>(
    (to) => {
      play('back')
      back(to)
    },
    [back, play],
  )

  const identity: PlayerIdentity | null = cloud.state
    ? { id: cloud.state.student_id, nickname: cloud.state.nickname, characterId: isCharacterId(cloud.state.character_id) ? cloud.state.character_id : 'human-boy' }
    : null
  const view = cloud.view
  const outfit = cloud.outfit
  // Official subjects first and unchanged; enrolled community courses follow and are labelled as such.
  const fullCatalog = useMemo(() => [...(cloud.catalog ?? []), ...cloud.community.filter((c) => !(cloud.catalog ?? []).some((o) => o.id === c.id))], [cloud.catalog, cloud.community])
  const subjects: readonly SubjectView[] = useMemo(() => fullCatalog.map(subjectFromCatalog), [fullCatalog])

  const gameRoutes = ['start', 'lobby', 'map', 'world', 'chapters', 'quiz', 'shop', 'locker', 'select', 'groups', 'import', 'rooms', 'room', 'join', 'discover', 'joincourse']
  const subject = 'subject' in route ? subjects.find((s) => s.id === route.subject) : undefined
  const level = subject ? LEVELS[subject.levelId] : undefined

  let screen: string = route.name === 'start' || !gameRoutes.includes(route.name) ? 'lobby' : route.name
  if (!cloud.state || !view) screen = cloud.stateError ? 'cloud-error' : 'loading'
  else if ((screen === 'world' || screen === 'chapters' || screen === 'quiz') && (!subject || !level)) screen = !cloud.catalog ? 'loading' : 'map'
  if (screen === 'lobby' && cloud.state && shouldOfferLegacyImport(localProfile, cloud.state.student_id, cloud.state.legacy_imported)) screen = 'import'

  const [roomMusic, setRoomMusic] = useState<TrackId>('room')
  const musicOverride = override?.screen === screen ? override.track : screen === 'room' ? roomMusic : null
  useEffect(() => {
    playMusic(musicOverride ?? MUSIC[screen] ?? 'lobby')
  }, [screen, musicOverride])

  const character = cloud.character
  const shopCategory: ShopCategory | undefined = route.name === 'shop' ? CATEGORIES.find((c) => c.id === route.category)?.id : undefined
  const key =
    route.name === 'quiz' && screen === 'quiz'
      ? `quiz:${route.subject}:${route.lesson}:${route.mission}`
      : screen === 'shop'
        ? `shop:${shopCategory ?? ''}`
        : screen === 'world' || screen === 'chapters'
          ? `${screen}:${subject?.id}`
          : screen

  const cloudSubject = subject?.cloudId ? fullCatalog.find((c) => c.id === subject.cloudId) : undefined

  return (
    <div key={key} className="screen">
      {screen === 'loading' && <Waiting text="جارٍ تحميل تقدّمك…" />}
      {screen === 'cloud-error' && (
        <Waiting text={cloud.stateError ?? 'تعذّر الاتصال.'} actionLabel="إعادة المحاولة" onAction={() => void cloud.reloadState()} />
      )}
      {screen === 'import' && cloud.state && localProfile && (
        <LegacyImportScreen
          local={localProfile}
          studentId={cloud.state.student_id}
          onDone={() => {
            void cloud.reloadState()
            navigate({ name: 'lobby' }, { replace: true })
          }}
        />
      )}
      {(screen === 'rooms' || screen === 'join') && view && (
        <Suspense fallback={<Waiting text="جارٍ التحميل…" />}>
          <RoomsHub
            subjects={cloud.catalog ?? []}
            community={cloud.community}
            allowed={view.controls.multiplayer_allowed}
            inviteCode={route.name === 'join' ? route.code : undefined}
            onEnter={(id) => navigate({ name: 'room', id }, { replace: true })}
            onBack={() => goBack({ name: 'lobby' })}
            play={play}
          />
        </Suspense>
      )}
      {screen === 'room' && route.name === 'room' && (
        <Suspense fallback={<Waiting text="جارٍ التحميل…" />}>
          <RoomScreen
            roomId={route.id}
            subjects={cloud.catalog ?? []}
            onLeave={() => {
              void cloud.reloadState()
              navigate({ name: 'rooms' }, { replace: true })
            }}
            play={play}
            setMusic={setRoomMusic}
          />
        </Suspense>
      )}
      {(screen === 'discover' || screen === 'joincourse') && (
        <Suspense fallback={<Waiting text="جارٍ التحميل…" />}>
          <DiscoverScreen
            initialCode={route.name === 'joincourse' ? route.code : undefined}
            onBack={() => goBack({ name: 'lobby' })}
            onPlay={(slug) => navigate({ name: 'world', subject: slug })}
            onChanged={() => void cloud.reloadCommunity()}
            play={play}
          />
        </Suspense>
      )}
      {screen === 'groups' && (
        <Suspense fallback={<Waiting text="جارٍ التحميل…" />}>
          <GroupsScreen onBack={() => goBack({ name: 'lobby' })} />
        </Suspense>
      )}
      {screen === 'select' && identity && cloud.state && (
        <AvatarEditorScreen
          nickname={identity.nickname}
          characterId={identity.characterId}
          appearance={cloud.state.appearance}
          outfit={outfit}
          ownedCreatures={ROSTER.filter((c) => view?.unlockedCharacters.has(c.id)).map((c) => c.id)}
          onSave={({ appearance, creature, nickname }) => {
            void (async () => {
              if (nickname !== identity.nickname) await cloud.setNickname(nickname).catch(() => {})
              if (appearance) await cloud.setAppearance({ ...appearance }).catch(() => {})
              else if (creature) await cloud.setCharacter(creature).catch(() => {})
            })()
            navigate({ name: 'lobby' })
          }}
          onBack={() => goBack({ name: 'lobby' })}
          play={play}
        />
      )}
      {screen === 'lobby' && identity && view && (
        <LobbyScreen
          profile={identity}
          character={character!}
          view={view}
          outfit={outfit}
          storageNote="حساب طالب · تقدّمك محفوظ في حسابك"
          onChangeCharacter={() => navigate({ name: 'select' })}
          onOpenMap={() => navigate({ name: 'map' })}
          onOpenRooms={() => navigate({ name: 'rooms' })}
          onOpenDiscover={() => navigate({ name: 'discover' })}
          onOpenShop={() => navigate({ name: 'shop' })}
          onOpenLocker={() => navigate({ name: 'locker' })}
          onOpenBoard={() => navigate({ name: 'groups' })}
          onAccount={() => navigate({ name: 'account' })}
          onHome={() => navigate({ name: 'account' })}
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
          onPurchase={cloud.purchase}
          onChanged={() => void cloud.reloadState()}
          onLocker={() => navigate({ name: 'locker' })}
          onBack={() => goBack({ name: 'lobby' })}
          play={play}
          reducedMotion={settings.reducedMotion}
        />
      )}
      {screen === 'locker' && identity && character && view && (
        <LockerScreen
          character={character}
          characterId={identity.characterId}
          nickname={identity.nickname}
          view={view}
          equipped={cloud.equipped}
          outfit={outfit}
          onEquip={(id) => void cloud.equip(id)}
          onUnequip={(slot) => void cloud.unequip(slot)}
          onSelectCharacter={(id) => void cloud.setCharacter(id)}
          onEditAvatar={() => navigate({ name: 'select' })}
          onUpgrade={cloud.upgrade}
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
          loading={!cloud.catalog}
          error={cloud.catalogError}
          onRetry={() => void cloud.reloadCatalog(true)}
          onEnter={(id) => {
            play('portal')
            navigate({ name: 'world', subject: id })
          }}
          onDiscover={() => navigate({ name: 'discover' })}
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
      {screen === 'chapters' && subject && (
        <LessonSelectScreen
          subjectTitle={subject.title}
          units={cloudSubject ? treeFromCatalog(cloudSubject, cloud.state?.mission_best ?? {}) : null}
          error={!!cloud.catalogError && !cloud.catalog}
          lastLessonId={null}
          sourceNote={subject.community ? `مادة مجتمعية أنشأها ${subject.creator ?? 'ولي أمر'}، ولم تُراجع أكاديميًا من المنصة. مكافآتها محدودة يوميًا ويتحقق منها الخادم.` : `الأسئلة من «${cloudSubject?.source_label || subject.title}». تقدّمك ومكافآتك محفوظة في حسابك ويتحقق منها الخادم.`}
          onRetry={() => void cloud.reloadCatalog(true)}
          onStartMission={(lesson, mission) => {
            play('missionStart')
            navigate({ name: 'quiz', subject: subject.id, lesson, mission })
          }}
          onBackToWorld={() => goBack({ name: 'world', subject: subject.id })}
        />
      )}
      {screen === 'quiz' && route.name === 'quiz' && subject && character && cloudSubject && (
        <CloudQuizScreen
          subject={cloudSubject}
          lessonId={route.lesson}
          missionNumber={route.mission}
          character={character}
          outfit={outfit}
          reducedMotion={settings.reducedMotion}
          play={play}
          onResults={() => setOverride({ screen, track: 'victory' })}
          onFinished={() => void cloud.reloadState()}
          onShop={() => navigate({ name: 'shop' })}
          onLessons={() => goBack({ name: 'chapters', subject: subject.id })}
          onWorld={() => navigate({ name: 'world', subject: subject.id })}
        />
      )}
    </div>
  )
}

/** Loads the account's saved settings once after sign-in, then saves changes (debounced). */
function usePreferenceSync(userId: string | null, settings: Settings, update: (p: Partial<Settings>) => void) {
  const loadedFor = useRef<string | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!userId) {
      loadedFor.current = null
      return
    }
    if (loadedFor.current === userId) return
    loadedFor.current = userId
    let alive = true
    api
      .getMyPreferences()
      .then((p) => {
        if (!alive) return
        if (p && Object.keys(p).length > 0) update(sanitizeSettings(p, settings))
        setReady(true)
      })
      .catch(() => alive && setReady(true))
    return () => {
      alive = false
    }
    // settings is only the fallback for missing keys
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, update])
  useEffect(() => {
    if (!userId || !ready) return
    const t = window.setTimeout(() => void api.saveMyPreferences({ ...settings }).catch(() => {}), 1200)
    return () => window.clearTimeout(t)
  }, [userId, ready, settings])
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
