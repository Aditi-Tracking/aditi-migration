import { useState } from 'react'
import TabButton from '../../shared/TabButton'
import { useAuth } from '../../../context/AuthContext'
import { canCreateFieldService, canViewAllFieldService, hasFieldServiceAccess } from '../../../lib/fieldService'
import SubmitEntryTab from './SubmitEntryTab'
import EntriesListTab from './EntriesListTab'
import useFieldServiceDashboard from './dashboard/useFieldServiceDashboard'

// Ported from old-portal/js/fieldservice.js's loadFieldService/_fsRenderTabBar/_fsSwitchTabView.
// Phase 1 (Submit + List + delete) and Phase 2 (Dashboard, js/fieldservice-dashboard.js) are both
// done now. The Dashboard tab is always present regardless of role/permissions — reaching this
// panel at all already implies hasFieldServiceAccess(), so (matching _fsRenderTabBar's own
// comment) no extra check is needed for it specifically.
//
// field_service_create is no longer permission-gated (see lib/fieldService.js) — every logged-in
// user can submit, so hasFieldServiceAccess() is effectively always true; the check below is a
// defensive fallback only, mirroring loadFieldService()'s own guard, since the nav item/hub tile
// are already unconditionally visible for this module.
export default function FieldServicePanel() {
  const { currentUser, permissions } = useAuth()
  const canCreate = canCreateFieldService(currentUser)
  const viewAll = canViewAllFieldService(currentUser, permissions)
  const [activeTab, setActiveTab] = useState(canCreate ? 'submit' : 'list')

  // Called unconditionally (hooks can't be conditional) — `active` is this hook's own internal
  // gate on refetching/reloading, so the Dashboard tab's data only loads while it's actually the
  // active tab, matching the exact behavior `FieldServiceDashboardTab` had before this restructure.
  const dashboard = useFieldServiceDashboard({ active: activeTab === 'dashboard' })

  if (!hasFieldServiceAccess(currentUser, permissions)) {
    return <div className="px-4 sm:px-6 py-16 text-center text-text-muted text-[13px]">You don't have access to this dashboard.</div>
  }

  const tabs = []
  if (canCreate) tabs.push(['submit', '📝 Submit Entry'])
  tabs.push(['list', viewAll ? '📋 All Entries' : '📋 My Entries'])
  tabs.push(['dashboard', '📊 Dashboard'])

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="mb-4">
        <div className="text-[16px] font-semibold text-text">Field Service</div>
        <div className="text-[11.5px] text-text-muted mt-0.5">Home › Field Service</div>
      </div>

      {/* Tab row + Dashboard-only filter bar share one row (tabs left, filters right via
          justify-between) — matches production's #fsTabBar/#fsdInlineFilters side-by-side
          layout. Reverses an earlier session's deliberate two-row split, per explicit
          instruction, not a mistake being silently fixed. */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <div className="flex gap-2 flex-wrap">
          {tabs.map(([id, label]) => (
            <TabButton key={id} active={activeTab === id} onClick={() => setActiveTab(id)}>
              {label}
            </TabButton>
          ))}
        </div>
        {activeTab === 'dashboard' && dashboard.filterBar}
      </div>

      {/* Both tabs stay mounted, toggled via `hidden` — a half-filled Submit form survives
          switching to the list and back, matching production's own display:none toggling
          rather than losing state on unmount (same convention Task Checklist's Phase 2
          Scheduler tab established). */}
      {canCreate && (
        <div hidden={activeTab !== 'submit'}>
          <SubmitEntryTab />
        </div>
      )}
      <div hidden={activeTab !== 'list'}>
        <EntriesListTab active={activeTab === 'list'} />
      </div>
      <div hidden={activeTab !== 'dashboard'}>{dashboard.body}</div>
    </div>
  )
}
