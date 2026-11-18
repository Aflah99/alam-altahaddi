import { useAuth } from '../cloud/auth'
import { AreaMessage } from '../cloud/AreaShell'

/** Placeholder until Phase B (administrator dashboard). */
export default function AdminApp({ onExit }: { path: string[]; navigate: (path: string[]) => void; onExit: () => void }) {
  const { state } = useAuth()
  const ok = state.status === 'signed-in' && state.role === 'admin'
  return (
    <AreaMessage title="لوحة المشرف">
      <p>{ok ? 'لوحة المشرف قيد الإعداد.' : 'هذه اللوحة للمشرفين فقط.'}</p>
      <button type="button" className="area__btn" onClick={onExit}>
        العودة
      </button>
    </AreaMessage>
  )
}
