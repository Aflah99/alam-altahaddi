import { createContext, useContext } from 'react'
import type { Role } from './types'

export type AuthState =
  | { status: 'disabled' }
  | { status: 'loading' }
  | { status: 'signed-out'; expired: boolean }
  | { status: 'signed-in'; userId: string; email: string | null; role: Role | null; recovery: boolean }

export interface AuthApi {
  state: AuthState
  signInStudent: (username: string, password: string) => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpParent: (email: string, password: string, displayName: string) => Promise<{ needsConfirmation: boolean }>
  sendPasswordReset: (email: string) => Promise<void>
  resendConfirmation: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  signOut: () => Promise<void>
  /** Re-reads the role (e.g. right after an owner promotes an account). */
  refreshRole: () => Promise<void>
}

export const AuthContext = createContext<AuthApi | null>(null)

export function useAuth(): AuthApi {
  const v = useContext(AuthContext)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}

export const PASSWORD_MIN = 8

/** Same rule as the Supabase Auth policy of the production project (and passwordProblem in
 *  supabase/functions/_shared/accounts.ts). Arabic message, or null when acceptable. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `كلمة المرور قصيرة؛ استخدم ${PASSWORD_MIN} أحرف على الأقل.`
  if (password.length > 72) return 'كلمة المرور طويلة جدًّا.'
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password))
    return 'كلمة المرور يجب أن تحتوي حرفًا إنجليزيًّا صغيرًا وحرفًا كبيرًا ورقمًا ورمزًا مثل ! أو #.'
  return null
}

export const PASSWORD_HINT = '٨ أحرف على الأقل: حرف إنجليزي صغير وكبير ورقم ورمز.'
