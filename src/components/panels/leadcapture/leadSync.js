import { createContext, useContext, useState } from 'react'

// Cross-tab freshness for Lead Capture. The four (soon five) tabs stay mounted once opened, and each fetches its own list from its own request key —
// so a write in one tab (send, push, delete, close …) used to leave every other warm tab showing old data until a page refresh. This is the shared signal.
//
//   stale[tabId]  a counter per tab, bumped whenever ANOTHER tab writes (notifyChanged). A tab folds it into its request key, so a bump means "refetch".
//   focusTick     bumped when the browser window comes back after being away (so changes made by other people show up without a refresh).
//
// Rules (see LeadCapturePanel, which owns the state, and useLeadSync below):
//   - the tab that did the write is NOT bumped: it already re-reads exactly what it changed, and a full refetch would clear its selection;
//   - a HIDDEN tab never fetches: its key is frozen at what it last showed, and takes the live value the moment it becomes visible — so a write is paid
//     for once, when the tab is next opened, and only if something changed;
//   - a visible tab refetches immediately; `holdFocus` lets it decline the focus-return refetch while the user is mid-task (rows ticked, a modal
//     open, a draft row) — the held refetch happens as soon as they are done;
//   - blunt on purpose: any write marks every other tab stale. Each refetch is one paginated request plus one summary call; cheaper than being wrong.
export const LeadSyncContext = createContext({ stale: {}, focusTick: 0, notifyChanged: () => {} })
export const LeadTabContext = createContext({ tabId: null, active: true })

// A tab's sync key: put it in the tab's request key. Optional { holdFocus } — see above.
export function useLeadSync({ holdFocus = false } = {}) {
  const { stale, focusTick } = useContext(LeadSyncContext)
  const { tabId, active } = useContext(LeadTabContext)
  const live = stale[tabId] ?? 0
  const [seen, setSeen] = useState({ stale: live, focus: focusTick })
  const next = { stale: active ? live : seen.stale, focus: active && !holdFocus ? focusTick : seen.focus }
  if (next.stale !== seen.stale || next.focus !== seen.focus) setSeen(next) // derived state: adjust during render, never in an effect
  return `${next.stale}.${next.focus}`
}

// → notify(): call after a SUCCESSFUL write; every other tab becomes stale.
export function useNotifyChanged() {
  const { notifyChanged } = useContext(LeadSyncContext)
  const { tabId } = useContext(LeadTabContext)
  return () => notifyChanged(tabId)
}
