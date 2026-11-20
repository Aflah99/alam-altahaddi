import { useAuth } from '../cloud/auth'
import { AreaMessage, AreaShell } from '../cloud/AreaShell'
import { BooksSection } from './sections/Books'
import { CommunitySection } from './sections/Community'
import { EconomySection } from './sections/Economy'
import { GenerateSection } from './sections/Generate'
import { HomeSection } from './sections/Home'
import { JobsSection } from './sections/Jobs'
import { LessonsSection } from './sections/Lessons'
import { ReportsSection } from './sections/Reports'
import { ReviewSection } from './sections/Review'
import { SettingsSection } from './sections/Settings'
import { SubjectsSection } from './sections/Subjects'

const NAV = [
  { id: 'home', label: 'الرئيسية' },
  { id: 'subjects', label: 'المواد الدراسية' },
  { id: 'lessons', label: 'الوحدات والدروس' },
  { id: 'community', label: 'المواد المجتمعية' },
  { id: 'books', label: 'الكتب والمصادر' },
  { id: 'generate', label: 'توليد الأسئلة' },
  { id: 'review', label: 'مراجعة الأسئلة' },
  { id: 'jobs', label: 'إدارة المهام' },
  { id: 'reports', label: 'التقارير' },
  { id: 'economy', label: 'الاقتصاد والصناديق' },
  { id: 'settings', label: 'الإعدادات' },
] as const

export type AdminNav = (path: string[]) => void

/**
 * لوحة المشرف. The UI hides itself from non-admins, but every action is enforced by
 * the database (admin-only policies and functions) and by the backend functions.
 */
export default function AdminApp({ path, navigate, onExit }: { path: string[]; navigate: AdminNav; onExit: () => void }) {
  const auth = useAuth()
  const { state } = auth
  if (state.status !== 'signed-in' || state.role !== 'admin') {
    return (
      <AreaMessage title="لوحة المشرف">
        <p>
          {state.status === 'disabled'
            ? 'الحسابات السحابية غير مفعّلة في هذه النسخة بعد.'
            : state.status === 'loading'
              ? 'جارٍ التحقّق من الجلسة…'
              : 'هذه اللوحة للمشرفين فقط. سجّل الدخول بحساب مشرف.'}
        </p>
        <button type="button" className="area__btn" onClick={onExit}>
          العودة
        </button>
      </AreaMessage>
    )
  }
  const section = (NAV.find((n) => n.id === path[0])?.id ?? 'home') as (typeof NAV)[number]['id']
  const arg = path[1]
  return (
    <AreaShell
      title="لوحة المشرف"
      subtitle={state.email ?? undefined}
      nav={NAV}
      active={section}
      onNav={(id) => navigate([id])}
      onExit={onExit}
      onSignOut={() => void auth.signOut().then(onExit)}
    >
      {section === 'home' && <HomeSection navigate={navigate} />}
      {section === 'subjects' && <SubjectsSection navigate={navigate} />}
      {section === 'lessons' && <LessonsSection subjectId={arg} navigate={navigate} />}
      {section === 'community' && <CommunitySection arg={arg} navigate={navigate} />}
      {section === 'books' && <BooksSection navigate={navigate} />}
      {section === 'generate' && <GenerateSection navigate={navigate} />}
      {section === 'review' && <ReviewSection key={arg?.includes(':') ? arg : 'all'} questionId={arg} navigate={navigate} />}
      {section === 'jobs' && <JobsSection jobId={arg} navigate={navigate} />}
      {section === 'reports' && <ReportsSection />}
      {section === 'economy' && <EconomySection />}
      {section === 'settings' && <SettingsSection />}
    </AreaShell>
  )
}
