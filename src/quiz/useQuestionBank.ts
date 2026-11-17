import { useEffect, useState } from 'react'
import type { QuestionBank } from '../questions/types'

/** Banks are code-split: they load only when the student opens the lessons. */
const LOADERS: Record<string, () => Promise<QuestionBank>> = {
  'religion-values-g8': () => import('../questions/banks/religionValuesG8').then((m) => m.RELIGION_VALUES_G8),
}

const cache = new Map<string, QuestionBank>()

export function useQuestionBank(bankId: string): { bank: QuestionBank | null; error: boolean } {
  const [bank, setBank] = useState<QuestionBank | null>(() => cache.get(bankId) ?? null)
  const [loadFailed, setLoadFailed] = useState(false)
  const error = !(bankId in LOADERS) || loadFailed

  useEffect(() => {
    const load = LOADERS[bankId]
    if (cache.has(bankId) || !load) return
    let alive = true
    load()
      .then((b) => {
        cache.set(bankId, b)
        if (alive) setBank(b)
      })
      .catch(() => alive && setLoadFailed(true))
    return () => {
      alive = false
    }
  }, [bankId])

  return { bank, error }
}
