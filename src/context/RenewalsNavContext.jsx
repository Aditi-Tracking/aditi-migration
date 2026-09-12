import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { fetchRenewalsAccessSnapshot } from '../lib/renewals'

const RenewalsNavContext = createContext(null)

// Ported from old-portal/js/renewals.js's _applyRenewalsNavVisibility —
// mounted once at PortalShell level (same lifetime as
// TaskChecklistNavProvider) so Sidebar/MobileMenuSheet/DashboardsHubPanel all
// read the exact same resolved value. Unlike Task Checklist's nav context,
// production has no live-sync poll for this one — it's a one-shot resolve
// right after login, so this provider doesn't invent a poll either.
const INITIAL_STATE = {
  isMIS: false,
  isAccounts: false,
  crmPerson: null,
  fullDataAccess: false,
  allowedLocations: ['original'],
  loading: true,
}

export function RenewalsNavProvider({ children }) {
  const { currentUser } = useAuth()
  const [state, setState] = useState(INITIAL_STATE)

  useEffect(() => {
    if (!currentUser?.email) return
    let cancelled = false
    fetchRenewalsAccessSnapshot(currentUser).then((snapshot) => {
      if (cancelled) return
      setState({ ...snapshot, loading: false })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolves once per login
  }, [currentUser?.email])

  const navVisible = state.isMIS || !!state.crmPerson || state.isAccounts
  const value = { ...state, navVisible }

  return <RenewalsNavContext.Provider value={value}>{children}</RenewalsNavContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- context + its hook belong together
export function useRenewalsNav() {
  const ctx = useContext(RenewalsNavContext)
  if (!ctx) throw new Error('useRenewalsNav must be used within RenewalsNavProvider')
  return ctx
}
