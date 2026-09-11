import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { fetchTodaysCelebrations, fetchWishesForSelf, isMe } from '../lib/celebrations'

const CelebrationsContext = createContext(null)

// Ported from old-portal/js/celebrations.js's loadCelebrations() + its
// self-popup auto-open. Old-portal fires this via a triple-redundant
// mechanism (patching window.showPortal, a MutationObserver, and a 3s
// fallback timer) because vanilla JS had no reliable "app is ready, run
// once" hook — this provider mounts once for the whole logged-in session
// (same lifetime as FileViewerProvider), so a single mount-time effect
// gives the identical "runs once per session" guarantee natively.
//
// #celebPopupOverlay/#myWishesOverlay are global in old-portal's DOM (defined
// outside #panel-home) — the self-popup can appear over any panel, not just
// Home. This provider (and the overlay components it drives) is mounted at
// the PortalShell level for that reason; only the banner UI itself is
// Home-scoped.
export function CelebrationsProvider({ children }) {
  const { currentUser } = useAuth()
  const [data, setData] = useState({ birthdays: [], anniversaries: [], empList: [], loading: true })
  const [popup, setPopup] = useState(null) // { mode, person, years } | null
  const [myWishesOpen, setMyWishesOpen] = useState(false)
  const [selfWishData, setSelfWishData] = useState({ email: null, type: null, empId: null, wishes: null })
  const selfPopupShownRef = useRef(false)

  useEffect(() => {
    if (!currentUser) return
    let cancelled = false
    fetchTodaysCelebrations().then(({ birthdays, anniversaries, empList }) => {
      if (cancelled) return
      setData({ birthdays, anniversaries, empList, loading: false })

      if (selfPopupShownRef.current) return
      const myBday = birthdays.find((p) => isMe(p, currentUser))
      const myAnni = anniversaries.find((p) => isMe(p, currentUser))
      if (myBday || myAnni) {
        selfPopupShownRef.current = true
        setTimeout(() => {
          if (cancelled) return
          if (myBday) setPopup({ mode: 'birthday-self', person: myBday, years: null })
          else setPopup({ mode: 'anniversary-self', person: myAnni, years: myAnni.years })
        }, 1000)
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately runs once per session (currentUser identity, not object equality)
  }, [currentUser?.email])

  const openWishPopup = useCallback((mode, person, years = null) => {
    setPopup({ mode, person, years })
  }, [])

  const closeWishPopup = useCallback(() => setPopup(null), [])

  const refreshSelfWishCount = useCallback(async (email, type, empId) => {
    setSelfWishData({ email, type, empId, wishes: null })
    try {
      const wishes = await fetchWishesForSelf(email, type, empId)
      setSelfWishData({ email, type, empId, wishes })
      return wishes
    } catch {
      return []
    }
  }, [])

  const openMyWishesModal = useCallback(() => {
    setSelfWishData((prev) => {
      if (prev.email || prev.empId) return prev
      const meBday = data.birthdays.find((p) => isMe(p, currentUser))
      const meAnni = data.anniversaries.find((p) => isMe(p, currentUser))
      const me = meBday || meAnni
      if (!me) return prev
      return { email: me.email || currentUser?.email || null, type: meBday ? 'birthday' : 'anniversary', empId: me.empId || null, wishes: null }
    })
    setMyWishesOpen(true)
  }, [data.birthdays, data.anniversaries, currentUser])

  const closeMyWishesModal = useCallback(() => setMyWishesOpen(false), [])

  const value = {
    ...data,
    popup,
    openWishPopup,
    closeWishPopup,
    myWishesOpen,
    openMyWishesModal,
    closeMyWishesModal,
    selfWishData,
    refreshSelfWishCount,
  }

  return <CelebrationsContext.Provider value={value}>{children}</CelebrationsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- context + its hook belong together
export function useCelebrations() {
  const ctx = useContext(CelebrationsContext)
  if (!ctx) throw new Error('useCelebrations must be used within CelebrationsProvider')
  return ctx
}
