import { useSettings } from './hooks/useSettings'
import { StartScreen } from './screens/StartScreen'

export function App() {
  const [settings, updateSettings] = useSettings()
  return <StartScreen settings={settings} onSettingsChange={updateSettings} />
}
