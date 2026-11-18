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
