import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { AdminRole, UserProfile } from '@/lib/supabase'

type AuthContextValue = {
  user: User | null
  session: Session | null
  profile: UserProfile | null
  isAdmin: boolean
  adminRole: AdminRole | null
  isLoading: boolean
  /**
   * V2 (§12.3): true from session-established until the is_admin RPC + role
   * fetch settle — post-login redirects must wait on it (race-safe). Always
   * false while signed out. Covers both OTP and password logins (both arrive
   * through the same onAuthStateChange path).
   */
  isRoleLoading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  profile: null,
  isAdmin: false,
  adminRole: null,
  isLoading: true,
  isRoleLoading: false,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRoleLoading, setIsRoleLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    // Auth events can overlap (e.g. SIGNED_IN then TOKEN_REFRESHED); only the
    // latest loadRoleAndProfile run may write state, or a slow earlier run
    // could clear isRoleLoading / overwrite the role with stale data.
    let roleRequestSeq = 0

    async function loadRoleAndProfile(currentUser: User) {
      const seq = ++roleRequestSeq
      // is_admin RPC failure ⇒ false: fail closed (§9.5).
      let admin: boolean
      try {
        const { data, error } = await supabase.rpc('is_admin')
        admin = !error && data === true
      } catch {
        admin = false
      }

      // adminRole from own admin_users row — only readable when admin (§5.5).
      let role: AdminRole | null = null
      if (admin) {
        try {
          const { data } = await supabase
            .from('admin_users')
            .select('role')
            .eq('id', currentUser.id)
            .maybeSingle()
          const fetchedRole: unknown = data?.role
          role = fetchedRole === 'super_admin' || fetchedRole === 'admin' ? fetchedRole : null
        } catch {
          role = null
        }
      }

      // user_profiles may not exist until the WP-02 migration runs — degrade to null (§9).
      let userProfile: UserProfile | null
      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', currentUser.id)
          .maybeSingle()
        userProfile = (data ?? null) as UserProfile | null
      } catch {
        userProfile = null
      }

      if (cancelled || seq !== roleRequestSeq) return
      setIsAdmin(admin)
      setAdminRole(role)
      setProfile(userProfile)
      // Every failure path above fails closed (admin=false) before this line,
      // so isRoleLoading always settles — guards can never spin forever.
      setIsRoleLoading(false)
    }

    function applySession(nextSession: Session | null) {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      if (nextSession?.user) {
        setIsRoleLoading(true)
        void loadRoleAndProfile(nextSession.user)
      } else {
        roleRequestSeq++ // invalidate any in-flight role load
        setIsAdmin(false)
        setAdminRole(null)
        setProfile(null)
        setIsRoleLoading(false)
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      applySession(data.session)
      setIsLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return
      applySession(nextSession)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw new Error(`Sign out failed: ${error.message}`)
    // State is cleared by the onAuthStateChange subscription.
  }

  return (
    <AuthContext.Provider
      value={{ user, session, profile, isAdmin, adminRole, isLoading, isRoleLoading, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
