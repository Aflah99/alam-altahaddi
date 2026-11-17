import type { InfoContent } from './startMenu'

/** Arabic copy for the player lobby. */

export type LobbyPlaceId = 'map' | 'closet' | 'shop' | 'board'

export const LOBBY_PLACES: Record<LobbyPlaceId, { label: string; info: InfoContent }> = {
  map: {
    label: 'خريطة المغامرة',
    info: {
      title: 'خريطة المغامرة',
      paragraphs: ['من هذه البوابة ستختار المادة الدراسية والمستوى، ثم تنطلق في مراحل المغامرة.'],
      status: 'الخريطة غير متاحة بعد، وستُضاف في مهمة قادمة.',
    },
  },
  closet: {
    label: 'الخزانة',
    info: {
      title: 'الخزانة',
      paragraphs: ['هنا ستتمكّن لاحقًا من تخصيص شخصيتك وتغيير مظهرها.'],
      status: 'الخزانة غير متاحة بعد، وستُضاف في مهمة قادمة.',
    },
  },
  shop: {
    label: 'المتجر',
    info: {
      title: 'المتجر',
      paragraphs: ['هنا ستستخدم لاحقًا العملات التي تكسبها من التعلّم لشراء أغراض لشخصيتك.'],
      status: 'المتجر مغلق حاليًا، ولا توجد عملات أو مشتريات بعد.',
    },
  },
  board: {
    label: 'المتصدرون',
    info: {
      title: 'المتصدرون',
      paragraphs: ['لوحة صدارة خاصة بمجموعتك فقط، يراها أصدقاؤك في المجموعة دون غيرهم.'],
      status: 'لوحة المتصدرين غير متاحة بعد، وستُضاف في مهمة قادمة.',
    },
  },
}

export const DEMO_NOTE = 'نسخة تجريبية · محفوظ على هذا الجهاز فقط'
