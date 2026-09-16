import { useState } from 'react'
import TabButton from '../../shared/TabButton'
import { useAuth } from '../../../context/AuthContext'
import { canCreateFieldService, canViewAllFieldService, hasFieldServiceAccess } from '../../../lib/fieldService'
import SubmitEntryTab from './SubmitEntryTab'
import EntriesListTab from './EntriesListTab'
import FieldServiceDashboardTab from './dashboard/FieldServiceDashboardTab'

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

      <div className="flex gap-2 flex-wrap mb-4">
        {tabs.map(([id, label]) => (
          <TabButton key={id} active={activeTab === id} onClick={() => setActiveTab(id)}>
            {label}
          </TabButton>
        ))}
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
      <div hidden={activeTab !== 'dashboard'}>
        <FieldServiceDashboardTab active={activeTab === 'dashboard'} />
      </div>
    </div>
  )
}
