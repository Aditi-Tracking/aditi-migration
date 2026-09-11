import { useCallback, useEffect, useState } from 'react'
import { fetchPortalUpdates } from '../lib/announcements'

export function useAnnouncementUpdates() {
  const [updates, setUpdates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refetch = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setUpdates(await fetchPortalUpdates())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fetch for badge + drawer feed
    refetch()
  }, [refetch])

  return { updates, loading, error, refetch }
}
