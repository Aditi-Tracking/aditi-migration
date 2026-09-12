import { useEffect, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import OverlayShell from '../../shared/OverlayShell'
import { canPayVendorRequests, canReviewVendorRequests, formatINR, markPaid, saveDecision } from '../../../lib/vendorRequests'
import { VendorPayBadge, VendorStatusBadge } from './VendorBadges'

// Ported from old-portal/js/vendor.js's openVrModal/vrSaveDecision/vrMarkPaid. The EA section and
// Accounts section are independently conditional — EA's is gated purely on review rights, while
// Accounts' additionally requires status==='Approved' && payment_status!=='Paid' (a request
// that's already Paid, or not yet Approved, never shows the mark-paid controls even to someone
// with pay rights).
export default function VendorRequestReviewModal({ request, nameMap, permissions, onClose, onSaved }) {
  const { currentUser } = useAuth()
  const canReview = canReviewVendorRequests(currentUser, permissions)
  const canPay = canPayVendorRequests(currentUser, permissions)

  const [status, setStatus] = useState('On Hold')
  const [remarks, setRemarks] = useState('')
  const [utr, setUtr] = useState('')
  const [proofFile, setProofFile] = useState(null)
  const [savingDecision, setSavingDecision] = useState(false)
  const [savingPay, setSavingPay] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!request) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the modal's local state whenever the open request changes, not a render loop
    setStatus(request.status || 'On Hold')
    setRemarks(request.remarks || '')
    setUtr(request.utr_number || '')
    setProofFile(null)
    setMsg(null)
  }, [request])

  if (!request) return null

  const nameDisplay = nameMap[String(request.submitted_by || '').toLowerCase()] || request.submitted_by || '—'
  const dateStr = request.created_at ? new Date(request.created_at).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
  const showAccountsSection = canPay && request.status === 'Approved' && request.payment_status !== 'Paid'

  const details = [
    ['Requested By', nameDisplay],
    ['Date', dateStr],
    ['Amount', request.amount != null ? formatINR(request.amount) : '—'],
    ['Quantity', request.qty || '—'],
    ['Location', request.location || '—'],
    ['Invoice #', request.invoice_number || '—'],
    ['PO No. (Odoo)', request.po_number || '—'],
  ]
  if (request.remarks) details.push(['Remarks', request.remarks])
  if (request.reviewed_by) details.push(['Reviewed By', nameMap[String(request.reviewed_by).toLowerCase()] || request.reviewed_by])
  if (request.utr_number) details.push(['UTR Number', request.utr_number])
  if (request.paid_by) details.push(['Paid By', nameMap[String(request.paid_by).toLowerCase()] || request.paid_by])

  async function handleSaveDecision() {
    setSavingDecision(true)
    setMsg(null)
    try {
      const payload = await saveDecision(request.id, { status, remarks }, currentUser?.email)
      setMsg({ text: '✅ Decision saved!', tone: 'success' })
      onSaved(request.id, payload)
      setTimeout(onClose, 1200)
    } catch (e) {
      setMsg({ text: '❌ ' + e.message, tone: 'error' })
    } finally {
      setSavingDecision(false)
    }
  }

  async function handleMarkPaid() {
    setSavingPay(true)
    setMsg({ text: proofFile ? '⏳ Uploading payment proof…' : '⏳ Saving…', tone: 'info' })
    try {
      const payload = await markPaid(request.id, { utr, proofFile }, currentUser?.email)
      setMsg({ text: '💳 Marked as PAID!', tone: 'success' })
      onSaved(request.id, payload)
      setTimeout(onClose, 1200)
    } catch (e) {
      setMsg({ text: '❌ ' + e.message, tone: 'error' })
    } finally {
      setSavingPay(false)
    }
  }

  const MSG_CLASS = { success: 'bg-primary-tint text-primary', error: 'bg-danger-tint text-danger', info: 'bg-[#a855f7]/15 text-[#a855f7]' }

  return (
    <OverlayShell open={!!request} onClose={onClose} maxWidth="max-w-lg">
      <div className="text-[10.5px] font-bold text-[#f0a500] uppercase tracking-wide mb-1">Purchase Request</div>
      <div className="text-[16px] font-bold text-text">{request.vendor_name || '—'}</div>
      <div className="text-[12.5px] text-text-muted mt-0.5 mb-4">{request.product_name || '—'}</div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12.5px] mb-4">
        {details.map(([l, v]) => (
          <div key={l}>
            <div className="text-[10.5px] text-text-muted">{l}</div>
            <div className="font-semibold text-text">{v}</div>
          </div>
        ))}
        <div>
          <div className="text-[10.5px] text-text-muted">Status</div>
          <VendorStatusBadge status={request.status} />
        </div>
        <div>
          <div className="text-[10.5px] text-text-muted">Payment</div>
          <VendorPayBadge status={request.payment_status} />
        </div>
      </div>

      <div className="mb-4">
        <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-text-muted mb-2">📎 Attachments</div>
        <div className="flex gap-2.5 flex-wrap">
          {request.invoice_link ? (
            <a href={request.invoice_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-tint border border-primary/25 text-primary text-[12px] font-bold">
              📄 View Invoice / Quotation →
            </a>
          ) : (
            <span className="text-[12px] text-text-muted px-3 py-1.5 bg-surface-2 border border-border rounded-lg">📄 No invoice attached</span>
          )}
          {request.payment_attachment ? (
            <a href={request.payment_attachment} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#a855f7]/15 border border-[#a855f7]/30 text-[#a855f7] text-[12px] font-bold">
              💳 View Payment Proof →
            </a>
          ) : (
            <span className="text-[12px] text-text-muted px-3 py-1.5 bg-surface-2 border border-border rounded-lg">💳 No payment proof yet</span>
          )}
        </div>
      </div>

      {canReview && (
        <div className="mb-4 rounded-lg border border-border bg-surface-2 p-3.5">
          <div className="text-[11.5px] font-bold text-text mb-2.5">📝 Approval Decision</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[11px] text-text-muted mb-1">Status *</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface text-text text-[12.5px] outline-none">
                <option value="On Hold">🔒 On Hold</option>
                <option value="Approved">✅ Approved</option>
                <option value="Declined">❌ Declined</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-text-muted mb-1">Remarks</label>
              <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional notes" className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface text-text text-[12.5px] outline-none" />
            </div>
          </div>
          <button type="button" onClick={handleSaveDecision} disabled={savingDecision} className="px-4 py-2 rounded-lg bg-[#f0a500] text-black text-[12.5px] font-bold disabled:opacity-60">
            💾 Save Decision
          </button>
        </div>
      )}

      {showAccountsSection && (
        <div className="mb-4 rounded-lg border border-border bg-surface-2 p-3.5">
          <div className="text-[11.5px] font-bold text-text mb-2.5">💳 Payment Details</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[11px] text-text-muted mb-1">UTR Number</label>
              <input type="text" value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="UTR / Transaction ref" className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface text-text text-[12.5px] outline-none" />
            </div>
            <div>
              <label className="block text-[11px] text-text-muted mb-1">Payment Proof</label>
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#a855f7]/30 bg-[#a855f7]/10 text-[#a855f7] text-[12px] font-bold cursor-pointer">
                💳 Upload Proof
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setProofFile(e.target.files?.[0] || null)} className="hidden" />
              </label>
              <span className="text-[11px] text-text-muted ml-2">{proofFile ? proofFile.name : 'No file chosen'}</span>
            </div>
          </div>
          <button type="button" onClick={handleMarkPaid} disabled={savingPay} className="px-4 py-2 rounded-lg bg-[#a855f7] text-white text-[12.5px] font-bold disabled:opacity-60">
            💳 Mark as Paid
          </button>
        </div>
      )}

      {msg && <div className={`px-3.5 py-2.5 rounded-lg text-[12.5px] font-semibold text-center ${MSG_CLASS[msg.tone]}`}>{msg.text}</div>}
    </OverlayShell>
  )
}
