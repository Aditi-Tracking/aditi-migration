import { useEffect, useMemo, useState } from 'react'
import { IMS_LOCATION_LABELS, computeImsKpis, computeMaxStock, effectiveDateIndex, fetchImsData, filterImsRows, findTodayIndex, formatImsDate, parseImsRows } from '../../../lib/ims'
import IMSKpiGrid from './IMSKpiGrid'
import IMSCharts from './IMSCharts'
import IMSControls from './IMSControls'
import IMSTable from './IMSTable'

const REFRESH_MS = 5 * 60 * 1000

// Ported from old-portal/js/ims.js's loadIMSDashboard/_imsParseData/_imsRenderAll. Three approved
// fixes over production, all converging on one shared `filter` state driving KPI tiles, status
// buttons, charts, and the table consistently:
//  1. The 5-min auto-refresh interval is cleared on unmount (production leaks it past navigating
//     away from the panel).
//  2. Status buttons now also refresh the charts (production only did this for KPI-tile clicks —
//     a status-button click left the charts stale).
//  3. "Total SKUs" and "Total Stock" tiles (both filter:'all') highlight together (production's
//     highlight check was keyed off the clicked element's literal label text, so only "Total SKUs"
//     could ever show the ring).
// The static "Live" badge is intentionally NOT wired to real connection/error state — it's
// decorative-only in production too.
export default function IMSPanel() {
  const [location, setLocation] = useState('hq')
  const [dateHeaders, setDateHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [dateIdx, setDateIdx] = useState(-1)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastSync, setLastSync] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  async function load(loc) {
    setLoading(true)
    setError('')
    try {
      const json = await fetchImsData(loc)
      const { dateHeaders: hdrs, items } = parseImsRows(json)
      setDateHeaders(hdrs)
      setRows(items)
      setDateIdx(findTodayIndex(hdrs))
      setLastSync(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetches on mount and on every location switch
    load(location)
  }, [location])

  // Approved fix: cleared on unmount, unlike production's leaked interval.
  useEffect(() => {
    const id = setInterval(() => load(location), REFRESH_MS)
    return () => clearInterval(id)
  }, [location])

  async function handleRefresh() {
    setRefreshing(true)
    await load(location)
    setRefreshing(false)
  }

  function handleLocationChange(loc) {
    if (loc === location) return
    setLocation(loc)
    setFilter('all')
    setSearch('')
  }

  function handleDateChange(idx) {
    setDateIdx(idx)
  }

  const effIdx = useMemo(() => effectiveDateIndex(dateIdx, dateHeaders), [dateIdx, dateHeaders])
  const todayIdx = useMemo(() => findTodayIndex(dateHeaders), [dateHeaders])
  const dateLabel = effIdx !== null ? formatImsDate(dateHeaders[effIdx]) : '—'

  const kpis = useMemo(() => computeImsKpis(rows, effIdx), [rows, effIdx])
  const maxStock = useMemo(() => computeMaxStock(rows, effIdx), [rows, effIdx])

  // One shared filtered view feeds both the charts and the table — the fix for status
  // buttons previously leaving the charts stale.
  const filteredRows = useMemo(() => filterImsRows(rows, { statusFilter: filter, search }, effIdx), [rows, filter, search, effIdx])

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <div>
          <div className="text-[16px] font-semibold text-text">aditi IMS</div>
          <div className="text-[11.5px] text-text-muted mt-0.5">Home › IMS — {IMS_LOCATION_LABELS[location]}</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full border border-[#00d4aa38] bg-[#00d4aa14] px-3 py-1 text-[11.5px] font-medium text-[#00d4aa]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00d4aa]" />
            Live
          </span>
          {lastSync && <span className="text-[11px] text-text-muted">Updated {lastSync.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="text-[12px] font-medium text-primary border border-primary/30 rounded-md px-3 py-1.5 disabled:opacity-60"
          >
            ↻ {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {loading && <div className="text-center py-16 text-text-muted text-[13px]">⏳ Loading...</div>}
      {!loading && error && (
        <div className="mt-4 rounded-lg border border-danger/25 bg-danger-tint px-4 py-3.5 text-[13px] text-danger">
          ⚠️ Could not load data. Please check the IMS API URL is correct and the sheet is publicly accessible.
          <div className="text-[11.5px] mt-1.5 opacity-70">{error}</div>
        </div>
      )}

      {!loading && !error && (
        <div className="mt-5">
          <IMSKpiGrid kpis={kpis} dateLabel={dateLabel} filter={filter} onFilterClick={setFilter} />
          <IMSCharts rows={filteredRows} effIdx={effIdx} dateLabel={dateLabel} />
          <IMSControls
            location={location}
            onLocationChange={handleLocationChange}
            dateHeaders={dateHeaders}
            dateIdx={effIdx ?? 0}
            todayIdx={todayIdx}
            onDateChange={handleDateChange}
            search={search}
            onSearchChange={setSearch}
            filter={filter}
            onFilterChange={setFilter}
          />
          <IMSTable rows={filteredRows} effIdx={effIdx} maxStock={maxStock} dateLabel={dateLabel} total={rows.length} />
        </div>
      )}
    </div>
  )
}
