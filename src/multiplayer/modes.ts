import type { ModeId } from './api'

/** Arabic copy for the eight modes. Player limits match mp_mode_limits() in the database. */
export const MODES: readonly { id: ModeId; name: string; icon: string; min: number; max: number; summary: string; timed: boolean }[] = [
  { id: 'speed', name: 'سباق المعرفة', icon: '⚡', min: 2, max: 50, timed: true, summary: 'أجب عن أكبر عدد من الأسئلة بشكل صحيح قبل انتهاء الوقت. التعادل يُحسم بالدقة ثم السرعة.' },
  { id: 'teams', name: 'معركة الفرق', icon: '🛡️', min: 4, max: 50, timed: true, summary: 'فرق متوازنة؛ كل إجابة صحيحة تضيف نقطة لفريقك. يفوز الفريق الأعلى نقاطًا.' },
  { id: 'survival', name: 'تحدّي الصمود', icon: '❤️', min: 2, max: 50, timed: false, summary: 'لكل لاعب ثلاثة قلوب. الإجابة الخاطئة تُفقدك قلبًا، ويفوز آخر من يبقى.' },
  { id: 'treasure', name: 'صيد الكنوز', icon: '💎', min: 2, max: 30, timed: true, summary: 'اختر صندوقًا ظاهرة قيمته، وأجب لتفتحه. من يفتحه أولًا يأخذ كنزه.' },
  { id: 'boss', name: 'الزعيم الأسطوري', icon: '🐉', min: 2, max: 20, timed: true, summary: 'تعاونوا! كل إجابة صحيحة تُضعف الزعيم. اهزموه قبل انتهاء الوقت لتفوزوا جميعًا.' },
  { id: 'tournament', name: 'بطولة الأبطال', icon: '🏆', min: 4, max: 32, timed: false, summary: 'مواجهات ثنائية متتالية في جدول بطولة؛ الفائز يتأهل حتى يُتوَّج البطل.' },
  { id: 'conquest', name: 'غزو الممالك', icon: '🏰', min: 2, max: 6, timed: false, summary: 'هاجم أرضًا مجاورة في دورك؛ تجيبان معًا، ومن يُصِب ويسبق يفوز بالأرض. استولِ على الخريطة كلها!' },
  { id: 'duel', name: 'منافسة سريعة', icon: '⚔️', min: 2, max: 2, timed: false, summary: 'مواجهة بين لاعبَين في سبعة أسئلة؛ الأكثر صوابًا يفوز، ثم الأسرع.' },
]
export const modeInfo = (id: ModeId) => MODES.find((m) => m.id === id)!

/** Preset messages and emoji only: there is no free text between players. */
export const REACTIONS: readonly { id: string; label: string }[] = [
  { id: 'hello', label: 'مرحبًا! 👋' },
  { id: 'good_luck', label: 'بالتوفيق!' },
  { id: 'well_done', label: 'أحسنت!' },
  { id: 'great_game', label: 'مباراة رائعة!' },
  { id: 'thanks', label: 'شكرًا!' },
  { id: 'ready', label: 'أنا جاهز!' },
  { id: 'wow', label: 'رائع!' },
  { id: 'oops', label: 'أوه!' },
  { id: 'e_smile', label: '😊' },
  { id: 'e_star', label: '⭐' },
  { id: 'e_clap', label: '👏' },
  { id: 'e_fire', label: '🔥' },
  { id: 'e_think', label: '🤔' },
  { id: 'e_heart', label: '💙' },
  { id: 'e_trophy', label: '🏆' },
  { id: 'e_wave', label: '🙌' },
]
export const reactionLabel = (id: string) => REACTIONS.find((r) => r.id === id)?.label ?? ''

/** Fictional lands of the conquest map (4 × 3 grid). */
export const TERRITORIES: readonly string[] = [
  'قلعة الريح', 'وادي النجوم', 'غابة الزمرد', 'جبال البلّور',
  'صحراء الذهب', 'بحيرة القمر', 'برج الحكمة', 'سهول الضياء',
  'جزر المرجان', 'مروج الربيع', 'كهف الياقوت', 'مملكة السحاب',
]
export const PLAYER_COLORS = ['#e8443a', '#2f6fd6', '#2fa84f', '#e8b42f', '#9b5cff', '#1fb3b3']
export const TEAM_NAMES = ['فريق الشمس', 'فريق القمر', 'فريق النجوم', 'فريق الرعد']
export const TEAM_COLORS = ['#ff8a2a', '#4fb4ff', '#ffd23f', '#b57bff']
export const DURATIONS = [60, 120, 150, 180, 300]
