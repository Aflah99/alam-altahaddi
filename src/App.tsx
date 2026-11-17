import { useCallback } from 'react'
import { sfx, type SfxName } from './audio/sfx'
import { useSettings } from './hooks/useSettings'
import { useHashRoute } from './navigation/useHashRoute'
import { usePlayerProfile } from './player/usePlayerProfile'
import { CharacterSelectScreen } from './screens/CharacterSelectScreen'
import { LobbyScreen } from './screens/LobbyScreen'
import { StartScreen } from './screens/StartScreen'

/**
 * Flow: Start → «مغامرة فردية» → character selection → player lobby.
 * The lobby needs a (local) profile; without one it shows character selection.
 */
export function App() {
  const [settings, updateSettings] = useSettings()
  const [route, navigate] = useHashRoute()
  const [profile, saveProfile] = usePlayerProfile()

  const play = useCallback(
    (name: SfxName) => {
      if (settings.sound) sfx[name]()
    },
    [settings.sound],
  )

  const goStart = useCallback(() => navigate('start'), [navigate])
  const screen = route === 'lobby' && !profile ? 'select' : route

  return (
    <div key={screen} className="screen">
      {screen === 'start' && (
        <StartScreen settings={settings} onSettingsChange={updateSettings} onStartSolo={() => navigate('select')} />
      )}
      {screen === 'select' && (
        <CharacterSelectScreen
          profile={profile}
          onConfirm={(characterId, nickname) => {
            saveProfile(characterId, nickname)
            navigate('lobby', { replace: route === 'lobby' })
          }}
          onBack={() => {
            play('back')
            goStart()
          }}
          play={play}
          reducedMotion={settings.reducedMotion}
        />
      )}
      {screen === 'lobby' && profile && (
        <LobbyScreen
          profile={profile}
          onChangeCharacter={() => navigate('select')}
          onHome={() => {
            play('back')
            goStart()
          }}
          play={play}
          reducedMotion={settings.reducedMotion}
        />
      )}
    </div>
  )
}
