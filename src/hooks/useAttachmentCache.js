import { useCallback, useRef } from 'react'
import { fetchAttachmentBlob } from '../lib/taskDelegation'

// Ported from old-portal/js/taskDelegation.js's _tdAttachmentBlobCache/_tdFetchAttachmentBlobUrl/
// _tdClearAttachmentCache — same shape as Renewals' useScreenshotCache, generalized since this
// bucket isn't images-only. `clear()` is called on modal close/task switch, not on lightbox close
// alone, since the URL may still be owned by a visible thumbnail.
export function useAttachmentCache() {
  const cacheRef = useRef(new Map())

  const getUrl = useCallback(async (path) => {
    if (cacheRef.current.has(path)) return cacheRef.current.get(path)
    const blob = await fetchAttachmentBlob(path)
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
