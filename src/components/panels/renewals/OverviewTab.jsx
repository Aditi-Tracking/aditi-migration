import { useEffect, useState } from 'react'
import { RU_LOCATIONS, fetchRenewalsOverview } from '../../../lib/renewals'
import OverviewKpiGrid from './OverviewKpiGrid'
import OverviewCharts from './OverviewCharts'
import TeamPerformanceSection from './TeamPerformanceSection'
import RecentActivityTable from './RecentActivityTable'

// Ported from old-portal/js/renewals.js's loadRenewalsOverview/
// _ruRenderOverview/_ruOverviewLocationFilterHtml. Owns its own independent
// location filter — deliberately separate from the shared location bar
// (RenewalsPanel suppresses that bar entirely while this tab is active, the
// same rule production uses, rather than showing two competing pickers).
// "All Locations" sends p_location: null to the RPC, which already computes
// the combined-across-every-location totals server-side.
export default function OverviewTab({ allowedLocations, isMIS, fullDataAccess, crmPerson }) {
  const crmPersonId = crmPerson?.id || null
  // null = not yet resolved; 'all' = combined; otherwise a real location value.
  const [locationFilter, setLocationFilter] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Default: "All" for a multi-location user, their one location for
  // everyone else — only (re)applied when unset or no longer valid, so a
  // user's own filter choice persists across unrelated re-renders.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resolves the default filter once allowedLocations is known, not a render loop
    setLocationFilter((prev) => {
      if (prev === 'all' || (prev && allowedLocations.includes(prev))) return prev
      return allowedLocations.length > 1 ? 'all' : allowedLocations[0]
    })
  }, [allowedLocations])

  const resolvedLocation = locationFilter === 'all' ? null : locationFilter

  useEffect(() => {
    if (locationFilter === null) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fresh load triggered by a filter/scope change, not a synchronous render loop
    setLoading(true)
    setError('')
    fetchRenewalsOverview({ crmPersonId, fullDataAccess, location: resolvedLocation })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolvedLocation is derived from locationFilter, already a dep
  }, [crmPersonId, fullDataAccess, locationFilter])

  if (locationFilter === null || loading) return <p className="text-text-muted text-[13.5px]">Loading…</p>
  if (error) return <p className="text-danger text-[13.5px]">⚠️ {error}</p>

  const locationOptions = [{ value: 'all', label: 'All Locations' }, ...RU_LOCATIONS.filter((l) => allowedLocations.includes(l.value))]

  return (
    <div>
      {allowedLocations.length > 1 && (
        <div className="flex items-center gap-2 mb-4">
          <label className="text-[12.5px] font-bold text-text-muted">📍 Location</label>
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="rounded-lg border border-border bg-surface-2 text-text px-3 py-1.5 text-[12.5px] font-bold"
          >
            {locationOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <OverviewKpiGrid financial={data.financial} />
      <OverviewCharts financial={data.financial} coverage={data.coverage} />
      <TeamPerformanceSection location={resolvedLocation} isMIS={isMIS} fullDataAccess={fullDataAccess} crmPerson={crmPerson} />
      <RecentActivityTable activity={data.recent_activity} />
    </div>
  )
}
