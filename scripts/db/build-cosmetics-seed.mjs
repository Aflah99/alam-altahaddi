// Prints the SQL VALUES for the wearable + creature catalogue from src/cosmetics/wearables.ts,
// so the database and the game never disagree about ids, slots, rarities and prices.
// Usage: node --experimental-strip-types scripts/db/build-cosmetics-seed.mjs
import { CREATURE_ITEMS, WEARABLES } from '../../src/cosmetics/wearables.ts'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const rows = WEARABLES.map((w, i) =>
  `  (${q(w.id)}, ${q(w.slot)}, ${q(w.name)}, ${q(w.description)}, ${w.price ?? 0}, ${q(w.rarity)}, ${w.price !== null}, true, ${!!w.creatureOk || w.slot === 'pet'}, ${100 + i}, null)`,
)
CREATURE_ITEMS.forEach((c, i) =>
  rows.push(`  (${q(c.id)}, 'characters', ${q(c.name)}, ${q(c.description)}, 0, 'legendary', false, true, true, ${10 + i}, ${q(c.characterId)})`),
)
console.log(rows.join(',\n'))
