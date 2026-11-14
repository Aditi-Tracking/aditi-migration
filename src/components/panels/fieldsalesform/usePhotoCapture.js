import { useCallback, useEffect, useRef, useState } from 'react'
import { getPosition, stampPhoto } from '../../../lib/visitPhoto'

// The visit's attachment: choose a photo (camera or file) → read the device's position → burn time + position into the image → ready to upload.
//   state { status: 'empty' | 'processing' | 'ready' | 'error', file, blob, previewUrl, stamped, geo: { lat, lng, accuracy, at }, error }
//   pick(file)  start over with a new file     retry()  redo position + stamp for the SAME file (after "allow location")     clear()  drop it
// Only the latest pick wins: a slow position fix for a photo that has since been replaced is ignored.
const EMPTY = { status: 'empty', file: null, blob: null, previewUrl: '', stamped: false, geo: null, error: '' }

export function usePhotoCapture() {
  const [state, setState] = useState(EMPTY)
  const seq = useRef(0)

  useEffect(() => {
    const url = state.previewUrl
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [state.previewUrl])

  const pick = useCallback(async (file) => {
    const id = ++seq.current
    const current = () => id === seq.current
    setState({ ...EMPTY, status: 'processing', file })
    try {
      const pos = await getPosition()
      if (!current()) return
      const at = new Date()
      const { blob, stamped } = await stampPhoto(file, pos, at)
      if (!current()) return
      setState({ status: 'ready', file, blob, previewUrl: URL.createObjectURL(blob), stamped, geo: { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, at: at.toISOString() }, error: '' })
    } catch (e) {
      if (current()) setState({ ...EMPTY, status: 'error', file, error: e?.message || 'The photo could not be prepared.' })
    }
  }, [])

  const retry = useCallback(() => {
    if (state.file) pick(state.file)
  }, [state.file, pick])

  const clear = useCallback(() => {
    seq.current++
    setState(EMPTY)
  }, [])

  return { photo: state, pick, retry, clear }
}
