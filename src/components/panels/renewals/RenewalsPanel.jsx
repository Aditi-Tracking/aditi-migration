import { useEffect, useState } from 'react'
import { useRenewalsNav } from '../../../context/RenewalsNavContext'
import { fetchUnassignedPoolCount, visibleTabIds } from '../../../lib/renewals'
import LocationBar from './LocationBar'
import RenewalsTabBar from './RenewalsTabBar'
import MyCustomersTab from './MyCustomersTab'
import ClosedPaidTab from './ClosedPaidTab'
import UnassignedPoolTab from './UnassignedPoolTab'
import UploadTab from './UploadTab'
import ResolveUnmatchedTab from './ResolveUnmatchedTab'
import OverviewTab from './OverviewTab'
import AccountsTab from './AccountsTab'

// All 7 tabs are now built — Renewals & Collections is fully converted.
const BUILT_TAB_IDS = ['myCustomers', 'closedPaid', 'upload', 'unmatched', 'unassignedPool', 'overview', 'accounts']

// Ported from old-portal/js/renewals.js's loadRenewals/ruRenderTabBar/
// ruRenderLocationBar. Through Phase 1a/1b there was only ever one built
// tab, so production's own "no bar if <=1 visible" rule never fired — Phase
// 2 is where a real tab bar starts mattering (a plain crm_persons user now
// has 2 built tabs, MIS has 3).
export default function RenewalsPanel() {
  const { isMIS, isAccounts, crmPerson, fullDataAccess, allowedLocations, loading } = useRenewalsNav()
  const [location, setLocation] = useState(null)
  const [chosenTab, setChosenTab] = useState(null)
  const [unassignedPoolCount, setUnassignedPoolCount] = useState(0)

  useEffect(() => {
    if (loading) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resolves the default location once allowedLocations/crmPerson are known, not a render loop
    setLocation((prev) => {
      if (prev && allowedLocations.includes(prev)) return prev
      return crmPerson?.location && allowedLocations.includes(crmPerson.location) ? crmPerson.location : allowedLocations[0]
    })
  }, [loading, allowedLocations, crmPerson])

  // Cheap approximate count on login/location switch (MIS only) — corrected
  // to the precise post-filter count once UnassignedPoolTab actually loads
  // (see its own onCountChange call, passed down below). Two-tier, matching
  // production's own _ruRefreshUnassignedPoolBadge/loadRenewalsUnassignedPool
  // split exactly rather than reconciling it away.
  useEffect(() => {
    if (!isMIS || !location) return
    let cancelled = false
    fetchUnassignedPoolCount(location)
      .then((n) => !cancelled && setUnassignedPoolCount(n))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isMIS, location])

  if (loading || !location) {
    return (
      <div className="px-4 sm:px-6 py-5">
        <p className="text-text-muted text-[13px]">⏳ Loading…</p>
      </div>
    )
  }

  // Pure/synchronous, computed fresh every render — no effect needed, and no
  // one-frame flash between "tabs resolved" and "active tab resolved" the
  // way an effect-driven default would introduce.
  const tabs = visibleTabIds({ isMIS, crmPerson, isAccounts }).filter((id) => BUILT_TAB_IDS.includes(id))
  const activeTab = chosenTab && tabs.includes(chosenTab) ? chosenTab : (tabs[0] ?? null)

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="mb-4">
        <div className="text-[16px] font-semibold text-text">Renewals & Collections</div>
        <div className="text-[11.5px] text-text-muted mt-0.5">Home › Renewals & Collections</div>
      </div>

      {/* Tab bar first, always — a control the user just clicked must never
          shift position because something conditionally rendered above it
          changed size. LocationBar (suppressed entirely on Overview, which
          has its own dedicated location/"All" filter — showing this
          switcher on top of it would be two location pickers with
          overlapping jobs) comes after, so only content below the tab bar
          ever reflows on tab switch. */}
      <RenewalsTabBar tabs={tabs} activeTab={activeTab} onChange={setChosenTab} unassignedPoolCount={unassignedPoolCount} />

      {activeTab !== 'overview' && <LocationBar location={location} allowedLocations={allowedLocations} onChange={setLocation} />}

      {activeTab === 'myCustomers' && (
        <MyCustomersTab location={location} isMIS={isMIS} fullDataAccess={fullDataAccess} crmPerson={crmPerson} />
      )}
      {activeTab === 'closedPaid' && (
        <ClosedPaidTab location={location} isMIS={isMIS} fullDataAccess={fullDataAccess} crmPerson={crmPerson} />
      )}
      {activeTab === 'upload' && <UploadTab location={location} allowedLocations={allowedLocations} />}
      {activeTab === 'unmatched' && <ResolveUnmatchedTab location={location} />}
      {activeTab === 'unassignedPool' && <UnassignedPoolTab location={location} onCountChange={setUnassignedPoolCount} />}
      {activeTab === 'overview' && (
        <OverviewTab allowedLocations={allowedLocations} isMIS={isMIS} fullDataAccess={fullDataAccess} crmPerson={crmPerson} />
      )}
      {/* Deliberately no location prop — Accounts is location-agnostic, the
          one exception to every other tab's per-loader scoping. The shared
          LocationBar above stays visible and switchable here (only Overview
          suppresses it) even though it has zero effect on this tab. */}
      {activeTab === 'accounts' && <AccountsTab isMIS={isMIS} isAccounts={isAccounts} />}
    </div>
  )
}
