import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { DP_PRODUCT_CATEGORIES, addOverride, deleteOverride, overrideFloor, round2, saveProduct, updateOverride } from '../../../lib/dealPricing'

// Ported from old-portal/js/dealPricing.js's dpOpenProductModal/dpSaveProduct/
// dpRenderOverridesTable/dpAddOverride/dpUpdateOverride/dpDeleteOverride.
// `product` is null for "Add Product". State Overrides only exist once a
// product has a real id — hidden entirely for a brand-new unsaved product,
// matching production exactly (creating one re-opens this same modal in
// edit mode via onProductCreated below, rather than closing it).
export default function ProductModal({ open, product, overrides, onClose, onProductCreated, onProductUpdated, onOverrideAdded, onOverrideUpdated, onOverrideDeleted }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState(DP_PRODUCT_CATEGORIES[0])
  const [unit, setUnit] = useState('')
  const [cost, setCost] = useState('')
  const [margin, setMargin] = useState('20')
  const [gst, setGst] = useState('18')
  const [active, setActive] = useState('true')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [newState, setNewState] = useState('')
  const [newCost, setNewCost] = useState('')
  const [overrideError, setOverrideError] = useState('')
  const [costDrafts, setCostDrafts] = useState({}) // overrideId -> in-progress input string, committed on blur

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the form each time the modal opens for a (possibly different, or newly-created) product
    setName(product?.name || '')
    setCategory(product?.category || DP_PRODUCT_CATEGORIES[0])
    setUnit(product?.unit || '')
    setCost(product ? String(product.cost_price) : '')
    setMargin(product ? String(product.default_margin_pct) : '20')
    setGst(product ? String(product.gst_pct) : '18')
    setActive(product ? String(product.is_active) : 'true')
    setError('')
    setSaving(false)
    setNewState('')
    setNewCost('')
    setOverrideError('')
    setCostDrafts({})
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on product id, not the whole object, so an in-place patch to other products never resets this form; a real id transition (create -> edit mode) is the only thing that should
  }, [open, product?.id])

  if (!open) return null

  const costNum = parseFloat(cost) || 0
  const marginNum = parseFloat(margin) || 0
  const floorPreview = round2(costNum * (1 + marginNum / 100))

  async function handleSave() {
    setError('')
    const payload = {
      name: name.trim(),
      category,
      unit: unit.trim(),
      cost_price: parseFloat(cost),
      default_margin_pct: parseFloat(margin),
      gst_pct: parseFloat(gst),
      is_active: active === 'true',
    }
    if (!payload.name || !payload.unit || isNaN(payload.cost_price) || isNaN(payload.default_margin_pct) || isNaN(payload.gst_pct)) {
      setError('Please fill in all fields with valid values.')
      return
    }
    setSaving(true)
    try {
      if (product) {
        await saveProduct(product.id, payload)
        onProductUpdated(product.id, payload)
        onClose()
      } else {
        const created = await saveProduct(null, payload)
        onProductCreated(created)
        // Stays open — parent re-passes `product` as the newly-created row,
        // switching this same modal into edit mode (see the effect above).
      }
    } catch (e) {
      setError('❌ ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddOverride() {
    setOverrideError('')
    const state = newState.trim()
    const costVal = parseFloat(newCost)
    if (!state || isNaN(costVal)) {
      setOverrideError('Enter a state and a valid cost price.')
      return
    }
    try {
      const created = await addOverride(product.id, state, costVal)
      onOverrideAdded(product.id, created)
      setNewState('')
      setNewCost('')
    } catch (e) {
      setOverrideError('❌ Could not add override (this product may already have one for that state — edit it below instead): ' + e.message)
    }
  }

  async function handleOverrideCostBlur(o) {
    const raw = costDrafts[o.id]
    if (raw === undefined) return
    const costVal = parseFloat(raw)
    if (isNaN(costVal) || costVal === o.cost_price) return
    try {
      await updateOverride(o.id, costVal)
      onOverrideUpdated(product.id, o.id, costVal)
    } catch (e) {
      alert('❌ Could not update override: ' + e.message)
    }
  }

  async function handleDeleteOverride(o) {
    if (!confirm('Remove this state override? The product will fall back to its base cost for that state.')) return
    try {
      await deleteOverride(o.id)
      onOverrideDeleted(product.id, o.id)
    } catch (e) {
      alert('❌ Could not delete override: ' + e.message)
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
          <label className="block text-[11.5px] font-medium text-text-muted mb-1.5">Product Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text" />
        </div>
        <div>
          <label className="block text-[11.5px] font-medium text-text-muted mb-1.5">Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text">
            {DP_PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11.5px] font-medium text-text-muted mb-1.5">Unit</label>
          <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. per device, per month" className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text" />
        </div>
        <div>
          <label className="block text-[11.5px] font-medium text-text-muted mb-1.5">Cost Price (₹)</label>
          <input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text" />
        </div>
        <div>
          <label className="block text-[11.5px] font-medium text-text-muted mb-1.5">Default Margin %</label>
          <input type="number" min="0" step="0.1" value={margin} onChange={(e) => setMargin(e.target.value)} className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text" />
        </div>
        <div>
          <label className="block text-[11.5px] font-medium text-text-muted mb-1.5">GST %</label>
          <input type="number" min="0" step="0.1" value={gst} onChange={(e) => setGst(e.target.value)} className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text" />
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
        Base floor preview (state overrides may raise/lower this per state): <strong className="text-text">₹{floorPreview.toFixed(2)}</strong>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full mt-4 rounded-lg bg-primary text-white font-bold text-[13px] py-2.5 disabled:opacity-60"
      >
        {saving ? 'Saving…' : 'Save Product'}
      </button>

      {product && (
        <div className="mt-6 pt-5 border-t border-border">
          <div className="text-[13px] font-semibold text-text mb-2.5">State Overrides</div>

          {!overrides.length ? (
            <div className="text-[12px] text-text-muted mb-3">No state overrides — this product uses its base cost everywhere.</div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden mb-3">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-text-muted text-[10.5px] uppercase tracking-wide border-b border-border">
                    <th className="px-3 py-2 font-semibold">State</th>
                    <th className="px-3 py-2 font-semibold">Cost Price</th>
                    <th className="px-3 py-2 font-semibold">Floor (this state)</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {overrides.map((o) => (
                    <tr key={o.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-text">{o.state}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={costDrafts[o.id] ?? String(o.cost_price)}
                          onChange={(e) => setCostDrafts((prev) => ({ ...prev, [o.id]: e.target.value }))}
                          onBlur={() => handleOverrideCostBlur(o)}
                          className="w-28 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[12px] text-text"
                        />
                      </td>
                      <td className="px-3 py-2 text-text">₹{overrideFloor(o.cost_price, product).toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => handleDeleteOverride(o)} title="Remove override" className="text-danger text-[13px]">
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-[11px] font-medium text-text-muted mb-1">State</label>
              <input type="text" value={newState} onChange={(e) => setNewState(e.target.value)} placeholder="e.g. Gujarat" className="w-36 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-text-muted mb-1">Cost Price (₹)</label>
              <input type="number" min="0" step="0.01" value={newCost} onChange={(e) => setNewCost(e.target.value)} className="w-32 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text" />
            </div>
            <button type="button" onClick={handleAddOverride} className="text-[12px] font-medium text-primary border border-primary/30 rounded-md px-3 py-1.5 h-fit">
              + Add Override
            </button>
          </div>
          {overrideError && <div className="mt-2 text-[11.5px] text-danger">{overrideError}</div>}
        </div>
      )}
    </OverlayShell>
  )
}
