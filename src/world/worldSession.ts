/**
 * Remembers where the player was in each level for this browser session
 * (sessionStorage, so it survives a reload), so returning from the lessons or
 * a quiz puts them back beside the portal.
 */
export interface SavedPosition {
  x: number
  facing: 1 | -1
}

const KEY = 'alam-altahaddi:world-session:v1'
const memory = new Map<string, SavedPosition>()

function read(): Record<string, SavedPosition> {
  try {
    return JSON.parse(window.sessionStorage.getItem(KEY) ?? '{}') as Record<string, SavedPosition>
  } catch {
    return Object.fromEntries(memory)
  }
}

function write(all: Record<string, SavedPosition>) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // sessionStorage unavailable: the in-memory copy still works for this visit.
  }
}

export const worldSession = {
  get(levelId: string): SavedPosition | undefined {
    const p = read()[levelId] ?? memory.get(levelId)
    return p && Number.isFinite(p.x) ? p : undefined
  },
  save(levelId: string, pos: SavedPosition) {
    memory.set(levelId, pos)
    write({ ...read(), [levelId]: pos })
  },
  clear(levelId: string) {
    memory.delete(levelId)
    const all = read()
    delete all[levelId]
    write(all)
  },
}
