import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { useAuth } from '../../../context/AuthContext'
import {
  FMS_ANISH_EMAIL,
  FMS_CONFIG_PERSON_OPTIONS,
  calcPendingAmount,
  empName,
  fetchEngineers,
  isCertOrder,
  nonCertQuantity,
  productNames,
  submitSupportDirectToEngineer,
  submitSupportToConfig,
} from '../../../lib/fms'

// Ported from old-portal/js/fms.js's fmsOpenSupportOverlay/fmsSupportToggleCfg/
// fmsSupportSubmit. Pure-cert orders can't take the direct-to-engineer path
// (radio disabled, matches production) — and if config-required routes
// specifically to Anish on a pure-cert order, this closes and hands off to
// Certification instead of writing anything itself (see onNeedsCertification).
export default function SupportAssignModal({ open, order, empMap, locations, products, onClose, onSaved, onNeedsCertification }) {
  const { currentUser } = useAuth()
  const [cfgRequired, setCfgRequired] = useState(true)
  const [configPerson, setConfigPerson] = useState(FMS_ANISH_EMAIL)
  const [notes, setNotes] = useState('')
  const [engineers, setEngineers] = useState([])
  const [engineerEmail, setEngineerEmail] = useState('')
  const [installQty, setInstallQty] = useState(0)
  const [pendingQty, setPendingQty] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const isPureCert = order ? isCertOrder(order) : false

  useEffect(() => {
    if (!open || !order) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the form whenever the overlay opens for a (possibly different) order
    setCfgRequired(true)
    setConfigPerson(FMS_ANISH_EMAIL)
    setNotes('')
    setEngineerEmail('')
    setInstallQty(0)
    setPendingQty(0)
    setError('')
  }, [open, order])

  async function handleToggleCfg(required) {
    setCfgRequired(required)
    if (!required) {
      const total = nonCertQuantity(order)
      setInstallQty(total)
      setPendingQty(0)
      if (!engineers.length) setEngineers(await fetchEngineers(empMap))
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      if (cfgRequired) {
        if (configPerson === FMS_ANISH_EMAIL && isCertOrder(order)) {
          onClose()
          onNeedsCertification(order.id)
          return
        }
        await submitSupportToConfig({ orderId: order.id, configPersonEmail: configPerson, notes, assignedFrom: currentUser?.email || '' })
      } else {
        if (!engineerEmail) {
          setError('❌ Select an engineer')
          setSubmitting(false)
          return
        }
        await submitSupportDirectToEngineer({
          order,
          engineerEmail,
          installed: parseInt(installQty) || 0,
          pending: parseInt(pendingQty) || 0,
          assignedFrom: currentUser?.email || '',
        })
      }
      onSaved?.()
      onClose()
    } catch (e) {
      setError('❌ Error: ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!order) return null

  const locName = order.location_type === 'outside' ? order.location_manual || 'Outside' : locations.find((l) => l.id === order.location_id)?.location_name || '—'
  const pendingAmt = calcPendingAmount(order)
  const inputClass = 'w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none'

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="text-[15px] font-semibold text-text mb-3">🔧 Assign Order</div>
      <div className="rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 mb-3.5 text-[12.5px] text-text leading-relaxed">
        <div>
          <strong>SO:</strong> {order.so_number} &nbsp;|&nbsp; <strong>Ticket:</strong> {order.ticket_no || '—'}
        </div>
        <div>
          <strong>Client:</strong> {order.client_name || '—'}
        </div>
        <div>
          <strong>Products:</strong> {productNames(order.product_ids, order.product_items, products)}
        </div>
        <div>
          <strong>Qty:</strong> {order.quantity} &nbsp;|&nbsp; <strong>Location:</strong> {locName}
        </div>
        <div>
          <strong>Order Amt:</strong> ₹{order.order_amount || 0} &nbsp;|&nbsp; <strong>Received:</strong> ₹{order.amount_received || 0}{' '}
          &nbsp;|&nbsp; <strong className={pendingAmt > 0 ? 'text-danger' : 'text-primary'}>Pending: ₹{pendingAmt}</strong>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface-2 p-3 mb-3.5">
        <div className="text-[12.5px] font-semibold text-text mb-2">Configuration Required?</div>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => handleToggleCfg(true)}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-[12.5px] ${cfgRequired ? 'border-primary bg-primary-tint text-primary' : 'border-border text-text'}`}
          >
            ⚙️ Yes — Send for Configuration
          </button>
          {!isPureCert && (
            <button
              type="button"
              onClick={() => handleToggleCfg(false)}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-[12.5px] ${!cfgRequired ? 'border-primary bg-primary-tint text-primary' : 'border-border text-text'}`}
            >
              👷 No — Direct to Engineer
            </button>
          )}
        </div>
      </div>

      {cfgRequired ? (
        <>
          <div className="mb-3">
            <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Send Configuration To *</label>
            <select value={configPerson} onChange={(e) => setConfigPerson(e.target.value)} className={inputClass}>
              {FMS_CONFIG_PERSON_OPTIONS.map((p) => (
                <option key={p.email} value={p.email}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-3.5">
            <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Notes for Configuration Team (Optional)</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special instructions..." className={inputClass} />
          </div>
        </>
      ) : (
        <>
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
          <div className="grid grid-cols-2 gap-3 mb-3.5">
            <div>
              <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Devices to Install</label>
              <input type="number" min="0" value={installQty} onChange={(e) => setInstallQty(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Devices Pending</label>
              <input type="number" min="0" value={pendingQty} onChange={(e) => setPendingQty(e.target.value)} className={inputClass} />
            </div>
          </div>
        </>
      )}

      {error && <div className="text-[12.5px] text-danger mb-2.5">{error}</div>}

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex-1 bg-primary text-white rounded-lg py-2.5 text-[13px] font-bold disabled:opacity-60"
        >
          {submitting ? '⏳ Assigning...' : cfgRequired ? `➡️ Send to ${empName(empMap, configPerson)} for Configuration` : '👷 Assign Directly to Engineer'}
        </button>
        <button type="button" onClick={onClose} className="px-4 rounded-lg border border-border text-text-muted text-[13px]">
          Cancel
        </button>
      </div>
    </OverlayShell>
  )
}
