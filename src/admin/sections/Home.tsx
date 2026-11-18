import { ar } from '../../quiz/format'
import type { AdminNav } from '../AdminApp'
import { rpc, useLoad } from '../data'

interface Dash {
  subjects: number
  published_subjects: number
  lessons: number
  questions_published: number
  questions_review: number
  flagged: number
  open_flags: number
  textbooks: number
  jobs_active: number
  students: number
  ai_enabled: boolean
  ai_questions_today: number
  ai_pages_today: number
  ai_month_usd: number
  ai_month_budget: number
}

export function HomeSection({ navigate }: { navigate: AdminNav }) {
  const { data, error } = useLoad(() => rpc<Dash>('admin_dashboard'), [])
  return (
    <>
      <h1 className="area__h1">الرئيسية</h1>
      {error && <p className="area__error">{error}</p>}
      {data && (
        <>
          <div className="area__grid">
            <Stat n={data.published_subjects} label={`مادة منشورة من ${ar(data.subjects)}`} />
            <Stat n={data.lessons} label="درسًا" />
            <Stat n={data.questions_published} label="سؤالًا منشورًا" />
            <Stat n={data.questions_review} label="بانتظار المراجعة" onClick={() => navigate(['review'])} />
            <Stat n={data.open_flags + data.flagged} label="مسائل أكاديمية مفتوحة" onClick={() => navigate(['reports'])} />
            <Stat n={data.textbooks} label="كتابًا ومصدرًا" onClick={() => navigate(['books'])} />
            <Stat n={data.jobs_active} label="مهمة توليد نشطة" onClick={() => navigate(['jobs'])} />
            <Stat n={data.students} label="حساب طالب" />
          </div>
          <div className="area__card" style={{ marginTop: 14 }}>
            <h2 className="area__h2" style={{ marginTop: 0 }}>استخدام الذكاء الاصطناعي</h2>
            <p>
              الحالة: <strong>{data.ai_enabled ? 'مفعّل' : 'معطّل'}</strong> · اليوم: {ar(data.ai_questions_today)} سؤالًا و{ar(data.ai_pages_today)} صفحة ·
              هذا الشهر: US${Number(data.ai_month_usd).toFixed(2)} من ميزانية US${Number(data.ai_month_budget).toFixed(2)}
            </p>
            <p className="area__muted">التكلفة الشهرية مجموع تكلفة الدفعات المنفّذة بحسب الأسعار المسجّلة في الإعدادات (تقديرية؛ الفاتورة الفعلية في حساب Anthropic).</p>
          </div>
        </>
      )}
    </>
  )
}

function Stat({ n, label, onClick }: { n: number; label: string; onClick?: () => void }) {
  return (
    <div className="area__stat" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <b>{ar(n)}</b>
      <span>{label}</span>
    </div>
  )
}
