import { useCallback } from 'react'
import { sfx, type SfxName } from './audio/sfx'
import { getCharacter } from './characters/roster'
import { CATEGORIES, type ShopCategory } from './economy/catalog'
import { useWallet } from './economy/useWallet'
import { LockerScreen } from './shop/LockerScreen'
import { ShopScreen } from './shop/ShopScreen'
import { useSettings } from './hooks/useSettings'
import { useHashRoute } from './navigation/useHashRoute'
import { usePlayerProfile } from './player/usePlayerProfile'
import { CharacterSelectScreen } from './screens/CharacterSelectScreen'
import { LobbyScreen } from './screens/LobbyScreen'
import { StartScreen } from './screens/StartScreen'
import { AdventureMapScreen } from './world/AdventureMapScreen'
import { WorldScreen } from './world/WorldScreen'
import { LessonSelectScreen } from './quiz/LessonSelectScreen'
import { missionId } from './quiz/engine'
import { QuizScreen } from './quiz/QuizScreen'
import { useLearningProgress } from './quiz/useLearningProgress'
import { LEVELS } from './world/config/levels'
import { findSubject } from './world/config/subjects'

/**
 * Flow: Start → «مغامرة فردية» → character selection → lobby → adventure map
 * → world → portal → lessons → quiz arena → results (+ rewards). The lobby also
 * opens the shop and the locker. Everything past character selection needs a
 * (local) profile; without one, character selection is shown first.
 */
export function App() {
  const [settings, updateSettings] = useSettings()
  const { route, navigate, back } = useHashRoute()
  const [profile, saveProfile] = usePlayerProfile()
  const [progress, recordProgress] = useLearningProgress(profile?.id ?? 'no-profile')
  const wallet = useWallet(profile?.id ?? 'no-profile')

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

  const needsProfile = route.name !== 'start' && route.name !== 'select'
  const subject = 'subject' in route ? findSubject(route.subject) : undefined
  const level = subject ? LEVELS[subject.levelId] : undefined

  let screen: string = route.name
  if (needsProfile && !profile) screen = 'select'
  else if ((route.name === 'world' || route.name === 'chapters' || route.name === 'quiz') && (!subject || !level)) screen = 'map'

  const character = profile ? getCharacter(profile.characterId) : null
  const shopCategory: ShopCategory | undefined =
    route.name === 'shop' ? CATEGORIES.find((c) => c.id === route.category)?.id : undefined
  const key =
    route.name === 'quiz' && screen === 'quiz'
      ? `quiz:${route.subject}:${route.lesson}:${route.mission}`
      : screen === 'shop'
        ? `shop:${shopCategory ?? ''}`
        : screen === 'world' || screen === 'chapters'
        ? `${screen}:${subject?.id}`
        : screen

  return (
    <div key={key} className="screen">
      {screen === 'start' && (
        <StartScreen
          settings={settings}
          onSettingsChange={updateSettings}
          onStartSolo={() => navigate({ name: 'select' })}
        />
      )}
      {screen === 'select' && (
        <CharacterSelectScreen
          profile={profile}
          onConfirm={(characterId, nickname) => {
            saveProfile(characterId, nickname)
            if (needsProfile) navigate(route, { replace: true })
            else navigate({ name: 'lobby' })
          }}
          onBack={() => goBack({ name: 'start' })}
          play={play}
          reducedMotion={settings.reducedMotion}
          available={[...wallet.view.unlockedCharacters]}
          outfit={wallet.outfit}
        />
      )}
      {screen === 'lobby' && profile && (
        <LobbyScreen
          profile={profile}
          view={wallet.view}
          outfit={wallet.outfit}
          onChangeCharacter={() => navigate({ name: 'select' })}
          onOpenMap={() => navigate({ name: 'map' })}
          onOpenShop={() => navigate({ name: 'shop' })}
          onOpenLocker={() => navigate({ name: 'locker' })}
          onHome={() => goBack({ name: 'start' })}
          play={play}
          reducedMotion={settings.reducedMotion}
        />
      )}
      {screen === 'shop' && profile && character && (
        <ShopScreen
          character={character}
          view={wallet.view}
          outfit={wallet.outfit}
          initialCategory={shopCategory}
          onPurchase={wallet.purchase}
          onLocker={() => navigate({ name: 'locker' })}
          onBack={() => goBack({ name: 'lobby' })}
          play={play}
          reducedMotion={settings.reducedMotion}
        />
      )}
      {screen === 'locker' && profile && character && (
        <LockerScreen
          character={character}
          nickname={profile.nickname}
          view={wallet.view}
          equipped={wallet.wallet.equipped}
          outfit={wallet.outfit}
          onEquip={wallet.equip}
          onUnequip={wallet.unequip}
          onSelectCharacter={(id) => saveProfile(id, profile.nickname)}
          onShop={(category) => navigate({ name: 'shop', category })}
          onBack={() => goBack({ name: 'lobby' })}
          play={play}
        />
      )}
      {screen === 'map' && character && (
        <AdventureMapScreen
          character={character}
          outfit={wallet.outfit}
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
          outfit={wallet.outfit}
          settings={settings}
          onSettingsChange={updateSettings}
          play={play}
          onOpenChapters={() => navigate({ name: 'chapters', subject: subject.id })}
          onMap={() => goBack({ name: 'map' })}
        />
      )}
      {screen === 'chapters' && subject && (
        <LessonSelectScreen
          subject={subject}
          progress={progress}
          onStartMission={(lesson, mission) => {
            play('confirm')
            navigate({ name: 'quiz', subject: subject.id, lesson, mission })
          }}
          onBackToWorld={() => goBack({ name: 'world', subject: subject.id })}
        />
      )}
      {screen === 'quiz' && route.name === 'quiz' && subject && character && (
        <QuizScreen
          subject={subject}
          lessonId={route.lesson}
          missionNumber={route.mission}
          character={character}
          outfit={wallet.outfit}
          reducedMotion={settings.reducedMotion}
          play={play}
          onRecord={recordProgress}
          onReward={(mission, summary) => wallet.awardMissionRewards(subject.bankId, mission, summary)}
          previousCompletions={progress.missions[missionId(route.lesson, route.mission)]?.timesCompleted ?? 0}
          onShop={() => navigate({ name: 'shop' })}
          onLessons={() => goBack({ name: 'chapters', subject: subject.id })}
          onWorld={() => navigate({ name: 'world', subject: subject.id })}
        />
      )}
    </div>
  )
}
