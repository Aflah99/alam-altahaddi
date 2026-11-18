import { useCallback, useEffect, useState } from 'react'
import { arabicError, supabase } from '../cloud/client'

export function db() {
  const c = supabase()
  if (!c) throw new Error('cloud not configured')
  return c
}

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args)
  if (error) throw error
  return data as T
}

/** Server messages for admin actions: keep the (English) reason, add an Arabic lead. */
export function adminError(e: unknown): string {
  const msg = String((e as { message?: string })?.message ?? e)
  if (/[؀-ۿ]/.test(msg)) return msg
  const known: [RegExp, string][] = [
    [/disabled in settings/, 'توليد الأسئلة معطّل في الإعدادات.'],
    [/daily question limit/, 'تم بلوغ الحد اليومي للأسئلة.'],
    [/daily page limit/, 'تم بلوغ الحد اليومي للصفحات.'],
    [/monthly AI budget/, 'سيتجاوز هذا العمل الميزانية الشهرية المحددة.'],
    [/too many jobs running/, 'يوجد عدد كبير من المهام قيد التشغيل.'],
    [/too many pages/, 'عدد الصفحات أكبر من الحد المسموح للمهمة.'],
    [/question count/, 'عدد الأسئلة خارج الحد المسموح.'],
    [/exactly 4 options|four options/, 'يجب أن يكون للسؤال أربعة خيارات وإجابة صحيحة واحدة.'],
    [/duplicate key|23505/, 'يوجد عنصر بالمعرّف نفسه.'],
  ]
  for (const [re, ar] of known) if (re.test(msg)) return `${ar} (${msg})`
  return arabicError(e)
}

/** Tiny data hook: runs `load` on mount and when `deps` change. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((n) => n + 1), [])
  useEffect(() => {
    let alive = true
    load()
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(adminError(e)))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { data, error, reload, setData }
}

export interface SubjectRow {
  id: string
  slug: string
  name_ar: string
  name_en: string | null
  grade: number
  semester: number
  description: string
  icon: string
  theme: string
  sort_order: number
  status: 'draft' | 'published' | 'archived'
  source_label: string
}
export interface UnitRow {
  id: string
  subject_id: string
  number: number
  title: string
  status: string
  sort_order: number
}
export interface LessonRow {
  id: string
  subject_id: string
  unit_id: string
  number: number
  title: string
  page_start: number | null
  page_end: number | null
  status: string
  legacy_id: string | null
}

export const STATUS_AR: Record<string, string> = {
  draft: 'مسودة',
  needs_review: 'بحاجة إلى مراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
  published: 'منشور',
  archived: 'مؤرشف',
}
export const statusChip = (s: string) =>
  `area__chip ${s === 'published' ? 'area__chip--ok' : s === 'rejected' || s === 'archived' ? 'area__chip--bad' : s === 'needs_review' || s === 'draft' ? 'area__chip--warn' : ''}`

export async function loadSubjects(): Promise<SubjectRow[]> {
  const { data, error } = await db().from('subjects').select('*').order('sort_order').order('name_ar')
  if (error) throw error
  return data as SubjectRow[]
}
export async function loadUnits(subjectId: string): Promise<UnitRow[]> {
  const { data, error } = await db().from('units').select('*').eq('subject_id', subjectId).order('number')
  if (error) throw error
  return data as UnitRow[]
}
export async function loadLessons(subjectId: string): Promise<LessonRow[]> {
  const { data, error } = await db().from('lessons').select('*').eq('subject_id', subjectId).order('number')
  if (error) throw error
  return data as LessonRow[]
}
