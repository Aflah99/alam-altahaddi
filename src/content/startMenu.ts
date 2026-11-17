/** Arabic copy for the start menu and its informational overlays. */

export type ModeId = 'solo' | 'friends'

export const MENU_ITEMS: readonly { id: ModeId; label: string }[] = [
  { id: 'solo', label: 'مغامرة فردية' },
  { id: 'friends', label: 'تحدّي الأصدقاء' },
]

export interface InfoContent {
  title: string
  paragraphs: readonly string[]
  status: string
}

export const INFO: Record<ModeId | 'parent', InfoContent> = {
  solo: {
    title: 'مغامرة فردية',
    paragraphs: [
      'رحلة تعليمية خاصة بك: تجيب عن الأسئلة وتتقدّم عبر المراحل بالسرعة التي تناسبك.',
    ],
    status: 'هذا الوضع قيد البناء، وسيُضاف في مهمة قادمة.',
  },
  friends: {
    title: 'تحدّي الأصدقاء',
    paragraphs: [
      'منافسة تعليمية داخل مجموعة خاصة من الأصدقاء، يلعب فيها كلٌّ منكم على جهازه.',
    ],
    status: 'هذا الوضع قيد البناء، وسيُضاف في مهمة قادمة.',
  },
  parent: {
    title: 'ولي الأمر',
    paragraphs: ['ستتمكّن من هنا لاحقًا من متابعة تقدّم ابنك أو ابنتك في اللعبة.'],
    status: 'تسجيل دخول أولياء الأمور غير متاح بعد، وسيُضاف في مهمة قادمة.',
  },
}
