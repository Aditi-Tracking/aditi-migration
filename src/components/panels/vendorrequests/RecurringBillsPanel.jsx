import { useEffect, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import {
  baseRows,
  bulkApprove,
  bulkPay,
  computeKpis,
  fetchAll,
  filterAndSortBills,
  populateHistYearOptions,
} from '../../../lib/recurringBills'
import { lookupEmpId } from '../../../lib/vendorRequests'
import RecurringBillsTable from './RecurringBillsTable'
import RecurringBillDetailModal from './RecurringBillDetailModal'

const MONTHS = [
  ['01', 'Jan'], ['02', 'Feb'], ['03', 'Mar'], ['04', 'Apr'], ['05', 'May'], ['06', 'Jun'],
  ['07', 'Jul'], ['08', 'Aug'], ['09', 'Sep'], ['10', 'Oct'], ['11', 'Nov'], ['12', 'Dec'],
]
const FILTER_CHIPS = [
  ['all', 'All'],
  ['On Hold', '🔒 On Hold'],
  ['Approved', '✅ Approved'],
  ['Declined', '❌ Declined'],
  ['Paid', '💳 Paid'],
  ['Unpaid', '⏳ Unpaid'],
]

// Ported from old-portal/js/vendor.js's loadRecurringBills/_rpApplyFilter/rpBulkApprove/
// rpBulkPay. `recentIds` (bills submitted THIS session) resets on mount, matching production's
// reset inside openRecurringBills() — reached via a header button on VendorRequestsPanel, not a
// nav item or hub tile, same as production's single entry point.
export default function RecurringBillsPanel() {
  const { currentUser, permissions } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [allBills, setAllBills] = useState([])
  const [recentIds, setRecentIds] = useState(new Set())

  const [search, setSearch] = useState('')
  const [filterModes, setFilterModes] = useState(new Set())
  const [histMonth, setHistMonth] = useState('')
  const [histYear, setHistYear] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Map()) // id -> 'approve' | 'pay'
  const [bulkMsg, setBulkMsg] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  const [detailBillId, setDetailBillId] = useState(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setAllBills(await fetchAll())
      setSelectedIds(new Map())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time reset, not a render loop
    setRecentIds(new Set())
    load()
  }, [])

  const histActive = !!(histMonth && histYear)
  const base = baseRows(allBills, { histMonth, histYear })
  const filtered = filterAndSortBills(base, { search, statusModes: filterModes, payModes: filterModes, histActive, recentIds })
  const kpis = computeKpis(base, allBills, histActive)
  const yearOptions = populateHistYearOptions(allBills)

  function clearSelection() {
    setSelectedIds(new Map())
  }

  function toggleChip(mode) {
    setFilterModes((prev) => {
      const next = new Set(prev)
      if (mode === 'all') next.clear()
      else if (next.has(mode)) next.delete(mode)
      else next.add(mode)
      return next
    })
    clearSelection()
  }

  function toggleSelect(id, action, checked) {
    setSelectedIds((prev) => {
      const next = new Map(prev)
      if (checked) next.set(id, action)
      else next.delete(id)
      return next
    })
  }

  function handleClearHistFilter() {
    setHistMonth('')
    setHistYear('')
    clearSelection()
  }

  function patchBill(id, patch) {
    setAllBills((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function handleBillSaved(row, isNewCycle) {
    if (isNewCycle) {
      setAllBills((prev) => [...prev, row])
    } else {
      patchBill(row.id, row)
    }
    setRecentIds((prev) => new Set(prev).add(row.id))
  }

  async function handleBulkApprove() {
    const ids = [...selectedIds].filter(([, action]) => action === 'approve').map(([id]) => id)
    if (!ids.length) return
    if (!confirm(`Approve ${ids.length} recurring bill(s)?`)) return
    setBulkBusy(true)
    try {
      const empId = await lookupEmpId(currentUser?.email)
      const { ok, fail, payload } = await bulkApprove(ids, empId)
      setAllBills((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, ...payload } : r)))
      setBulkMsg({ text: `✅ ${ok} approved, ${fail} failed`, tone: fail ? 'warn' : 'success' })
      clearSelection()
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleBulkPay() {
    const ids = [...selectedIds].filter(([, action]) => action === 'pay').map(([id]) => id)
    if (!ids.length) return
    if (!confirm(`Mark ${ids.length} recurring bill(s) as Paid?`)) return
    setBulkBusy(true)
    try {
      const empId = await lookupEmpId(currentUser?.email)
      const { ok, fail, payload } = await bulkPay(ids, empId)
      setAllBills((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, ...payload } : r)))
      setBulkMsg({ text: `💳 ${ok} paid, ${fail} failed`, tone: fail ? 'warn' : 'success' })
      clearSelection()
    } finally {
      setBulkBusy(false)
    }
  }

  const detailBill = allBills.find((r) => r.id === detailBillId) || null
  const anyApproveSelected = [...selectedIds.values()].some((a) => a === 'approve')
  const anyPaySelected = [...selectedIds.values()].some((a) => a === 'pay')

  const kpiTiles = histActive
    ? [
        { label: 'Total Bills', value: kpis.totalBills, color: '#4e9af1', icon: '📋' },
        { label: 'Submitted', value: kpis.submitted, color: '#f0a500', icon: '📨' },
        { label: 'Pending Approval', value: kpis.pending, color: '#f59e0b', icon: '🔒' },
        { label: 'Approved', value: kpis.approved, color: '#22c55e', icon: '✅' },
        { label: 'Paid', value: kpis.paid, color: '#a855f7', icon: '💳' },
      ]
    : [
        { label: 'Total Bills', value: kpis.totalBills, color: '#4e9af1', icon: '📋' },
        { label: 'Due This Month', value: kpis.dueNotSubmitted, color: '#f0a500', icon: '⏰' },
        { label: 'Pending Approval', value: kpis.pending, color: '#f59e0b', icon: '🔒' },
        { label: 'Approved', value: kpis.approved, color: '#22c55e', icon: '✅' },
        { label: 'Paid', value: kpis.paid, color: '#a855f7', icon: '💳' },
      ]

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="text-[16px] font-semibold text-text">🔁 Recurring Bills</div>
          <div className="text-[11.5px] text-text-muted mt-0.5">Fixed monthly bills — only the amount changes each cycle</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {anyApproveSelected && (
            <button type="button" onClick={handleBulkApprove} disabled={bulkBusy} className="text-[12px] font-bold text-primary border border-primary/30 bg-primary-tint rounded-md px-3 py-1.5 disabled:opacity-60">
              ✅ Approve Selected
            </button>
          )}
          {anyPaySelected && (
            <button type="button" onClick={handleBulkPay} disabled={bulkBusy} className="text-[12px] font-bold text-[#a855f7] border border-[#a855f7]/30 bg-[#a855f7]/10 rounded-md px-3 py-1.5 disabled:opacity-60">
              💳 Pay Selected
            </button>
          )}
          <button type="button" onClick={load} className="text-[12px] font-medium text-text-muted border border-border rounded-md px-3 py-1.5">
            🔄 Refresh
          </button>
        </div>
      </div>

      {bulkMsg && <div className={`px-3.5 py-2.5 rounded-lg text-[12.5px] font-semibold mb-3.5 ${bulkMsg.tone === 'warn' ? 'bg-[#f0a500]/15 text-[#f0a500]' : 'bg-primary-tint text-primary'}`}>{bulkMsg.text}</div>}

      {loading && <div className="text-center py-16 text-text-muted text-[13px]">⏳ Loading recurring bills…</div>}
      {!loading && error && <div className="text-center py-16 text-danger text-[13px]">❌ {error}</div>}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-4">
            {kpiTiles.map((k) => (
              <div key={k.label} className="rounded-xl border border-border bg-surface p-3 border-l-4" style={{ borderLeftColor: k.color }}>
                <div className="text-[16px] mb-0.5">{k.icon}</div>
                <div className="text-[18px] font-extrabold" style={{ color: k.color }}>
                  {k.value}
                </div>
                <div className="text-[10px] font-bold text-text-muted uppercase tracking-wide">{k.label}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-2.5 flex-wrap items-center mb-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendor, product, location…"
              className="flex-1 min-w-[220px] px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[12.5px] outline-none"
            />
            <select value={histMonth} onChange={(e) => setHistMonth(e.target.value)} className="px-2.5 py-2 rounded-lg border border-border bg-surface-2 text-text text-[12.5px]">
              <option value="">Month</option>
              {MONTHS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <select value={histYear} onChange={(e) => setHistYear(e.target.value)} className="px-2.5 py-2 rounded-lg border border-border bg-surface-2 text-text text-[12.5px]">
              <option value="">Year</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button type="button" onClick={handleClearHistFilter} className="px-3 py-2 rounded-lg border border-border text-text-muted text-[12.5px] font-semibold">
              ✕ Clear
            </button>
          </div>

          {histActive && (
            <div className="mb-3.5 px-3.5 py-2.5 rounded-lg bg-primary-tint text-primary text-[12.5px] font-semibold">
              📅 Showing history for {MONTHS.find(([v]) => v === histMonth)?.[1]} {histYear} — read-only
            </div>
          )}

          <div className="flex gap-1.5 flex-wrap mb-4">
            {FILTER_CHIPS.map(([mode, label]) => {
              const active = mode === 'all' ? filterModes.size === 0 : filterModes.has(mode)
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => toggleChip(mode)}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-semibold border ${active ? 'bg-primary text-white border-primary' : 'bg-surface-2 text-text-muted border-border'}`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <RecurringBillsTable
            rows={filtered}
            histActive={histActive}
            recentIds={recentIds}
            currentUser={currentUser}
            permissions={permissions}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onRowClick={setDetailBillId}
          />
        </>
      )}

      <RecurringBillDetailModal bill={detailBill} currentUser={currentUser} permissions={permissions} onClose={() => setDetailBillId(null)} onSaved={handleBillSaved} />
    </div>
  )
}
