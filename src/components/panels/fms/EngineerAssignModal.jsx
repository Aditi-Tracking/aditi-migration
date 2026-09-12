import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { useAuth } from '../../../context/AuthContext'
import { fetchEngineers, nonCertQuantity, productNames, submitEngineerAssign } from '../../../lib/fms'

// Ported from old-portal/js/fms.js's fmsOpenEngineerOverlay/fmsEngAutoCalc/
// fmsSubmitEngineerAssign (Step 4 — reached only via the config path;
// direct-to-engineer skips this overlay entirely, see SupportAssignModal).
export default function EngineerAssignModal({ open, order, empMap, products, onClose, onSaved }) {
  const { currentUser } = useAuth()
  const [engineers, setEngineers] = useState([])
  const [engineerEmail, setEngineerEmail] = useState('')
  const [installed, setInstalled] = useState(0)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const total = order ? nonCertQuantity(order) : 0

  useEffect(() => {
    if (!open || !order) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the form whenever the overlay opens for a (possibly different) order
    setEngineerEmail('')
    setInstalled(0)
    setNotes('')
    setError('')
    fetchEngineers(empMap).then(setEngineers)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- empMap is stable for the life of the panel
  }, [open, order])

  if (!order) return null

  function handleInstalledChange(value) {
    let v = parseInt(value) || 0
    if (v > total) v = total
    if (v < 0) v = 0
    setInstalled(v)
  }
  const pending = total - installed

  async function handleSubmit() {
    if (!engineerEmail) {
      setError('❌ Select an engineer')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const isCompleted = await submitEngineerAssign({ order, engineerEmail, installed, notes: notes.trim(), myEmail: currentUser?.email || '' })
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
      <div className="text-[15px] font-semibold text-text mb-3">👷 Assign Engineer</div>
      <div className="rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 mb-3.5 text-[12.5px] text-text leading-relaxed">
        <div>
          <strong>SO:</strong> {order.so_number} &nbsp;|&nbsp; <strong>Client:</strong> {order.client_name || '—'}
        </div>
        <div>
          <strong>Products:</strong> {productNames(order.product_ids, order.product_items, products)}
        </div>
        <div>
          Total Qty: <strong className="text-primary">{total}</strong>
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Assign Engineer *</label>
        <select value={engineerEmail} onChange={(e) => setEngineerEmail(e.target.value)} className={inputClass}>
          <option value="">Select engineer...</option>
          {engineers.map((e) => (
            <option key={e.email} value={e.email}>
              {e.name}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-3">
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">
          Devices Installed <span className="font-normal">(max: {total})</span>
        </label>
        <input type="number" min="0" value={installed} onChange={(e) => handleInstalledChange(e.target.value)} className={inputClass} />
      </div>
      <div className="mb-3">
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">
          Devices Pending <span className="text-primary font-normal">(auto calculated)</span>
        </label>
        <input type="number" value={pending} readOnly className={`${inputClass} opacity-70 cursor-not-allowed`} />
      </div>
      <div className="mb-3.5">
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Installation Notes</label>
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
          {submitting ? '⏳ Assigning...' : '✅ Assign & Update'}
        </button>
        <button type="button" onClick={onClose} className="px-4 rounded-lg border border-border text-text-muted text-[13px]">
          Cancel
        </button>
      </div>
    </OverlayShell>
  )
}
