import { createContext, useCallback, useContext, useState } from 'react'
import { isDirectVideoUrl, isYouTubeUrl, toEmbeddableUrl } from '../lib/fileViewerUtils'
import { isMobileDevice, isTabletDevice } from '../lib/deviceDetection'

// Ported from old-portal/js/app.js's openFileViewer()/closeFileViewer() —
// any module that needs to open a document goes through useFileViewer().
const FileViewerContext = createContext(null)

export function FileViewerProvider({ children }) {
  const [viewer, setViewer] = useState(null)

  const openFileViewer = useCallback((url, title) => {
    if (!url) return

    // YouTube link -> seedha new tab mein kholo (iframe mein nahi chalega)
    if (isYouTubeUrl(url)) {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }

    if (isDirectVideoUrl(url)) {
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
  }, [])

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
