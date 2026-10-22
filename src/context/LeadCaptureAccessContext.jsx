import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { fetchLeadCaptureAccess } from '../lib/leadCaptureAccess'

const LeadCaptureAccessContext = createContext(null)

// Who the signed-in person is in Lead Capture: their ONE tier and the capabilities it holds (asked of the database, which is the only place the tiers are
// defined). Mounted once at PortalShell level, like the other nav contexts, so the sidebar tile, the mobile menu, the Dashboards hub and the Lead Capture
// panels all read the same value.
//   tier         'lc_field_sales' | 'lc_sales_person' | 'lc_admin' | null (no access)
//   permissions  { key: 'true' } — read by the five lib/*Permissions.js files exactly as the old per-key map was
//   loading      true until the first answer for THIS person has arrived (never shown stale access for a previous login)
//   error        the message when the last ask failed ('' otherwise); a failed ask never GRANTS access — the previous answer stays, or there is none
//   visible      any tier at all → the Lead Capture tile shows
// It asks once per login, and again whenever the window comes back after more than 30 s away (so a change an administrator just made shows up without a
// page refresh), and on reload(). The database enforces the tier on every request regardless of what this says.
const REFRESH_AFTER_MS = 30000
const NOBODY = { email: null, tier: null, permissions: {}, error: '' }

export function LeadCaptureAccessProvider({ children }) {
  const { currentUser } = useAuth()
  const email = currentUser?.email ? String(currentUser.email).toLowerCase() : null
  const [state, setState] = useState(NOBODY)
  const askedAt = useRef(0)

  const load = useCallback(async () => {
    if (!email) return
    askedAt.current = Date.now()
    try {
      const a = await fetchLeadCaptureAccess()
      setState({ email, tier: a?.tier || null, permissions: a?.permissions || {}, error: '' })
    } catch (e) {
      setState((s) => (s.email === email ? { ...s, error: e.message } : { ...NOBODY, email, error: e.message }))
    }
  }, [email])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!email) return undefined
    const back = () => {
      if (document.visibilityState !== 'hidden' && Date.now() - askedAt.current > REFRESH_AFTER_MS) load()
    }
    window.addEventListener('focus', back)
    document.addEventListener('visibilitychange', back)
    return () => {
      window.removeEventListener('focus', back)
      document.removeEventListener('visibilitychange', back)
    }
  }, [email, load])

  // an answer belongs to the person it was asked for; until THEIR answer arrives the context is loading, with no access
  const mine = state.email === email
  const value = useMemo(
    () => ({
      tier: mine ? state.tier : null,
      permissions: mine ? state.permissions : {},
      loading: !!email && !mine && !state.error,
      error: mine ? state.error : '',
      visible: mine && !!state.tier,
      reload: load,
    }),
    [mine, state, email, load]
  )
  return <LeadCaptureAccessContext.Provider value={value}>{children}</LeadCaptureAccessContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- context + its hook belong together
export function useLeadCaptureAccess() {
  const ctx = useContext(LeadCaptureAccessContext)
  if (!ctx) throw new Error('useLeadCaptureAccess must be used within LeadCaptureAccessProvider')
  return ctx
}
