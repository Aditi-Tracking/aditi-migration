import { useEffect, useState } from 'react'
import { useRenewalsNav } from '../../../context/RenewalsNavContext'
import LocationBar from './LocationBar'
import MyCustomersTab from './MyCustomersTab'

// Ported from old-portal/js/renewals.js's loadRenewals/ruRenderTabBar/
// ruRenderLocationBar. Phase 1a only has the My Customers tab built — the
// tab bar itself doesn't render yet (production's own "no bar if <=1
// visible tab" rule applies naturally, since there's nothing else to switch
// to until Closed/Paid/Upload/Resolve Unmatched/Unassigned Pool/Overview/
// Accounts land in later phases).
export default function RenewalsPanel() {
  const { isMIS, crmPerson, fullDataAccess, allowedLocations, loading } = useRenewalsNav()
  const [location, setLocation] = useState(null)

  useEffect(() => {
    if (loading) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resolves the default location once allowedLocations/crmPerson are known, not a render loop
    setLocation((prev) => {
      if (prev && allowedLocations.includes(prev)) return prev
      return crmPerson?.location && allowedLocations.includes(crmPerson.location) ? crmPerson.location : allowedLocations[0]
    })
  }, [loading, allowedLocations, crmPerson])

  if (loading || !location) {
    return (
      <div className="px-4 sm:px-6 py-5">
        <p className="text-text-muted text-[13px]">⏳ Loading…</p>
      </div>
    )
  }

  // My Customers is only available to MIS/owner or an actual crm_persons
  // match — a pure Accounts-tier grant (no crm_persons row, not MIS) has nav
  // access to this module but nothing built for them yet (Accounts is
  // Phase 5).
  const hasMyCustomers = isMIS || !!crmPerson

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="mb-4">
        <div className="text-[16px] font-semibold text-text">Renewals & Collections</div>
        <div className="text-[11.5px] text-text-muted mt-0.5">Home › Renewals & Collections</div>
      </div>

      <LocationBar location={location} allowedLocations={allowedLocations} onChange={setLocation} />

      {hasMyCustomers ? (
        <MyCustomersTab location={location} isMIS={isMIS} fullDataAccess={fullDataAccess} crmPerson={crmPerson} />
      ) : (
        <p className="text-text-muted text-[13px] py-10 text-center">The Accounts tab isn't built yet — check back soon.</p>
      )}
    </div>
  )
}
