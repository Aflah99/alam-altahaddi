import type { ChildRow } from './ParentApp'

/** Placeholder until Phase C (private groups). */
export function ParentGroups({ kids }: { kids: ChildRow[] }) {
  return <p className="area__info">{kids.length ? 'المجموعات الخاصة قيد الإعداد.' : 'أضف ابنًا أولًا.'}</p>
}
