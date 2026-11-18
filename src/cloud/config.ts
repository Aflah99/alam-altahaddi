/**
 * Cloud (Supabase) configuration. Only PUBLIC values may live here: the project URL
 * and the publishable key are designed to be shipped to browsers, and every table is
 * protected by Row Level Security. Secret keys and the Anthropic key exist only in
 * Supabase Edge Function secrets.
 *
 * Without these variables the game runs exactly as before, as a device-local guest.
 */
const env = import.meta.env

export const SUPABASE_URL: string = env.VITE_SUPABASE_URL ?? ''
export const SUPABASE_PUBLISHABLE_KEY: string = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? ''

// https only, except a local test backend on this machine.
export const cloudEnabled = (SUPABASE_URL.startsWith('https://') || /^http:\/\/localhost:\d+$/.test(SUPABASE_URL)) && SUPABASE_PUBLISHABLE_KEY.length > 20

/**
 * Children sign in with a username, not an email. The backend creates their auth
 * account with this non-routable internal address, which never receives mail.
 * Must match STUDENT_EMAIL_DOMAIN in supabase/functions/_shared/accounts.ts.
 */
export const STUDENT_EMAIL_DOMAIN = env.VITE_STUDENT_EMAIL_DOMAIN || 'students.alam-altahaddi.invalid'

export const studentEmail = (username: string) => `${username.trim().toLowerCase()}@${STUDENT_EMAIL_DOMAIN}`

/** Where Supabase sends people back after email confirmation / password reset. */
export const authRedirectUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}`

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/
