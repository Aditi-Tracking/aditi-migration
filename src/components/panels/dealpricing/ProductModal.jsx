import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { DP_PRODUCT_TYPES, DP_STATES, saveProduct } from '../../../lib/dealPricing'

function fmtFloor(n) {
  return n == null ? '—' : `₹${Number(n).toFixed(2)}`
}

// `product` is null for "Add Product". Prices are entered GST-inclusive; the
// ex-GST floors are generated columns on the server, so they're shown
// read-only (from the row as last loaded/saved) and never sent in the payload.
// Saving closes the modal — there is nothing left to add after creating.
export default function ProductModal({ open, product, onClose, onSaved }) {
  const [name, setName] = useState('')
  const [productType, setProductType] = useState('product')
  const [state, setState] = useState('')
  const [unit, setUnit] = useState('')
  const [price, setPrice] = useState('')
  const [renewalPrice, setRenewalPrice] = useState('')
  const [gst, setGst] = useState('18')
  const [active, setActive] = useState('true')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the form each time the modal opens for a (possibly different) product
    setName(product?.name || '')
    setProductType(product?.product_type || 'product')
    setState(product?.state || '')
    setUnit(product?.unit || '')
    setPrice(product?.price_incl_gst != null ? String(product.price_incl_gst) : '')
    setRenewalPrice(product?.renewal_price_incl_gst != null ? String(product.renewal_price_incl_gst) : '')
    setGst(product ? String(product.gst_pct) : '18')
    setActive(product ? String(product.is_active) : 'true')
    setError('')
    setSaving(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on product id, not the whole object, so an in-place patch to other products never resets this form
  }, [open, product?.id])

  if (!open) return null

  const isAccessory = productType === 'accessory'

  async function handleSave() {
    setError('')
    const payload = {
      name: name.trim(),
      product_type: productType,
      state: isAccessory ? null : state || null,
      unit: unit.trim(),
      price_incl_gst: price.trim() === '' ? null : parseFloat(price),
      renewal_price_incl_gst: isAccessory || renewalPrice.trim() === '' ? null : parseFloat(renewalPrice),
      gst_pct: parseFloat(gst),
      is_active: active === 'true',
    }
    if (
      !payload.name ||
      !payload.unit ||
      isNaN(payload.gst_pct) ||
      (payload.price_incl_gst !== null && isNaN(payload.price_incl_gst)) ||
      (payload.renewal_price_incl_gst !== null && isNaN(payload.renewal_price_incl_gst))
    ) {
      setError('Please fill in name, unit and GST with valid values (prices may be left blank).')
      return
    }
    // Zero is allowed; the DB's CHECK constraint also rejects negatives, this
    // just skips the round-trip.
    if (payload.price_incl_gst < 0 || payload.renewal_price_incl_gst < 0) {
      setError('Prices cannot be negative.')
      return
    }
    setSaving(true)
    try {
      const saved = await saveProduct(product?.id ?? null, payload)
      onSaved(saved)
      onClose()
    } catch (e) {
      setError('❌ ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-2xl">
      <div className="mb-1 pr-8">
        <div className="text-[15px] font-semibold text-text">{product ? 'Edit Product' : 'Add Product'}</div>
        <div className="text-[11.5px] text-text-muted mt-0.5">{product ? product.name : 'New pricing product'}</div>
      </div>

      {error && <div className="mt-3 rounded-lg border border-danger/30 bg-danger-tint text-danger px-3.5 py-2.5 text-[12px]">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-4">
        <div className="sm:col-span-2">
          <label className="block text-[11.5px] font-medium text-text-muted mb-1.5">Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text" />
        </div>
        <div>
          <label className="block text-[11.5px] font-medium text-text-muted mb-1.5">Type</label>
          <select
            value={productType}
            onChange={(e) => {
              setProductType(e.target.value)
              if (e.target.value === 'accessory') setState('')
            }}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text"
          >
            {DP_PRODUCT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11.5px] font-medium text-text-muted mb-1.5">State</label>
          <select
            value={isAccessory ? '' : state}
            onChange={(e) => setState(e.target.value)}
            disabled={isAccessory}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text disabled:opacity-50"
          >
            <option value="">All states (universal)</option>
            {DP_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {isAccessory && <div className="mt-1 text-[11px] text-text-muted">Accessories are always universal.</div>}
        </div>
        <div>
          <label className="block text-[11.5px] font-medium text-text-muted mb-1.5">Unit</label>
          <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. per device, per month" className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text" />
        </div>
        <div>
          <label className="block text-[11.5px] font-medium text-text-muted mb-1.5">GST %</label>
          <input type="number" min="0" step="0.1" value={gst} onChange={(e) => setGst(e.target.value)} className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text" />
        </div>
        <div>
          <label className="block text-[11.5px] font-medium text-text-muted mb-1.5">Price incl. GST (₹)</label>
          <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Blank = TBA" className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text" />
        </div>
        <div>
          <label className="block text-[11.5px] font-medium text-text-muted mb-1.5">Renewal price incl. GST (₹)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={isAccessory ? '' : renewalPrice}
            onChange={(e) => setRenewalPrice(e.target.value)}
            disabled={isAccessory}
            placeholder={isAccessory ? 'Accessories have no renewal' : 'Blank = TBA'}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-[11.5px] font-medium text-text-muted mb-1.5">Status</label>
          <select value={active} onChange={(e) => setActive(e.target.value)} className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text">
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      <div className="mt-3 text-[11.5px] text-text-muted">
        {product ? (
          <>
            Floor (ex-GST, computed): <strong className="text-text">{fmtFloor(product.floor_price)}</strong> · Renewal floor:{' '}
            <strong className="text-text">{fmtFloor(product.renewal_floor_price)}</strong>
          </>
        ) : (
          'Floor prices are computed automatically from the GST-inclusive prices once saved.'
        )}
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full mt-4 rounded-lg bg-primary text-white font-bold text-[13px] py-2.5 disabled:opacity-60"
      >
        {saving ? 'Saving…' : 'Save Product'}
      </button>
    </OverlayShell>
  )
}
