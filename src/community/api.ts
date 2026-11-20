import { supabase } from '../cloud/client'

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const c = supabase()
  if (!c) throw new Error('cloud not configured')
  const { data, error } = await c.rpc(fn, args)
  if (error) throw error
  return data as T
}

export type Visibility = 'public' | 'private' | 'invite'
export const VISIBILITY_AR: Record<Visibility, string> = { public: 'عام', private: 'خاص', invite: 'بالدعوة' }
export const VISIBILITY_HELP: Record<Visibility, string> = {
  public: 'تظهر في البحث ويمكن لأي طالب مسجّل الاشتراك فيها واللعب مباشرة.',
  private: 'لا تظهر لأحد غير عائلتك، ولا يمكن الوصول إليها بتخمين الرابط.',
  invite: 'لا تظهر في البحث. يشترك فقط من يملك رمز الدعوة الذي ترسله له.',
}
export type Status = 'draft' | 'published' | 'archived'
export const STATUS_AR: Record<Status, string> = { draft: 'مسودة', published: 'منشورة', archived: 'مؤرشفة' }
export const CATEGORIES = ['علوم', 'رياضيات', 'لغة عربية', 'لغة إنجليزية', 'دراسات اجتماعية', 'تربية إسلامية', 'تقنية', 'ثقافة عامة', 'أخرى'] as const
export const ICONS: [string, string][] = [
  ['book', 'كتاب'], ['star', 'نجمة'], ['flask', 'مختبر'], ['globe', 'كرة أرضية'], ['calc', 'حاسبة'], ['quill', 'قلم'], ['leaf', 'ورقة شجر'], ['gear', 'ترس'],
]
export const THEMES: [string, string][] = [['meadow', 'مرج'], ['forest', 'غابة'], ['desert', 'صحراء'], ['castle', 'قلعة'], ['future', 'مستقبل']]

export interface Counts { units: number; lessons: number; questions: number; mcq: number; written: number }
export interface Rating { avg: number | null; count: number; score: number }

export interface MyCourse {
  id: string; slug: string; name_ar: string; description: string; grade: number; category: string; icon: string; theme: string
  status: Status; visibility: Visibility; moderation: 'ok' | 'suspended' | 'removed'; moderation_note: string
  published_at: string | null; updated_at: string; counts: Counts; rating: Rating; enrollments: number; my_children_enrolled: number
}
export interface EditorQuestion {
  id: string; qtype: 'mcq' | 'written'; text: string; hint: string; explanation: string
  options: string[] | null; correct_option: string | null; accepted_answers: string[]; used: boolean
}
export interface EditorLesson { id: string; number: number; title: string; questions: EditorQuestion[] }
export interface EditorUnit { id: string; number: number; title: string; lessons: EditorLesson[] }
export interface CourseDetail {
  course: {
    id: string; slug: string; name_ar: string; description: string; grade: number; category: string; icon: string; theme: string; status: Status
    visibility: Visibility; moderation: 'ok' | 'suspended' | 'removed'; moderation_note: string; source_label: string; published_at: string | null
    updated_at: string; version: number; creator_name: string
  }
  counts: Counts
  units: EditorUnit[]
}
export interface ValidationIssue { code: string; where?: string; have?: number; need?: number; title?: string; unit?: number }
export interface Validation { ok: boolean; errors: ValidationIssue[]; warnings: ValidationIssue[]; counts: Counts }
export interface CourseInput {
  name_ar?: string; description?: string; grade?: number; category?: string; source_label?: string; icon?: string; theme?: string; visibility?: Visibility
}
export interface QuestionInput {
  id?: string; lesson_id?: string; qtype: 'mcq' | 'written'; text: string; hint?: string; explanation?: string
  options?: string[]; correct_option?: string | null; accepted_answers?: string[]
}

export const myCourses = () => call<MyCourse[]>('cc_my_courses')
export const getCourse = (id: string) => call<CourseDetail>('cc_get_course', { p_id: id })
export const createCourse = (p: CourseInput) => call<string>('cc_create_course', { p })
export const updateCourse = (id: string, p: CourseInput) => call<void>('cc_update_course', { p_id: id, p })
export const saveUnit = (subject: string, unit: string | null, title: string) => call<string>('cc_save_unit', { p_subject: subject, p_unit: unit, p_title: title })
export const saveLesson = (unit: string, lesson: string | null, title: string) => call<string>('cc_save_lesson', { p_unit: unit, p_lesson: lesson, p_title: title })
export const deleteUnit = (unit: string) => call<'deleted' | 'archived'>('cc_delete_unit', { p_unit: unit })
export const deleteLesson = (lesson: string) => call<'deleted' | 'archived'>('cc_delete_lesson', { p_lesson: lesson })
export const reorder = (kind: 'unit' | 'lesson' | 'question', parent: string, ids: string[]) => call<void>('cc_reorder', { p_kind: kind, p_parent: parent, p_ids: ids })
export const saveQuestion = (p: QuestionInput) => call<{ id: string; versioned: boolean }>('cc_save_question', { p })
export const deleteQuestion = (id: string) => call<'deleted' | 'archived'>('cc_delete_question', { p_id: id })
export const importQuestions = (lesson: string, items: unknown[], request: string) =>
  call<{ imported: number; skipped_duplicates: number; replay: boolean }>('cc_import_questions', { p_lesson: lesson, p_items: items, p_request: request })
export const validateCourse = (id: string) => call<Validation>('cc_validate', { p_id: id })
export const setStatus = (id: string, status: Status) => call<{ status: Status }>('cc_set_status', { p_id: id, p_status: status })
export const setVisibility = (id: string, v: Visibility) => call<{ visibility: Visibility; students_without_access: number }>('cc_set_visibility', { p_id: id, p_visibility: v })
export const courseInvite = (id: string) =>
  call<{ code: string; expires_at: string; max_uses: number; uses: number; invited_families: number } | null>('cc_course_invite', { p_id: id })
export const createInvite = (id: string, days = 30, maxUses = 50) =>
  call<{ code: string; expires_at: string; max_uses: number }>('cc_create_invite', { p_id: id, p_days: days, p_max_uses: maxUses })
export const revokeInvites = (id: string, removeAccess: boolean) => call<number>('cc_revoke_invites', { p_id: id, p_remove_access: removeAccess })
export const deleteCourse = (id: string) => call<'deleted' | 'archived'>('cc_delete_course', { p_id: id })
export const setCreatorName = (name: string) => call<string>('cc_set_creator_name', { p_name: name })

/* ---------- discovery (students and parents) ---------- */
export interface CourseCard {
  id: string; slug: string; name_ar: string; description: string; grade: number; category: string; icon: string; theme: string
  kind: 'official' | 'community'; visibility: Visibility; source_label: string; creator_name: string | null; published_at: string | null
  unit_count: number; lesson_count: number; question_count: number; rating_avg: number | null; rating_count: number; favorites: number
  enrollments: number; enrolled: boolean; favorited: boolean; my_rating: number | null; is_mine: boolean
  outline?: { title: string; lessons: { title: string; questions: number }[] }[]
  available?: boolean; missions_total?: number; missions_done?: number
}
export type Sort = 'relevance' | 'popular' | 'rating' | 'recent'
export interface SearchArgs { q: string; grade: number | null; category: string; sort: Sort; favorites: boolean; limit: number; offset: number }
export const searchCourses = (a: SearchArgs) =>
  call<{ total: number; items: CourseCard[] }>('search_courses', { p_q: a.q, p_grade: a.grade, p_category: a.category, p_sort: a.sort, p_favorites: a.favorites, p_limit: a.limit, p_offset: a.offset })
export const courseCard = (id: string) => call<CourseCard>('course_card', { p_subject: id })
export const enrollCourse = (id: string) => call<CourseCard>('enroll_course', { p_subject: id })
export const unenrollCourse = (id: string) => call<void>('unenroll_course', { p_subject: id })
export const myEnrolled = () => call<CourseCard[]>('my_courses')
export const communityInfo = () =>
  call<{ allowed: boolean; rewards_enabled: boolean; xp_per_question: number; coins_per_question: number; mission_xp: number; mission_coins: number
    daily_xp_cap: number; daily_coin_cap: number; used_xp: number; used_coins: number; import_batch_max: number; max_questions_per_course: number }>('community_info')
export const redeemInvite = (code: string) => call<{ status: 'ok' | 'invalid'; subject_id?: string; course?: CourseCard }>('redeem_course_invite', { p_code: code })
export const toggleFavorite = (id: string, on: boolean) => call<boolean>('toggle_course_favorite', { p_subject: id, p_on: on })
export const rateCourse = (id: string, stars: number) => call<Rating>('rate_course', { p_subject: id, p_stars: stars })
export const reportCourse = (id: string, category: string, details: string) => call<{ status: 'reported' | 'already_reported' }>('report_course', { p_subject: id, p_category: category, p_details: details })

/* ---------- parent oversight ---------- */
export interface ChildCourse {
  id: string; name_ar: string; creator_name: string; visibility: Visibility; category: string; status: 'active' | 'removed'; blocked: boolean
  enrolled_at: string; available: boolean; moderation: string; answered: number; missions_done: number; last_played: string | null
}
export const childCourses = (student: string) => call<{ community_allowed: boolean; courses: ChildCourse[] }>('parent_child_courses', { p_student: student })
export const setCourseBlock = (student: string, subject: string, blocked: boolean) => call<void>('parent_set_course_block', { p_student: student, p_subject: subject, p_blocked: blocked })
export const setCommunityAllowed = (student: string, allowed: boolean) => call<void>('parent_set_community_allowed', { p_student: student, p_allowed: allowed })

export const REPORT_CATEGORIES: [string, string][] = [
  ['incorrect', 'محتوى أكاديمي غير صحيح'],
  ['inappropriate', 'محتوى غير مناسب'],
  ['copyright', 'مخاوف حقوق النشر'],
  ['misleading', 'معلومات مضلّلة عن المادة'],
  ['other', 'مشكلة أخرى'],
]

/** Arabic text for backend errors raised by the community functions. */
export function communityError(e: unknown): string {
  const err = e as { message?: string; details?: string }
  const msg = String(err?.message ?? e)
  const detail = String(err?.details ?? '')
  const field: Record<string, string> = { text: 'نص السؤال', hint: 'التلميح', explanation: 'الشرح', option: 'أحد الخيارات', answer: 'إحدى الإجابات', name: 'اسم المادة', description: 'الوصف', category: 'التصنيف', source: 'المصدر', unit_title: 'عنوان الوحدة', lesson_title: 'عنوان الدرس', creator_name: 'اسم المبدع' }
  const f = field[detail] ? ` (${field[detail]})` : ''
  const table: [RegExp, string][] = [
    [/unsafe_content/, `يحتوي النص على روابط أو رموز برمجية أو كلمات غير مسموحة${f}. عدّله ثم أعد المحاولة.`],
    [/official_claim/, `لا يجوز أن تدّعي المادة أنها رسمية أو معتمدة أو موثّقة من الإدارة${f}. عدّل النص.`],
    [/text_too_short/, `النص قصير جدًّا${f}.`],
    [/text_too_long/, `النص أطول من الحد المسموح${f}.`],
    [/invalid_question/, 'هناك سؤال غير صالح: تأكد من وجود أربعة خيارات مختلفة وإجابة صحيحة واحدة، أو إجابة نموذجية للسؤال الكتابي.'],
    [/duplicate_question/, 'يوجد سؤال بالنص نفسه في هذه المادة.'],
    [/batch_too_large/, 'عدد الأسئلة في الدفعة أكبر من الحد المسموح. استورد على دفعات أصغر.'],
    [/invalid_batch/, 'لا توجد أسئلة صالحة للاستيراد.'],
    [/limit_reached/, 'وصلت إلى الحد المسموح (عدد المواد أو الوحدات أو الدروس أو الأسئلة).'],
    [/rate_limited/, 'عمليات كثيرة في وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.'],
    [/validation_failed/, 'المادة غير جاهزة للنشر بعد. راجع قائمة المشاكل.'],
    [/course_suspended/, 'هذه المادة موقوفة من الإدارة ولا يمكن تعديلها أو نشرها.'],
    [/course_archived/, 'هذه المادة مؤرشفة. أعدها إلى مسودة أولًا.'],
    [/reorder_mismatch/, 'تغيّر الترتيب أثناء التعديل. أعد تحميل الصفحة وحاول مرة أخرى.'],
    [/blocked_by_parent/, 'قام ولي أمرك بإيقاف هذه المادة.'],
    [/community_disabled/, 'ولي أمرك أوقف المواد المجتمعية في حسابك.'],
    [/own_course/, 'لا يمكنك تقييم أو الإبلاغ عن مادة أنشأتها عائلتك.'],
    [/play_first/, 'أكمل مهمة واحدة على الأقل في هذه المادة قبل تقييمها.'],
    [/invalid rating/, 'التقييم من ١ إلى ٥ نجوم.'],
    [/course not found/, 'المادة غير موجودة أو غير متاحة لك.'],
    [/parent account required/, 'إنشاء المواد متاح لحسابات أولياء الأمور فقط.'],
  ]
  for (const [re, ar] of table) if (re.test(msg)) return ar
  return ''
}
