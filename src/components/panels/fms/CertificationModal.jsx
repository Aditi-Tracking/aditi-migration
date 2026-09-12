import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { useAuth } from '../../../context/AuthContext'
import { certQuantity, fetchCertifiedSoFar, submitCertification } from '../../../lib/fms'

// Ported from old-portal/js/fms.js's fmsOpenCertificationOverlay/
// fmsSubmitCertification. Additive/audit-trail — a partial submission
// re-primes this SAME overlay for the next batch (matches production's
// fmsOpenCertificationOverlay(order.id) re-call) rather than closing; only
// the submission that reaches the target closes it and completes the order.
export default function CertificationModal({ open, order, onClose, onSaved }) {
  const { currentUser } = useAuth()
  const [target, setTarget] = useState(0)
  const [certifiedSoFar, setCertifiedSoFar] = useState(0)
  const [qty, setQty] = useState(0)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [progressMsg, setProgressMsg] = useState('')

  async function loadProgress() {
    const t = certQuantity(order)
    const soFar = await fetchCertifiedSoFar(order.id)
    const remaining = Math.max(t - soFar, 0)
    setTarget(t)
    setCertifiedSoFar(soFar)
    setQty(remaining)
  }

  useEffect(() => {
    if (!open || !order) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the form whenever the overlay opens for a (possibly different) order
    setNotes('')
    setError('')
    setProgressMsg('')
    loadProgress()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadProgress closes over `order`, re-run only when open/order change
  }, [open, order])

  if (!order) return null

  const remaining = Math.max(target - certifiedSoFar, 0)

  function handleQtyChange(value) {
    let v = parseInt(value) || 0
    if (v > remaining) v = remaining
    if (v < 0) v = 0
    setQty(v)
  }

  async function handleSubmit() {
    if (!qty || qty < 1) {
      setError('❌ Enter certified quantity')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const result = await submitCertification({ order, certifiedQty: qty, notes: notes.trim(), myEmail: currentUser?.email || '' })
      if (result.isComplete) {
        onSaved?.(true)
        onClose()
      } else {
        setProgressMsg(`✅ ${result.certifiedSoFar}/${result.target} certified so far — keep going`)
        setNotes('')
        await loadProgress()
      }
    } catch (e) {
      setError('❌ Error: ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = 'w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none'

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-sm">
      <div className="text-[15px] font-semibold text-text mb-3">📶 Complete Certification</div>
      <div className="rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 mb-3.5 text-[12.5px] text-text leading-relaxed">
        <div>
          <strong>SO:</strong> {order.so_number} &nbsp;|&nbsp; <strong>Client:</strong> {order.client_name || '—'}
        </div>
        <div>
          Certified so far: <strong className="text-primary">{certifiedSoFar} / {target}</strong>
        </div>
      </div>

      {progressMsg && <div className="text-[12.5px] text-primary mb-3">{progressMsg}</div>}

      <div className="mb-3">
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">
          Certified Quantity * <span className="font-normal">(max {remaining})</span>
        </label>
        <input type="number" min="1" value={qty} onChange={(e) => handleQtyChange(e.target.value)} className={inputClass} />
      </div>
      <div className="mb-3.5">
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Notes (optional)</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any remarks..." className={inputClass} />
      </div>

      {error && <div className="text-[12.5px] text-danger mb-2.5">{error}</div>}

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex-1 bg-primary text-white rounded-lg py-2.5 text-[13px] font-bold disabled:opacity-60"
        >
          {submitting ? '⏳ Completing...' : '🎉 Complete Certification'}
        </button>
        <button type="button" onClick={onClose} className="px-4 rounded-lg border border-border text-text-muted text-[13px]">
          Cancel
        </button>
      </div>
    </OverlayShell>
  )
}
