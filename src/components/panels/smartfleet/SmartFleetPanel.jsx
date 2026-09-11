import { useEffect, useMemo, useState } from 'react'
import {
  computeKpiSummary,
  fetchAllLeads,
  matchesChartFilter,
  matchesKpiFilter,
  matchesSearch,
  matchesSelectFilters,
  matchesStageFilter,
  sortLeads,
} from '../../../lib/smartFleet'
import SmartFleetKpiGrid from './SmartFleetKpiGrid'
import SmartFleetRepLeaderboard from './SmartFleetRepLeaderboard'
import SmartFleetCharts from './SmartFleetCharts'
import SmartFleetFilterBar from './SmartFleetFilterBar'
import SmartFleetTable from './SmartFleetTable'

const EMPTY_CHART_FILTERS = { source: null, team: null, product: null, lostReason: null }

// Ported from old-portal/js/leads.js's loadLeads/lRenderAll — 100%
// read-only. Three separate filter dimensions combine via AND exactly as
// production does, kept as distinct state rather than merged:
//   - kpiFilter: KPI-tile click — feeds charts AND the table
//   - stageFilter: Won/Pending/Lost buttons — table ONLY, charts untouched
//   - chartFilters: chart-click (source/team/product/lostReason) — feeds
//     charts (dimming) AND the table
// KPI tile VALUES always reflect the full source-scoped list (L), never
// re-filtered by kpiFilter itself — see computeKpiSummary. The rep
// leaderboard reads L directly, independent of kpiFilter/stageFilter/
// chartFilters/search/selects — only the source switch affects it.
export default function SmartFleetPanel() {
  const [allLeads, setAllLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastSync, setLastSync] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const [sourceSystem, setSourceSystem] = useState('') // '' = Both, 'google_sheets', 'odoo'
  const [kpiFilter, setKpiFilter] = useState(null)
  const [stageFilter, setStageFilter] = useState('')
  const [chartFilters, setChartFilters] = useState(EMPTY_CHART_FILTERS)
  const [search, setSearch] = useState('')
  const [selSourceChannel, setSelSourceChannel] = useState('')
  const [selTeam, setSelTeam] = useState('')
  const [selRep, setSelRep] = useState('')
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState(1)
  const [page, setPage] = useState(1)
  const [repAllMode, setRepAllMode] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const rows = await fetchAllLeads()
      if (!rows.length) throw new Error('No leads found in leads_normalized')
      setAllLeads(rows)
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
    await load() // deliberately doesn't reset filters, matching refreshLeads()
    setRefreshing(false)
  }

  function handleSetSource(sys) {
    setSourceSystem(sys)
    setKpiFilter(null)
    setStageFilter('')
    setChartFilters(EMPTY_CHART_FILTERS)
  }

  function handleReset() {
    setSearch('')
    setSelSourceChannel('')
    setSelTeam('')
    setSelRep('')
    setStageFilter('')
    setKpiFilter(null)
    setChartFilters(EMPTY_CHART_FILTERS)
  }

  // Clicking the Won KPI tile also syncs the Stage button to Won — a
  // one-way sync, not symmetric (clicking the Won stage button never
  // touches kpiFilter, see SmartFleetFilterBar's onStageChange).
  function handleKpiClick(fk) {
    const next = kpiFilter === fk && fk !== 'all' ? null : fk
    setKpiFilter(next)
    if (next === 'won') setStageFilter('Won')
    else if (stageFilter === 'Won') setStageFilter('')
  }

  function handleChartFilterToggle(key, value) {
    setChartFilters((prev) => ({ ...prev, [key]: prev[key] === value ? null : value }))
  }

  function handleSort(key) {
    if (sortKey === key) setSortDir((d) => -d)
    else {
      setSortKey(key)
      setSortDir(1)
    }
  }

  const L = useMemo(
    () => (sourceSystem ? allLeads.filter((r) => r.source_system === sourceSystem) : allLeads),
    [allLeads, sourceSystem]
  )

  const kpiSummary = useMemo(() => computeKpiSummary(L), [L])

  const chartData = useMemo(
    () => L.filter((r) => matchesKpiFilter(r, kpiFilter) && matchesChartFilter(r, chartFilters)),
    [L, kpiFilter, chartFilters]
  )

  const tableRows = useMemo(() => {
    const filtered = L.filter(
      (r) =>
        matchesSearch(r, search) &&
        matchesSelectFilters(r, { sourceChannel: selSourceChannel, team: selTeam, rep: selRep }) &&
        matchesStageFilter(r, stageFilter) &&
        matchesKpiFilter(r, kpiFilter) &&
        matchesChartFilter(r, chartFilters)
    )
    return sortLeads(filtered, sortKey, sortDir)
  }, [L, search, selSourceChannel, selTeam, selRep, stageFilter, kpiFilter, chartFilters, sortKey, sortDir])

  useEffect(() => {
    // Jump back to page 1 whenever any filter changes, matching lApply's Lp=1 reset.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1)
  }, [search, selSourceChannel, selTeam, selRep, stageFilter, kpiFilter, chartFilters, sourceSystem])

  const sourceChannelOptions = useMemo(() => [...new Set(L.map((r) => r.source_channel).filter(Boolean))].sort(), [L])
  const teamOptions = useMemo(() => [...new Set(L.map((r) => r.team_name).filter(Boolean))].sort(), [L])
  const repOptions = useMemo(() => [...new Set(L.map((r) => r.RepName).filter(Boolean))].sort(), [L])

  const activeFilterCount =
    (kpiFilter && kpiFilter !== 'all' ? 1 : 0) + Object.values(chartFilters).filter(Boolean).length

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <div>
          <div className="text-[16px] font-semibold text-text">Aditi SmartFleet</div>
          <div className="text-[11.5px] text-text-muted mt-0.5">Home › SmartFleet</div>
        </div>
        <div className="flex items-center gap-3">
          {lastSync && (
            <span className="text-[11px] text-text-muted">Sync: {lastSync.toLocaleTimeString('en-IN')}</span>
          )}
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

      {loading && <div className="text-center py-16 text-text-muted text-[13px]">⏳ Fetching data from Supabase…</div>}
      {!loading && error && <div className="text-center py-16 text-danger text-[13px]">⚠️ Data load failed: {error}</div>}

      {!loading && !error && (
        <div className="mt-5">
          <div className="flex gap-1.5 mb-5">
            {[
              { key: '', label: 'Both' },
              { key: 'google_sheets', label: 'Google Sheet' },
              { key: 'odoo', label: 'Odoo' },
            ].map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => handleSetSource(s.key)}
                className={`text-[12px] font-medium rounded-md px-3 py-1.5 border ${
                  sourceSystem === s.key ? 'bg-primary text-white border-primary' : 'border-border text-text-muted'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="text-[12px] font-semibold text-text-muted uppercase tracking-wide mb-2.5">
            Key Performance Indicator
          </div>
          <SmartFleetKpiGrid summary={kpiSummary} activeKpi={kpiFilter} onKpiClick={handleKpiClick} />

          <SmartFleetRepLeaderboard leads={L} active={repAllMode} onToggle={() => setRepAllMode((v) => !v)} />

          <div className="flex items-center justify-between mt-6 mb-2.5">
            <div className="text-[12px] font-semibold text-text-muted uppercase tracking-wide">Lead Analytics</div>
            {activeFilterCount > 0 && (
              <button type="button" onClick={handleReset} className="text-[11px] text-primary font-medium">
                ✕ Clear filters
              </button>
            )}
          </div>
          <SmartFleetCharts data={chartData} chartFilters={chartFilters} onChartFilterToggle={handleChartFilterToggle} />

          <div className="text-[12px] font-semibold text-text-muted uppercase tracking-wide mt-6 mb-2.5">
            Lead Explorer
          </div>
          <SmartFleetFilterBar
            search={search}
            onSearchChange={setSearch}
            sourceChannelOptions={sourceChannelOptions}
            selSourceChannel={selSourceChannel}
            onSourceChannelChange={setSelSourceChannel}
            teamOptions={teamOptions}
            selTeam={selTeam}
            onTeamChange={setSelTeam}
            repOptions={repOptions}
            selRep={selRep}
            onRepChange={setSelRep}
            stageFilter={stageFilter}
            onStageChange={setStageFilter}
            onReset={handleReset}
          />
          <SmartFleetTable
            rows={tableRows}
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
