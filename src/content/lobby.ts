export interface InfoContent {
  title: string
  paragraphs: readonly string[]
  status: string
}

/** Arabic copy for the player lobby. */

export type LobbyPlaceId = 'map' | 'closet' | 'shop' | 'board'

export const LOBBY_PLACES: Record<LobbyPlaceId, { label: string; info: InfoContent }> = {
  map: {
    // Opens the adventure map screen (no info panel).
    label: 'خريطة المغامرة',
    info: { title: 'خريطة المغامرة', paragraphs: [], status: '' },
  },
  closet: {
    // Opens the locker screen (no info panel).
    label: 'الخزانة',
    info: { title: 'الخزانة', paragraphs: [], status: '' },
  },
  shop: {
    // Opens the shop screen (no info panel).
    label: 'المتجر',
    info: { title: 'المتجر', paragraphs: [], status: '' },
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
