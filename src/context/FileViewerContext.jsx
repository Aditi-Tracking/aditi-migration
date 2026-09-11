import { createContext, useCallback, useContext, useState } from 'react'
import { isDirectVideoUrl, isYouTubeUrl, toEmbeddableUrl } from '../lib/fileViewerUtils'
import { isMobileDevice, isTabletDevice } from '../lib/deviceDetection'
import { useAuth } from './AuthContext'
import { getCardName, logActivity } from '../lib/activityTracking'

// Ported from old-portal/js/app.js's openFileViewer()/closeFileViewer() —
// any module that needs to open a document goes through useFileViewer().
const FileViewerContext = createContext(null)

export function FileViewerProvider({ children }) {
  const { currentUser } = useAuth()
  const [viewer, setViewer] = useState(null)

  const openFileViewer = useCallback((url, title) => {
    if (!url) return

    // Track file/video open — mirrors app.js's openFileViewer() exactly,
    // including that it fires before any of the type-specific branching
    // below (a YouTube link tracked here still opens in a new tab, never
    // reaching the in-page viewer).
    const isYT = isYouTubeUrl(url)
    const isVid = isDirectVideoUrl(url)
    const isPdf = /\.pdf(\?|$)/i.test(url)
    logActivity(currentUser, {
      event_type: isYT || isVid ? 'video_play' : 'file_open',
      event_detail: (isYT ? 'YouTube: ' : isVid ? 'Video: ' : isPdf ? 'PDF: ' : 'File: ') + (title || url),
      card_name: getCardName() || '',
      video_title: isYT || isVid ? title || url : null,
      file_name: !isYT && !isVid ? title || url : null,
    })

    // YouTube link -> seedha new tab mein kholo (iframe mein nahi chalega)
    if (isYT) {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }

    if (isVid) {
      setViewer({ title: title || 'Documents', mode: 'video', src: url })
      return
    }

    // Mobile/PWA: Android Chrome iframe mein PDF "Open" button + pencil aata
    // hai. Tablets go through the same path — iPadOS Safari mein cropped
    // iframe content left-pinned reh jaata hai.
    const isMobile = isMobileDevice() || isTabletDevice()
    let embedUrl = toEmbeddableUrl(url)
    if (isMobile) {
      window.open(embedUrl, '_blank')
      return
    }

    if (embedUrl.indexOf('#') === -1) embedUrl += '#toolbar=0'
    const isGoogle = /drive\.google\.com|docs\.google\.com/.test(embedUrl)
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)

    setViewer({ title: title || 'Documents', mode: 'iframe', src: embedUrl, isGoogle, isSafari })
  }, [currentUser])

  const closeFileViewer = useCallback(() => setViewer(null), [])

  return (
    <FileViewerContext.Provider value={{ viewer, openFileViewer, closeFileViewer }}>
      {children}
    </FileViewerContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- context + its hook belong together
export function useFileViewer() {
  const ctx = useContext(FileViewerContext)
  if (!ctx) throw new Error('useFileViewer must be used within FileViewerProvider')
  return ctx
}
