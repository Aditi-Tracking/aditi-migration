import { useEffect, useState } from 'react'
import { fetchCostMasterProducts, toggleProductActive } from '../../../lib/dealPricing'
import ProductModal from './ProductModal'

// Ported from old-portal/js/dealPricing.js's dpLoadCostMaster/
// dpRenderCostMasterTable/dpToggleProductActive, since reworked for
// GST-inclusive prices. All mutations patch local state directly rather than
// refetching — this screen's own writes are the only thing that can change it.
// Floors are generated columns: shown read-only, taken from the row the server
// last returned.
function fmtPrice(n) {
  return n == null ? 'TBA' : `₹${Number(n).toFixed(2)}`
}

function fmtFloor(n) {
  return n == null ? '—' : `₹${Number(n).toFixed(2)}`
}

export default function CostMasterTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [products, setProducts] = useState([])
  const [modalProductId, setModalProductId] = useState(undefined) // undefined = closed, null = new, id = editing

  useEffect(() => {
    let cancelled = false
    fetchCostMasterProducts()
      .then((rows) => {
        if (cancelled) return
        setProducts(rows)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleToggleActive(product) {
    if (product.is_active && !confirm('Deactivate this product? It will disappear from the Calculator (existing quotes are unaffected).')) return
    try {
      await toggleProductActive(product.id, !product.is_active)
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, is_active: !product.is_active } : p)))
    } catch (e) {
      alert('❌ Could not update: ' + e.message)
    }
  }

  const modalOpen = modalProductId !== undefined
  const editingProduct = modalProductId ? products.find((p) => p.id === modalProductId) || null : null

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3.5 flex-wrap">
        <div className="text-[12px] text-text-muted">Product &amp; accessory prices (GST-inclusive), renewal prices &amp; GST — visible to MD office only. Floors are computed automatically.</div>
        <button
          type="button"
          onClick={() => setModalProductId(null)}
          className="text-[12px] font-medium text-primary border border-primary/30 rounded-md px-3 py-1.5 shrink-0"
        >
          + Add Product
        </button>
      </div>

      {loading && <div className="text-center py-16 text-text-muted text-[13px]">Loading…</div>}
      {!loading && error && <div className="text-center py-16 text-danger text-[13px]">⚠️ {error}</div>}

      {!loading && !error && (
        !products.length ? (
          <div className="text-center py-16 text-text-muted text-[13px]">No products yet — click "+ Add Product" to create the first one.</div>
        ) : (
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-text-muted text-[11px] uppercase tracking-wide border-b border-border">
                    <th className="px-3 py-2 font-semibold">Name</th>
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <th className="px-3 py-2 font-semibold">State</th>
                    <th className="px-3 py-2 font-semibold">Unit</th>
                    <th className="px-3 py-2 font-semibold">Price incl. GST</th>
                    <th className="px-3 py-2 font-semibold">Floor</th>
                    <th className="px-3 py-2 font-semibold">Renewal incl. GST</th>
                    <th className="px-3 py-2 font-semibold">Renewal Floor</th>
                    <th className="px-3 py-2 font-semibold">GST %</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className={`border-b border-border last:border-0 ${p.is_active ? '' : 'opacity-50'}`}>
                      <td className="px-3 py-2 text-text">{p.name}</td>
                      <td className="px-3 py-2 text-text capitalize">{p.product_type}</td>
                      <td className="px-3 py-2 text-text">{p.state || 'All states'}</td>
                      <td className="px-3 py-2 text-text">{p.unit}</td>
                      <td className="px-3 py-2 text-text">{fmtPrice(p.price_incl_gst)}</td>
                      <td className="px-3 py-2 text-text">{fmtFloor(p.floor_price)}</td>
                      <td className="px-3 py-2 text-text">{fmtPrice(p.renewal_price_incl_gst)}</td>
                      <td className="px-3 py-2 text-text">{fmtFloor(p.renewal_floor_price)}</td>
                      <td className="px-3 py-2 text-text">{Number(p.gst_pct).toFixed(1)}%</td>
                      <td className="px-3 py-2">
                        {p.is_active ? (
                          <span className="rounded-full bg-primary-tint border border-primary/20 text-primary text-[10.5px] font-medium px-2 py-0.5">Active</span>
                        ) : (
                          <span className="rounded-full bg-border/40 border border-border text-text-muted text-[10.5px] font-medium px-2 py-0.5">Inactive</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <button type="button" onClick={() => setModalProductId(p.id)} className="text-primary text-[12px] font-semibold mr-2.5">
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(p)}
                          className={`text-[12px] font-semibold ${p.is_active ? 'text-danger' : 'text-primary'}`}
                        >
                          {p.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      <ProductModal
        open={modalOpen}
        product={editingProduct}
        onClose={() => setModalProductId(undefined)}
        onSaved={(saved) => {
          setProducts((prev) => (prev.some((p) => p.id === saved.id) ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved]))
        }}
      />
    </div>
  )
}
