import { useCallback } from 'react'
import { sfx, type SfxName } from './audio/sfx'
import { getCharacter } from './characters/roster'
import { useSettings } from './hooks/useSettings'
import { useHashRoute } from './navigation/useHashRoute'
import { usePlayerProfile } from './player/usePlayerProfile'
import { CharacterSelectScreen } from './screens/CharacterSelectScreen'
import { LobbyScreen } from './screens/LobbyScreen'
import { StartScreen } from './screens/StartScreen'
import { AdventureMapScreen } from './world/AdventureMapScreen'
import { ChapterSelectScreen } from './world/ChapterSelectScreen'
import { WorldScreen } from './world/WorldScreen'
import { LEVELS } from './world/config/levels'
import { findSubject } from './world/config/subjects'

/**
 * Flow: Start → «مغامرة فردية» → character selection → lobby → adventure map
 * → world → portal → chapters. Everything past character selection needs a
 * (local) profile; without one, character selection is shown first.
 */
export function App() {
  const [settings, updateSettings] = useSettings()
  const { route, navigate, back } = useHashRoute()
  const [profile, saveProfile] = usePlayerProfile()

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
  else if ((route.name === 'world' || route.name === 'chapters') && (!subject || !level)) screen = 'map'

  const character = profile ? getCharacter(profile.characterId) : null
  const key = screen === 'world' || screen === 'chapters' ? `${screen}:${subject?.id}` : screen

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
        />
      )}
      {screen === 'lobby' && profile && (
        <LobbyScreen
          profile={profile}
          onChangeCharacter={() => navigate({ name: 'select' })}
          onOpenMap={() => navigate({ name: 'map' })}
          onHome={() => goBack({ name: 'start' })}
          play={play}
          reducedMotion={settings.reducedMotion}
        />
      )}
      {screen === 'map' && character && (
        <AdventureMapScreen
          character={character}
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
          settings={settings}
          onSettingsChange={updateSettings}
          play={play}
          onOpenChapters={() => navigate({ name: 'chapters', subject: subject.id })}
          onMap={() => goBack({ name: 'map' })}
        />
      )}
      {screen === 'chapters' && subject && (
        <ChapterSelectScreen
          subject={subject}
          onBackToWorld={() => goBack({ name: 'world', subject: subject.id })}
          onBackToMap={() => navigate({ name: 'map' })}
        />
      )}
    </div>
  )
}
