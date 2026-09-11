import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { authClient, setAuthToken } from '../lib/supabaseClient'
import { fetchEmployeeId, fetchLoginEmployeeInfo } from '../lib/employeeProfile'
import {
  buildFallbackPermissions,
  clearPermissionsCache,
  fetchPermissionsWithRetry,
  writePermissionsCache,
} from '../lib/permissions'

// Ported from old-portal/js/auth.js. Keep every rule here (role mapping,
// permission fallback/retry/cache, idle timeout, visibility self-heal)
// byte-for-byte equivalent to that file — only the UI around it changes.

const AuthContext = createContext(null)

const FULL_ACCESS_ROLES = ['managing director', 'mis', 'pc', 'executive assistant', 'ea']
const IDLE_LIMIT = 3 * 60 * 60 * 1000 // 3 hours idle = logout
const WARN_BEFORE = 5 * 60 * 1000 // warn 5 minutes before logout

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [permissions, setPermissions] = useState({})
  const [initializing, setInitializing] = useState(true)
  const [permissionsFetchFailed, setPermissionsFetchFailed] = useState(false)
  const [idleWarning, setIdleWarning] = useState(false)
  const [justLoggedIn, setJustLoggedIn] = useState(null)

  // A device can have a still-valid session from a previous user sitting in
  // localStorage — if someone signs in with different credentials while that
  // session's auto-restore is still in flight, both flows would otherwise race
  // to publish CURRENT_USER/PERMISSIONS. Each flow checks its own sequence
  // number before publishing, so only the most-recently-started flow wins.
  const authFlowSeqRef = useRef(0)
  const permissionsRecoveryInFlightRef = useRef(false)

  const loadUserProfile = useCallback(async (authUser) => {
    const mySeq = ++authFlowSeqRef.current
    try {
      const empData = await fetchLoginEmployeeInfo(authUser.email)
      if (mySeq !== authFlowSeqRef.current) return // a newer login/restore started — abandon this one

      const rawR = String((empData && empData.Employee_Dept) || 'employee').trim().toLowerCase()

      const newUser = {
        email: authUser.email,
        role: FULL_ACCESS_ROLES.includes(rawR) ? 'owner' : 'employee',
        rawRole: rawR === 'managing director' ? 'owner' : rawR === 'ea' ? 'executive assistant' : rawR,
        name: empData ? String(empData.Employee_name || authUser.email.split('@')[0]) : authUser.email.split('@')[0],
        location: empData ? String(empData.Location || '').trim() : '',
      }

      let newPermissions
      let fetchFailed = false
      try {
        const pr = await fetchPermissionsWithRetry(authUser.email)
        if (pr && pr.ok) {
          const pd = await pr.json()
          newPermissions = pd.permissions || {}
          if (pd.rawRole) newUser.rawRole = pd.rawRole
          if (pd.role) newUser.role = pd.role === 'owner' ? 'owner' : 'employee'
          writePermissionsCache(authUser.email, newPermissions)
        } else {
          newPermissions = buildFallbackPermissions(newUser.rawRole, authUser.email)
          fetchFailed = true
        }
      } catch {
        newPermissions = buildFallbackPermissions(newUser.rawRole, authUser.email)
        fetchFailed = true
      }

      if (mySeq !== authFlowSeqRef.current) return // re-check — the permissions fetch above is the slow part

      setCurrentUser(newUser)
      setPermissions(newPermissions)
      setPermissionsFetchFailed(fetchFailed)
      setJustLoggedIn(Date.now())

      // Fire-and-forget, mirrors old-portal's _fetchAndCacheEmpId — doesn't
      // block showing the portal, just fills in empId once it resolves.
      fetchEmployeeId(authUser.email).then((empId) => {
        if (empId == null || mySeq !== authFlowSeqRef.current) return
        setCurrentUser((u) => {
          if (!u) return u
          const next = { ...u, empId }
          try {
            localStorage.setItem('aditiUser', JSON.stringify(next))
          } catch {
            /* localStorage may be unavailable — ignore */
          }
          return next
        })
      })
    } catch {
      if (mySeq !== authFlowSeqRef.current) return
      const fallbackUser = {
        email: authUser.email,
        role: 'employee',
        rawRole: 'employee',
        name: authUser.email.split('@')[0],
        location: '',
      }
      setCurrentUser(fallbackUser)
      setPermissions(buildFallbackPermissions('employee', authUser.email))
      setPermissionsFetchFailed(true)
      setJustLoggedIn(Date.now())
    }
  }, [])

  // Session restore on load — mirrors old-portal's window.addEventListener('load', ...)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const {
          data: { session },
        } = await authClient.auth.getSession()
        if (session && !cancelled) {
          setAuthToken(session.access_token)
          await loadUserProfile(session.user)
        }
      } catch (e) {
        console.warn('Session check error:', e)
      } finally {
        if (!cancelled) setInitializing(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadUserProfile])

  // Auth state listener (token refresh, logout detect)
  useEffect(() => {
    const { data: sub } = authClient.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setCurrentUser(null)
        setAuthToken(null) // reset to anon on logout
      }
      if (session?.access_token) {
        setAuthToken(session.access_token) // user JWT save — RLS authenticated policies kaam karengi
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const login = useCallback(
    async (email, password) => {
      const { data, error } = await authClient.auth.signInWithPassword({ email, password })
      if (error) return { error }

      setAuthToken(data.session.access_token) // token set first — RLS passes correctly
      await loadUserProfile(data.user)
      return { error: null }
    },
    [loadUserProfile]
  )

  const logout = useCallback(() => {
    setTimeout(async () => {
      try {
        await authClient.auth.signOut()
      } catch {
        /* best-effort — ignore */
      }
      try {
        localStorage.removeItem('aditiUser')
        localStorage.removeItem('aditiLoginTime')
      } catch {
        /* localStorage may be unavailable — ignore */
      }
      // Shared/company devices can be used by multiple engineers across sessions —
      // clear this user's cached permissions so they never leak into the next
      // user's fallback on the same device.
      setCurrentUser((u) => {
        if (u?.email) clearPermissionsCache(u.email)
        return null
      })
      window.location.reload()
    }, 400)
  }, [])

  const updateAvatarUrl = useCallback((avatarUrl) => {
    setCurrentUser((u) => {
      if (!u) return u
      const next = { ...u, avatar_url: avatarUrl }
      try {
        localStorage.setItem('aditiUser', JSON.stringify(next))
      } catch {
        /* localStorage may be unavailable — ignore */
      }
      return next
    })
  }, [])

  // Idle timeout — 3h inactivity logs the user out, with a 5-min warning first.
  useEffect(() => {
    if (!currentUser) return
    let lastActivity = Date.now()
    let warned = false
    let loggedOut = false

    const resetActivity = () => {
      lastActivity = Date.now()
      if (warned) {
        warned = false
        setIdleWarning(false)
      }
    }
    const events = ['click', 'keydown', 'scroll', 'touchstart']
    events.forEach((ev) => window.addEventListener(ev, resetActivity, { passive: true }))

    const interval = setInterval(() => {
      const idleMs = Date.now() - lastActivity
      if (!warned && idleMs >= IDLE_LIMIT - WARN_BEFORE) {
        warned = true
        setIdleWarning(true)
      }
      if (!loggedOut && idleMs >= IDLE_LIMIT) {
        loggedOut = true
        setIdleWarning(false)
        logout()
      }
    }, 10000)

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetActivity))
      clearInterval(interval)
    }
  }, [currentUser, logout])

  // Permission self-heal on foreground return — if the last permissions fetch
  // fell back to role defaults, retry silently the moment the tab is
  // foregrounded again.
  useEffect(() => {
    async function onVisibility() {
      if (document.hidden) return
      if (!permissionsFetchFailed || !currentUser || permissionsRecoveryInFlightRef.current) return
      const mySeq = authFlowSeqRef.current
      permissionsRecoveryInFlightRef.current = true
      try {
        const pr = await fetchPermissionsWithRetry(currentUser.email)
        if (mySeq !== authFlowSeqRef.current) return // a new login started while we were re-fetching
        if (pr && pr.ok) {
          const pd = await pr.json()
          const newPermissions = pd.permissions || {}
          setPermissions(newPermissions)
          setCurrentUser((u) =>
            u
              ? {
                  ...u,
                  rawRole: pd.rawRole || u.rawRole,
                  role: pd.role ? (pd.role === 'owner' ? 'owner' : 'employee') : u.role,
                }
              : u
          )
          writePermissionsCache(currentUser.email, newPermissions)
          setPermissionsFetchFailed(false)
        }
      } catch {
        /* best-effort — a later visibilitychange retries */
      } finally {
        permissionsRecoveryInFlightRef.current = false
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [permissionsFetchFailed, currentUser])

  const value = {
    currentUser,
    permissions,
    initializing,
    permissionsFetchFailed,
    idleWarning,
    dismissIdleWarning: () => setIdleWarning(false),
    justLoggedIn,
    clearJustLoggedIn: () => setJustLoggedIn(null),
    login,
    logout,
    updateAvatarUrl,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- context + its hook belong together
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
