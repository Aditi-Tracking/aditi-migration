import { useEffect, useMemo, useRef, useState } from 'react'
import {
  EMPTY_COLLECTIONS_FILTERS,
  fetchCollectionsRaw,
  fetchCollectionsTargetsRaw,
  filterCollectionsRows,
  getMonthWeekOptions,
  getWeekOptions,
  MONTH_NAMES,
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

// Collections & Repeat Orders Dashboard — one Google Apps Script, two sheets fetched in parallel
// (lib/collectionsDashboard.js's COLLECTIONS_URL for daily numbers, its ?sheet=Sheet6 variant for
// commitment/target data, merged together by normalizeCollectionsRows), fetched on mount then
// re-polled on an interval so a new row added on either sheet shows up here without the user
// needing to hit Refresh — filtered entirely client-side (the whole dataset is a few hundred KB of
// JSON, same scale as Enterprise Solutions' single-fetch pattern — no server-side pagination/query
// needed). 100% read-only.
const REFRESH_MS = 60 * 1000

export default function CollectionsDashboardPanel() {
  const [daily, setDaily] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastSync, setLastSync] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const [filters, setFilters] = useState(EMPTY_COLLECTIONS_FILTERS)
  const [page, setPage] = useState(0)

  // `silent` skips the full-page loading state so the periodic poll (and the manual Refresh
  // button) update the numbers in place instead of blanking the whole dashboard every minute.
  async function load({ silent = false } = {}) {
    if (!silent) setLoading(true)
    setError('')
    try {
      const [raw, targetsRaw] = await Promise.all([fetchCollectionsRaw(), fetchCollectionsTargetsRaw()])
      setDaily(normalizeCollectionsRows(raw, targetsRaw))
      setLastSync(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fetch
    load()
  }, [])

  // Cleared on unmount so navigating away from the panel doesn't leak the interval.
  useEffect(() => {
    const id = setInterval(() => load({ silent: true }), REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  async function handleRefresh() {
    setRefreshing(true)
    await load({ silent: true })
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

  // Defaults the Month filter to the REAL current calendar month once data first arrives, instead
  // of leaving it on "All Months" (which put the oldest data first in Entries/Employee Summary,
  // since rows sort ascending) — regardless of whether that month actually has any real (nonzero)
  // data yet. Falls back to the latest month present only if the real current month has no rows at
  // all (not even blank placeholder ones). Only fires once (didDefaultMonthRef) so it never fights
  // a later silent poll refresh or the user explicitly clearing back to "All Months".
  const didDefaultMonthRef = useRef(false)
  useEffect(() => {
    if (didDefaultMonthRef.current || !months.length) return
    didDefaultMonthRef.current = true
    const currentMonthName = MONTH_NAMES[new Date().getMonth()]
    const defaultMonth = months.includes(currentMonthName) ? currentMonthName : months[months.length - 1]
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time default once months load
    setFilters((f) => (f.month ? f : { ...f, month: defaultMonth }))
  }, [months])

  const monthWeekOptions = useMemo(() => getMonthWeekOptions(daily, filters.month), [daily, filters.month])
  const locations = useMemo(() => uniqueSorted(daily, 'location'), [daily])
  const names = useMemo(() => uniqueSorted(daily, 'name'), [daily])
  const filteredRows = useMemo(() => filterCollectionsRows(daily, filters), [daily, filters])
  // Derived from filteredRows (not the full unfiltered `daily`), so the week list itself narrows
  // along with the other filters — picking Month=September only ever offers September's weeks,
  // instead of listing weeks that would show empty once combined with the active filters.
  const weeks = useMemo(() => getWeekOptions(filteredRows), [filteredRows])
  // Drives CollectionsEmployeeSummaryTable's own period default (Daily for the real current month,
  // Monthly for any other month picked, including "All Months") — see that component's own comment.
  const isCurrentMonth = filters.month === MONTH_NAMES[new Date().getMonth()]

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

          <CollectionsEmployeeSummaryTable rows={filteredRows} weeks={weeks} isCurrentMonth={isCurrentMonth} />

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
