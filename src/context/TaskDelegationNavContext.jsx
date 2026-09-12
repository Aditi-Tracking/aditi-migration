import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { fetchTaskDelegationAccessSnapshot } from '../lib/taskDelegation'

const TaskDelegationNavContext = createContext(null)

// Ported from old-portal/js/taskDelegation.js's _applyTaskDelegationNavVisibility — mounted once at
// PortalShell level (same lifetime as RenewalsNavProvider/TaskChecklistNavProvider) so
// Sidebar/MobileMenuSheet/DashboardsHubPanel all read the exact same resolved value. Like Renewals'
// nav context (and unlike Task Checklist's), production has no live-sync poll for this module — a
// one-shot resolve right after login.
const INITIAL_STATE = { isMD: false, isActiveAssignee: false, loading: true }

export function TaskDelegationNavProvider({ children }) {
  const { currentUser } = useAuth()
  const [state, setState] = useState(INITIAL_STATE)

  useEffect(() => {
    if (!currentUser?.email) return
    let cancelled = false
    fetchTaskDelegationAccessSnapshot(currentUser).then(({ isMD, isActiveAssignee }) => {
      if (cancelled) return
      setState({ isMD, isActiveAssignee, loading: false })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolves once per login
  }, [currentUser?.email])

  const navVisible = state.isMD || state.isActiveAssignee
  const value = { ...state, navVisible }

  return <TaskDelegationNavContext.Provider value={value}>{children}</TaskDelegationNavContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- context + its hook belong together
export function useTaskDelegationNav() {
  const ctx = useContext(TaskDelegationNavContext)
  if (!ctx) throw new Error('useTaskDelegationNav must be used within TaskDelegationNavProvider')
  return ctx
}
