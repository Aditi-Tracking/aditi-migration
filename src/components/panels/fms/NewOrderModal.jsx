import { useEffect, useRef, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { useAuth } from '../../../context/AuthContext'
import {
  FMS_CERT_ELIGIBLE_EMAILS,
  FMS_CERT_PRODUCT_NAMES,
  createOrder,
  empName,
  updateOrder,
  uploadAllFmsProofs,
} from '../../../lib/fms'
import FMSProofUpload from './FMSProofUpload'

const DRAFT_KEY = 'fmsNewOrderDraft_v1'
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000
// Auto-defaults to NBD for users who only handle New Business.
const NBD_DEFAULT_USERS = ['salesmumbai@adititracking.com']

function blankRow(id) {
  return { id, productId: '', quantity: 1 }
}

function blankForm() {
  return {
    clientType: 'existing',
    clientName: '',
    soNumber: '',
    ticketNo: '',
    orderAmount: '',
    amountReceived: '',
    tentativeDate: '',
    locationId: '',
    locationManual: '',
    assignSupport: '',
  }
}

// Ported from old-portal/js/fms.js's fmsOpenNewOrder/fmsSubmitNewOrder
// (create) and fmsEditOrder/fmsUpdateOrder (edit — reuses this same form,
// pre-filled). Dead code NOT ported: the client-search/select-existing-
// client dropdown (fmsSearchClient/fmsSelectClient/customer_odoo_aliases) —
// #fmsClientDropdown never existed in index.html, so client name has always
// just been a free-text field; client_id/is_new_client are always sent as
// null/false, matching production's actual (not the vestigial UI's implied)
// behavior. One faithfully-preserved quirk: in edit mode the proof-upload
// field is shown (same shared form) but is functionally inert — production's
// fmsUpdateOrder() never uploads or persists proof files, only Update
// Payment does that. Not "fixing" that here.
export default function NewOrderModal({ open, onClose, editOrder, products, locations, supportPersons, empMap, onSaved }) {
  const { currentUser } = useAuth()
  const isEdit = !!editOrder

  const [form, setForm] = useState(blankForm())
  const rowIdSeq = useRef(1)
  const [productRows, setProductRows] = useState([blankRow(1)])
  const [proofFiles, setProofFiles] = useState([])
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const draftTimerRef = useRef(null)

  function set(field) {
    return (value) => setForm((f) => ({ ...f, [field]: value }))
  }

  // ── Draft autosave — new orders only, not while editing ──
  function restoreDraftIfAny() {
    let draft = null
    try {
      draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    } catch {
      /* corrupt draft — ignore */
    }
    if (!draft || !draft.savedAt || Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) return
    if (!draft.form?.clientName && !draft.form?.soNumber && !(draft.products || []).length) return
    setForm((f) => ({ ...f, ...draft.form }))
    if (draft.products?.length) {
      rowIdSeq.current = draft.products.length
      setProductRows(draft.products.map((p, idx) => ({ id: idx + 1, productId: p.productId, quantity: p.quantity })))
    }
  }

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets/pre-fills the form when the overlay opens or its edit target changes, not a synchronous re-derivation of render state
    setFormError('')
    setProofFiles([])

    if (editOrder) {
      let items = []
      try {
        items = JSON.parse(editOrder.product_items || '[]')
      } catch {
        /* fall back to empty row below */
      }
      rowIdSeq.current = items.length || 1
      setProductRows(
        items.length
          ? items.map((it, idx) => ({ id: idx + 1, productId: it.product_id != null ? String(it.product_id) : '', quantity: it.quantity || 1 }))
          : [blankRow(1)]
      )
      setForm({
        clientType: editOrder.client_type || 'existing',
        clientName: editOrder.client_name || '',
        soNumber: editOrder.so_number || '',
        ticketNo: editOrder.ticket_no || '',
        orderAmount: editOrder.order_amount ?? '',
        amountReceived: editOrder.amount_received ?? '',
        tentativeDate: editOrder.tentative_date || '',
        locationId: editOrder.location_type === 'outside' ? 'other' : editOrder.location_id != null ? String(editOrder.location_id) : '',
        locationManual: editOrder.location_type === 'outside' ? editOrder.location_manual || '' : '',
        assignSupport: editOrder.assigned_to_support || '',
      })
    } else {
      rowIdSeq.current = 1
      setProductRows([blankRow(1)])
      const email = (currentUser?.email || '').toLowerCase().trim()
      setForm({ ...blankForm(), clientType: NBD_DEFAULT_USERS.includes(email) ? 'nbd' : 'existing' })
      restoreDraftIfAny()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on open/edit-target change
  }, [open, editOrder])

  function scheduleDraftSave(nextForm, nextRows) {
    if (isEdit) return
    clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ form: nextForm, products: nextRows, savedAt: Date.now() }))
      } catch {
        /* localStorage may be unavailable — ignore */
      }
    }, 600)
  }

  useEffect(() => {
    if (!open) return
    scheduleDraftSave(form, productRows)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires on any form/row change while open
  }, [open, form, productRows])

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* ignore */
    }
  }

  // ── Product rows + cert/regular exclusivity ──
  function productName(productId) {
    return products.find((p) => String(p.id) === String(productId))?.product_name || ''
  }
  function isCertProductId(productId) {
    return FMS_CERT_PRODUCT_NAMES.includes(productName(productId))
  }

  function addProductRow() {
    rowIdSeq.current += 1
    setProductRows((rows) => [...rows, blankRow(rowIdSeq.current)])
  }
  function removeProductRow(id) {
    setProductRows((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.id !== id)))
  }
  function updateProductRow(id, patch) {
    setProductRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function isOptionDisabled(rowId, product) {
    const isCertOpt = FMS_CERT_PRODUCT_NAMES.includes(product.product_name)
    const others = productRows.filter((r) => r.id !== rowId)
    const hasCertElsewhere = others.some((r) => r.productId && isCertProductId(r.productId))
    const hasRegularElsewhere = others.some((r) => r.productId && !isCertProductId(r.productId))
    return isCertOpt ? hasRegularElsewhere : hasCertElsewhere
  }

  const productItems = productRows
    .filter((r) => r.productId)
    .map((r) => ({ product_id: parseInt(r.productId), product_name: productName(r.productId), quantity: parseInt(r.quantity) || 1 }))
  const isFormCertOnly = productItems.length > 0 && productItems.every((i) => FMS_CERT_PRODUCT_NAMES.includes(i.product_name))
  const assignOptions = isFormCertOnly ? FMS_CERT_ELIGIBLE_EMAILS.map((email) => ({ email, name: empName(empMap, email) })) : supportPersons

  async function handleSubmit() {
    if (submitting) return
    setFormError('')

    const quantity = productItems.reduce((s, i) => s + (i.quantity || 0), 0)
    const hasCertItem = productItems.some((i) => FMS_CERT_PRODUCT_NAMES.includes(i.product_name))
    const hasRegularItem = productItems.some((i) => !FMS_CERT_PRODUCT_NAMES.includes(i.product_name))

    if (!form.clientName.trim()) return setFormError('❌ Client name required')
    if (!form.soNumber.trim()) return setFormError('❌ SO Number required')
    if (!quantity || quantity < 1 || !productItems.length) return setFormError('❌ Add at least one product with quantity')
    if (hasCertItem && hasRegularItem) return setFormError('❌ Certificate and other products cannot be in the same order')
    if (!form.locationId) return setFormError('❌ Select a location')
    if (form.locationId === 'other' && !form.locationManual.trim()) return setFormError('❌ Enter location name')
    if (!form.assignSupport) return setFormError('❌ Assign to support person')

    setSubmitting(true)
    try {
      if (isEdit) {
        await updateOrder(editOrder.id, {
          client_id: null,
          client_name: form.clientName.trim(),
          so_number: form.soNumber.trim(),
          ticket_no: form.ticketNo.trim() || null,
          product_ids: productItems.map((i) => i.product_id),
          product_items: JSON.stringify(productItems),
          quantity,
          order_amount: parseFloat(form.orderAmount) || null,
          amount_received: parseFloat(form.amountReceived) || null,
          tentative_date: form.tentativeDate || null,
          location_type: form.locationId === 'other' ? 'outside' : 'local',
          location_id: form.locationId === 'other' ? null : parseInt(form.locationId),
          location_manual: form.locationId === 'other' ? form.locationManual.trim() : null,
          assigned_to_support: form.assignSupport,
        })
      } else {
        const proofUrls = await uploadAllFmsProofs(proofFiles)
        const now = new Date().toISOString()
        await createOrder({
          client_id: null,
          client_name: form.clientName.trim(),
          is_new_client: false,
          client_type: form.clientType,
          so_number: form.soNumber.trim(),
          ticket_no: form.ticketNo.trim() || null,
          product_ids: productItems.map((i) => i.product_id),
          product_items: JSON.stringify(productItems),
          quantity,
          order_amount: parseFloat(form.orderAmount) || null,
          amount_received: parseFloat(form.amountReceived) || null,
          payment_proof_url: proofUrls.length ? JSON.stringify(proofUrls) : null,
          tentative_date: form.tentativeDate || null,
          location_type: form.locationId === 'other' ? 'outside' : 'local',
          location_id: form.locationId === 'other' ? null : parseInt(form.locationId),
          location_manual: form.locationId === 'other' ? form.locationManual.trim() : null,
          status: 'pending_support',
          current_step: 1,
          created_by: currentUser?.email || '',
          assigned_to_support: form.assignSupport,
          step1_completed_at: now,
          step2_started_at: now,
        })
        clearDraft()
      }
      onSaved?.()
      onClose()
    } catch (e) {
      setFormError('❌ Error: ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = 'w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none'

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-2xl">
      <div className="text-[15px] font-semibold text-text mb-4">{isEdit ? `✏️ Edit Order — ${editOrder?.so_number || ''}` : '📋 New Installation Order'}</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div className="sm:col-span-2">
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Client Type *</label>
          <div className="flex gap-2.5 mb-2.5">
            {['nbd', 'existing'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set('clientType')(t)}
                className={`flex-1 rounded-lg border-2 px-4 py-2 text-[12.5px] font-semibold ${
                  form.clientType === t ? 'border-primary text-primary bg-primary-tint' : 'border-border text-text'
                }`}
              >
                {t === 'nbd' ? '🆕 NBD (New Business)' : '👤 Existing Client'}
              </button>
            ))}
          </div>
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Client Name *</label>
          <input type="text" value={form.clientName} onChange={(e) => set('clientName')(e.target.value)} placeholder="Enter client name..." className={inputClass} />
        </div>

        <div>
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">SO Number *</label>
          <input type="text" value={form.soNumber} onChange={(e) => set('soNumber')(e.target.value)} placeholder="SO-2026-001" className={inputClass} />
        </div>
        <div>
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Ticket No</label>
          <input type="text" value={form.ticketNo} onChange={(e) => set('ticketNo')(e.target.value)} placeholder="TKT-001" className={inputClass} />
        </div>
        <div>
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Order Amount (₹)</label>
          <input type="number" value={form.orderAmount} onChange={(e) => set('orderAmount')(e.target.value)} placeholder="50000" className={inputClass} />
        </div>
        <div>
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Amount Received (₹)</label>
          <input type="number" value={form.amountReceived} onChange={(e) => set('amountReceived')(e.target.value)} placeholder="25000" className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Tentative Date (Pending Amount)</label>
          <input type="date" value={form.tentativeDate} onChange={(e) => set('tentativeDate')(e.target.value)} className={inputClass} />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">
            Payment Proof <span className="font-normal text-text-muted">— upload, drag &amp; drop, or Ctrl+V to paste screenshot</span>
          </label>
          <FMSProofUpload files={proofFiles} onFilesChange={setProofFiles} />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1.5">Products * (Product + Quantity)</label>
          <div className="flex flex-col gap-2">
            {productRows.map((row) => (
              <div key={row.id} className="flex gap-2 items-center">
                <select
                  value={row.productId}
                  onChange={(e) => updateProductRow(row.id, { productId: e.target.value })}
                  className={`${inputClass} flex-[2]`}
                >
                  <option value="">Select product...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id} disabled={isOptionDisabled(row.id, p)}>
                      {p.product_name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  value={row.quantity}
                  onChange={(e) => updateProductRow(row.id, { quantity: e.target.value })}
                  className={`${inputClass} max-w-[90px]`}
                />
                {productRows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeProductRow(row.id)}
                    className="w-9 h-9 shrink-0 rounded-lg border border-danger/30 bg-danger-tint text-danger"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addProductRow}
            className="mt-2 w-full text-[12px] font-semibold text-primary border border-dashed border-primary/40 rounded-lg px-3.5 py-1.5"
          >
            + Add Another Product
          </button>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Location *</label>
          <select value={form.locationId} onChange={(e) => set('locationId')(e.target.value)} className={inputClass}>
            <option value="">Select location...</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.location_name}
              </option>
            ))}
            <option value="other">Other</option>
          </select>
          {form.locationId === 'other' && (
            <input
              type="text"
              value={form.locationManual}
              onChange={(e) => set('locationManual')(e.target.value)}
              placeholder="Enter location name..."
              className={`${inputClass} mt-1.5`}
            />
          )}
        </div>

        <div className="sm:col-span-2">
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Assign To Support Person *</label>
          <select value={form.assignSupport} onChange={(e) => set('assignSupport')(e.target.value)} className={inputClass}>
            <option value="">Select support person...</option>
            {assignOptions.map((p) => (
              <option key={p.email} value={p.email}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {formError && <div className="text-[12.5px] text-danger mt-3">{formError}</div>}

      <div className="flex gap-2.5 mt-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex-1 bg-primary text-white rounded-lg py-2.5 text-[13.5px] font-bold disabled:opacity-60"
        >
          {submitting ? '⏳ Submitting...' : isEdit ? '💾 Update Order' : '📤 Submit Order'}
        </button>
        <button type="button" onClick={onClose} className="px-4 rounded-lg border border-border text-text-muted text-[13px]">
          Cancel
        </button>
      </div>
    </OverlayShell>
  )
}
