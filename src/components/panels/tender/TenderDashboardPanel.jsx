import { useEffect, useMemo, useState } from 'react'
import { computeMonthSummary, computeStageBreakdown, computeTenderKpis, fetchTenderRaw, filterRowsByKpi, normalizeTenderRows } from '../../../lib/tenderDashboard'
import TenderKpiGrid from './TenderKpiGrid'
import TenderMonthSummaryTable from './TenderMonthSummaryTable'
import TenderStageTable from './TenderStageTable'
import TenderCharts from './TenderCharts'
import TenderExplorerTable from './TenderExplorerTable'

// New dashboard, backed by a standalone Google Apps Script sheet (see lib/tenderDashboard.js for
// the column-mapping notes — the sheet's own header row can't be trusted, so everything reads by
// position instead). KPIs/month summary/stage breakdown match the reference "Tender Status
// Dashboard" mockup; the Explorer table below them is this app's own addition, not in the mockup.
export default function TenderDashboardPanel() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastSync, setLastSync] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [kpiFilter, setKpiFilter] = useState(null)

  async function load({ forceRefresh = false } = {}) {
    setLoading(true)
    setError('')
    try {
      const raw = await fetchTenderRaw({ forceRefresh })
      setRows(normalizeTenderRows(raw))
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
    await load({ forceRefresh: true })
    setRefreshing(false)
  }

  function handleKpiClick(key) {
    setKpiFilter((prev) => (prev === key ? null : key))
  }

  const kpis = computeTenderKpis(rows)
  const monthSummary = computeMonthSummary(rows)
  const stageBreakdown = computeStageBreakdown(rows)
  // KPIs/summary tables always read the FULL set (never re-filtered by their own click) — only the
  // Explorer table below reacts to which tile is active, same discipline as every other dashboard's
  // cross-filter in this app.
  const explorerRows = useMemo(() => filterRowsByKpi(rows, kpiFilter), [rows, kpiFilter])

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <div>
          <div className="text-[16px] font-semibold text-text">📋 Tender & Project</div>
          <div className="text-[11.5px] text-text-muted mt-0.5">Home › Dashboards › Tender & Project</div>
        </div>
        <div className="flex items-center gap-3">
          {lastSync && <span className="text-[11px] text-text-muted">Sync: {lastSync.toLocaleTimeString('en-IN')}</span>}
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

      {loading && <div className="text-center py-16 text-text-muted text-[13px]">⏳ Loading tenders…</div>}
      {!loading && error && <div className="text-center py-16 text-danger text-[13px]">⚠️ Data load failed: {error}</div>}

      {!loading && !error && (
        <div className="mt-5">
          <TenderKpiGrid kpis={kpis} activeFilter={kpiFilter} onFilterClick={handleKpiClick} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <TenderMonthSummaryTable summary={monthSummary} />
            <TenderStageTable breakdown={stageBreakdown} />
          </div>

          <TenderCharts monthSummary={monthSummary} />

          <TenderExplorerTable rows={explorerRows} />
        </div>
      )}
    </div>
  )
}
