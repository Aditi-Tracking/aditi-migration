import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { useAuth } from '../../../context/AuthContext'
import { fetchLatestConfig, nonCertQuantity, productNames, submitConfig } from '../../../lib/fms'

// Ported from old-portal/js/fms.js's fmsOpenConfigOverlay/fmsCfgAutoCalc/
// fmsSubmitConfig. Loads an existing fms_configuration row to prefill if
// one exists (defensive — in practice unreachable once status has moved
// past pending_config, since nothing reopens this overlay for an order
// that's no longer in that status, but harmless to keep).
export default function ConfigModal({ open, order, products, onClose, onSaved }) {
  const { currentUser } = useAuth()
  const [configuredQty, setConfiguredQty] = useState(0)
  const [notes, setNotes] = useState('')
  const [skipReason, setSkipReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const total = order ? nonCertQuantity(order) : 0

  useEffect(() => {
    if (!open || !order) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the form whenever the overlay opens for a (possibly different) order
    setError('')
    setNotes('')
    setSkipReason('')
    setConfiguredQty(0)
    fetchLatestConfig(order.id).then((existing) => {
      if (existing) {
        setConfiguredQty(existing.configured_qty || 0)
        setNotes(existing.config_notes || '')
        setSkipReason(existing.skip_reason || '')
      }
    })
  }, [open, order])

  if (!order) return null

  function handleQtyChange(value) {
    let v = parseInt(value) || 0
    if (v > total) v = total
    if (v < 0) v = 0
    setConfiguredQty(v)
  }

  const notConfiguredQty = total - configuredQty
  const pct = total > 0 ? Math.round((configuredQty / total) * 100) : 0
  const barColor = pct === 100 ? 'bg-primary' : pct > 50 ? 'bg-primary/70' : 'bg-[#fb923c]'

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      await submitConfig({
        order,
        configuredQty,
        notConfiguredQty,
        notes: notes.trim(),
        skipReason: skipReason.trim(),
        configuredBy: currentUser?.email || '',
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
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-sm">
      <div className="text-[15px] font-semibold text-text mb-3">⚙️ Device Configuration</div>
      <div className="rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 mb-3 text-[12.5px] text-text leading-relaxed">
        <div>
          <strong>SO:</strong> {order.so_number} &nbsp;|&nbsp; <strong>Client:</strong> {order.client_name || '—'}
        </div>
        <div>
          <strong>Products:</strong> {productNames(order.product_ids, order.product_items, products)}
        </div>
        <div>
          Total Devices to Configure: <strong className="text-[#f0a500]">{total}</strong>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-[11px] text-text-muted mb-1">
          <span>Configuration Progress</span>
          <span className="font-semibold">
            {configuredQty} / {total}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-2 border border-border overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">
            Configured <span className="font-normal">(max: {total})</span>
          </label>
          <input type="number" min="0" value={configuredQty} onChange={(e) => handleQtyChange(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">
            Not Configured <span className="text-primary font-normal">auto</span>
          </label>
          <input type="number" value={notConfiguredQty} readOnly className={`${inputClass} opacity-70 cursor-not-allowed`} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3.5">
        <div>
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Notes</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Remarks..." className={inputClass} />
        </div>
        <div>
          <label className="block text-[11.5px] font-semibold text-[#fb923c] mb-1">
            ⏭️ Skip Reason <span className="font-normal text-text-muted">(optional)</span>
          </label>
          <textarea rows={2} value={skipReason} onChange={(e) => setSkipReason(e.target.value)} placeholder="e.g. Faulty devices, Waiting for SIM..." className={inputClass} />
        </div>
      </div>

      {error && <div className="text-[12.5px] text-danger mb-2.5">{error}</div>}

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex-1 bg-primary text-white rounded-lg py-2.5 text-[13px] font-bold disabled:opacity-60"
        >
          {submitting ? '⏳ Saving...' : '✅ Submit & Send to Support'}
        </button>
        <button type="button" onClick={onClose} className="px-4 rounded-lg border border-border text-text-muted text-[13px]">
          Cancel
        </button>
      </div>
    </OverlayShell>
  )
}
