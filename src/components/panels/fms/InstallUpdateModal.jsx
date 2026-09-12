import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { useAuth } from '../../../context/AuthContext'
import { fetchLatestInstallation, nonCertQuantity, submitInstallUpdate } from '../../../lib/fms'

// Ported from old-portal/js/fms.js's fmsOpenInstallUpdate/fmsInstAutoCalc/
// fmsSubmitInstallUpdate. One fix vs. byte-for-byte production, confirmed:
// production prefills the installed-count input from the latest
// fms_installation row but hardcodes the progress bar to start at 0%
// regardless, only catching up once the input is first touched — here the
// bar is recomputed on open so it matches the prefilled value immediately.
export default function InstallUpdateModal({ open, order, onClose, onSaved }) {
  const { currentUser } = useAuth()
  const [installed, setInstalled] = useState(0)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const total = order ? nonCertQuantity(order) : 0

  useEffect(() => {
    if (!open || !order) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the form whenever the overlay opens for a (possibly different) order
    setNotes('')
    setError('')
    setInstalled(0)
    fetchLatestInstallation(order.id).then((inst) => {
      if (inst) setInstalled(inst.devices_installed || 0)
    })
  }, [open, order])

  if (!order) return null

  function handleInstalledChange(value) {
    let v = parseInt(value) || 0
    if (v > total) v = total
    if (v < 0) v = 0
    setInstalled(v)
  }
  const pending = total - installed
  const pct = total > 0 ? Math.round((installed / total) * 100) : 0
  const barColor = pct === 100 ? 'bg-primary' : pct > 50 ? 'bg-[#06b6d4]' : 'bg-[#fb923c]'
  const willComplete = installed > 0 && installed >= total

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      const isCompleted = await submitInstallUpdate({ order, installed, notes: notes.trim(), myEmail: currentUser?.email || '' })
      onSaved?.(isCompleted)
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
      <div className="text-[15px] font-semibold text-text mb-3">🔩 Update Installation</div>
      <div className="rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 mb-3.5 text-[12.5px] text-text leading-relaxed">
        <div>
          <strong>SO:</strong> {order.so_number} &nbsp;|&nbsp; <strong>Client:</strong> {order.client_name || '—'}
        </div>
        <div>
          Total Qty Required: <strong className="text-[#06b6d4]">{total}</strong>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-[11.5px] text-text-muted mb-1">
          <span>Installation Progress</span>
          <span>
            {installed} / {total}
          </span>
        </div>
        <div className="h-2 rounded-full bg-surface-2 border border-border overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">
          Devices Installed <span className="font-normal">(max: {total})</span>
        </label>
        <input type="number" min="0" value={installed} onChange={(e) => handleInstalledChange(e.target.value)} className={inputClass} />
      </div>
      <div className="mb-3">
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">
          Devices Pending <span className="text-[#06b6d4] font-normal">(auto calculated)</span>
        </label>
        <input type="number" value={pending} readOnly className={`${inputClass} opacity-70 cursor-not-allowed`} />
      </div>
      <div className="mb-3.5">
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Notes</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Update remarks..." className={inputClass} />
      </div>

      {willComplete && (
        <div className="rounded-lg border border-primary/30 bg-primary-tint text-primary text-[12.5px] px-3.5 py-2.5 mb-3">
          🎉 All devices installed — this order will be marked <strong>Completed</strong>!
        </div>
      )}

      {error && <div className="text-[12.5px] text-danger mb-2.5">{error}</div>}

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex-1 bg-primary text-white rounded-lg py-2.5 text-[13px] font-bold disabled:opacity-60"
        >
          {submitting ? '⏳ Updating...' : '💾 Update Installation'}
        </button>
        <button type="button" onClick={onClose} className="px-4 rounded-lg border border-border text-text-muted text-[13px]">
          Cancel
        </button>
      </div>
    </OverlayShell>
  )
}
