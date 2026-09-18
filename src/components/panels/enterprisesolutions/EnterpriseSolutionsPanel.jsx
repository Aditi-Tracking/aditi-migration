import { useEffect, useMemo, useState } from 'react'
import {
  EMPTY_ESOL_CROSS_FILTER,
  computeMTD,
  fetchEnterpriseSolutionsRaw,
  filterEsolRows,
  normalizeEnterpriseSolutionsData,
  sortEsolRows,
  toggleEsolCrossFilter,
} from '../../../lib/enterpriseSolutions'
import EnterpriseSolutionsSwitcher from './EnterpriseSolutionsSwitcher'
import EnterpriseSolutionsKpiGrid from './EnterpriseSolutionsKpiGrid'
import EnterpriseSolutionsActivity from './EnterpriseSolutionsActivity'
import EnterpriseSolutionsCharts from './EnterpriseSolutionsCharts'
import EnterpriseSolutionsFilterBar from './EnterpriseSolutionsFilterBar'
import EnterpriseSolutionsTable from './EnterpriseSolutionsTable'

// Ported from old-portal/js/entsol.js's loadEnterpriseSolutions/esolRenderAll/esolSwitchTab.
// FIXED-LIGHT-THEME PANEL throughout — see lib/enterpriseSolutions.js's header comment; every
// color here is a literal hex value, deliberately not this project's theme-aware tokens.
//
// Tab switch resets type/sort/page/search/cross-filter/activity-drill-type/activity-metric — but
// deliberately NOT the Activity scope pill (Today/Month/All), matching esolSwitchTab exactly.
export default function EnterpriseSolutionsPanel() {
  const [tab, setTab] = useState('clicktask')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastSync, setLastSync] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const [crossFilter, setCrossFilter] = useState(EMPTY_ESOL_CROSS_FILTER)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState(1)
  const [page, setPage] = useState(1)
  const [tableOpen, setTableOpen] = useState(true)

  const [activityScope, setActivityScope] = useState('today')
  const [activityMetric, setActivityMetric] = useState('buses')
  const [activityDetailType, setActivityDetailType] = useState(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const raw = await fetchEnterpriseSolutionsRaw()
      setData(normalizeEnterpriseSolutionsData(raw))
      setLastSync(raw.lastUpdated ? new Date(raw.lastUpdated) : new Date())
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

  function handleTabChange(next) {
    if (next === tab) return
    setTab(next)
    setSortKey(null)
    setSortDir(1)
    setPage(1)
    setCrossFilter(EMPTY_ESOL_CROSS_FILTER)
    setSearch('')
    setTypeFilter('')
    setActivityDetailType(null)
    setActivityMetric('buses')
    // activityScope deliberately left as-is
  }

  function handleFilterClick(key, val) {
    setCrossFilter((cf) => toggleEsolCrossFilter(cf, key, val))
  }
  function handleClearFilter() {
    setCrossFilter(EMPTY_ESOL_CROSS_FILTER)
  }
  function handleChartFilterToggle(key, val) {
    setCrossFilter((cf) => toggleEsolCrossFilter(cf, key, val))
  }

  // KPI-triggered sort defaults to DESCENDING on first click (ranks "top" values first) —
  // different from a table-header click, which defaults to ascending. Both toggle direction on
  // repeat clicks of the same key. Ported exactly from esolKpiClick vs esolSort.
  function handleKpiSortClick(key) {
    if (sortKey === key) setSortDir((d) => -d)
    else {
      setSortKey(key)
      setSortDir(-1)
    }
  }
  function handleHeaderSort(key) {
    if (sortKey === key) setSortDir((d) => -d)
    else {
      setSortKey(key)
      setSortDir(1)
    }
  }

  function handleReset() {
    setSearch('')
    setTypeFilter('')
    setSortKey(null)
    setSortDir(1)
    setCrossFilter(EMPTY_ESOL_CROSS_FILTER)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- jump back to page 1 on any filter change
    setPage(1)
  }, [crossFilter, search, typeFilter, sortKey, sortDir])

  const nameKey = tab === 'clicktask' ? 'customer' : 'school'
  const rows = useMemo(() => (data ? data[tab].rows : []), [data, tab])
  const filteredRows = useMemo(() => filterEsolRows(rows, { search, typeFilter, crossFilter }, nameKey), [rows, search, typeFilter, crossFilter, nameKey])
  const sortedRows = useMemo(() => sortEsolRows(filteredRows, sortKey, sortDir), [filteredRows, sortKey, sortDir])

  const mtd = useMemo(() => (data ? computeMTD(data[tab].transactions) : { lic: { added: 0, removed: 0 }, bus: { added: 0, removed: 0 } }), [data, tab])

  const totalLicenses = data
    ? tab === 'clicktask'
      ? (data.clicktask.totalCustomerLicenses || 0) + (data.clicktask.totalTrialLicenses || 0)
      : (data.coolbus.totalSchoolLicenses || 0) + (data.coolbus.totalTrialLicenses || 0)
    : 0

  const clicktaskSub = data ? `${data.clicktask.totalCustomers || 0} customers · ${(data.clicktask.totalCustomerLicenses || 0).toLocaleString('en-IN')} licenses` : '—'
  const coolbusSub = data
    ? `${data.coolbus.totalSchools || 0} schools · ${(data.coolbus.totalSchoolLicenses || 0).toLocaleString('en-IN')} licenses · ${(data.coolbus.totalSchoolBuses || 0).toLocaleString('en-IN')} buses`
    : '—'

  return (
    <div className="min-h-full" style={{ background: '#eef1f8' }}>
      <div className="px-4 sm:px-6 py-5">
        <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
          <div>
            <div className="text-[16px] font-bold text-[#1e293b]">
              Aditi Enterprise Solutions <span className="text-[10.5px] font-normal text-[#8891a5] ml-1.5 tracking-wide">LICENSE DEPLOYMENT INTELLIGENCE</span>
            </div>
            <div className="text-[11.5px] text-[#8891a5] mt-0.5">Portal → Enterprise Solutions</div>
          </div>
          <div className="flex items-center gap-3">
            {lastSync && <span className="text-[11px] text-[#8891a5]">Sync: {lastSync.toLocaleTimeString('en-IN')}</span>}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="text-[12px] font-semibold rounded-md px-3 py-1.5 border border-[#7c3aed]/30 text-[#7c3aed] disabled:opacity-60"
            >
              ↻ {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {loading && <div className="text-center py-16 text-[#8891a5] text-[13px]">Loading...</div>}
        {!loading && error && (
          <div className="mt-4 rounded-lg border border-[#ffb3c0] bg-[#ffeef1] px-4 py-3.5 text-[13px] text-[#e03e5c]">⚠️ Data load failed: {error}</div>
        )}

        {!loading && !error && data && (
          <div className="mt-5">
            <EnterpriseSolutionsSwitcher tab={tab} onTabChange={handleTabChange} clicktaskSub={clicktaskSub} coolbusSub={coolbusSub} />

            <div className="text-[13px] font-bold text-[#475569] mb-2">Key Performance Indicators</div>
            <EnterpriseSolutionsKpiGrid
              tab={tab}
              data={data}
              mtd={mtd}
              crossFilter={crossFilter}
              sortKey={sortKey}
              onFilterClick={handleFilterClick}
              onClearClick={handleClearFilter}
              onKpiSortClick={handleKpiSortClick}
            />
            {(crossFilter.location || crossFilter.type || crossFilter.school) && (
              <div className="flex items-center gap-2 rounded-lg bg-[#f3edff] border border-[#ded1fb] px-4 py-2 mb-3.5 text-[13px] text-[#1e293b] flex-wrap">
                🎯 Filter:{' '}
                <strong style={{ color: '#7c3aed' }}>{[crossFilter.location, crossFilter.type, crossFilter.school].filter(Boolean).join(' + ')}</strong>
                <span onClick={handleClearFilter} className="cursor-pointer font-semibold ml-2" style={{ color: '#e03e5c' }}>
                  ✕ Clear
                </span>
              </div>
            )}

            <div className="text-[13px] font-bold text-[#475569] mb-2">{activityMetric === 'license' || tab === 'clicktask' ? 'License' : 'Bus'} Activity</div>
            <EnterpriseSolutionsActivity
              tab={tab}
              transactions={data[tab].transactions}
              scope={activityScope}
              onScopeChange={setActivityScope}
              metric={activityMetric}
              onMetricChange={setActivityMetric}
              detailType={activityDetailType}
              onToggleDetail={(t) => setActivityDetailType((cur) => (cur === t ? null : t))}
            />

            <div className="text-[13px] font-bold text-[#475569] mb-2">{tab === 'clicktask' ? 'ClickTask Analytics' : 'CoolBus Analytics'}</div>
            <EnterpriseSolutionsCharts tab={tab} data={data} crossFilter={crossFilter} onChartFilterToggle={handleChartFilterToggle} />

            <div className="text-[13px] font-bold text-[#475569] mb-2.5">Deployment Explorer</div>
            <EnterpriseSolutionsFilterBar search={search} onSearchChange={setSearch} typeFilter={typeFilter} onTypeChange={setTypeFilter} onReset={handleReset} />
            <EnterpriseSolutionsTable
              tab={tab}
              rows={sortedRows}
              open={tableOpen}
              onToggleOpen={() => setTableOpen((v) => !v)}
              page={page}
              onPageChange={setPage}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleHeaderSort}
              totalLicenses={totalLicenses}
            />
          </div>
        )}
      </div>
    </div>
  )
}
