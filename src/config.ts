/** Static, public app configuration. Never put secrets here. */
export const APP_NAME = 'عالم التحدّي'

/**
 * Public Supabase settings will be read from Vite env vars in a later task.
 * Only `VITE_`-prefixed, browser-safe values belong on the client.
 */
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
}
