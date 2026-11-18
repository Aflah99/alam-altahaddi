/**
 * Wearable catalogue for the human avatars (original pixel art) + shop/package metadata.
 *
 * Coordinates are on the 20×30 human grid (see characters/human.ts). Art letters:
 *   O ink outline · T tier trim · t tier trim shade · G tier gem · other letters from `pal`.
 * T/t/G take the colours of the item's upgrade tier, so every upgrade visibly changes
 * the item; tiers 3+ add `extra` decorative pixels, 5+ sparkle and 6 (Mythic) glows.
 *
 * Every item is cosmetic only. Weapons and companions have no gameplay effect.
 * This module has no imports so the database seed script can load it directly.
 */

export type Slot = 'head' | 'hair' | 'face' | 'neck' | 'top' | 'gloves' | 'shoes' | 'cape' | 'back' | 'weapon' | 'pet'
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'

export const SLOTS: readonly { id: Slot; label: string }[] = [
  { id: 'head', label: 'أغطية الرأس' },
  { id: 'hair', label: 'زينة الشعر' },
  { id: 'face', label: 'زينة الوجه' },
  { id: 'neck', label: 'الأوشحة والقلائد' },
  { id: 'top', label: 'الدروع والأزياء' },
  { id: 'gloves', label: 'القفازات' },
  { id: 'shoes', label: 'الأحذية' },
  { id: 'cape', label: 'العباءات' },
  { id: 'back', label: 'على الظهر' },
  { id: 'weapon', label: 'أسلحة للزينة' },
  { id: 'pet', label: 'الرفاق' },
]

/** Drawing order (later = on top). Capes and back items are drawn behind the body. */
export const SLOT_ORDER: readonly Slot[] = ['cape', 'back', 'shoes', 'top', 'gloves', 'neck', 'face', 'hair', 'head', 'weapon', 'pet']

export const RARITIES: Record<Rarity, { label: string; color: string; dupPoints: number }> = {
  common: { label: 'شائع', color: '#8fd16a', dupPoints: 5 },
  rare: { label: 'نادر', color: '#4fb4ff', dupPoints: 15 },
  epic: { label: 'ملحمي', color: '#b57bff', dupPoints: 40 },
  legendary: { label: 'أسطورة', color: '#ffc93c', dupPoints: 120 },
}

export interface TierDef {
  tier: number
  label: string
  trim: string
  trimShade: string
  gem: string
  /** Upgrade points needed to reach this tier from the previous one. */
  cost: number
}

export const TIERS: readonly TierDef[] = [
  { tier: 1, label: 'برونزي', trim: '#c47a3a', trimShade: '#8a5222', gem: '#e05a3a', cost: 0 },
  { tier: 2, label: 'فضي', trim: '#d6dde8', trimShade: '#99a5b8', gem: '#6fb8ff', cost: 20 },
  { tier: 3, label: 'ذهبي', trim: '#ffd34d', trimShade: '#c99a1c', gem: '#ff4d6d', cost: 45 },
  { tier: 4, label: 'بلاتيني', trim: '#eef6ff', trimShade: '#b7c6dc', gem: '#8f7dff', cost: 90 },
  { tier: 5, label: 'ألماسي', trim: '#7ef0ff', trimShade: '#33b4d6', gem: '#e9fbff', cost: 160 },
  { tier: 6, label: 'أسطوري', trim: '#ff7ad9', trimShade: '#b44cd6', gem: '#fff38a', cost: 280 },
]
export const MAX_TIER = 6

export const tierDef = (tier: number): TierDef => TIERS[Math.max(1, Math.min(MAX_TIER, Math.round(tier))) - 1]

export interface Art {
  rows: readonly string[]
  x: number
  y: number
}

export interface Wearable {
  id: string
  slot: Slot
  name: string
  description: string
  rarity: Rarity
  /** Price in the normal shop; null = surprise packages only. */
  price: number | null
  pal: Record<string, string>
  /** Drawn over the body. */
  front?: Art
  /** Drawn only where the body is transparent (capes, wings, bags). */
  behind?: Art
  /** Extra details shown from the Gold tier (3) upwards. */
  extra?: Art
  /** Shoes recolour the boots instead of drawing new pixels. */
  boots?: { base: string; shade: string }
  /** Also drawn on the legendary creature characters (pets are always). */
  creatureOk?: boolean
}

const M = '#b8c2d6'
const m = '#7d879e'

const w = (o: Wearable) => o

export const WEARABLES: readonly Wearable[] = [
  /* ---------------------------------------------------------------- head */
  w({
    id: 'hat-grad', slot: 'head', name: 'قبعة التخرّج', description: 'لمن يحبّ النجاح والتفوّق.', rarity: 'common', price: 120, creatureOk: true,
    pal: { K: '#323a7a' },
    front: { x: 2, y: 1, rows: ['......OOOO......', '..OOOOKKKKOOOO..', 'OOKKKKKKKKKKKKOO', '..OOOOKKKKOOOOT.', '...OKKKKKKKKOOT.', '...OKKKKKKKKO.T.', '...OOOOOOOOOO.G.'] },
    extra: { x: 8, y: 2, rows: ['GG'] },
  }),
  w({
    id: 'hat-straw', slot: 'head', name: 'قبعة القش', description: 'قبعة صيفية للمغامرات الطويلة.', rarity: 'common', price: 80, creatureOk: true,
    pal: { S: '#f4cf6a', s: '#d9a83c', o: '#6b4a1e' },
    front: { x: 1, y: 1, rows: ['.....oooooooo.....', '....oSSSSSSSSo....', '....oSSSSSSSSo....', '....oTTTTTTTTo....', 'oooooSSSSSSSSooooo', 'oSSSSsSSSSSSsSSSSo', '.oooooooooooooooo.'] },
    extra: { x: 6, y: 4, rows: ['G......G'] },
  }),
  w({
    id: 'hat-crown', slot: 'head', name: 'التاج الملكي', description: 'تاج صغير لأبطال المعرفة.', rarity: 'rare', price: 200, creatureOk: true,
    pal: {},
    front: { x: 4, y: 0, rows: ['.O...OO...O.', 'OTO.OTTO.OTO', 'OTTOTGGTOTTO', 'OTTTTTTTTTTO', 'OtttGtttGttO', 'OOOOOOOOOOOO'] },
    extra: { x: 5, y: 3, rows: ['G........G'] },
  }),
  w({
    id: 'hat-beanie', slot: 'head', name: 'قبعة صوفية', description: 'قبعة زرقاء دافئة.', rarity: 'common', price: 60, creatureOk: true,
    pal: { B: '#4fb4ff', b: '#2a78d4', W: '#fff4e6' },
    front: { x: 2, y: 1, rows: ['.......OO.......', '......OWWO......', '....OOOOOOOO....', '...OBBBBBBBBO...', '..OBBbBBBBbBBO..', '.OBBBBBBBBBBBBO.', 'OTTTTTTTTTTTTTTO', 'OOOOOOOOOOOOOOOO'] },
    extra: { x: 7, y: 5, rows: ['G....G'] },
  }),
  w({
    id: 'head-flowers', slot: 'head', name: 'إكليل الزهور', description: 'إكليل من زهور الربيع الملوّنة.', rarity: 'common', price: 70,
    pal: { F: '#ff8fb1', Y: '#ffe14d', P: '#b57bff', L: '#3fbf5a' },
    front: { x: 2, y: 2, rows: ['..F...P...F...P.', '.FYF.PYP.FYF.PYP', 'LLFLTLPLLLFLTLPL'] },
    extra: { x: 4, y: 1, rows: ['G.......G'] },
  }),
  w({
    id: 'head-wizard', slot: 'head', name: 'قبعة الحكيم', description: 'قبعة مدبّبة مرصّعة بالنجوم.', rarity: 'rare', price: 160,
    pal: { P: '#5b3fbf', p: '#3e2a8a' },
    front: { x: 2, y: 0, rows: ['..........OOO...', '........OOPPO...', '......OOPPGPO...', '.....OPPPPPpO...', '....OPPGPPPPpO..', 'OOOOTTTTTTTTTTOO', 'OTTTTttttttTTTTO', '.OOOOOOOOOOOOOO.'] },
    extra: { x: 7, y: 3, rows: ['..G', 'G..'] },
  }),
  w({
    id: 'head-helmet', slot: 'head', name: 'خوذة الفارس', description: 'خوذة لامعة بريشة ملوّنة.', rarity: 'rare', price: 180,
    pal: { M, m, R: '#e8443a' },
    front: { x: 1, y: 0, rows: ['........RR........', '.....OOORROOO.....', '...OOMMMMMMMMOO...', '..OMMMMMTTMMMMMO..', '.OMMmMMMTTMMMmMMO.', '.OMmMMMMTTMMMMmMO.', '.OMMTTTTTTTTTTMMO.', '.OMO..........OMO.', '.OMO..........OMO.', '..O............O..'] },
    extra: { x: 8, y: 3, rows: ['.G'] },
  }),
  w({
    id: 'head-turban', slot: 'head', name: 'عمامة الرحّالة', description: 'عمامة بيضاء بجوهرة لامعة.', rarity: 'rare', price: null,
    pal: { W: '#f4f1e8', w: '#cfc6b0' },
    front: { x: 2, y: 1, rows: ['....OOOOOOOO....', '..OOWWwWWwWWOO..', '.OWWwWWwTTwWWWO.', 'OWwWWwWTGGTwWwWO', 'OWWwWWwTGGTWwWWO', 'OwWWwWWwTTwWWwWO', '.OOOOOOOOOOOOOO.'] },
    extra: { x: 3, y: 4, rows: ['T..........T'] },
  }),
  w({
    id: 'head-dragon', slot: 'head', name: 'خوذة التنين', description: 'خوذة بقرنين من عالم التنانين.', rarity: 'legendary', price: null,
    pal: { R: '#d63a3a', r: '#962424', H: '#f4ead2' },
    front: { x: 0, y: 0, rows: ['OHO..............OHO', '.OHO..OOOOOOOO..OHO.', '..OHOORRRRRRRROOHO..', '...OORRRRTTRRRRROO..', '..ORRRRRRTTRRRRRRRO.', '..ORrRRRRGGRRRRrRRO.', '..ORRTTTTTTTTTTTRRO.', '..ORO..........ORO..', '...O............O...'] },
    extra: { x: 4, y: 4, rows: ['G..........G'] },
  }),
  /* ---------------------------------------------------------------- hair accessories */
  w({
    id: 'hair-ribbon-red', slot: 'hair', name: 'شريطة حمراء', description: 'شريطة لطيفة على جانب الرأس.', rarity: 'common', price: 40,
    pal: { R: '#e8443a', r: '#a8262b' },
    front: { x: 13, y: 3, rows: ['OO.OO', 'ORTRO', 'OrOrO', 'OO.OO'] },
  }),
  w({
    id: 'hair-ribbon-blue', slot: 'hair', name: 'شريطة زرقاء', description: 'شريطة زرقاء بعقدة لامعة.', rarity: 'common', price: 40,
    pal: { R: '#4fb4ff', r: '#2a78d4' },
    front: { x: 13, y: 3, rows: ['OO.OO', 'ORTRO', 'OrOrO', 'OO.OO'] },
  }),
  w({
    id: 'hair-flower', slot: 'hair', name: 'زهرة الشعر', description: 'زهرة وردية تزيّن الرأس.', rarity: 'common', price: 45,
    pal: { F: '#ff8fb1', f: '#e0609a', L: '#3fbf5a' },
    front: { x: 13, y: 2, rows: ['.OFO.', 'OFTFO', 'OfFfO', '.LOL.'] },
  }),
  w({
    id: 'hair-star-pin', slot: 'hair', name: 'مشبك النجمة', description: 'مشبك على شكل نجمة.', rarity: 'rare', price: 120,
    pal: {},
    front: { x: 13, y: 2, rows: ['..O..', '.OTO.', 'OTGTO', '.OTO.', '.O.O.'] },
  }),
  w({
    id: 'hair-moon', slot: 'hair', name: 'مشبك الهلال', description: 'هلال فضّي يلمع في الليل.', rarity: 'epic', price: null,
    pal: { W: '#f4f1ff' },
    front: { x: 13, y: 1, rows: ['.OOO.', 'OTTO.', 'OTO..', 'OTTOG', '.OOO.'] },
    extra: { x: 17, y: 0, rows: ['G'] },
  }),
  /* ---------------------------------------------------------------- face */
  w({
    id: 'acc-glasses', slot: 'face', name: 'نظارة القراءة', description: 'نظارة دائرية لقراءة الكتب.', rarity: 'common', price: 90, creatureOk: true,
    pal: {},
    front: { x: 4, y: 8, rows: ['TTTT....TTTT', 'T..TTTTTT..T', 'T..T....T..T', 'T..T....T..T', 'TTTT....TTTT'] },
  }),
  w({
    id: 'acc-sunglasses', slot: 'face', name: 'نظارة شمسية', description: 'نظارة داكنة للأيام المشمسة.', rarity: 'common', price: 100, creatureOk: true,
    pal: { K: '#151530', B: '#7fb8ff' },
    front: { x: 3, y: 8, rows: ['OOOOOOOOOOOOOO', '.OBKKO..OBKKO.', '.OKKKOTTOKKKO.', '..OOO....OOO..'] },
  }),
  w({
    id: 'face-monocle', slot: 'face', name: 'المونوكل', description: 'عدسة أنيقة لعين واحدة.', rarity: 'rare', price: 130,
    pal: { L: '#cfefff' },
    front: { x: 11, y: 8, rows: ['.TTTT.', 'T.LL.T', 'T....T', '.TTTT.', '....t.', '....t.'] },
  }),
  w({
    id: 'face-mask', slot: 'face', name: 'قناع البطل', description: 'قناع مغامر يغطي العينين فقط.', rarity: 'rare', price: null,
    pal: { R: '#d63a3a', r: '#962424' },
    front: { x: 2, y: 8, rows: ['.RRRRRRRRRRRRRR.', 'RRR..RRRRRR..RRR', 'rRR..RTTTTR..RRr', '.rRRRR....RRRRr.'] },
  }),
  w({
    id: 'face-goggles', slot: 'face', name: 'نظارة المخترع', description: 'نظارة نحاسية بعدسات ملوّنة.', rarity: 'epic', price: null,
    pal: { K: '#4a3020', L: '#9fe8ff' },
    front: { x: 2, y: 8, rows: ['KKOOOOKKKKOOOOKK', 'KOTTTTOKKOTTTTOK', '.OTLLTO..OTLLTO.', '.OTTTTO..OTTTTO.', '..OOOO....OOOO..'] },
    extra: { x: 5, y: 10, rows: ['G......G'] },
  }),
  /* ---------------------------------------------------------------- neck */
  w({
    id: 'outfit-scarf', slot: 'neck', name: 'وشاح أحمر', description: 'وشاح دافئ بحافة ملوّنة.', rarity: 'common', price: 60, creatureOk: true,
    pal: { R: '#e8443a', r: '#b8262b' },
    front: { x: 6, y: 15, rows: ['OOOOOOOO', 'ORRTRRRO', 'OrRRRRrO', '.ORRO...', '.ORrO...', '.OTTO...'] },
  }),
  w({
    id: 'outfit-bowtie', slot: 'neck', name: 'ربطة فراشية', description: 'ربطة عنق بنفسجية أنيقة.', rarity: 'common', price: 50, creatureOk: true,
    pal: { V: '#9b5cff' },
    front: { x: 7, y: 16, rows: ['OO..OO', 'OVOOVO', 'OVTTVO', 'OO..OO'] },
  }),
  w({
    id: 'neck-shemagh', slot: 'neck', name: 'شماغ مربّع', description: 'وشاح أحمر وأبيض بنقوش مربّعة.', rarity: 'common', price: 70,
    pal: { R: '#d63a3a', W: '#f4f1e8' },
    front: { x: 5, y: 15, rows: ['OOOOOOOOOO', 'ORWRWRWRWO', 'OWRWTTWRWO', '.ORWRWRWO.', '..OOOOOO..'] },
  }),
  w({
    id: 'neck-medal', slot: 'neck', name: 'ميدالية المعرفة', description: 'ميدالية لمن يتعلّم كل يوم.', rarity: 'common', price: 65,
    pal: { B: '#2f6fd6', R: '#e8443a' },
    front: { x: 7, y: 16, rows: ['BR..RB', '.BR.B.', '..OO..', '.OTTO.', '.OTGO.', '..OO..'] },
  }),
  w({
    id: 'neck-amulet', slot: 'neck', name: 'تميمة الحكمة', description: 'قلادة بحجر يلمع بهدوء.', rarity: 'rare', price: null,
    pal: {},
    front: { x: 7, y: 16, rows: ['T....T', '.T..T.', '..TT..', '.OGGO.', '.OGGO.', '..OO..'] },
  }),
  w({
    id: 'neck-cloud', slot: 'neck', name: 'وشاح الغيوم', description: 'وشاح ناعم كالغيم.', rarity: 'epic', price: null,
    pal: { W: '#ffffff', C: '#bfe3ff' },
    front: { x: 5, y: 15, rows: ['.OOOOOOOO.', 'OWWCWWCWWO', 'OCWWTTWWCO', '.OWWOOWWO.', '.OCWO.....', '.OWWO.....', '..OO......'] },
    extra: { x: 4, y: 16, rows: ['G........G'] },
  }),
  /* ---------------------------------------------------------------- tops */
  w({
    id: 'outfit-belt', slot: 'top', name: 'حزام المستكشف', description: 'حزام جلدي بإبزيم لامع.', rarity: 'common', price: 70, creatureOk: true,
    pal: { L: '#6b4a1e' },
    front: { x: 7, y: 22, rows: ['LLTTLL'] },
  }),
  w({
    id: 'acc-star', slot: 'top', name: 'شارة النجمة', description: 'شارة تلمع على الصدر.', rarity: 'common', price: 70, creatureOk: true,
    pal: { W: '#ffffff' },
    front: { x: 10, y: 17, rows: ['..O..', '.OTO.', 'OTWTO', '.OTO.', '..O..'] },
  }),
  w({
    id: 'top-vest', slot: 'top', name: 'سترة المستكشف', description: 'سترة بجيوب كثيرة فوق الملابس.', rarity: 'common', price: 75,
    pal: { V: '#8a5a32', v: '#5f3d20' },
    front: { x: 6, y: 17, rows: ['OVVOOVVO', 'OVVO.VVO', 'OVvO.VvO', 'OVTO.TVO', 'OVVO.VVO'] },
  }),
  w({
    id: 'top-armor', slot: 'top', name: 'درع الفارس', description: 'درع صدري لامع فوق الثياب.', rarity: 'rare', price: 170,
    pal: { M, m },
    front: { x: 3, y: 17, rows: ['.OMMOOOOOOMMO.', 'OMMMOMMMMOMMMO', 'OmMOMMTTMMOMmO', '...OmMTTMmO...', '...OMMMMMMO...', '...OTTTTTTO...'] },
    extra: { x: 9, y: 18, rows: ['GG'] },
  }),
  w({
    id: 'top-sash', slot: 'top', name: 'وشاح الشرف', description: 'وشاح ملكي بجوهرة على الصدر.', rarity: 'epic', price: null,
    pal: { R: '#c42a5a' },
    front: { x: 6, y: 17, rows: ['RR......', '.RR.....', '..RTT...', '...TGT..', '....TRR.', '.....RR.'] },
    extra: { x: 5, y: 17, rows: ['G'] },
  }),
  w({
    id: 'top-phoenix', slot: 'top', name: 'درع العنقاء', description: 'درع من ريش العنقاء المتوهّج.', rarity: 'legendary', price: null,
    pal: { R: '#ff6a2a', r: '#c23a14', Y: '#ffd34d' },
    front: { x: 2, y: 16, rows: ['..OYO......OYO..', '.ORRRO....ORRRO.', 'ORRYRROOOORRYRRO', 'OrRRROTTTTORRRrO', '...ORRTGGTRRO...', '...OrRRTTRRrO...', '...ORYRRRRYRO...', '...OTTTTTTTTO...'] },
    extra: { x: 1, y: 18, rows: ['Y..............Y'] },
  }),
  /* ---------------------------------------------------------------- gloves */
  w({
    id: 'gloves-leather', slot: 'gloves', name: 'قفازات جلدية', description: 'قفازات متينة للمغامرات.', rarity: 'common', price: 45,
    pal: { L: '#8a5a32' },
    front: { x: 4, y: 22, rows: ['TT........TT', 'LL........LL'] },
  }),
  w({
    id: 'gloves-white', slot: 'gloves', name: 'قفازات بيضاء', description: 'قفازات أنيقة للمناسبات.', rarity: 'common', price: 45,
    pal: { W: '#f4f4fa' },
    front: { x: 4, y: 22, rows: ['TT........TT', 'WW........WW'] },
  }),
  w({
    id: 'gloves-gauntlet', slot: 'gloves', name: 'قفازات الفارس', description: 'قفازات معدنية لامعة.', rarity: 'rare', price: 140,
    pal: { M, m },
    front: { x: 4, y: 21, rows: ['MM........MM', 'TT........TT', 'Mm........mM'] },
  }),
  w({
    id: 'gloves-mage', slot: 'gloves', name: 'قفازات الساحر', description: 'قفازات تشعّ بنور لطيف.', rarity: 'epic', price: null,
    pal: { P: '#7c4dd6' },
    front: { x: 4, y: 22, rows: ['TT........TT', 'PG........GP'] },
    extra: { x: 3, y: 23, rows: ['G............G'] },
  }),
  /* ---------------------------------------------------------------- shoes */
  w({ id: 'boots-red', slot: 'shoes', name: 'حذاء أحمر', description: 'حذاء خفيف للجري والقفز.', rarity: 'common', price: 50, pal: {}, boots: { base: '#d63a3a', shade: '#962424' } }),
  w({ id: 'boots-cloud', slot: 'shoes', name: 'حذاء الغيمة', description: 'حذاء أبيض ناعم كالغيم.', rarity: 'common', price: 55, pal: {}, boots: { base: '#f4f6ff', shade: '#bfc8e8' } }),
  w({ id: 'boots-knight', slot: 'shoes', name: 'حذاء الفارس', description: 'حذاء معدني متين.', rarity: 'rare', price: 140, pal: {}, boots: { base: M, shade: m } }),
  w({
    id: 'boots-winged', slot: 'shoes', name: 'الحذاء المجنّح', description: 'حذاء بجناحين صغيرين.', rarity: 'epic', price: null,
    pal: { W: '#ffffff' }, boots: { base: '#4fb4ff', shade: '#2a78d4' },
    front: { x: 3, y: 27, rows: ['WW..........WW', '.WT........TW.'] },
  }),
  /* ---------------------------------------------------------------- capes */
  w({
    id: 'cape-red', slot: 'cape', name: 'عباءة حمراء', description: 'عباءة البطل الشجاع.', rarity: 'common', price: 70,
    pal: { C: '#d63a3a', c: '#962424' },
    behind: { x: 2, y: 16, rows: ['..OCCCCCCCCCCO..', '.OCCCCCCCCCCCCO.', '.OCCCCCCCCCCCCO.', 'OCCCCCCCCCCCCCCO', 'OCCCCCCCCCCCCCCO', 'OCcCCCCCCCCCCcCO', 'OCcCCCCCCCCCCcCO', 'OCcCCCCCCCCCCcCO', 'OCcCCCCCCCCCCcCO', 'OCcCCcCCCCcCCcCO', 'OCcCCcCCCCcCCcCO', 'OTTTTTTTTTTTTTTO', 'OOOOOOOOOOOOOOOO'] },
    front: { x: 6, y: 16, rows: ['T......T'] },
  }),
  w({
    id: 'cape-blue', slot: 'cape', name: 'عباءة زرقاء', description: 'عباءة بلون السماء.', rarity: 'common', price: 70,
    pal: { C: '#2f6fd6', c: '#1f4c9a' },
    behind: { x: 2, y: 16, rows: ['..OCCCCCCCCCCO..', '.OCCCCCCCCCCCCO.', '.OCCCCCCCCCCCCO.', 'OCCCCCCCCCCCCCCO', 'OCCCCCCCCCCCCCCO', 'OCcCCCCCCCCCCcCO', 'OCcCCCCCCCCCCcCO', 'OCcCCCCCCCCCCcCO', 'OCcCCCCCCCCCCcCO', 'OCcCCcCCCCcCCcCO', 'OCcCCcCCCCcCCcCO', 'OTTTTTTTTTTTTTTO', 'OOOOOOOOOOOOOOOO'] },
    front: { x: 6, y: 16, rows: ['T......T'] },
  }),
  w({
    id: 'cape-royal', slot: 'cape', name: 'العباءة الملكية', description: 'عباءة بنفسجية بحافة فاخرة.', rarity: 'rare', price: 170,
    pal: { C: '#6b3fc4', c: '#48288a', W: '#f4f1ff' },
    behind: { x: 1, y: 16, rows: ['...OWWWWWWWWWWO...', '..OCCCCCCCCCCCCO..', '.OCCCCCCCCCCCCCCO.', '.OCCCCCCCCCCCCCCO.', 'OCCCCCCCCCCCCCCCCO', 'OCcCCCCCCCCCCCCcCO', 'OCcCCCCCCCCCCCCcCO', 'OCcCCCCCCCCCCCCcCO', 'OCcCCCCCCCCCCCCcCO', 'OCcCCcCCCCCCcCCcCO', 'OCcCCcCCCCCCcCCcCO', 'OTTTTTTTTTTTTTTTTO', 'OOOOOOOOOOOOOOOOOO'] },
    front: { x: 6, y: 16, rows: ['G......G'] },
  }),
  w({
    id: 'cape-starry', slot: 'cape', name: 'عباءة النجوم', description: 'عباءة ليلية تتلألأ فيها النجوم.', rarity: 'epic', price: null,
    pal: { C: '#1d2a6a', c: '#121a48', S: '#ffffff' },
    behind: { x: 1, y: 16, rows: ['...OCCCCCCCCCCO...', '..OCCSCCCCCCSCCO..', '.OCCCCCCCCCCCCCCO.', '.OCSCCCCCCCCCCGCO.', 'OCCCCCCCCCCCCCCCCO', 'OCcCCCCCCCCCCCCSCO', 'OCSCCCCCCCCCCCCcCO', 'OCcCCCCCCCCCCCCcCO', 'OCcCCCCCCCCCCCSCCO', 'OCGCCcCCCCCCcCCcCO', 'OCcCCcCCCCCCcCCGCO', 'OTTTTTTTTTTTTTTTTO', 'OOOOOOOOOOOOOOOOOO'] },
    front: { x: 6, y: 16, rows: ['G......G'] },
  }),
  w({
    id: 'cape-dragon', slot: 'cape', name: 'عباءة التنين', description: 'عباءة بحراشف التنين الحمراء.', rarity: 'legendary', price: null,
    pal: { C: '#b8222f', c: '#7a1520', Y: '#ffb02e' },
    behind: { x: 0, y: 15, rows: ['....OOOOOOOOOOOO....', '...OCCCCCCCCCCCCO...', '..OCCYCCCCCCCCYCCO..', '.OCCCCCCCCCCCCCCCCO.', '.OCcCYCCCCCCCCYCcCO.', 'OCCcCCCCCCCCCCCCcCCO', 'OCYcCCCCCCCCCCCCcYCO', 'OCCcCCCCCCCCCCCCcCCO', 'OCcCYCCCCCCCCCCYCcCO', 'OCcCCcCCCCCCCCcCCcCO', 'OCYCCcCCCCCCCCcCCYCO', 'OCcCCcCCCCCCCCcCCcCO', 'OTGTTTTTTTTTTTTTTGTO', 'OOOOOOOOOOOOOOOOOOOO'] },
    front: { x: 6, y: 16, rows: ['G......G'] },
  }),
  /* ---------------------------------------------------------------- back */
  w({
    id: 'bag-school', slot: 'back', name: 'حقيبة مدرسية', description: 'حقيبة حمراء لكتبك ودفاترك.', rarity: 'common', price: 80, creatureOk: true,
    pal: { B: '#e8443a', b: '#b8262b' },
    behind: { x: 14, y: 16, rows: ['.OOOOO', 'OBBBBBO', 'OBTTBBO', 'OBBBBBO', 'ObbbbbO', 'OBBBBBO', '.OOOOO.'] },
  }),
  w({
    id: 'bag-books', slot: 'back', name: 'حقيبة الكتب', description: 'حقيبة خضراء خفيفة.', rarity: 'common', price: 90, creatureOk: true,
    pal: { B: '#2fb84a', b: '#14803a' },
    behind: { x: 14, y: 16, rows: ['.OOOOO', 'OBBBBBO', 'OBTTBBO', 'OBBBBBO', 'ObbbbbO', 'OBBBBBO', '.OOOOO.'] },
  }),
  w({
    id: 'bag-explorer', slot: 'back', name: 'حقيبة المستكشف', description: 'حقيبة جلدية للرحلات.', rarity: 'rare', price: 150, creatureOk: true,
    pal: { B: '#a8703a', b: '#6b4a1e' },
    behind: { x: 13, y: 15, rows: ['..OOOOO', '.OBBBBBO', 'OBBTTBBBO', 'OBBBBBBBO', 'ObbbbbbbO', 'OBBGBBBBO', 'OBBBBBBBO', '.OOOOOOO.'] },
  }),
  w({
    id: 'back-shield', slot: 'back', name: 'درع الظهر', description: 'ترس دائري معلّق على الظهر.', rarity: 'rare', price: 150,
    pal: { M, m, B: '#2f6fd6' },
    behind: { x: 12, y: 15, rows: ['..OOOOO..', '.OTTTTTO.', 'OTBBBBBTO', 'OTBBGBBTO', 'OTBBBBBTO', 'OTBBBBBTO', '.OTTTTTO.', '..OOOOO..'] },
  }),
  w({
    id: 'back-fairy', slot: 'back', name: 'أجنحة الفراشة', description: 'أجنحة شفّافة ملوّنة.', rarity: 'epic', price: null,
    pal: { A: '#9fe8ff', a: '#ffb3e6' },
    behind: { x: 0, y: 14, rows: ['OOO..............OOO', 'OAAO............OAAO', 'OAGAO..........OAGAO', 'OAAAAO........OAAAAO', '.OAAAO........OAAAO.', '.OaaaO........OaaaO.', 'OaaaaO........OaaaaO', 'OaTaO..........OaTaO', '.OO..............OO.'] },
  }),
  w({
    id: 'back-dragon-wings', slot: 'back', name: 'أجنحة التنين', description: 'جناحان عظيمان لحماة المعرفة.', rarity: 'legendary', price: null,
    pal: { D: '#7a2fd6', d: '#4b1a8a', R: '#c9a2ff' },
    behind: { x: 0, y: 11, rows: ['O..................O', 'TO................OT', 'DTO..............OTD', 'DDTO............OTDD', 'RDDTO..........OTDDR', 'DRDDDO........ODDDRD', 'DDRDdO........OdDRDD', 'dDDRDO........ODRDDd', '.dDDRO........ORDDd.', '..dDGO........OGDd..', '...ddO........Odd...', '....OO........OO....'] },
  }),
  /* ---------------------------------------------------------------- weapons */
  w({
    id: 'weapon-wood-sword', slot: 'weapon', name: 'سيف خشبي', description: 'سيف تدريب خشبي آمن.', rarity: 'common', price: 60,
    pal: { W: '#c8925a', w: '#8a5a32' },
    front: { x: 15, y: 13, rows: ['.O.', 'OWO', 'OWO', 'OWO', 'OwO', 'OWO', 'OwO', 'OWO', 'TTT', '.w.', '.T.'] },
  }),
  w({
    id: 'weapon-spear', slot: 'weapon', name: 'رمح الحارس', description: 'رمح طويل بزينة ملوّنة.', rarity: 'common', price: 65,
    pal: { W: '#8a5a32', R: '#e8443a' },
    front: { x: 16, y: 8, rows: ['.O.', 'OTO', 'OTO', 'RTR', '.W.', '.W.', '.W.', '.W.', '.W.', '.W.', '.W.', '.W.', '.W.', '.W.', '.W.', '.W.', '.W.', '.W.', '.W.', '.T.'] },
  }),
  w({
    id: 'weapon-sword', slot: 'weapon', name: 'سيف الفارس', description: 'سيف لامع للزينة فقط.', rarity: 'rare', price: 160,
    pal: { M: '#e6ecf5', m: '#9aa6b8', H: '#5a3a22' },
    front: { x: 15, y: 11, rows: ['.O.', 'OMO', 'OMO', 'OMO', 'OmO', 'OMO', 'OmO', 'OMO', 'OMO', 'TTTT', '.H.', '.G.'] },
    extra: { x: 16, y: 13, rows: ['G'] },
  }),
  w({
    id: 'weapon-staff', slot: 'weapon', name: 'عصا الحكمة', description: 'عصا خشبية تعلوها كرة مضيئة.', rarity: 'rare', price: null,
    pal: { W: '#8a5a32', w: '#5f3d20' },
    front: { x: 15, y: 7, rows: ['.OO.', 'OGGO', 'OGGO', '.TT.', '.W..', '.w..', '.W..', '.W..', '.w..', '.W..', '.W..', '.w..', '.W..', '.W..', '.w..', '.W..', '.W..', '.w..', '.W..', '.T..', '.W..'] },
  }),
  w({
    id: 'weapon-bow', slot: 'weapon', name: 'قوس الرامي', description: 'قوس خشبي بوتر فضّي.', rarity: 'epic', price: null,
    pal: { W: '#a8703a', S: '#e6ecf5' },
    front: { x: 15, y: 12, rows: ['.OW.', '.W.S', 'W..S', 'W..S', 'T..S', 'W..S', 'W..S', '.W.S', '.OW.'] },
    extra: { x: 15, y: 16, rows: ['G'] },
  }),
  w({
    id: 'weapon-crystal', slot: 'weapon', name: 'سيف البلّور', description: 'سيف من بلّور سحري يلمع.', rarity: 'legendary', price: null,
    pal: { C: '#9ff3ff', c: '#4fc8e8', W: '#ffffff' },
    front: { x: 15, y: 9, rows: ['.O.', 'OWO', 'OCO', 'OCO', 'OcO', 'OCO', 'OWO', 'OcO', 'OCO', 'OCO', 'OcO', 'TGTT', '.T.', '.G.'] },
    extra: { x: 14, y: 10, rows: ['G...', '...G'] },
  }),
  /* ---------------------------------------------------------------- pets (beside the avatar) */
  w({
    id: 'pet-chick', slot: 'pet', name: 'كتكوت', description: 'رفيق أصفر صغير يتبعك.', rarity: 'common', price: 80, creatureOk: true,
    pal: { Y: '#ffe14d', y: '#e8b82a', B: '#ff9a3c', E: '#1a1a2e' },
    front: { x: 20, y: 23, rows: ['..OOO..', '.OYYYO.', 'OYEYYBB', 'OYYYYO.', 'OyYYYYO', '.OTOTO.', '..O.O..'] },
  }),
  w({
    id: 'pet-bunny', slot: 'pet', name: 'أرنب', description: 'أرنب أبيض يحبّ الجزر.', rarity: 'common', price: 90, creatureOk: true,
    pal: { W: '#ffffff', w: '#d6dcef', P: '#ff9ab8', E: '#1a1a2e' },
    front: { x: 20, y: 21, rows: ['.O.O...', 'OWOWO..', 'OPOPO..', 'OWWWWO.', 'OWEWEWO', 'OWWPWWO', '.OTTTO.', 'OwWWWwO', '.OOOOO.'] },
  }),
  w({
    id: 'pet-cat', slot: 'pet', name: 'قطّة', description: 'قطّة برتقالية فضولية.', rarity: 'rare', price: 150, creatureOk: true,
    pal: { C: '#f29a3c', c: '#c46a1e', E: '#1a1a2e', P: '#ff9ab8' },
    front: { x: 20, y: 22, rows: ['O...O..', 'OCOCO..', 'OCCCCO.', 'OECCECO', 'OCCPCCO', '.OTTTO.', 'OcCCCcO', '.OO.OO.'] },
  }),
  w({
    id: 'pet-puppy', slot: 'pet', name: 'جرو', description: 'جرو مخلص لا يفارقك.', rarity: 'rare', price: null, creatureOk: true,
    pal: { D: '#c8925a', d: '#8a5a32', E: '#1a1a2e', N: '#2a1d5c' },
    front: { x: 20, y: 22, rows: ['OO..OO.', 'OdOOdO.', 'ODDDDDO', 'ODEDEDO', 'ODDNDDO', '.OTTTO.', 'ODdDdDO', '.OO.OO.'] },
  }),
  w({
    id: 'pet-owlet', slot: 'pet', name: 'بومة صغيرة', description: 'بومة صغيرة تحبّ القراءة.', rarity: 'epic', price: null, creatureOk: true,
    pal: { B: '#8a5a32', b: '#5f3d20', W: '#f4ead2', E: '#1a1a2e', Y: '#ffb02e' },
    front: { x: 20, y: 22, rows: ['O.....O', 'OBOOOBO', 'OWEBEWO', 'OBBYBBO', 'ObWWWbO', '.OTGTO.', '.OBBBO.', '..Y.Y..'] },
  }),
  w({
    id: 'pet-dragon', slot: 'pet', name: 'تنين صغير', description: 'تنين صغير لطيف يطير بجانبك.', rarity: 'legendary', price: null, creatureOk: true,
    pal: { G: '#3fbf5a', g: '#24873a', W: '#ffe14d', E: '#1a1a2e' },
    front: { x: 20, y: 20, rows: ['...O.O..', '..OGOGO.', 'O.OGGGGO', 'WOGEGGEO', 'WWOGGGGO', '.WOGGGO.', '..OTTTO.', '.OGgGgGO', '.OGGGGOg', '..OO.OOO'] },
  }),
]

export function getWearable(id: string): Wearable | undefined {
  return WEARABLES.find((x) => x.id === id)
}

/** Legendary collectible characters: obtainable only from surprise packages. */
export const CREATURE_ITEMS: readonly { id: string; characterId: string; name: string; description: string }[] = [
  { id: 'char-green-slime', characterId: 'green-slime', name: 'سلايم الأخضر', description: 'كائن أسطوري هادئ يحب القفز فوق العشب.' },
  { id: 'char-blue-slime', characterId: 'blue-slime', name: 'سلايم الأزرق', description: 'كائن أسطوري مبتسم دائمًا.' },
  { id: 'char-little-robot', characterId: 'little-robot', name: 'الروبوت الصغير', description: 'مساعد أسطوري بشاشة مبتسمة.' },
  { id: 'char-fox', characterId: 'fox', name: 'الثعلب', description: 'ثعلب أسطوري ذكي وسريع.' },
  { id: 'char-owl', characterId: 'owl', name: 'البومة الحكيمة', description: 'بومة أسطورية تحب الكتب.' },
  { id: 'char-turtle', characterId: 'turtle', name: 'السلحفاة الصبورة', description: 'سلحفاة أسطورية تتأنّى حتى تصل إلى الجواب.' },
]

/** Points needed to go from `tier` to `tier + 1` (null at the top tier). */
export function upgradeCost(tier: number): number | null {
  return tier >= MAX_TIER ? null : TIERS[tier].cost
}

/** Encodes an equipped item with its tier for the sprite renderer: "id@tier". */
export const wornKey = (id: string, tier = 1) => `${id}@${tier}`
export function parseWorn(key: string): { id: string; tier: number } {
  const [id, t] = key.split('@')
  const tier = Number(t)
  return { id, tier: Number.isInteger(tier) && tier >= 1 && tier <= MAX_TIER ? tier : 1 }
}
