import type { ChildRow } from './ParentApp'

/** Placeholder until Phase C (privacy controls). */
export function ParentPrivacy({ kids }: { kids: ChildRow[]; reload: () => Promise<void> }) {
  return <p className="area__info">{kids.length ? 'إعدادات الخصوصية قيد الإعداد.' : 'أضف ابنًا أولًا.'}</p>
}
