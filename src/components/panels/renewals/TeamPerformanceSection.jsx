import { useEffect, useState } from 'react'
import { RU_TEAM_PERF_PRESETS, fetchTeamPerformance, teamPerfDateRange } from '../../../lib/renewals'

// Ported from old-portal/js/renewals.js's _ruTeamPerfShellHtml/
// loadRenewalsTeamPerformance/_ruTeamPerfPresetChange/_ruTeamPerfApplyCustom/
// _ruTeamPerfTableHtml. Owns its own preset/custom-range state independent
// of the Overview tab's location filter — switching location only re-fetches
// with the new location, it never resets which date range was selected.
// Same access split as My Customers/Closed-Paid: `isMIS || fullDataAccess`
// gets the full peer comparison table, a plain crm_persons match gets a
// compact personal 3-tile scorecard instead.
export default function TeamPerformanceSection({ location, isMIS, fullDataAccess, crmPerson }) {
  const crmPersonId = crmPerson?.id || null
  const showFullTable = isMIS || fullDataAccess

  const [preset, setPreset] = useState('mtd')
  const [customFrom, setCustomFrom] = useState('') // committed — only set by Apply, drives the fetch
  const [customTo, setCustomTo] = useState('')
  const [pendingCustomFrom, setPendingCustomFrom] = useState('') // draft input values
  const [pendingCustomTo, setPendingCustomTo] = useState('')

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const { start, end } = preset === 'custom' ? { start: customFrom, end: customTo } : teamPerfDateRange(preset)
  const waitingForCustomRange = preset === 'custom' && (!start || !end)

  useEffect(() => {
    if (waitingForCustomRange) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no valid custom range yet, resolves the empty state immediately
      setRows([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    fetchTeamPerformance({ crmPersonId, isMIS, fullDataAccess, location, start, end })
      .then((data) => !cancelled && setRows(data))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [location, isMIS, fullDataAccess, crmPersonId, start, end, waitingForCustomRange])

  function handlePresetChange(value) {
    if (value === 'custom') {
      setPendingCustomFrom(customFrom)
      setPendingCustomTo(customTo)
    }
    setPreset(value)
  }

  function handleApplyCustom() {
    if (!pendingCustomFrom || !pendingCustomTo) {
      alert('⚠️ Please select both a start and end date.')
      return
    }
    setCustomFrom(pendingCustomFrom)
    setCustomTo(pendingCustomTo)
  }

  return (
    <div className="rounded-xl border border-border bg-surface mb-5 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between flex-wrap gap-2.5">
        <span className="text-[13px] font-semibold text-text">{showFullTable ? 'CRM Team Performance' : 'Your Calling Activity'}</span>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={preset}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="rounded-md border border-border bg-surface-2 text-text text-[12px] font-semibold px-2.5 py-1.5"
          >
            {RU_TEAM_PERF_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          {preset === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={pendingCustomFrom}
                onChange={(e) => setPendingCustomFrom(e.target.value)}
                className="rounded-md border border-border bg-surface-2 text-text text-[12px] px-1.5 py-1"
              />
              <span className="text-text-muted text-[12px]">to</span>
              <input
                type="date"
                value={pendingCustomTo}
                onChange={(e) => setPendingCustomTo(e.target.value)}
                className="rounded-md border border-border bg-surface-2 text-text text-[12px] px-1.5 py-1"
              />
              <button
                type="button"
                onClick={handleApplyCustom}
                className="rounded-md bg-primary text-white font-bold text-[12px] px-3 py-1"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      </div>

      <div>
        {waitingForCustomRange ? (
          <p className="px-4 py-3.5 text-text-muted text-[12.5px]">Pick a date range and click Apply.</p>
        ) : loading ? (
          <p className="px-4 py-3.5 text-text-muted text-[12.5px]">Loading…</p>
        ) : error ? (
          <p className="px-4 py-3.5 text-danger text-[12.5px]">⚠️ {error}</p>
        ) : showFullTable ? (
          <FullTable rows={rows} />
        ) : (
          <PersonalScorecard row={rows[0]} />
        )}
      </div>
    </div>
  )
}

function FullTable({ rows }) {
  if (!rows.length) return <p className="px-4 py-3.5 text-text-muted text-[12.5px]">No active CRM persons.</p>
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-[12.5px] w-full">
        <thead>
          <tr className="bg-surface-2 text-text-muted text-left border-b border-border">
            <th className="px-3 py-1.5">CRM Person</th>
            <th className="px-3 py-1.5 text-right">Calls</th>
            <th className="px-3 py-1.5 text-right">Received Amount</th>
            <th className="px-3 py-1.5 text-right">Total Customers</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => {
            const receivedAmount = Number(t.received_amount || 0)
            const isTop = i === 0 && receivedAmount > 0
            return (
              <tr key={t.person_name + i} className={`border-b border-border last:border-b-0 even:bg-surface-2/40 ${isTop ? 'font-semibold' : ''}`}>
                <td className="px-3 py-1.5 text-text">
                  {t.person_name}
                  {isTop && (
                    <span className="ml-1.5 rounded-full bg-primary-tint text-primary text-[10.5px] font-bold px-2 py-0.5 whitespace-nowrap">
                      ★ Top Performer
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right">{t.calls_count}</td>
                <td className={`px-3 py-1.5 text-right ${receivedAmount > 0 ? 'text-primary font-bold' : 'text-text-muted'}`}>
                  ₹{receivedAmount.toLocaleString('en-IN')}
                </td>
                <td className="px-3 py-1.5 text-right">{t.total_customers}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PersonalScorecard({ row }) {
  const t = row || { calls_count: 0, received_amount: 0, total_customers: 0 }
  const tiles = [
    { label: 'Calls', value: t.calls_count },
    { label: 'Received Amount', value: `₹${Number(t.received_amount || 0).toLocaleString('en-IN')}` },
    { label: 'Total Customers', value: t.total_customers },
  ]
  return (
    <div className="grid grid-cols-3 gap-3 p-3.5">
      {tiles.map((x) => (
        <div key={x.label} className="rounded-lg border border-border bg-surface-2 p-3">
          <div className="text-[11px] text-text-muted">{x.label}</div>
          <div className="text-[16px] font-bold text-text mt-1">{x.value}</div>
        </div>
      ))}
    </div>
  )
}
