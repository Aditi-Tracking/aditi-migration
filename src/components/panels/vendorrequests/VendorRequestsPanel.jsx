import { useEffect, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import {
  bulkMarkPaid,
  buildRequesterFilterOptions,
  buildVendorFilterOptions,
  computeAmountKpis,
  computeCountKpis,
  deleteVendorRequest,
  fetchAll,
  filterVendorRequests,
  formatINR,
} from '../../../lib/vendorRequests'
import { canAccessRecurringBills } from '../../../lib/recurringBills'
import VendorRequestsTable from './VendorRequestsTable'
import VendorRequestFormModal from './VendorRequestFormModal'
import VendorRequestReviewModal from './VendorRequestReviewModal'

const FILTER_CHIPS = [
  ['all', 'All'],
  ['On Hold', '🔒 On Hold'],
  ['Approved', '✅ Approved'],
  ['Declined', '❌ Declined'],
  ['Paid', '💳 Paid'],
  ['Unpaid', '⏳ Unpaid'],
]

// Ported from old-portal/js/vendor.js's loadVendorRequests/_vrApplyFilter/vrSetFilter/vrBulkPay.
// Reached from Finance's "Purchase Request" card — see FinancePanel.jsx/CNSectionPanel.jsx's
// extraCard slot. Recurring Bills (a fully separate feature bundled in the same production file,
// its own recurring_* permissions) is now built too — reached via the header button below, which
// navigates to a sibling panel rather than production's nested-overlay-on-overlay, matching every
// other cross-panel jump in this app.
export default function VendorRequestsPanel({ onNavigate }) {
  const { currentUser, permissions } = useAuth()
  const showRecurringBillsBtn = canAccessRecurringBills(currentUser, permissions)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nameMap, setNameMap] = useState({})
  const [vendors, setVendors] = useState([])
  const [requests, setRequests] = useState([])

  const [search, setSearch] = useState('')
  const [filterModes, setFilterModes] = useState(new Set())
  const [filterVendor, setFilterVendor] = useState('')
  const [filterRequester, setFilterRequester] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkMsg, setBulkMsg] = useState(null)
  const [bulkPaying, setBulkPaying] = useState(false)

  const [formModal, setFormModal] = useState(null) // { editingRequest: {...} | null } | null
  const [reviewId, setReviewId] = useState(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await fetchAll(currentUser, permissions)
      setNameMap(data.nameMap)
      setVendors(data.vendors)
      setRequests(data.requests)
      setSelectedIds(new Set())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fetch
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-time fetch
  }, [])

  function clearSelection() {
    setSelectedIds(new Set())
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

  const filtered = filterVendorRequests(requests, {
    search,
    statusModes: filterModes,
    payModes: filterModes,
    vendor: filterVendor,
    requester: filterRequester,
    nameMap,
  })
  const countKpis = computeCountKpis(filtered)
  const amountKpis = computeAmountKpis(filtered)
  const vendorOptions = buildVendorFilterOptions(requests)
  const requesterOptions = buildRequesterFilterOptions(requests, nameMap)

  function toggleSelect(id, checked) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function patchRequest(id, patch) {
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function handleVendorAdded(saved) {
    setVendors((prev) => [...prev, saved].sort((a, b) => a.vendor_name.localeCompare(b.vendor_name)))
  }

  function handleFormSaved() {
    setFormModal(null)
    load()
  }

  async function handleDelete(id) {
    const req = requests.find((r) => r.id === id)
    if (!req) return
    if (!confirm(`Delete purchase request from ${req.vendor_name || 'this request'}?\n\nThis cannot be undone.`)) return
    try {
      await deleteVendorRequest(id)
      setRequests((prev) => prev.filter((r) => r.id !== id))
    } catch (e) {
      alert('❌ Delete failed: ' + e.message)
    }
  }

  async function handleBulkPay() {
    const ids = [...selectedIds]
    if (!ids.length) return
    if (!confirm(`Mark ${ids.length} row(s) as Paid?`)) return
    setBulkPaying(true)
    try {
      const { ok, fail, payload } = await bulkMarkPaid(ids, currentUser?.email)
      setRequests((prev) => prev.map((r) => (selectedIds.has(r.id) ? { ...r, ...payload } : r)))
      setBulkMsg({ text: `💳 ${ok} paid, ${fail} failed`, tone: fail ? 'warn' : 'success' })
      clearSelection()
    } finally {
      setBulkPaying(false)
    }
  }

  const reviewRequest = requests.find((r) => r.id === reviewId) || null

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="text-[16px] font-semibold text-text">Vendor Purchase Approvals</div>
          <div className="text-[11.5px] text-text-muted mt-0.5">Home › Finance › Purchase Requests</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {showRecurringBillsBtn && (
            <button
              type="button"
              onClick={() => onNavigate?.('recurringbills')}
              className="text-[12px] font-bold text-white rounded-md px-3.5 py-1.5"
              style={{ background: 'linear-gradient(135deg,#8b5cf6,#a78bfa)' }}
            >
              🔁 Recurring
            </button>
          )}
          {selectedIds.size > 0 && (
            <button type="button" onClick={handleBulkPay} disabled={bulkPaying} className="text-[12px] font-bold text-primary border border-primary/30 bg-primary-tint rounded-md px-3 py-1.5 disabled:opacity-60">
              💳 Pay Selected ({selectedIds.size})
            </button>
          )}
          <button type="button" onClick={load} className="text-[12px] font-medium text-text-muted border border-border rounded-md px-3 py-1.5">
            🔄 Refresh
          </button>
          <button type="button" onClick={() => setFormModal({ editingRequest: null })} className="text-[12px] font-bold text-white bg-primary rounded-md px-3.5 py-1.5">
            + New Request
          </button>
        </div>
      </div>

      {bulkMsg && <div className={`px-3.5 py-2.5 rounded-lg text-[12.5px] font-semibold mb-3.5 ${bulkMsg.tone === 'warn' ? 'bg-[#f0a500]/15 text-[#f0a500]' : 'bg-primary-tint text-primary'}`}>{bulkMsg.text}</div>}

      {loading && <div className="text-center py-16 text-text-muted text-[13px]">⏳ Loading requests…</div>}
      {!loading && error && <div className="text-center py-16 text-danger text-[13px]">❌ {error}</div>}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
            {[
              { label: 'Total', value: countKpis.total, color: '#4e9af1', icon: '📋' },
              { label: 'On Hold', value: countKpis.onHold, color: '#f59e0b', icon: '🔒' },
              { label: 'Approved', value: countKpis.approved, color: '#22c55e', icon: '✅' },
              { label: 'Paid', value: countKpis.paid, color: '#a855f7', icon: '💳' },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-border bg-surface p-3 border-l-4" style={{ borderLeftColor: k.color }}>
                <div className="text-[16px] mb-0.5">{k.icon}</div>
                <div className="text-[18px] font-extrabold" style={{ color: k.color }}>
                  {k.value}
                </div>
                <div className="text-[10px] font-bold text-text-muted uppercase tracking-wide">{k.label}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
            {[
              { label: 'Total Requested (₹)', value: amountKpis.total, color: '#4e9af1', icon: '💰' },
              { label: 'Approved Amount (₹)', value: amountKpis.approved, color: '#22c55e', icon: '✅' },
              { label: 'Paid Amount (₹)', value: amountKpis.paid, color: '#a855f7', icon: '💳' },
              { label: 'Unpaid Amount (₹)', value: amountKpis.unpaid, color: '#ef4444', icon: '⏳' },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-border bg-surface p-3 border-l-4" style={{ borderLeftColor: k.color }}>
                <div className="text-[16px] mb-0.5">{k.icon}</div>
                <div className="text-[16px] font-extrabold" style={{ color: k.color }}>
                  {formatINR(k.value)}
                </div>
                <div className="text-[10px] font-bold text-text-muted uppercase tracking-wide">{k.label}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-2.5 flex-wrap mb-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendor, product, employee…"
              className="flex-1 min-w-[220px] px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[12.5px] outline-none"
            />
            <select value={filterVendor} onChange={(e) => setFilterVendor(e.target.value)} className="px-2.5 py-2 rounded-lg border border-border bg-surface-2 text-text text-[12.5px]">
              <option value="">🔽 Filter by vendor…</option>
              {vendorOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <select value={filterRequester} onChange={(e) => setFilterRequester(e.target.value)} className="px-2.5 py-2 rounded-lg border border-border bg-surface-2 text-text text-[12.5px]">
              <option value="">🔽 Filter by requested by…</option>
              {requesterOptions.map((p) => (
                <option key={p.email} value={p.email}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

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

          <VendorRequestsTable
            rows={filtered}
            nameMap={nameMap}
            currentUser={currentUser}
            permissions={permissions}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onRowClick={setReviewId}
            onEdit={(id) => setFormModal({ editingRequest: requests.find((r) => r.id === id) })}
            onDelete={handleDelete}
          />
        </>
      )}

      <VendorRequestFormModal
        open={!!formModal}
        editingRequest={formModal?.editingRequest || null}
        vendors={vendors}
        currentUser={currentUser}
        onClose={() => setFormModal(null)}
        onVendorAdded={handleVendorAdded}
        onSaved={handleFormSaved}
      />

      <VendorRequestReviewModal request={reviewRequest} nameMap={nameMap} permissions={permissions} onClose={() => setReviewId(null)} onSaved={patchRequest} />
    </div>
  )
}
