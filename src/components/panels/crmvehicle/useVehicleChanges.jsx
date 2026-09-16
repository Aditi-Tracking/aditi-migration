import { useEffect, useMemo, useState } from 'react'
import {
  computeStatsDelta,
  fetchDailyFleetStats,
  fetchVehicleChangeCount,
  fetchVehicleChanges,
  groupChangesByCompany,
  resolveCustomPeriod,
  resolveQuickPeriod,
  totalVehiclesDeltaText,
} from '../../../lib/crmVehicle'

const QUICK_BUTTONS = [
  ['yesterday', 'Yesterday'],
  ['7d', 'Last 7 Days'],
  ['30d', 'Last 30 Days'],
]

// Ported from old-portal/js/crm.js's crmChgQuick/crmChgCustom/crmChgLoad/crmLoadKpiDeltas/
// crmChgShowDetail/crmChgFilterDetail/crmChgRenderDetail. Two real fidelity quirks kept exactly:
// (1) the tier filter is only ever read at the moment a period is (re)loaded — switching tiers
// afterward does NOT refetch this section, it stays scoped to whichever tier was active at load
// time, since `load` isn't re-invoked on a `tier` change (no effect depends on it); (2)
// `dataVersion` bumping — which happens on every parent reload, including the 5-minute
// auto-refresh — always resets this section back to "Yesterday", discarding whatever
// period/detail the viewer had open, matching production's unconditional
// crmChgQuick('yesterday') call inside loadCRMDashboard.
//
// A hook, not a component: `filterBar` (date controls + stat cards, always shown once
// canViewChanges) and `body` (the company-breakdown detail panel, shown only once a stat card is
// clicked) are returned as two separate pre-rendered JSX pieces so CRMVehiclePanel can render
// `body` conditionally without threading detailType/setDetailType back out of this hook. Keeps all
// the state/fetch logic in exactly one place (no prop-drilling, no risk of two separate
// state copies drifting out of sync) while letting the parent decide exactly where each piece sits.
//
// `selectedRow` (new — not a port, an explicitly requested extension) drives a genuinely new
// capability: a per-company added/removed delta for the Total Vehicles KPI tile, using the same
// active date period as the aggregate Added/Removed cards. vehicle_changes already has a real
// `company` column (used for years by the existing company-breakdown detail panel), so this is a
// straightforward added filter clause on an existing fetch, not a data-model gap.
export default function useVehicleChanges({ enabled, server, tier, allowedServers, totalVehicles, dataVersion, selectedRow, onDeltasComputed }) {
  const [activeQuick, setActiveQuick] = useState('yesterday')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [periodLabel, setPeriodLabel] = useState('—')
  const [addedCount, setAddedCount] = useState(null)
  const [removedCount, setRemovedCount] = useState(null)
  const [addedRows, setAddedRows] = useState([])
  const [removedRows, setRemovedRows] = useState([])
  const [detailType, setDetailType] = useState(null) // 'added' | 'removed' | null (closed)
  const [detailSearch, setDetailSearch] = useState('')
  const [companyDelta, setCompanyDelta] = useState(null)

  async function load(fromDate, toDateRaw, label, isLiveToday) {
    setPeriodLabel(label)
    setAddedCount(null)
    setRemovedCount(null)
    setDetailType(null)
    const toDate = toDateRaw === 'live' ? new Date().toISOString().slice(0, 10) : toDateRaw

    try {
      const [added, removed] = await Promise.all([
        fetchVehicleChanges('added', { fromDate, toDate, server, tier, allowedServers }),
        fetchVehicleChanges('removed', { fromDate, toDate, server, tier, allowedServers }),
      ])
      setAddedRows(added)
      setRemovedRows(removed)
      setAddedCount(added.length)
      setRemovedCount(removed.length)
    } catch {
      setAddedCount(null)
      setRemovedCount(null)
    }

    try {
      const [addedNet, removedNet, statsRows] = await Promise.all([
        fetchVehicleChangeCount('added', { fromDate, toDate, server, allowedServers }),
        fetchVehicleChangeCount('removed', { fromDate, toDate, server, allowedServers }),
        fetchDailyFleetStats(server),
      ])
      const totalDelta = totalVehiclesDeltaText(addedNet - removedNet)
      const deltas = computeStatsDelta(statsRows, {
        fromDate,
        toDate,
        isLiveToday,
        liveCurrent: totalVehicles, // only read for the isLiveToday branch
      })
      onDeltasComputed(deltas, totalDelta)
    } catch {
      onDeltasComputed(null, null)
    }
  }

  function handleQuick(period) {
    setActiveQuick(period)
    const { fromDate, toDate, periodLabel: label, isLiveToday } = resolveQuickPeriod(period)
    setDateFrom(fromDate)
    setDateTo(toDate)
    load(fromDate, toDate, label, isLiveToday)
  }

  function handleCustom(from, to) {
    const resolved = resolveCustomPeriod(from, to)
    if (!resolved) {
      if (from && to) alert('From date must be before To date')
      return
    }
    setActiveQuick(null)
    load(resolved.fromDate, resolved.toDate, resolved.periodLabel, resolved.isLiveToday)
  }

  useEffect(() => {
    // `enabled` guards this whole hook the way `canViewChanges &&` used to gate mounting the old
    // component — a viewer without this permission should never trigger these fetches at all,
    // not just never see their result.
    if (!enabled) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refires on every parent reload (incl. auto-refresh), always resetting to "Yesterday", matching production
    handleQuick('yesterday')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately excludes tier/handleQuick: must NOT refire on a tier-only change, matching production (see the tier-freeze comment above)
  }, [enabled, server, dataVersion])

  // New: per-company delta for the currently-selected row, over the currently-active date
  // period. Fires on a selection change (independent of this section's own date-period reloads,
  // since selecting a row happens in a sibling component) and on a date-period change while a
  // row is already selected. Deliberately no `tier` dependency, matching
  // fetchVehicleChangeCount's own established tier-omission above.
  useEffect(() => {
    if (!enabled || !selectedRow || !dateFrom || !dateTo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resolves companyDelta to null immediately when there's nothing valid to fetch for, not a render loop
      setCompanyDelta(null)
      return
    }
    let cancelled = false
    const toDate = dateTo === 'live' ? new Date().toISOString().slice(0, 10) : dateTo
    Promise.all([
      fetchVehicleChangeCount('added', { fromDate: dateFrom, toDate, server, allowedServers, company: selectedRow.company }),
      fetchVehicleChangeCount('removed', { fromDate: dateFrom, toDate, server, allowedServers, company: selectedRow.company }),
    ])
      .then(([added, removed]) => {
        if (!cancelled) setCompanyDelta(totalVehiclesDeltaText(added - removed))
      })
      .catch(() => {
        if (!cancelled) setCompanyDelta(null)
      })
    return () => {
      cancelled = true
    }
  }, [enabled, selectedRow, dateFrom, dateTo, server, allowedServers])

  const addedPct = totalVehicles && addedCount != null ? `+${((addedCount / totalVehicles) * 100).toFixed(1)}% of fleet` : ''
  const removedPct = totalVehicles && removedCount != null ? `-${((removedCount / totalVehicles) * 100).toFixed(1)}% of fleet` : ''

  const detailRows = detailType === 'added' ? addedRows : removedRows
  // Memoized so a re-render for an unrelated reason (e.g. the 5-minute auto-refresh bumping
  // dataVersion while the detail panel happens to be open) doesn't re-filter/re-group rows that
  // haven't actually changed — detailSearch stays a real dependency, so live search-typing still
  // recomputes exactly when it should.
  const filteredDetailRows = useMemo(() => {
    const q = detailSearch.toLowerCase().trim()
    return q ? detailRows.filter((r) => (r.company || '').toLowerCase().includes(q) || (r.vehicle_no || '').toLowerCase().includes(q)) : detailRows
  }, [detailRows, detailSearch])
  const grouped = useMemo(() => groupChangesByCompany(filteredDetailRows), [filteredDetailRows])

  const filterBar = (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="flex gap-2.5 flex-wrap">
        <button
          type="button"
          onClick={() => setDetailType('added')}
          className="flex items-center gap-3 rounded-xl border-[1.5px] border-[#10b98150] bg-[#10b98114] px-4.5 py-2.5 min-w-[160px]"
        >
          <span className="text-[20px]">🟢</span>
          <div className="text-left">
            <div className="text-[19px] font-extrabold text-[#10b981]">{addedCount == null ? '…' : addedCount.toLocaleString()}</div>
            <div className="text-[10.5px] text-text-muted">Vehicles Added</div>
            {/* Always rendered (never conditionally unmounted) so this line's height is reserved
                even while addedCount is null mid-reload — invisible, not absent, so nothing above
                or below it visibly resizes during the loading moment. */}
            <div className={`text-[10px] font-semibold text-[#10b981] ${addedPct ? '' : 'invisible'}`}>{addedPct || '+0.0% of fleet'}</div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setDetailType('removed')}
          className="flex items-center gap-3 rounded-xl border-[1.5px] border-danger/30 bg-danger-tint px-4.5 py-2.5 min-w-[160px]"
        >
          <span className="text-[20px]">🔴</span>
          <div className="text-left">
            <div className="text-[19px] font-extrabold text-danger">{removedCount == null ? '…' : removedCount.toLocaleString()}</div>
            <div className="text-[10.5px] text-text-muted">Vehicles Removed</div>
            <div className={`text-[10px] font-semibold text-danger ${removedPct ? '' : 'invisible'}`}>{removedPct || '-0.0% of fleet'}</div>
          </div>
        </button>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3.5 py-2.5">
          <span className="text-[13px] text-text-muted">📅</span>
          <div className="text-[11.5px] font-semibold text-text">{periodLabel}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {QUICK_BUTTONS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => handleQuick(key)}
            className={`text-[11.5px] font-medium rounded-md px-2.5 py-1.5 border ${
              activeQuick === key ? 'bg-primary text-white border-primary' : 'border-border text-text-muted'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5">
          <span className="text-[11.5px] text-text-muted">From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value)
              handleCustom(e.target.value, dateTo)
            }}
            className="bg-transparent text-text text-[12px] outline-none"
          />
          <span className="text-[11.5px] text-text-muted">To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value)
              handleCustom(dateFrom, e.target.value)
            }}
            className="bg-transparent text-text text-[12px] outline-none"
          />
        </div>
      </div>
    </div>
  )

  const body = detailType && (
    <div className="mb-4">
      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-semibold text-text">
            {detailType === 'added' ? '🟢' : '🔴'}{' '}
            <span className={detailType === 'added' ? 'text-[#10b981]' : 'text-danger'}>
              {filteredDetailRows.length.toLocaleString()} Vehicles {detailType === 'added' ? 'Added' : 'Removed'}
            </span>{' '}
            — Company Breakdown
          </div>
          <button type="button" onClick={() => setDetailType(null)} className="text-text-muted text-[15px]">
            ✕
          </button>
        </div>
        <input
          type="text"
          value={detailSearch}
          onChange={(e) => setDetailSearch(e.target.value)}
          placeholder="🔍 Search company..."
          className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface text-text text-[12.5px] outline-none mb-2.5"
        />
        <div className="max-h-[320px] overflow-y-auto">
          {!grouped.length ? (
            <div className="text-center py-6 text-text-muted text-[12.5px]">No data found</div>
          ) : (
            grouped.map((g) => (
              <div key={g.company} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <div className="text-[12.5px] font-semibold text-text">{g.company}</div>
                  <div className="text-[10.5px] text-text-muted">
                    {g.tier ? g.tier + ' · ' : ''}
                    {(g.region || '').replace(' Server', '')}
                  </div>
                </div>
                <div className={`text-[13px] font-bold ${detailType === 'added' ? 'text-[#10b981]' : 'text-danger'}`}>
                  {detailType === 'added' ? '+' : '-'}
                  {g.count}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )

  return { filterBar, body, companyDelta }
}
