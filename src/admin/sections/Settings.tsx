import { useEffect, useState } from 'react'
import { adminError, db } from '../data'

interface AiSettings {
  enabled: boolean
  model: string
  effort: string
  pages_per_batch: number
  max_pages_per_job: number
  max_questions_per_job: number
  daily_question_limit: number
  daily_page_limit: number
  max_concurrent_jobs: number
  monthly_budget_usd: number
  price_input_per_mtok: number
  price_output_per_mtok: number
}

const MODELS: [string, string, number, number][] = [
  ['claude-opus-5-5', 'Claude Opus 5.5 (الأدق، الافتراضي)', 4, 20],
  ['claude-sonnet-5-5', 'Claude Sonnet 5.5', 2, 10],
  ['claude-haiku-5-5', 'Claude Haiku 5.5 (الأرخص)', 0.1, 0.5],
]

/** الإعدادات — AI spending controls (off by default) and game protections. */
export function SettingsSection() {
  const [s, setS] = useState<AiSettings | null>(null)
  const [game, setGame] = useState<{ pass_accuracy: number; max_answers_per_minute: number; max_sessions_per_hour: number } | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    void (async () => {
      const a = await db().from('ai_settings').select('*').maybeSingle()
      const g = await db().from('game_settings').select('pass_accuracy, max_answers_per_minute, max_sessions_per_hour').maybeSingle()
      if (a.error || g.error) setMsg({ ok: false, text: adminError(a.error ?? g.error) })
      setS(a.data as AiSettings)
      setGame(g.data)
    })()
  }, [])

  const save = async () => {
    if (!s || !game) return
    setMsg(null)
    const a = await db().from('ai_settings').update({ ...s, updated_at: new Date().toISOString() }).eq('id', true)
    const g = await db().from('game_settings').update(game).eq('id', true)
    if (a.error || g.error) setMsg({ ok: false, text: adminError(a.error ?? g.error) })
    else setMsg({ ok: true, text: 'حُفظت الإعدادات.' })
  }

  if (!s || !game) return <p className="area__muted">{msg?.text ?? 'جارٍ التحميل…'}</p>
  const num = (k: keyof AiSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) })

  return (
    <>
      <h1 className="area__h1">الإعدادات</h1>
      {msg && <p className={msg.ok ? 'area__ok' : 'area__error'}>{msg.text}</p>}
      <div className="area__card area__form">
        <h2 className="area__h2" style={{ marginTop: 0 }}>الذكاء الاصطناعي والتكلفة</h2>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} /> تفعيل التوليد (يتطلب مفتاح Anthropic في أسرار الدوال الخلفية)
        </label>
        <div className="area__row">
          <label>
            النموذج
            <select
              value={s.model}
              onChange={(e) => {
                const m = MODELS.find((x) => x[0] === e.target.value)!
                setS({ ...s, model: m[0], price_input_per_mtok: m[2], price_output_per_mtok: m[3] })
              }}
            >
              {MODELS.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            الجهد
            <select value={s.effort} onChange={(e) => setS({ ...s, effort: e.target.value })}>
              <option value="low">منخفض</option>
              <option value="medium">متوسط</option>
              <option value="high">مرتفع</option>
            </select>
          </label>
        </div>
        <div className="area__row">
          <label>
            صفحات لكل دفعة
            <input type="number" min={1} max={20} value={s.pages_per_batch} onChange={num('pages_per_batch')} />
          </label>
          <label>
            أقصى صفحات لكل مهمة
            <input type="number" min={1} value={s.max_pages_per_job} onChange={num('max_pages_per_job')} />
          </label>
          <label>
            أقصى أسئلة لكل مهمة
            <input type="number" min={1} value={s.max_questions_per_job} onChange={num('max_questions_per_job')} />
          </label>
        </div>
        <div className="area__row">
          <label>
            حد الأسئلة اليومي
            <input type="number" min={0} value={s.daily_question_limit} onChange={num('daily_question_limit')} />
          </label>
          <label>
            حد الصفحات اليومي
            <input type="number" min={0} value={s.daily_page_limit} onChange={num('daily_page_limit')} />
          </label>
          <label>
            مهام متزامنة
            <input type="number" min={1} max={10} value={s.max_concurrent_jobs} onChange={num('max_concurrent_jobs')} />
          </label>
        </div>
        <div className="area__row">
          <label>
            الميزانية الشهرية (دولار)
            <input type="number" min={0} step="0.5" value={s.monthly_budget_usd} onChange={num('monthly_budget_usd')} />
          </label>
          <label>
            سعر الإدخال لكل مليون رمز
            <input type="number" min={0} step="0.01" value={s.price_input_per_mtok} onChange={num('price_input_per_mtok')} />
          </label>
          <label>
            سعر الإخراج لكل مليون رمز
            <input type="number" min={0} step="0.01" value={s.price_output_per_mtok} onChange={num('price_output_per_mtok')} />
          </label>
        </div>
        <p className="area__muted">
          لا يبدأ أي توليد تلقائيًّا عند رفع كتاب. كل مهمة تعرض تقديرًا تقريبيًّا وتحتاج إلى تأكيد مشرف، وتُرفض إذا تجاوزت الحدود اليومية أو الميزانية الشهرية. الأسعار هنا
          للتقدير الداخلي؛ تحقّق من أسعار Anthropic الحالية ومن حد الإنفاق في حسابك.
        </p>
      </div>
      <div className="area__card area__form">
        <h2 className="area__h2" style={{ marginTop: 0 }}>حماية اللعبة</h2>
        <div className="area__row">
          <label>
            نسبة النجاح لمكافأة المهمة (٪)
            <input type="number" min={1} max={100} value={game.pass_accuracy} onChange={(e) => setGame({ ...game, pass_accuracy: Number(e.target.value) })} />
          </label>
          <label>
            أقصى إجابات في الدقيقة
            <input type="number" min={5} value={game.max_answers_per_minute} onChange={(e) => setGame({ ...game, max_answers_per_minute: Number(e.target.value) })} />
          </label>
          <label>
            أقصى مهمات في الساعة
            <input type="number" min={5} value={game.max_sessions_per_hour} onChange={(e) => setGame({ ...game, max_sessions_per_hour: Number(e.target.value) })} />
          </label>
        </div>
      </div>
      <button type="button" className="area__btn" onClick={() => void save()}>
        حفظ الإعدادات
      </button>
    </>
  )
}
