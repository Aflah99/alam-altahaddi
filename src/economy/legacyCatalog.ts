import type { CosmeticSlot } from '../characters/cosmetics'
import type { CharacterId } from '../characters/roster'

/**
 * The shop catalogue: names and prices (in coins) live here, not in UI code.
 * Every item is cosmetic. Art lives in characters/cosmetics.ts and roster.ts.
 */
export type ShopCategory = 'characters' | CosmeticSlot

export const CATEGORIES: readonly { id: ShopCategory; label: string }[] = [
  { id: 'characters', label: 'الشخصيات' },
  { id: 'outfit', label: 'الملابس' },
  { id: 'hat', label: 'القبعات' },
  { id: 'accessory', label: 'الإكسسوارات' },
  { id: 'bag', label: 'الحقائب' },
]

export interface CatalogItem {
  id: string
  category: ShopCategory
  name: string
  description: string
  price: number
  /** For category 'characters': the character this item unlocks. */
  characterId?: CharacterId
}

export const CATALOG: readonly CatalogItem[] = [
  { id: 'char-owl', category: 'characters', characterId: 'owl', name: 'البومة الحكيمة', description: 'شخصية جديدة تحب الكتب والأسئلة الصعبة.', price: 180 },
  { id: 'char-turtle', category: 'characters', characterId: 'turtle', name: 'السلحفاة الصبورة', description: 'شخصية جديدة تتأنّى حتى تصل إلى الجواب.', price: 200 },
  { id: 'outfit-scarf', category: 'outfit', name: 'وشاح أحمر', description: 'وشاح دافئ بخطوط ذهبية.', price: 60 },
  { id: 'outfit-bowtie', category: 'outfit', name: 'ربطة فراشية', description: 'ربطة عنق بنفسجية أنيقة.', price: 50 },
  { id: 'outfit-belt', category: 'outfit', name: 'حزام المستكشف', description: 'حزام جلدي بإبزيم ذهبي.', price: 70 },
  { id: 'hat-grad', category: 'hat', name: 'قبعة التخرّج', description: 'لمن يحبّ النجاح والتفوّق.', price: 120 },
  { id: 'hat-straw', category: 'hat', name: 'قبعة القش', description: 'قبعة صيفية للمغامرات الطويلة.', price: 80 },
  { id: 'hat-crown', category: 'hat', name: 'التاج الذهبي', description: 'تاج صغير لأبطال المعرفة.', price: 200 },
  { id: 'hat-beanie', category: 'hat', name: 'قبعة صوفية', description: 'قبعة زرقاء بكرة بيضاء.', price: 60 },
  { id: 'acc-glasses', category: 'accessory', name: 'نظارة القراءة', description: 'نظارة دائرية لقراءة الكتب.', price: 90 },
  { id: 'acc-sunglasses', category: 'accessory', name: 'نظارة شمسية', description: 'نظارة داكنة للأيام المشمسة.', price: 100 },
  { id: 'acc-star', category: 'accessory', name: 'شارة النجمة', description: 'شارة ذهبية تلمع على الصدر.', price: 70 },
  { id: 'bag-school', category: 'bag', name: 'حقيبة مدرسية', description: 'حقيبة حمراء لكتبك ودفاترك.', price: 80 },
  { id: 'bag-books', category: 'bag', name: 'حقيبة الكتب', description: 'حقيبة خضراء خفيفة.', price: 90 },
  { id: 'bag-explorer', category: 'bag', name: 'حقيبة المستكشف', description: 'حقيبة جلدية للرحلات.', price: 150 },
]

export function getItem(id: string): CatalogItem | undefined {
  return CATALOG.find((i) => i.id === id)
}

/** The shop item that unlocks a character, if it is not a base character. */
export function itemForCharacter(characterId: CharacterId): CatalogItem | undefined {
  return CATALOG.find((i) => i.characterId === characterId)
}
