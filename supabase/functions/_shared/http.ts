// Deno-only: builds the service-role client from the function environment.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { Ctx } from './respond.ts'

export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')!
  let key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!key) {
    // Newer projects expose secret API keys as JSON.
    try {
      const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
      key = Object.values(keys)[0] ?? ''
    } catch {
      key = ''
    }
  }
  if (!url || !key) throw new Error('server not configured')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Wires a runtime-neutral handler to Deno.serve. */
export function serve(handler: (req: Request, ctx: Ctx) => Promise<Response>) {
  Deno.serve((req) => handler(req, { admin: adminClient(), env: (k) => Deno.env.get(k) }))
}
