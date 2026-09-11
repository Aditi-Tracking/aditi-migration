import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { computeKpiSummary, fetchTaskChecklistNavSnapshot } from '../lib/taskChecklist'

const TaskChecklistNavContext = createContext(null)

// Ported from old-portal/js/tasks.js's TASKS_LIVE_POLL_MS/TASKS_LIVE_MIN_GAP_MS
// (tSilentRefresh/tMaybeLiveSync) — 15s background poll while the tab is
// visible, plus an 8s minimum gap so a focus/visibilitychange event firing
// right after the interval doesn't double-fetch.
const POLL_MS = 15 * 1000
const MIN_GAP_MS = 8 * 1000

// Single shared source for the Task Checklist nav-reveal decision
// (_tRevealTasksNav) and the Home Task Alert Banner's data
// (updateHomeTaskBanner) — mounted once at the PortalShell level (same
// lifetime as FileViewerProvider/CelebrationsProvider) so Sidebar.jsx and
// MobileMenuSheet.jsx both read the exact same resolved value instead of
// each re-deriving it, which is what keeps desktop and mobile nav in sync.
export function TaskChecklistNavProvider({ children }) {
  const { currentUser, permissions } = useAuth()
  // `ownVisible` only matters for 'own' scope (data-dependent reveal, fails
  // closed). 'all'-scope reveal is derived below, independent of any
  // fetch — see navVisible.
  const [state, setState] = useState({ ownVisible: false, rows: [], loading: true })
  const syncingRef = useRef(false)
  const lastSyncRef = useRef(0)

  const scope = permissions.checklist_scope === 'all' ? 'all' : 'own'
  const email = currentUser?.email

  const refresh = useCallback(
    async (wide) => {
      if (!email || syncingRef.current) return
      syncingRef.current = true
      try {
        const snapshot = await fetchTaskChecklistNavSnapshot({ scope, email, wide })
        setState({ ownVisible: !!snapshot.ownVisible, rows: snapshot.rows, loading: false })
        lastSyncRef.current = Date.now()
      } catch {
        // Best-effort — keep last known rows/ownVisible, matching production
        // silently swallowing a failed sync. Still clear `loading` so the
        // Home banner doesn't skeleton forever after a single failed fetch.
        setState((s) => ({ ...s, loading: false }))
      } finally {
        syncingRef.current = false
      }
    },
    [email, scope]
  )

  // Ported from _tRevealTasksNav(true) firing before loadTasks()'s fetch:
  // for checklist_scope==='all', nav reveals instantly and can never be
  // hidden again by a failed/slow fetch — completely decoupled from `refresh`.
  const navVisible = scope === 'all' ? true : state.ownVisible

  // Initial load — plain query, mirrors prefetchAllData()'s background loadTasks() at login.
  useEffect(() => {
    if (!email) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fetch-then-set, not a synchronous setState
    refresh(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when identity/scope actually change
  }, [email, scope])

  // Background live-sync — widened query, mirrors tMaybeLiveSync's poll +
  // visibilitychange/focus triggers.
  useEffect(() => {
    if (!email) return
    function maybeLiveSync() {
      if (document.hidden) return
      if (Date.now() - lastSyncRef.current < MIN_GAP_MS) return
      refresh(true)
    }
    const interval = setInterval(maybeLiveSync, POLL_MS)
    document.addEventListener('visibilitychange', maybeLiveSync)
    window.addEventListener('focus', maybeLiveSync)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', maybeLiveSync)
      window.removeEventListener('focus', maybeLiveSync)
    }
  }, [email, refresh])

  const bannerSummary = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return computeKpiSummary(state.rows, { dateFrom: today, dateTo: today })
  }, [state.rows])

  const value = { navVisible, loading: state.loading, bannerSummary }

  return <TaskChecklistNavContext.Provider value={value}>{children}</TaskChecklistNavContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- context + its hook belong together
export function useTaskChecklistNav() {
  const ctx = useContext(TaskChecklistNavContext)
  if (!ctx) throw new Error('useTaskChecklistNav must be used within TaskChecklistNavProvider')
  return ctx
}
