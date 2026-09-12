import { useCallback, useRef } from 'react'
import { fetchScreenshotBlob } from '../lib/renewals'

// Ported from old-portal/js/renewals.js's _ruScreenshotBlobCache/
// _ruFetchScreenshotBlobUrl/_ruClearScreenshotCache. Shared by the customer
// detail modal's Call History thumbnails and the screenshot lightbox (a
// sibling overlay, not nested — see ScreenshotLightbox) so reopening the
// same image never re-fetches it. `clear()` is called by the owner
// (MyCustomersTab) on modal close and whenever a different customer's
// history loads — never on lightbox close alone, since the URL is still
// owned by the still-visible thumbnail.
export function useScreenshotCache() {
  const cacheRef = useRef(new Map())

  const getUrl = useCallback(async (path) => {
    if (cacheRef.current.has(path)) return cacheRef.current.get(path)
    const blob = await fetchScreenshotBlob(path)
    const url = URL.createObjectURL(blob)
    cacheRef.current.set(path, url)
    return url
  }, [])

  const clear = useCallback(() => {
    cacheRef.current.forEach((url) => URL.revokeObjectURL(url))
    cacheRef.current.clear()
  }, [])

  return { getUrl, clear }
}
