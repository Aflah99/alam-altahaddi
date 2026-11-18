/**
 * Reusable world presets. An administrator picks one for each subject in the
 * dashboard; no game-engine code is needed for a new subject. A preset chooses a
 * level layout and a colour treatment (CSS class on the world and map).
 */
export type WorldTheme = 'meadow' | 'forest' | 'desert' | 'castle' | 'future'

export interface ThemePreset {
  id: WorldTheme
  label: string
  levelId: string
}

export const THEMES: readonly ThemePreset[] = [
  { id: 'meadow', label: 'المرج الأخضر', levelId: 'meadow' },
  { id: 'forest', label: 'الغابة', levelId: 'forest' },
  { id: 'desert', label: 'الصحراء', levelId: 'desert' },
  { id: 'castle', label: 'القلعة', levelId: 'castle' },
  { id: 'future', label: 'عالم المستقبل', levelId: 'future' },
]

export function themePreset(id: string | undefined): ThemePreset {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}
