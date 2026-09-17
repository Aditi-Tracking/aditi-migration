import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../../../context/AuthContext'
import { canViewAllFieldService, fetchEngineerOptions } from '../../../../lib/fieldService'
import { fetchDailyStats, fetchDashboardEntries, fetchKpiComparisonStats, resolveActiveFilters, sumWindows } from '../../../../lib/fieldServiceDashboard'
import DashboardFilterBar from './DashboardFilterBar'
import DashboardKpiTiles from './DashboardKpiTiles'
import DashboardTrendChart from './DashboardTrendChart'
import DashboardJobTypeChart from './DashboardJobTypeChart'
import DashboardEngineerChart from './DashboardEngineerChart'
import DashboardEntriesTable from './DashboardEntriesTable'

const INITIAL_FILTERS = { preset: '30d', customFrom: '', customTo: '', jobType: '', engineerId: '' }

// Ported from old-portal/js/fieldservice-dashboard.js's loadFieldServiceDashboard/_fsdLoadAll.
// A hook, not a component: FieldServicePanel needs to place the filter bar in the same row as the
// tab buttons (matching production's #fsTabBar/#fsdInlineFilters side-by-side layout, previously
// deliberately split into two rows — now reverted) while the KPI tiles/charts/table render
// separately in the tab content area — two DOM locations that can't both be a single component's
// own JSX tree. Returning { filterBar, body } as pre-rendered JSX from one hook call keeps all the
// state/fetch logic in exactly one place (no prop-drilling, no risk of two separate state copies
// drifting out of sync), the same pattern as CRM Vehicle's useVehicleChanges. Still fully
// self-contained (filters + data all owned here, not split with FieldServicePanel) — only *where*
// the filter bar's JSX renders moved, not who owns its state.
//
// Unlike Phase 1's EntriesListTab (which loads once, the first time it's activated), this
// refetches on EVERY activation — matches production's loadFieldServiceDashboard(), which
// unconditionally calls _fsdLoadAll() each time the tab is switched to; only the filter bar's own
// render (and the engineer-options fetch, already cached by Phase 1) is one-shot.
export default function useFieldServiceDashboard({ active }) {
  const { currentUser, permissions } = useAuth()
  const viewAll = canViewAllFieldService(currentUser, permissions)

  const [filters, setFilters] = useState(INITIAL_FILTERS)
  const [engineerOptions, setEngineerOptions] = useState([])
  const [summaryRows, setSummaryRows] = useState([])
  const [kpiComparisons, setKpiComparisons] = useState(null)
  const [entriesRows, setEntriesRows] = useState([])
  const [entriesTotal, setEntriesTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Tracks the current page synchronously so the activation effect can reload "wherever the
  // table was left" (production never resets pagination on tab re-activation, only on an actual
  // filter change/Clear) without adding `page` itself as an effect dependency.
  const pageRef = useRef(0)

  const active_ = resolveActiveFilters(filters)

  async function loadSummary() {
    try {
      const [rows, kc] = await Promise.all([
        fetchDailyStats({ ...active_, viewAll }),
        fetchKpiComparisonStats({ jobType: active_.jobType, engineer: active_.engineer, viewAll }).then(sumWindows),
      ])
      setSummaryRows(rows)
      setKpiComparisons(kc)
    } catch (e) {
      setError(e.message)
    }
  }

  async function loadEntries(targetPage) {
    try {
      const { rows, total } = await fetchDashboardEntries({ ...active_, viewAll, page: targetPage })
      setEntriesRows(rows)
      setEntriesTotal(total)
    } catch (e) {
      setError(e.message)
    }
  }

  async function loadAll(targetPage = 0) {
    setLoading(true)
    setError('')
    await Promise.all([loadSummary(), loadEntries(targetPage)])
    setLoading(false)
  }

  useEffect(() => {
    if (!active) return
    if (viewAll && engineerOptions.length === 0) {
      fetchEngineerOptions(currentUser?.email).then(setEngineerOptions)
    }
    // Reloads with whatever page the table was left at — production never resets pagination on
    // a mere tab re-activation, only on an actual filter change or Clear (see the effect below).
    loadAll(pageRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch on every activation, not on every filter keystroke (filters trigger their own reload below)
  }, [active])

  function handleFilterChange(patch) {
    setFilters((prev) => ({ ...prev, ...patch }))
  }

  // Any filter change reloads from page 0 — mirrors _fsdOnFilterChange (_fsdPage = 0; _fsdLoadAll()).
  // Skipped on the very first mount (filters === INITIAL_FILTERS reference, nothing has changed
  // yet) so this doesn't double-fire alongside the activation effect above.
  const isFirstFiltersRender = useRef(true)
  useEffect(() => {
    if (isFirstFiltersRender.current) {
      isFirstFiltersRender.current = false
      return
    }
    if (!active) return
    pageRef.current = 0
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets pagination on a real filter change, not a render loop
    setPage(0)
    loadAll(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately reacts to filters only, not `active` (that effect above already covers activation)
  }, [filters])

  function handleClearFilters() {
    // A fresh object every time (not the frozen INITIAL_FILTERS reference) so clicking Clear
    // while already at default values still triggers the reload effect below — matching
    // production's _fsdClearFilters(), which always reloads unconditionally.
    setFilters({ ...INITIAL_FILTERS })
  }

  function handlePageChange(p) {
    if (p < 0) return
    pageRef.current = p
    setPage(p)
    loadEntries(p)
  }

  const filterBar = (
    <DashboardFilterBar
      preset={filters.preset}
      customFrom={filters.customFrom}
      customTo={filters.customTo}
      jobType={filters.jobType}
      engineerId={filters.engineerId}
      engineerOptions={engineerOptions}
      viewAll={viewAll}
      onChange={handleFilterChange}
      onClear={handleClearFilters}
    />
  )

  const body = (
    <div>
      <DashboardKpiTiles summaryRows={summaryRows} kpiComparisons={kpiComparisons} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mb-1.5">
        <DashboardJobTypeChart rows={summaryRows} />
        {viewAll && <DashboardEngineerChart rows={summaryRows} />}
      </div>
      <div className="mb-2.5">
        <DashboardTrendChart rows={summaryRows} />
      </div>

      <DashboardEntriesTable rows={entriesRows} total={entriesTotal} page={page} onPageChange={handlePageChange} viewAll={viewAll} loading={loading} error={error} />
    </div>
  )

  return { filterBar, body }
}
