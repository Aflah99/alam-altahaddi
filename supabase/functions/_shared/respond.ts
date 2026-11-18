// Runtime-neutral helpers (work in Deno Edge Functions and in Node test harnesses).
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2'
import { allowedOrigin } from './accounts.ts'

export type Env = (name: string) => string | undefined

export interface Ctx {
  /** Service-role client (secret key lives only in the function environment). */
  admin: SupabaseClient
  env: Env
}

export function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = allowedOrigin(req.headers.get('origin'), env('ALLOWED_ORIGINS'))
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

export function json(req: Request, env: Env, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req, env), 'Content-Type': 'application/json' } })
}

/** The signed-in caller (token verified by Supabase Auth) and their server-side role. */
export async function caller(req: Request, admin: SupabaseClient): Promise<{ user: User; role: string } | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null
  const { data: p } = await admin.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
  return { user: data.user, role: (p?.role as string) ?? '' }
}

export async function audit(admin: SupabaseClient, actor: string | null, action: string, entity: string, entityId: string, details: unknown = {}) {
  await admin.from('audit_log').insert({ actor_id: actor, action, entity, entity_id: entityId, details })
}
