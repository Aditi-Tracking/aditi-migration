import { useEffect, useState } from 'react'
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
export default function VehicleChangesSection({ server, tier, allowedServers, totalVehicles, dataVersion, onDeltasComputed }) {
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refires on every parent reload (incl. auto-refresh), always resetting to "Yesterday", matching production
    handleQuick('yesterday')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately excludes tier/handleQuick: must NOT refire on a tier-only change, matching production (see the tier-freeze comment above)
  }, [server, dataVersion])

  const addedPct = totalVehicles && addedCount != null ? `+${((addedCount / totalVehicles) * 100).toFixed(1)}% of fleet` : ''
  const removedPct = totalVehicles && removedCount != null ? `-${((removedCount / totalVehicles) * 100).toFixed(1)}% of fleet` : ''

  const detailRows = detailType === 'added' ? addedRows : removedRows
  const q = detailSearch.toLowerCase().trim()
  const filteredDetailRows = q ? detailRows.filter((r) => (r.company || '').toLowerCase().includes(q) || (r.vehicle_no || '').toLowerCase().includes(q)) : detailRows
  const grouped = groupChangesByCompany(filteredDetailRows)

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between flex-wrap gap-2.5 mb-3.5">
        <div className="text-[11px] font-bold text-text-muted uppercase tracking-wide">Fleet Changes Filter</div>
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

      <div className="flex gap-2.5 flex-wrap mb-3">
        <button
          type="button"
          onClick={() => setDetailType('added')}
          className="flex items-center gap-3 rounded-xl border-[1.5px] border-[#10b98150] bg-[#10b98114] px-4.5 py-2.5 min-w-[160px]"
        >
          <span className="text-[20px]">🟢</span>
          <div className="text-left">
            <div className="text-[19px] font-extrabold text-[#10b981]">{addedCount == null ? '…' : addedCount.toLocaleString()}</div>
            <div className="text-[10.5px] text-text-muted">Vehicles Added</div>
            {addedPct && <div className="text-[10px] font-semibold text-[#10b981]">{addedPct}</div>}
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
            {removedPct && <div className="text-[10px] font-semibold text-danger">{removedPct}</div>}
          </div>
        </button>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3.5 py-2.5">
          <span className="text-[13px] text-text-muted">📅</span>
          <div className="text-[11.5px] font-semibold text-text">{periodLabel}</div>
        </div>
      </div>

      {detailType && (
        <div className="rounded-xl border border-border bg-surface-2 p-4 mt-1">
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
      )}
    </div>
  )
}
