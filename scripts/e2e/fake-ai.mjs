// TEST-ONLY stand-in for Claude in the local emulator (EMU_FAKE_AI=1). It never calls any
// API and produces deterministic, clearly synthetic output so the pipeline (batches,
// checkpoints, validation, review, publishing) can be tested without spending money.
// It proves nothing about Claude's real output quality.
function sentences(text) {
  return String(text)
    .split(/[.؛\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 6)
}

export const fakeAi = {
  calls: 0,
  async json(call) {
    this.calls++
    const prompt = call.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n')
    if (call.schema.required?.includes('pages')) {
      const m = prompt.match(/من (\d+) إلى (\d+)/)
      const [from, to] = m ? [Number(m[1]), Number(m[2])] : [1, 1]
      const pages = []
      for (let p = from; p <= to; p++)
        pages.push({
          page_number: p,
          text: `نص تجريبي مستخرج من الصفحة ${p}. تتحدث هذه الصفحة التجريبية عن موضوع اختبار رقم ${p} لأغراض الفحص فقط.`,
          unit_title: 'الوحدة التجريبية',
          lesson_title: '',
          source_questions: [],
        })
      return { data: { pages }, inputTokens: 1500 * pages.length, outputTokens: 400 * pages.length }
    }
    const want = Number(prompt.match(/المطلوب: (\d+)/)?.[1] ?? 1)
    const pageBlocks = [...prompt.matchAll(/<page number="(\d+)">\n([\s\S]*?)\n<\/page>/g)].map((m) => ({ page: Number(m[1]), text: m[2] }))
    const all = pageBlocks.flatMap((p) => sentences(p.text).map((s) => ({ page: p.page, s })))
    const questions = []
    for (let i = 0; i < Math.min(want, all.length); i++) {
      const { page, s } = all[i]
      const w = s.split(/\s+/)
      const cut = Math.ceil(w.length / 2)
      const correct = w.slice(cut).join(' ')
      const distractors = all.filter((_, j) => j !== i).map((x) => x.s.split(/\s+/).slice(Math.ceil(x.s.split(/\s+/).length / 2)).join(' '))
        .filter((d) => d !== correct).slice(0, 3)
      while (distractors.length < 3) distractors.push(`خيار تجريبي غير صحيح ${distractors.length + 1}`)
      const options = [correct, ...distractors]
      const k = i % 4
      ;[options[0], options[k]] = [options[k], options[0]]
      questions.push({
        question: `أكمل العبارة من الدرس: «${w.slice(0, cut).join(' ')} …»`,
        options, correct_index: k, hint: `راجع الفكرة الرئيسية في الصفحة ${page}.`,
        explanation: `ورد في الصفحة ${page}: ${s}.`, difficulty: 1 + (i % 3), source_page: page, source_quote: s,
        from_source_question: false,
      })
    }
    return { data: { questions }, inputTokens: 900 * pageBlocks.length + 2500, outputTokens: 500 * questions.length }
  },
}
