import type { ChildRow } from './ParentApp'

/** Placeholder until Phase C (analytics). */
export function ParentChildDashboard({ kids }: { kids: ChildRow[]; childId?: string; onPick: (id: string) => void }) {
  return <p className="area__info">{kids.length ? 'لوحة النتائج قيد الإعداد.' : 'أضف ابنًا أولًا.'}</p>
}
