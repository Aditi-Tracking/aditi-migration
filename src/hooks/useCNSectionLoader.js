import { useEffect, useState } from 'react'
import { CN } from '../lib/contentNodes'
import { deleteContentNodeCard, invalidateContentNodes } from '../lib/cnUploadDelete'

// Shared load/delete logic that TrainingPanel.jsx, HRPanel.jsx, and CNSectionPanel.jsx each
// hand-duplicated: resolve a content_nodes section by name, load its categories, and delete a
// card with the same confirm -> deleteContentNodeCard -> invalidateContentNodes -> reload
// sequence. Each panel still owns its own JSX/derived filtering (e.g. HR's known/new card
// split) on top of the plain `cats` this returns.
//
// `silentIfMissing` preserves HR's one real behavioral difference from the other two: HR
// doesn't set an error when its section isn't found (just stops loading silently), while
// Training/CNSectionPanel both show "<sectionName> section not found in content_nodes".
export function useCNSectionLoader(sectionName, { silentIfMissing = false } = {}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [section, setSection] = useState(null)
  const [cats, setCats] = useState([])

  function load() {
    return CN.load().then(() => {
      const s = CN.getSection(sectionName)
      if (!s) {
        if (!silentIfMissing) setError(`${sectionName} section not found in content_nodes`)
        setLoading(false)
        return
      }
      setSection(s)
      setCats(CN.getCategories(s.id))
      setLoading(false)
    })
  }

  useEffect(() => {
    let cancelled = false
    load().catch((e) => {
      if (cancelled) return
      setError(e.message)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is redefined every render but only sectionName should re-trigger the fetch
  }, [sectionName])

  async function deleteCard(cat) {
    if (!confirm(`⚠️ "${cat.name}" and all its files will be permanently deleted.\nAre you sure?`)) return
    try {
      await deleteContentNodeCard(cat.id)
      await invalidateContentNodes()
      load()
    } catch (e) {
      alert('❌ ' + e.message)
    }
  }

  return { loading, error, section, cats, reload: load, deleteCard }
}
