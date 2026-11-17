import { buildBank } from '../normalize'
import type { AuthoringLessonFile } from '../types'

/**
 * ديني قيمي — Grade 8, semester 1 revision booklet («زاد الطالب»).
 * Questions were converted from the provided PDF (93 pages) and reviewed
 * against the rendered pages. The PDF itself is NOT part of this repository.
 */
const files = import.meta.glob<AuthoringLessonFile>('../data/religion-values-g8/*.json', {
  eager: true,
  import: 'default',
})

export const RELIGION_VALUES_G8 = buildBank(
  {
    id: 'religion-values-g8',
    subjectId: 'religion-values',
    prefix: 'rv8',
    title: 'زاد الطالب في مادة ديني قيمي — الصف الثامن، الفصل الدراسي الأول',
    pdfPages: 93,
  },
  Object.values(files),
)
