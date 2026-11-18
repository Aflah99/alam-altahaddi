import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { myRole } from './api'
import { AuthContext, type AuthApi, type AuthState } from './auth'
import { supabase } from './client'
import { authRedirectUrl, studentEmail } from './config'

/**
 * Supabase Auth session for the whole app. Sessions persist across reloads and are
 * refreshed automatically; if a refresh fails (expired or revoked session) the app
 * shows the sign-in screen again with an explanation.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = supabase()
  const [state, setState] = useState<AuthState>(client ? { status: 'loading' } : { status: 'disabled' })
  const manualSignOut = useRef(false)
  const recovery = useRef(false)

  const load = useCallback(async (userId: string, email: string | null) => {
    let role = null
    try {
      role = await myRole(userId)
    } catch {
      role = null
    }
    setState({ status: 'signed-in', userId, email, role, recovery: recovery.current })
  }, [])

  useEffect(() => {
    if (!client) return
    let alive = true
    client.auth.getSession().then(({ data }) => {
      if (!alive) return
      const s = data.session
      if (s) void load(s.user.id, s.user.email ?? null)
      else setState({ status: 'signed-out', expired: false })
    })
    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') recovery.current = true
      if (event === 'SIGNED_OUT' || !session) {
        const expired = !manualSignOut.current
        manualSignOut.current = false
        recovery.current = false
        setState((prev) => (prev.status === 'signed-in' ? { status: 'signed-out', expired } : { status: 'signed-out', expired: false }))
        return
      }
      if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY' || event === 'USER_UPDATED') {
        // Defer: calling Supabase inside this callback can deadlock the auth lock.
        setTimeout(() => void load(session.user.id, session.user.email ?? null), 0)
      }
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [client, load])

  const api = useMemo<AuthApi>(() => {
    const need = () => {
      if (!client) throw new Error('cloud not configured')
      return client
    }
    return {
      state,
      async signInStudent(username, password) {
        const { error } = await need().auth.signInWithPassword({ email: studentEmail(username), password })
        if (error) throw error
      },
      async signInWithEmail(email, password) {
        const { error } = await need().auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      },
      async signUpParent(email, password, displayName) {
        // The role is NOT taken from this request: the database gives every self-registered
        // account the parent role. display_name is optional and never shown to other families.
        const { data, error } = await need().auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: authRedirectUrl(), data: { display_name: displayName.slice(0, 40) } },
        })
        if (error) throw error
        return { needsConfirmation: !data.session }
      },
      async sendPasswordReset(email) {
        const { error } = await need().auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirectUrl() })
        if (error) throw error
      },
      async resendConfirmation(email) {
        const { error } = await need().auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: authRedirectUrl() } })
        if (error) throw error
      },
      async updatePassword(password) {
        const { error } = await need().auth.updateUser({ password })
        if (error) throw error
        recovery.current = false
        setState((s) => (s.status === 'signed-in' ? { ...s, recovery: false } : s))
      },
      async signOut() {
        manualSignOut.current = true
        await need().auth.signOut()
      },
      async refreshRole() {
        if (state.status === 'signed-in') await load(state.userId, state.email)
      },
    }
  }, [client, state, load])

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}
