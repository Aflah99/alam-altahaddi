/**
 * Remembers where the player was in each level for this visit (in memory only),
 * so returning from the chapter screen puts them back beside the portal.
 */
export interface SavedPosition {
  x: number
  facing: 1 | -1
}

const positions = new Map<string, SavedPosition>()

export const worldSession = {
  get: (levelId: string) => positions.get(levelId),
  save: (levelId: string, pos: SavedPosition) => positions.set(levelId, pos),
  clear: (levelId: string) => positions.delete(levelId),
}
