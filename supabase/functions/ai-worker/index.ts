// Edge Function entry point (Deno). Wires real dependencies into handler.ts:
// the Anthropic SDK (key from the function's secrets), pdf-lib and mammoth.
import Anthropic from 'npm:@anthropic-ai/sdk'
import mammoth from 'npm:mammoth@1'
import { PDFDocument } from 'npm:pdf-lib@1'
import { adminClient } from '../_shared/http.ts'
import { handleAiWorker, type AiClient, type PdfTools } from './handler.ts'

function anthropicClient(): AiClient | null {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return null
  const client = new Anthropic({ apiKey })
  return {
    async json(call) {
      // Streaming keeps long extractions under HTTP timeouts. Structured outputs constrain the
      // JSON; server-side validation (quality.ts) still checks every draft. Opus/Sonnet get the
      // server-side refusal fallback; Haiku has none.
      const params: Record<string, unknown> = {
        model: call.model,
        max_tokens: call.maxTokens,
        system: call.system,
        messages: [{ role: 'user', content: call.content }],
        output_config: { effort: call.effort, format: { type: 'json_schema', schema: call.schema } },
      }
      if (!call.model.startsWith('claude-haiku')) {
        params.betas = ['server-side-fallback-2026-07-01']
        params.fallbacks = 'default'
      }
      // deno-lint-ignore no-explicit-any
      const stream = (client.beta.messages as any).stream(params)
      const msg = await stream.finalMessage()
      if (msg.stop_reason === 'refusal') throw new Error('رفض النموذج هذا الطلب؛ راجع المحتوى أو جرّب نطاق صفحات آخر.')
      if (msg.stop_reason === 'max_tokens') throw new Error('انقطع الرد لطوله؛ قلّل عدد الصفحات أو الأسئلة في الدفعة.')
      // deno-lint-ignore no-explicit-any
      const text = (msg.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join('')
      return {
        data: JSON.parse(text),
        inputTokens: (msg.usage?.input_tokens ?? 0) + (msg.usage?.cache_creation_input_tokens ?? 0) + (msg.usage?.cache_read_input_tokens ?? 0),
        outputTokens: msg.usage?.output_tokens ?? 0,
      }
    },
  }
}

const pdf: PdfTools = {
  async pageCount(bytes) {
    return (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount()
  },
  async slice(bytes, from, to) {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const out = await PDFDocument.create()
    const idx = Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i)
    for (const p of await out.copyPages(src, idx)) out.addPage(p)
    return await out.save()
  },
}

Deno.serve((req) =>
  handleAiWorker(req, {
    admin: adminClient(),
    env: (k) => Deno.env.get(k),
    ai: anthropicClient(),
    pdf,
    docxToText: async (bytes) => (await mammoth.extractRawText({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) })).value,
  }),
)
