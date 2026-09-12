import { useEffect, useMemo, useState } from 'react'
import {
  EMPTY_ENTERPRISE_CROSS_FILTER,
  applyEnterpriseKpiClick,
  computeEnterpriseFunnel,
  computeEnterpriseKpis,
  fetchEnterpriseLeads,
  matchesEnterpriseCrossFilter,
  matchesEnterpriseExplorerSelects,
  matchesEnterpriseSearch,
  sortEnterpriseLeads,
  toggleEnterpriseChartFilter,
} from '../../../lib/enterpriseLead'
import EnterpriseKpiGrid from './EnterpriseKpiGrid'
import EnterpriseRepLeaderboard from './EnterpriseRepLeaderboard'
import EnterpriseCharts from './EnterpriseCharts'
import EnterpriseFilterBar from './EnterpriseFilterBar'
import EnterpriseTable from './EnterpriseTable'

// Ported from old-portal/js/enterprise.js's loadEnterprise/enRenderAll — 100% read-only, single
// Google Apps Script endpoint (see lib/enterpriseLead.js). Unlike SmartFleet's 3 separate filter
// dimensions (kpiFilter/stageFilter/chartFilters), production keeps ONE combined cross-filter
// object here (status/city/owner/source/product/milestone) — a KPI-tile click only ever touches
// `milestone` ('Total' resets all 6 at once), a chart click touches whichever of the other 5 it
// owns. KPIs and the Conversion Funnel both read the full unfiltered `rows`, never `crossFilter`.
// The Lead Explorer's own city/owner/stage selects are a SEPARATE, additive layer on top of the
// cross-filter — the same field can be constrained twice (a chart-click filter + a dropdown pick
// that disagree simply empty the table), matching production exactly.
export default function EnterpriseLeadPanel() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastSync, setLastSync] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const [crossFilter, setCrossFilter] = useState(EMPTY_ENTERPRISE_CROSS_FILTER)
  const [search, setSearch] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState(1)
  const [page, setPage] = useState(1)
  const [tableOpen, setTableOpen] = useState(true)
  const [repAllMode, setRepAllMode] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await fetchEnterpriseLeads()
      setRows(data)
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
    await load() // deliberately doesn't reset filters, matching refreshEnterprise()
    setRefreshing(false)
  }

  function handleKpiClick(fk) {
    setCrossFilter((cf) => applyEnterpriseKpiClick(cf, fk))
  }

  function handleChartFilterToggle(field, value) {
    setCrossFilter((cf) => toggleEnterpriseChartFilter(cf, field, value))
  }

  // Ported from enClearAll — clears ONLY the cross-filter (KPI milestone + chart-click fields),
  // leaves the Explorer's own search/selects untouched. Used by the "Clear filters" chip above
  // the charts, distinct from handleReset below.
  function handleClearCrossFilter() {
    setCrossFilter(EMPTY_ENTERPRISE_CROSS_FILTER)
  }

  // Ported from enReset — the Explorer's own Reset button clears search + all 3 selects AND the
  // cross-filter, unlike the chart-area chip above.
  function handleReset() {
    setSearch('')
    setCityFilter('')
    setOwnerFilter('')
    setStageFilter('')
    setCrossFilter(EMPTY_ENTERPRISE_CROSS_FILTER)
  }

  function handleSort(key) {
    if (sortKey === key) setSortDir((d) => -d)
    else {
      setSortKey(key)
      setSortDir(1)
    }
  }

  const kpis = useMemo(() => computeEnterpriseKpis(rows), [rows])
  const funnel = useMemo(() => computeEnterpriseFunnel(rows), [rows])

  const chartData = useMemo(() => rows.filter((r) => matchesEnterpriseCrossFilter(r, crossFilter)), [rows, crossFilter])

  const tableRows = useMemo(() => {
    const filtered = rows.filter(
      (r) =>
        matchesEnterpriseCrossFilter(r, crossFilter) &&
        matchesEnterpriseSearch(r, search) &&
        matchesEnterpriseExplorerSelects(r, { cityFilter, ownerFilter, stageFilter })
    )
    return sortEnterpriseLeads(filtered, sortKey, sortDir)
  }, [rows, crossFilter, search, cityFilter, ownerFilter, stageFilter, sortKey, sortDir])

  useEffect(() => {
    // Jump back to page 1 whenever any filter changes, matching enApply's ENp=1 reset.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1)
  }, [crossFilter, search, cityFilter, ownerFilter, stageFilter])

  // Built once from the full lead set, matching enBuildFilters — not re-derived from the
  // currently cross-filtered/searched subset.
  const cityOptions = useMemo(() => [...new Set(rows.map((r) => r.City).filter(Boolean))].sort(), [rows])
  const ownerOptions = useMemo(() => [...new Set(rows.map((r) => r.Owner).filter(Boolean))].sort(), [rows])
  const stageOptions = useMemo(() => [...new Set(rows.map((r) => r.CurrentStage).filter(Boolean))].sort(), [rows])

  const activeFilterCount = Object.values(crossFilter).filter(Boolean).length

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <div>
          <div className="text-[16px] font-semibold text-text">🏢 Enterprise Lead</div>
          <div className="text-[11.5px] text-text-muted mt-0.5">Home › Enterprise Lead</div>
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

      {loading && <div className="text-center py-16 text-text-muted text-[13px]">⏳ Loading leads…</div>}
      {!loading && error && <div className="text-center py-16 text-danger text-[13px]">⚠️ Data load failed: {error}</div>}

      {!loading && !error && (
        <div className="mt-5">
          <div className="text-[12px] font-semibold text-text-muted uppercase tracking-wide mb-2.5">Key Performance Indicator</div>
          <EnterpriseKpiGrid kpis={kpis} activeMilestone={crossFilter.milestone} onKpiClick={handleKpiClick} />

          <EnterpriseRepLeaderboard rows={rows} active={repAllMode} onToggle={() => setRepAllMode((v) => !v)} />

          <div className="flex items-center justify-between mt-1 mb-2.5">
            <div className="text-[12px] font-semibold text-text-muted uppercase tracking-wide">Lead Analytics</div>
            {activeFilterCount > 0 && (
              <button type="button" onClick={handleClearCrossFilter} className="text-[11px] text-primary font-medium">
                ✕ Clear filters
              </button>
            )}
          </div>
          <EnterpriseCharts data={chartData} funnel={funnel} crossFilter={crossFilter} onChartFilterToggle={handleChartFilterToggle} />

          <div className="text-[12px] font-semibold text-text-muted uppercase tracking-wide mt-6 mb-2.5">Lead Explorer</div>
          <EnterpriseFilterBar
            search={search}
            onSearchChange={setSearch}
            cityOptions={cityOptions}
            cityFilter={cityFilter}
            onCityChange={setCityFilter}
            ownerOptions={ownerOptions}
            ownerFilter={ownerFilter}
            onOwnerChange={setOwnerFilter}
            stageOptions={stageOptions}
            stageFilter={stageFilter}
            onStageChange={setStageFilter}
            onReset={handleReset}
          />
          <EnterpriseTable
            rows={tableRows}
            open={tableOpen}
            onToggleOpen={() => setTableOpen((v) => !v)}
            page={page}
            onPageChange={setPage}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
          />
        </div>
      )}
    </div>
  )
}
