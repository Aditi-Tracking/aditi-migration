// Which columns of a table a person has chosen to show — remembered in THIS browser (localStorage), nothing in the database. A low-stakes view preference, the
// same approach Renewals' "My Customers" columns already use.
//   const prefs = useColumnPrefs('scot_columns_v1:' + email, COLUMNS)
//   COLUMNS: [{ key, label, defaultVisible, locked? }]   locked = always shown (cannot be hidden)
//   prefs.isVisible(key)        what to render
//   prefs.toggle(key, on)       show / hide one column
//   prefs.reset()               back to the defaults
//   prefs.customised            true when any column differs from its default (enables "Reset to default")
// Only the person's OVERRIDES are stored ({ key: true|false }), so a column added later takes its own default instead of appearing or vanishing, an override
// that equals the default is dropped, an unknown key is ignored, and corrupt or blocked storage simply means "the defaults". The storage key should include
// who is signed in, so a shared computer does not carry one person's layout to the next.
import { useCallback, useMemo, useState } from 'react'

function read(storageKey) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {} // corrupt or blocked storage — the defaults
  }
}

function write(storageKey, overrides) {
  try {
    if (Object.keys(overrides).length) localStorage.setItem(storageKey, JSON.stringify(overrides))
    else localStorage.removeItem(storageKey)
  } catch {
    /* storage unavailable — the choice lasts for this visit only */
  }
}

export function useColumnPrefs(storageKey, columns) {
  const [state, setState] = useState(() => ({ key: storageKey, overrides: read(storageKey) }))
  // another person signed in (the key changed): read THEIR choice, never show the previous person's
  const overrides = state.key === storageKey ? state.overrides : read(storageKey)
  const byKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns])

  const isVisible = useCallback(
    (key) => {
      const col = byKey.get(key)
      if (!col) return false
      if (col.locked) return true
      return typeof overrides[key] === 'boolean' ? overrides[key] : !!col.defaultVisible
    },
    [byKey, overrides]
  )

  const toggle = useCallback(
    (key, on) => {
      const col = byKey.get(key)
      if (!col || col.locked) return
      const next = { ...overrides, [key]: !!on }
      if (next[key] === !!col.defaultVisible) delete next[key]
      write(storageKey, next)
      setState({ key: storageKey, overrides: next })
    },
    [byKey, overrides, storageKey]
  )

  const reset = useCallback(() => {
    write(storageKey, {})
    setState({ key: storageKey, overrides: {} })
  }, [storageKey])

  const customised = columns.some((c) => !c.locked && typeof overrides[c.key] === 'boolean' && overrides[c.key] !== !!c.defaultVisible)
  return { isVisible, toggle, reset, customised }
}
