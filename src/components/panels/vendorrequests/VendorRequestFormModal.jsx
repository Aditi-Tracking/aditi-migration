import { useEffect, useRef, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { LOCATIONS, createVendor, createVendorRequest, updateVendorRequest } from '../../../lib/vendorRequests'

const BLANK = { product: '', qty: '', amount: '', location: '', invoiceNo: '', poNo: '' }

// Ported from old-portal/js/vendor.js's openVendorForm/vfToggleNewVendor/saveNewVendor/
// submitVendorRequest/openVendorEditForm/submitVendorEdit. A real, confirmed asymmetry kept
// exactly: creating a NEW request requires Invoice Number + PO Number + an uploaded file; editing
// an existing (On Hold only) request requires none of those three — the existing invoice link is
// simply kept unless a new file is chosen.
export default function VendorRequestFormModal({ open, editingRequest, vendors, currentUser, onClose, onVendorAdded, onSaved }) {
  const isEditing = !!editingRequest
  const [vendorSearch, setVendorSearch] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [vendorDropdownOpen, setVendorDropdownOpen] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [invoiceFile, setInvoiceFile] = useState(null)
  const [existingInvoiceLink, setExistingInvoiceLink] = useState(null)

  const [newVendorOpen, setNewVendorOpen] = useState(false)
  const [newVendorName, setNewVendorName] = useState('')
  const [newVendorContact, setNewVendorContact] = useState('')
  const [newVendorNotes, setNewVendorNotes] = useState('')
  const [newVendorSaving, setNewVendorSaving] = useState(false)
  const [newVendorError, setNewVendorError] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const vendorBoxRef = useRef(null)

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the form whenever the modal opens or the target request changes, not a render loop
    setError('')
    setNewVendorOpen(false)
    setNewVendorError('')
    setInvoiceFile(null)
    setVendorDropdownOpen(false)
    if (editingRequest) {
      setVendorId(editingRequest.vendor_id ? String(editingRequest.vendor_id) : '')
      setVendorSearch(editingRequest.vendor_name || '')
      setForm({
        product: editingRequest.product_name || '',
        qty: editingRequest.qty != null ? String(editingRequest.qty) : '',
        amount: editingRequest.amount != null ? String(editingRequest.amount) : '',
        location: editingRequest.location || '',
        invoiceNo: editingRequest.invoice_number || '',
        poNo: editingRequest.po_number || '',
      })
      setExistingInvoiceLink(editingRequest.invoice_link || null)
    } else {
      setVendorId('')
      setVendorSearch('')
      setForm(BLANK)
      setExistingInvoiceLink(null)
    }
  }, [open, editingRequest])

  useEffect(() => {
    function onDocClick(e) {
      if (vendorBoxRef.current && !vendorBoxRef.current.contains(e.target)) setVendorDropdownOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  function set(patch) {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  const q = vendorSearch.toLowerCase()
  const vendorMatches = q ? vendors.filter((v) => v.vendor_name.toLowerCase().includes(q)).slice(0, 100) : vendors.slice(0, 100)

  function selectVendor(v) {
    setVendorId(String(v.id))
    setVendorSearch(v.vendor_name)
    setVendorDropdownOpen(false)
  }

  async function handleSaveNewVendor() {
    const name = newVendorName.trim()
    if (!name) {
      setNewVendorError('⚠️ Vendor name is required.')
      return
    }
    setNewVendorSaving(true)
    setNewVendorError('')
    try {
      const saved = await createVendor({ name, contact: newVendorContact.trim(), notes: newVendorNotes.trim() }, currentUser?.email)
      onVendorAdded(saved)
      setVendorId(String(saved.id))
      setVendorSearch(saved.vendor_name)
      setNewVendorOpen(false)
    } catch (e) {
      setNewVendorError('❌ ' + e.message)
    } finally {
      setNewVendorSaving(false)
    }
  }

  async function handleSubmit() {
    const vendorName = vendors.find((v) => String(v.id) === vendorId)?.vendor_name || vendorSearch
    const product = form.product.trim()
    const amount = form.amount

    if (!vendorId) {
      setError('⚠️ Please select a vendor.')
      return
    }
    if (!product) {
      setError('⚠️ Product / Service is required.')
      return
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError('⚠️ Please enter a valid amount.')
      return
    }
    if (!form.location) {
      setError('⚠️ Please select a location.')
      return
    }
    if (!isEditing) {
      if (!form.invoiceNo.trim()) {
        setError('⚠️ Invoice Number is required.')
        return
      }
      if (!form.poNo.trim()) {
        setError('⚠️ PO Number is required.')
        return
      }
      if (!invoiceFile) {
        setError('⚠️ Please upload an Invoice / Quotation file.')
        return
      }
    }

    setSaving(true)
    setError('')
    try {
      const payload = {
        vendorId,
        vendorName,
        product,
        qty: form.qty,
        amount,
        location: form.location,
        invoiceNumber: form.invoiceNo.trim(),
        poNumber: form.poNo.trim(),
        invoiceFile,
      }
      if (isEditing) {
        await updateVendorRequest(editingRequest.id, { ...payload, existingInvoiceLink })
      } else {
        await createVendorRequest(payload, currentUser)
      }
      onSaved()
    } catch (e) {
      setError('❌ ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-2xl">
      <div className="text-[15px] font-semibold text-text mb-1">{isEditing ? '✏️ Edit Purchase Request' : '📦 New Purchase Request'}</div>
      <div className="text-[12px] text-text-muted mb-4">{isEditing ? 'Update the details and save changes' : 'Submit a vendor payment request for approval'}</div>

      <div className="mb-3.5" ref={vendorBoxRef}>
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Vendor *</label>
        <div className="flex gap-2 relative">
          <div className="flex-1 relative">
            <input
              type="text"
              value={vendorSearch}
              autoComplete="off"
              placeholder="Search vendor…"
              onChange={(e) => {
                setVendorSearch(e.target.value)
                setVendorId('')
                setVendorDropdownOpen(true)
              }}
              onFocus={() => setVendorDropdownOpen(true)}
              className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none"
            />
            {vendorDropdownOpen && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 max-h-[220px] overflow-y-auto bg-surface border border-border rounded-lg shadow-lg">
                {vendorMatches.length ? (
                  vendorMatches.map((v) => (
                    <div key={v.id} onClick={() => selectVendor(v)} className="px-3 py-2 cursor-pointer border-b border-border last:border-0 hover:bg-surface-2 text-[12.5px]">
                      {v.vendor_name}
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-2.5 text-[12px] text-text-muted">No matching vendors</div>
                )}
              </div>
            )}
          </div>
          <button type="button" onClick={() => setNewVendorOpen((o) => !o)} className="px-3 py-2 rounded-lg border border-border text-text-muted text-[12.5px] font-semibold whitespace-nowrap">
            + New Vendor
          </button>
        </div>

        {newVendorOpen && (
          <div className="mt-2.5 rounded-lg border border-border bg-surface-2 p-3.5">
            <div className="text-[12px] font-bold text-text mb-2.5">➕ Add New Vendor</div>
            <div className="grid grid-cols-1 gap-2.5">
              <input type="text" value={newVendorName} onChange={(e) => setNewVendorName(e.target.value)} placeholder="Vendor Name *" className="px-3 py-2 rounded-lg border border-border bg-surface text-text text-[12.5px] outline-none" />
              <input type="text" value={newVendorContact} onChange={(e) => setNewVendorContact(e.target.value)} placeholder="Contact Number" className="px-3 py-2 rounded-lg border border-border bg-surface text-text text-[12.5px] outline-none" />
              <input type="text" value={newVendorNotes} onChange={(e) => setNewVendorNotes(e.target.value)} placeholder="Notes (optional)" className="px-3 py-2 rounded-lg border border-border bg-surface text-text text-[12.5px] outline-none" />
            </div>
            {newVendorError && <div className="text-danger text-[11.5px] mt-2">{newVendorError}</div>}
            <div className="flex gap-2 mt-2.5">
              <button type="button" onClick={handleSaveNewVendor} disabled={newVendorSaving} className="px-3.5 py-1.5 rounded-lg bg-primary text-white text-[12px] font-bold disabled:opacity-60">
                {newVendorSaving ? 'Saving…' : 'Save Vendor'}
              </button>
              <button type="button" onClick={() => setNewVendorOpen(false)} className="px-3.5 py-1.5 rounded-lg border border-border text-text-muted text-[12px] font-semibold">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mb-3.5">
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Product / Service *</label>
        <input type="text" value={form.product} onChange={(e) => set({ product: e.target.value })} placeholder="Describe what is being purchased" className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-3.5">
        <div>
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Quantity</label>
          <input type="number" min="1" value={form.qty} onChange={(e) => set({ qty: e.target.value })} placeholder="e.g. 10" className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none" />
        </div>
        <div>
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Amount (₹) *</label>
          <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="e.g. 25000" className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none" />
        </div>
        <div>
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Location *</label>
          <select value={form.location} onChange={(e) => set({ location: e.target.value })} className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none">
            <option value="">— Select Location —</option>
            {LOCATIONS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-3.5">
        <div>
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Invoice Number{!isEditing ? ' *' : ''}</label>
          <input type="text" value={form.invoiceNo} onChange={(e) => set({ invoiceNo: e.target.value })} placeholder="INV-0001" className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none" />
        </div>
        <div>
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">PO No. (Odoo){!isEditing ? ' *' : ''}</label>
          <input type="text" value={form.poNo} onChange={(e) => set({ poNo: e.target.value })} placeholder="e.g. P00123" className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none" />
        </div>
      </div>

      <div className="mb-3.5">
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">
          Invoice / Quotation {!isEditing ? '*' : <span className="font-normal text-text-muted">(optional — uploading replaces the existing file)</span>}
        </label>
        <div className="flex items-center gap-2.5 flex-wrap">
          <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-primary/30 bg-primary-tint text-primary text-[12.5px] font-bold cursor-pointer">
            📤 Upload Invoice
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)} className="hidden" />
          </label>
          <span className="text-[12px] text-text-muted">{invoiceFile ? invoiceFile.name : isEditing && existingInvoiceLink ? '📄 Existing file kept (upload to replace)' : 'No file chosen'}</span>
        </div>
      </div>

      {error && <div className="text-danger text-[12px] mb-3.5">{error}</div>}

      <div className="flex gap-3">
        <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 font-semibold border border-border text-text">
          Cancel
        </button>
        <button type="button" onClick={handleSubmit} disabled={saving} className="rounded-lg px-4 py-2 font-bold text-white bg-primary disabled:opacity-60">
          {saving ? 'Saving…' : isEditing ? '💾 Save Changes' : '🚀 Submit for Approval'}
        </button>
      </div>
    </OverlayShell>
  )
}
