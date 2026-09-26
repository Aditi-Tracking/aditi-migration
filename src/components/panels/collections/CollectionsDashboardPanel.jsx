import { useEffect, useMemo, useState } from 'react'
import {
  EMPTY_COLLECTIONS_FILTERS,
  fetchCollectionsRaw,
  filterCollectionsRows,
  getMonthWeekOptions,
  getWeekOptions,
  normalizeCollectionsRows,
  sortedMonths,
  uniqueSorted,
} from '../../../lib/collectionsDashboard'
import CollectionsKpiTiles from './CollectionsKpiTiles'
import CollectionsFilterBar from './CollectionsFilterBar'
import CollectionsEmployeeSummaryTable from './CollectionsEmployeeSummaryTable'
import CollectionsLocationChart from './CollectionsLocationChart'
import CollectionsEmployeeChart from './CollectionsEmployeeChart'
import CollectionsEntriesTable from './CollectionsEntriesTable'

// Collections & Repeat Orders Dashboard — a single Google Apps Script endpoint
// (lib/collectionsDashboard.js's COLLECTIONS_URL), fetched once on mount and filtered entirely
// client-side (the whole dataset is a few hundred KB of JSON, same scale as Enterprise
// Solutions' single-fetch pattern — no server-side pagination/query needed). 100% read-only.
export default function CollectionsDashboardPanel() {
  const [daily, setDaily] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastSync, setLastSync] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const [filters, setFilters] = useState(EMPTY_COLLECTIONS_FILTERS)
  const [page, setPage] = useState(0)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const raw = await fetchCollectionsRaw()
      setDaily(normalizeCollectionsRows(raw))
      setLastSync(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fetch
    load()
  }, [])

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  function handleFilterChange(patch) {
    setFilters((f) => ({ ...f, ...patch }))
  }
  function handleClear() {
    setFilters(EMPTY_COLLECTIONS_FILTERS)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- jump back to page 1 on any filter change
    setPage(0)
  }, [filters])

  const months = useMemo(() => sortedMonths(daily), [daily])
  const monthWeekOptions = useMemo(() => getMonthWeekOptions(daily, filters.month), [daily, filters.month])
  const locations = useMemo(() => uniqueSorted(daily, 'location'), [daily])
  const names = useMemo(() => uniqueSorted(daily, 'name'), [daily])
  const filteredRows = useMemo(() => filterCollectionsRows(daily, filters), [daily, filters])
  // Derived from filteredRows (not the full unfiltered `daily`), so the week list itself narrows
  // along with the other filters — picking Month=September only ever offers September's weeks,
  // instead of listing weeks that would show empty once combined with the active filters.
  const weeks = useMemo(() => getWeekOptions(filteredRows), [filteredRows])

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <div>
          <div className="text-[16px] font-semibold text-text">Collections & Repeat Orders</div>
          <div className="text-[11.5px] text-text-muted mt-0.5">Home › Dashboards › Collections & Repeat Orders</div>
        </div>
        <div className="flex items-center gap-3">
          {lastSync && <span className="text-[11px] text-text-muted">Sync: {lastSync.toLocaleTimeString('en-IN')}</span>}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="text-[12px] font-semibold rounded-md px-3 py-1.5 border border-primary/30 text-primary disabled:opacity-60"
          >
            ↻ {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {loading && <div className="text-center py-16 text-text-muted text-[13px]">⏳ Loading…</div>}
      {!loading && error && (
        <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3.5 text-[13px] text-danger">⚠️ Data load failed: {error}</div>
      )}

      {!loading && !error && (
        <div className="mt-5 flex flex-col gap-3">
          <CollectionsKpiTiles rows={filteredRows} />

          <CollectionsFilterBar
            filters={filters}
            months={months}
            weekOptions={monthWeekOptions}
            locations={locations}
            names={names}
            onChange={handleFilterChange}
            onClear={handleClear}
          />

          <CollectionsEmployeeSummaryTable rows={filteredRows} weeks={weeks} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <CollectionsLocationChart rows={filteredRows} filters={filters} onChange={handleFilterChange} />
            <CollectionsEmployeeChart rows={filteredRows} filters={filters} onChange={handleFilterChange} />
          </div>

          <CollectionsEntriesTable rows={filteredRows} page={page} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}
