// Generates docs/question-bank/religion-values-g8-coverage.md from the authoring files.
// Usage: npm run report:coverage
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const DATA = 'src/questions/data/religion-values-g8'
const OUT_DIR = 'docs/question-bank'
const ar = new Intl.NumberFormat('ar-EG')
const files = readdirSync(DATA)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(DATA, f), 'utf8')))
  .sort((a, b) => a.unit - b.unit || a.lesson - b.lesson)

const UNIT = ['', 'الوحدة الأولى', 'الوحدة الثانية', 'الوحدة الثالثة']
let src = 0
let pub = 0
let exc = 0
const rows = []
const flagged = []
for (const f of files) {
  const n = f.questions.filter((q) => (q.status ?? 'approved') === 'approved').length
  src += f.sourceQuestions
  pub += n
  exc += f.excluded.length
  rows.push(`| ${f.unit} | ${f.lesson} | ${f.title} | ${f.pages[0]}–${f.pages[1]} | ${f.sourceQuestions} | ${n} | ${f.excluded.length} |`)
  for (const e of f.excluded) if (e.reason === 'flagged-source') flagged.push(`- **U${f.unit} L${f.lesson} (${f.title}), Q${e.source}:** ${e.detail}`)
}

const byReason = {}
for (const f of files) for (const e of f.excluded) byReason[e.reason] = (byReason[e.reason] ?? 0) + 1

let md = `# Coverage report — ديني قيمي, Grade 8 (semester 1)

Source: «زاد الطالب في مادة ديني قيمي» — الصف الثامن الأساسي، الفصل الدراسي الأول ٢٠٢٥–٢٠٢٦ (إعداد: أ. فاطمة القرطوبية).
The PDF is **not** stored in this repository. Only adapted multiple-choice questions are published.

- **PDF pages provided and inspected:** 93 of 93 (pages 1–93). The file name ends in "1-93"; if the original booklet has more pages (the brief mentions 121), pages 94+ were **not provided** and are not covered.
- **Page numbers:** the booklet has no printed page numbers, so every reference is the PDF page number.
- **Structure found:** 3 units × 7 lessons = 21 lessons (pages 1–3 are the cover, a supplication page and the Unit 1 title page; unit title pages are 3, 33 and 63).
- **Method:** every page was read from the rendered page image (text extraction garbles Arabic diacritics and Quranic text, so it was used only as an index). Questions were converted lesson by lesson, keeping the documented answers. Distractors are taken from other facts in the same booklet wherever possible, so each is demonstrably wrong for its question.

## Totals

| | Count |
| --- | --- |
| Numbered source questions found | ${src} |
| Published multiple-choice questions | ${pub} |
| Exclusion / merge records | ${exc} |

Some source questions are multi-part or tables and were split into several MCQs, so published questions can exceed source questions for a lesson.

Exclusion reasons: ${Object.entries(byReason).map(([k, v]) => `${k} ${v}`).join(', ')}.

- **duplicate / merged** — same fact as another published question, or folded into one.
- **split** — converted as several single-answer items.
- **too-open / list** — opinion, open lists or paragraph answers with no single defensible option set.
- **image / too-long** — depends on a picture, diagram or a long passage that should not be reproduced.
- **sensitive** — no single defensible answer without reproducing sensitive detail.
- **flagged-source** — the source itself appears wrong or ambiguous; **not published**, needs teacher review.

## Flagged source problems (not published)

${flagged.join('\n')}

## Lesson-by-lesson coverage

| Unit | Lesson | Title | PDF pages | Source questions | Published MCQs | Exclusions |
| --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}
| | | **Total** | 1–93 | **${src}** | **${pub}** | **${exc}** |

## Exclusions by lesson

`
for (const f of files) {
  md += `\n### ${UNIT[f.unit]} — الدرس ${ar.format(f.lesson)}: ${f.title}\n\n`
  if (!f.excluded.length) md += '_None._\n'
  for (const e of f.excluded) md += `- Q${e.source} — **${e.reason}**: ${e.detail}\n`
}
md += `
## Validation

Every published question passes the automated pipeline (\`src/questions/validate.ts\`, run by \`npm test\`):
question text present; exactly four non-empty, distinct options (word order, digits and negation respected);
exactly one correct option; the hint does not contain the answer; the explanation shares the answer's key words;
the page reference lies inside the lesson's pages; no broken extraction characters; no near-duplicates.
Automated checks do not prove academic correctness — that rests on the page-by-page reading described above.
`
mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(join(OUT_DIR, 'religion-values-g8-coverage.md'), md)
console.log(`wrote ${OUT_DIR}/religion-values-g8-coverage.md — ${src} source, ${pub} published, ${exc} exclusions`)
