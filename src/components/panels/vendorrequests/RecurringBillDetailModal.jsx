import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { canEditRecurringBills, canPayRecurringBills, canReviewRecurringBills, markPaid, ordinal, saveBill, saveDecision, submittedThisCycle } from '../../../lib/recurringBills'
import { LOCATIONS, lookupEmpId } from '../../../lib/vendorRequests'
import { VendorPayBadge, VendorStatusBadge } from './VendorBadges'

// Ported from old-portal/js/vendor.js's openRecurringDetail/rpSaveBill/rpSaveDecision/
// rpDoMarkPaid. One shared modal for view/edit/approve/pay, same pattern as Vendor Requests'
// review modal. Unlike that modal, the Accounts section here has no UTR/proof-upload fields at
// all — just a single "Mark as Paid" button, matching production's rpdAcctSection exactly.
export default function RecurringBillDetailModal({ bill, currentUser, permissions, onClose, onSaved }) {
  const canEdit = canEditRecurringBills(currentUser, permissions)
  const canReview = canReviewRecurringBills(currentUser, permissions)
  const canPay = canPayRecurringBills(currentUser, permissions)

  const [product, setProduct] = useState('')
  const [location, setLocation] = useState('')
  const [amount, setAmount] = useState('')
  const [invoiceFile, setInvoiceFile] = useState(null)
  const [status, setStatus] = useState('On Hold')
  const [savingBill, setSavingBill] = useState(false)
  const [savingDecision, setSavingDecision] = useState(false)
  const [savingPay, setSavingPay] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!bill) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the modal's local state whenever the open bill changes, not a render loop
    setProduct(bill.product_name || '')
    setLocation(bill.location || '')
    setAmount(bill.amount != null ? String(bill.amount) : '')
    setInvoiceFile(null)
    setStatus(bill.status || 'On Hold')
    setError('')
    setMsg(null)
  }, [bill])

  if (!bill) return null

  const submitted = submittedThisCycle(bill)
  const showAccountsSection = submitted && canPay && bill.status === 'Approved' && bill.payment_status !== 'Paid'

  async function handleSaveBill() {
    const trimmedProduct = product.trim()
    if (!trimmedProduct) {
      setError('⚠️ Product / Service is required.')
      return
    }
    if (!location) {
      setError('⚠️ Please select a location.')
      return
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError('⚠️ Please enter a valid amount.')
      return
    }
    setSavingBill(true)
    setError('')
    try {
      const empId = await lookupEmpId(currentUser?.email)
      const { row, isNewCycle } = await saveBill(bill, { product: trimmedProduct, location, amount, invoiceFile }, empId)
      onSaved(row, isNewCycle)
      onClose()
    } catch (e) {
      setError('❌ ' + e.message)
    } finally {
      setSavingBill(false)
    }
  }

  async function handleSaveDecision() {
    setSavingDecision(true)
    setMsg(null)
    try {
      const empId = await lookupEmpId(currentUser?.email)
      const payload = await saveDecision(bill.id, status, empId)
      onSaved({ ...bill, ...payload }, false)
      setMsg({ text: '✅ Decision saved!', tone: 'success' })
      setTimeout(onClose, 1000)
    } catch (e) {
      setMsg({ text: '❌ ' + e.message, tone: 'error' })
    } finally {
      setSavingDecision(false)
    }
  }

  async function handleMarkPaid() {
    setSavingPay(true)
    setMsg(null)
    try {
      const empId = await lookupEmpId(currentUser?.email)
      const payload = await markPaid(bill.id, empId)
      onSaved({ ...bill, ...payload }, false)
      setMsg({ text: '💳 Marked as PAID!', tone: 'success' })
      setTimeout(onClose, 1000)
    } catch (e) {
      setMsg({ text: '❌ ' + e.message, tone: 'error' })
    } finally {
      setSavingPay(false)
    }
  }

  const MSG_CLASS = { success: 'bg-primary-tint text-primary', error: 'bg-danger-tint text-danger' }

  return (
    <OverlayShell open={!!bill} onClose={onClose} maxWidth="max-w-md">
      <div className="text-[10.5px] font-bold text-primary uppercase tracking-wide mb-1">Recurring Bill</div>
      <div className="text-[15px] font-bold text-text">{bill.vendor_name || '—'}</div>
      <div className="text-[12px] text-text-muted mt-0.5 mb-3">
        Due on the <strong className="text-text">{bill.due_date != null ? ordinal(bill.due_date) : '—'}</strong> of every month
      </div>

      <div className="flex gap-2 flex-wrap mb-4">
        {submitted ? (
          <>
            <VendorStatusBadge status={bill.status} />
            <VendorPayBadge status={bill.payment_status} />
            {bill.submitted_at && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-surface-2 text-text-muted border border-border">
                📅 Submitted {new Date(bill.submitted_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </span>
            )}
          </>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-surface-2 text-text-muted border border-border">Not submitted this month</span>
        )}
      </div>

      {canEdit && (
        <div className="mb-4 rounded-lg border border-border bg-surface-2 p-3.5">
          <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-text-muted mb-2.5">📝 This Month's Bill</div>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-[11px] text-text-muted mb-1">Product / Service *</label>
              <input type="text" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="e.g. Electricity bill" className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface text-text text-[12.5px] outline-none" />
            </div>
            <div>
              <label className="block text-[11px] text-text-muted mb-1">Location *</label>
              <select value={location} onChange={(e) => setLocation(e.target.value)} className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface text-text text-[12.5px] outline-none">
                <option value="">— Select Location —</option>
                {LOCATIONS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-text-muted mb-1">Amount (₹) *</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount" className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface text-text text-[12.5px] outline-none" />
            </div>
            <div>
              <label className="block text-[11px] text-text-muted mb-1">
                Bill / Invoice Copy <span className="font-normal">(optional)</span>
              </label>
              <div className="flex items-center gap-2.5 flex-wrap">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary/30 bg-primary-tint text-primary text-[12px] font-bold cursor-pointer">
                  📤 Upload
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)} className="hidden" />
                </label>
                <span className="text-[11.5px] text-text-muted">{invoiceFile ? invoiceFile.name : 'No file chosen'}</span>
                {bill.invoice_link && (
                  <a href={bill.invoice_link} target="_blank" rel="noopener noreferrer" className="text-[11.5px] text-primary font-bold">
                    📎 View current attachment
                  </a>
                )}
              </div>
            </div>
          </div>
          {error && <div className="text-danger text-[11.5px] mt-2.5">{error}</div>}
          <button type="button" onClick={handleSaveBill} disabled={savingBill} className="w-full mt-3 px-4 py-2.5 rounded-lg bg-primary text-white text-[12.5px] font-bold disabled:opacity-60">
            {savingBill ? 'Saving…' : '💾 Save & Submit This Month'}
          </button>
        </div>
      )}

      {submitted && canReview && (
        <div className="mb-4 rounded-lg border border-border bg-surface-2 p-3.5">
          <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-text-muted mb-2.5">✅ Approval Decision</div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface text-text text-[12.5px] outline-none mb-3">
            <option value="On Hold">🔒 On Hold</option>
            <option value="Approved">✅ Approved</option>
            <option value="Declined">❌ Declined</option>
          </select>
          <button type="button" onClick={handleSaveDecision} disabled={savingDecision} className="w-full px-4 py-2.5 rounded-lg bg-[#f0a500] text-black text-[12.5px] font-bold disabled:opacity-60">
            💾 Save Decision
          </button>
        </div>
      )}

      {showAccountsSection && (
        <div className="mb-4 rounded-lg border border-border bg-surface-2 p-3.5">
          <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-text-muted mb-2.5">💳 Payment</div>
          <button type="button" onClick={handleMarkPaid} disabled={savingPay} className="w-full px-4 py-2.5 rounded-lg bg-[#a855f7] text-white text-[12.5px] font-bold disabled:opacity-60">
            💳 Mark as Paid
          </button>
        </div>
      )}

      {msg && <div className={`px-3.5 py-2.5 rounded-lg text-[12.5px] font-semibold text-center ${MSG_CLASS[msg.tone]}`}>{msg.text}</div>}
    </OverlayShell>
  )
}
