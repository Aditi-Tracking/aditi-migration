import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { calcPendingAmount, updatePayment, uploadAllFmsProofs } from '../../../lib/fms'
import FMSProofUpload from './FMSProofUpload'

// Ported from old-portal/js/fms.js's fmsOpenUpdatePayment/fmsSubmitUpdatePayment.
// New proof files, if any, REPLACE the existing proof set entirely (not
// appended) — matches production exactly.
export default function UpdatePaymentModal({ open, order, onClose, onSaved }) {
  const [amountReceived, setAmountReceived] = useState('')
  const [tdsAmount, setTdsAmount] = useState('')
  const [tentativeDate, setTentativeDate] = useState('')
  const [proofFiles, setProofFiles] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !order) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the form to this order's current values whenever the overlay opens
    setAmountReceived(order.amount_received ?? '')
    setTdsAmount(order.tds_amount ?? '')
    setTentativeDate(order.tentative_date || '')
    setProofFiles([])
    setError('')
  }, [open, order])

  if (!order) return null

  const pendingAfter = calcPendingAmount({
    order_amount: order.order_amount,
    amount_received: parseFloat(amountReceived) || 0,
    tds_amount: parseFloat(tdsAmount) || 0,
  })

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      let proofUrl = order.payment_proof_url || null
      if (proofFiles.length) {
        const urls = await uploadAllFmsProofs(proofFiles)
        if (urls.length) proofUrl = JSON.stringify(urls)
      }
      await updatePayment(order.id, {
        amountReceived: parseFloat(amountReceived) || 0,
        tdsAmount: parseFloat(tdsAmount) || 0,
        tentativeDate: tentativeDate || null,
        paymentProofUrl: proofUrl,
      })
      onSaved?.()
      onClose()
    } catch (e) {
      setError('❌ Error: ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = 'w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none'

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-md">
      <div className="text-[15px] font-semibold text-text mb-3">💰 Update Payment</div>
      <div className="rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 mb-3.5 text-[12.5px] text-text leading-relaxed">
        <div>
          <strong>SO:</strong> {order.so_number} &nbsp;|&nbsp; <strong>Client:</strong> {order.client_name || '—'}
        </div>
        <div>
          <strong>Order Amt:</strong> ₹{(order.order_amount || 0).toLocaleString('en-IN')} &nbsp;|&nbsp; <strong>Received:</strong> ₹
          {(order.amount_received || 0).toLocaleString('en-IN')}
          {parseFloat(order.tds_amount) > 0 && (
            <>
              {' '}
              &nbsp;|&nbsp; <strong>TDS:</strong> ₹{order.tds_amount.toLocaleString('en-IN')}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Amount Received (₹) *</label>
          <input type="number" min="0" value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">TDS Deducted (₹) (if any)</label>
          <input type="number" min="0" value={tdsAmount} onChange={(e) => setTdsAmount(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Tentative Date (if still pending)</label>
          <input type="date" value={tentativeDate} onChange={(e) => setTentativeDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Payment Proof</label>
          <FMSProofUpload files={proofFiles} onFilesChange={setProofFiles} />
        </div>

        <div className="rounded-lg border border-primary/20 bg-primary-tint px-3.5 py-2 text-[12.5px]">
          Pending after update:{' '}
          <strong className={pendingAfter > 0 ? 'text-danger' : 'text-primary'}>₹{pendingAfter.toLocaleString('en-IN')}</strong>
        </div>
      </div>

      {error && <div className="text-[12.5px] text-danger mt-3">{error}</div>}

      <div className="flex gap-2.5 mt-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex-1 bg-primary text-white rounded-lg py-2.5 text-[13.5px] font-bold disabled:opacity-60"
        >
          {submitting ? '⏳ Saving...' : '💾 Update Payment'}
        </button>
        <button type="button" onClick={onClose} className="px-4 rounded-lg border border-border text-text-muted text-[13px]">
          Cancel
        </button>
      </div>
    </OverlayShell>
  )
}
