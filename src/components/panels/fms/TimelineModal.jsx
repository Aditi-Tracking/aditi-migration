import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import {
  calcPendingAmount,
  canOverride,
  canReassign,
  certQuantity,
  empName,
  fetchAssignments,
  fetchCertifications,
  fetchLatestConfig,
  fetchLatestInstallation,
  fetchOrderNotes,
  addOrderNote,
  deleteOrderNote,
  isCertOrder,
  isInvolvedInOrder,
  notesIsAdmin,
  parseProofUrls,
  productNames,
  statusLabel,
} from '../../../lib/fms'

const fmtDt = (dt) => (dt ? new Date(dt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null)
const fmtDate = (dt) => (dt ? new Date(dt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

// Ported from old-portal/js/fms.js's fmsOpenTimeline. Read-only detail view
// + Notes (add/delete, involvement-gated) + Payment/Edit/Delete/Reassign actions.
export default function TimelineModal({
  open,
  orderId,
  order,
  currentUser,
  permissions,
  locations,
  products,
  empMap,
  onClose,
  onEdit,
  onDelete,
  onOpenPayment,
  onOpenReassign,
}) {
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState([])
  const [config, setConfig] = useState(null)
  const [installation, setInstallation] = useState(null)
  const [certRows, setCertRows] = useState([])
  const [notes, setNotes] = useState([])
  const [noteInput, setNoteInput] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  async function load() {
    setLoading(true)
    const [a, c, i, cert, n] = await Promise.all([
      fetchAssignments(orderId),
      fetchLatestConfig(orderId),
      fetchLatestInstallation(orderId),
      fetchCertifications(orderId),
      fetchOrderNotes(orderId),
    ])
    setAssignments(a)
    setConfig(c)
    setInstallation(i)
    setCertRows(cert)
    setNotes(n)
    setLoading(false)
  }

  useEffect(() => {
    if (!open || !orderId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fresh detail fetch every time Timeline opens for a (possibly different) order
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId])

  if (!open || !order) return null

  const myEmailLower = (currentUser?.email || '').toLowerCase().trim()
  const isOverride = canOverride(currentUser, permissions)
  const isOrderCreator = myEmailLower === (order.created_by || '').toLowerCase().trim()
  const notesAdmin = notesIsAdmin(currentUser)
  const involved = isInvolvedInOrder(order, assignments, installation, myEmailLower)
  const canAddNote = notesAdmin || involved
  const canDeleteNote = (createdBy) => notesAdmin || (createdBy || '').toLowerCase().trim() === myEmailLower

  const locName = order.location_type === 'outside' ? order.location_manual || 'Outside' : locations.find((l) => l.id === order.location_id)?.location_name || '—'
  const pendAmt = calcPendingAmount(order)
  const step = order.current_step || 1
  const certOrder = isCertOrder(order)
  const certTarget = certQuantity(order)
  const certifiedSoFar = certRows.reduce((s, r) => s + (parseInt(r.certified_qty) || 0), 0)
  const cert = certRows[0] || null
  const proofs = parseProofUrls(order.payment_proof_url)

  const stepDefs = [
    {
      icon: '🗒️',
      label: 'Order Created',
      state: step >= 1 ? 'done' : 'active',
      time: fmtDt(order.step1_completed_at || order.created_at),
      info: `By ${empName(empMap, order.created_by)} → ${empName(empMap, order.assigned_to_support)}`,
    },
    {
      icon: '🔧',
      label: 'Support Assign',
      state: step >= 2 ? 'done' : step === 1 ? 'active' : 'pending',
      time: fmtDt(order.step2_completed_at),
      info: step >= 2 ? `To: ${empName(empMap, assignments.find((a) => a.step === 2)?.assigned_to)}` : '⏳ Pending',
    },
    {
      icon: '💾',
      label: 'Configuration',
      state: step >= 3 ? 'done' : step === 2 ? 'active' : 'pending',
      time: fmtDt(config?.configured_at),
      info: config ? (config.is_skipped ? `Skipped — ${config.skip_reason || ''}` : `✓ ${config.configured_qty} done, ${config.not_configured_qty} pending`) : '⏳ Pending',
    },
    {
      icon: '🔩',
      label: 'Installation',
      state: step >= 4 ? 'done' : step === 3 ? 'active' : 'pending',
      time: fmtDt(installation?.assigned_at),
      info: installation ? `Eng: ${empName(empMap, installation.engineer_email)} · ${installation.devices_installed}/${order.quantity} installed` : '⏳ Pending',
    },
    {
      icon: '🏁',
      label: 'Completed',
      state: order.status === 'completed' ? 'done' : step >= 4 ? 'active' : 'pending',
      time: fmtDt(order.step5_completed_at),
      info: order.status === 'completed' ? '🎉 Order Completed' : '⏳ Pending',
    },
  ]
  // Pure certification orders never really go through Config/Installation —
  // repurpose those two tiles so they don't misleadingly show blank/pending.
  if (certOrder) {
    stepDefs[2] = {
      icon: '📶',
      label: 'Certification',
      state: order.status === 'completed' ? 'done' : step >= 2 ? 'active' : 'pending',
      time: fmtDt(cert?.certified_at),
      info: certTarget > 0 ? `✓ ${certifiedSoFar}/${certTarget} certified${cert ? ` by ${empName(empMap, cert.certified_by)}` : ''}` : '⏳ Pending',
    }
    stepDefs[3] = { ...stepDefs[3], info: 'N/A — Certification only' }
  }

  async function handleAddNote() {
    const text = noteInput.trim()
    if (!text) return
    setSavingNote(true)
    try {
      await addOrderNote(orderId, text, currentUser?.email || '')
      setNoteInput('')
      await load()
    } finally {
      setSavingNote(false)
    }
  }

  async function handleDeleteNote(note) {
    if (!window.confirm('Delete this note? This cannot be undone.')) return
    await deleteOrderNote(note.id)
    await load()
  }

  const row = (label, value, valueClass = '') => (
    <div className="flex items-baseline py-1.5 border-b border-border last:border-0">
      <span className="min-w-[130px] text-[11.5px] text-text-muted font-semibold shrink-0">{label}</span>
      <span className={`text-[13px] font-semibold text-text flex-1 ${valueClass}`}>{value}</span>
    </div>
  )

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="text-[15px] font-semibold text-text">
          📋 Order: <span className="text-primary">{order.so_number}</span>{' '}
          <span className="text-[11px] font-medium text-text-muted">
            {statusLabel(order.status).icon} {statusLabel(order.status).label}
          </span>
        </div>
        <div className="flex gap-1.5">
          {(isOrderCreator || isOverride) && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onOpenPayment(order.id)
              }}
              className="text-[12px] font-medium text-primary border border-primary/30 rounded-md px-3 py-1.5"
            >
              💰 Payment
            </button>
          )}
          {isOverride && (
            <>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onEdit(order.id)
                }}
                className="text-[12px] font-medium text-text-muted border border-border rounded-md px-3 py-1.5"
              >
                ✏️ Edit
              </button>
              <button
                type="button"
                onClick={() => onDelete(order.id)}
                className="text-[12px] font-medium text-danger border border-danger/30 bg-danger-tint rounded-md px-3 py-1.5"
              >
                🗑️ Delete
              </button>
            </>
          )}
          {order.status === 'pending_support' && canReassign(currentUser, permissions, order) && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onOpenReassign(order.id)
              }}
              className="text-[12px] font-medium text-primary border border-primary/30 rounded-md px-3 py-1.5"
            >
              🔁 Reassign
            </button>
          )}
        </div>
      </div>

      {/* Pipeline recap */}
      <div className="flex items-start w-full mb-4 overflow-x-auto">
        {stepDefs.map((s, i) => {
          const isDone = s.state === 'done'
          const isActive = s.state === 'active'
          return (
            <div key={s.label} className="flex items-start flex-1 min-w-[110px]">
              <div className="flex flex-col items-center gap-1 shrink-0 w-[90px]">
                <div
                  className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-[15px] ${
                    isDone ? 'border-primary bg-primary-tint' : isActive ? 'border-primary bg-surface' : 'border-border bg-surface-2 opacity-40'
                  }`}
                >
                  {s.icon}
                </div>
                <div className={`text-[10px] font-bold text-center ${isDone || isActive ? 'text-primary' : 'text-text-muted'}`}>{s.label}</div>
                <div className="text-[9.5px] text-text-muted text-center">{s.time || ''}</div>
                <div className={`text-[9.5px] text-center leading-tight ${isDone || isActive ? 'text-primary' : 'text-text-muted'}`}>{s.info}</div>
              </div>
              {i < stepDefs.length - 1 && <div className={`flex-1 h-[2px] mt-[18px] ${isDone ? 'bg-primary' : 'bg-border'}`} />}
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide mb-1.5">Order Details</div>
          <div className="rounded-lg border border-border bg-surface-2 px-3.5 mb-3">
            {row('Client', order.client_name || '—')}
            {row('SO Number', order.so_number || '—', 'text-primary')}
            {row('Ticket No', order.ticket_no || '—')}
            {row('Location', locName)}
            {row('Products', productNames(order.product_ids, order.product_items, products))}
            {row('Total Quantity', `${order.quantity || '—'} units`)}
            {row('Created By', empName(empMap, order.created_by))}
            {row('Assigned To', empName(empMap, order.assigned_to_support))}
          </div>

          <div className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide mb-1.5">Payment Details</div>
          <div className="rounded-lg border border-border bg-surface-2 px-3.5">
            {row('Order Amount', `₹${(order.order_amount || 0).toLocaleString('en-IN')}`)}
            {row('Amount Received', `₹${(order.amount_received || 0).toLocaleString('en-IN')}`, 'text-primary')}
            {parseFloat(order.tds_amount) > 0 && row('TDS Deducted', `₹${order.tds_amount.toLocaleString('en-IN')}`)}
            {row('Pending Amount', `₹${pendAmt.toLocaleString('en-IN')}`, pendAmt > 0 ? 'text-danger' : 'text-primary')}
            {order.tentative_date && row('Payment Due Date', fmtDate(order.tentative_date))}
            {!!proofs.length &&
              row(
                'Payment Proof',
                <span className="flex gap-2 flex-wrap">
                  {proofs.map((url, i) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="text-primary font-semibold">
                      📎{proofs.length > 1 ? ` ${i + 1}` : ''}
                    </a>
                  ))}
                </span>
              )}
          </div>
        </div>

        <div>
          <div className="text-[10.5px] font-bold text-text-muted uppercase tracking-wide mb-1.5">📝 Notes</div>
          <div className="flex flex-col gap-2 mb-2.5 max-h-[300px] overflow-y-auto">
            {loading && <div className="text-[12px] text-text-muted">Loading…</div>}
            {!loading && !notes.length && (
              <div className="text-[12px] text-text-muted">No notes yet{canAddNote ? ' — add one below to explain a delay or share an update.' : '.'}</div>
            )}
            {notes.map((n) => (
              <div key={n.id} className="rounded-lg border border-border bg-surface-2 px-3 py-2 flex gap-2 items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] text-text whitespace-pre-wrap leading-relaxed">{n.note_text}</div>
                  <div className="text-[10.5px] text-text-muted mt-1">
                    {empName(empMap, n.created_by)} · {fmtDt(n.created_at)}
                  </div>
                </div>
                {canDeleteNote(n.created_by) && (
                  <button type="button" onClick={() => handleDeleteNote(n)} title="Delete note" className="shrink-0 text-text-muted">
                    🗑️
                  </button>
                )}
              </div>
            ))}
          </div>
          {canAddNote && (
            <>
              <textarea
                rows={3}
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="e.g. Delayed due to client unavailable on site, rescheduled to..."
                className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[12.5px] outline-none"
              />
              <button
                type="button"
                onClick={handleAddNote}
                disabled={savingNote}
                className="mt-2 bg-primary text-white rounded-lg px-4 py-1.5 text-[12.5px] font-bold disabled:opacity-60"
              >
                ➕ Add Note
              </button>
            </>
          )}
        </div>
      </div>
    </OverlayShell>
  )
}
