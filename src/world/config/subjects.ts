import type { CatalogSubject } from '../../cloud/types'
import { themePreset, type WorldTheme } from './themes'

/**
 * A subject region on the adventure map. In cloud mode subjects come from the
 * database (published by administrators, no code changes); without the cloud the
 * bundled «ديني قيمي» subject is used for device-local guests.
 */
export interface SubjectView {
  /** URL id (slug). */
  id: string
  /** Arabic subject name shown on the map, portal and lesson screen. */
  title: string
  /** One honest sentence about what the region is for. */
  summary: string
  theme: WorldTheme
  levelId: string
  /** Bundled question bank (device-local guest mode). */
  bankId?: string
  /** Cloud subject id. */
  cloudId?: string
}

/** Kept for guest mode and older code paths. */
export type SubjectConfig = SubjectView

export const LOCAL_SUBJECTS: readonly SubjectView[] = [
  {
    id: 'religion-values',
    title: 'ديني قيمي',
    summary: 'دروس ومهمات أسئلة من كتيّب مراجعة ديني قيمي للصف الثامن. ادخل العالم وابحث عن البوابة.',
    theme: 'meadow',
    levelId: 'meadow',
    bankId: 'religion-values-g8',
  },
]

/** @deprecated use LOCAL_SUBJECTS or the cloud catalogue. */
export const SUBJECTS = LOCAL_SUBJECTS

export function subjectFromCatalog(s: CatalogSubject): SubjectView {
  return {
    id: s.slug,
    title: s.name_ar,
    summary: s.description || `دروس ${s.name_ar} للصف ${s.grade}.`,
    theme: s.theme,
    levelId: themePreset(s.theme).levelId,
    cloudId: s.id,
  }
}

export function findSubject(id: string, list: readonly SubjectView[] = LOCAL_SUBJECTS): SubjectView | undefined {
  return list.find((s) => s.id === id)
}
