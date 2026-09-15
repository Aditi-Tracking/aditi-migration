import { useEffect, useState } from 'react'
import { fetchCostMasterData, productFloor, toggleProductActive } from '../../../lib/dealPricing'
import ProductModal from './ProductModal'

// Ported from old-portal/js/dealPricing.js's dpLoadCostMaster/
// dpRenderCostMasterTable/dpToggleProductActive. All mutations patch local
// state directly (matching production's own _dpCostMasterRows/
// _dpOverridesByProduct in-memory updates) rather than refetching — this
// screen's own writes are the only thing that can change it.
export default function CostMasterTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [products, setProducts] = useState([])
  const [overridesByProduct, setOverridesByProduct] = useState({})
  const [modalProductId, setModalProductId] = useState(undefined) // undefined = closed, null = new, id = editing

  useEffect(() => {
    let cancelled = false
    fetchCostMasterData()
      .then(({ products, overridesByProduct }) => {
        if (cancelled) return
        setProducts(products)
        setOverridesByProduct(overridesByProduct)
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
        <div className="text-[12px] text-text-muted">Product costs, margins &amp; GST — visible to MD office only. Reps never see this screen or the cost price.</div>
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
                    <th className="px-3 py-2 font-semibold">Category</th>
                    <th className="px-3 py-2 font-semibold">Unit</th>
                    <th className="px-3 py-2 font-semibold">Cost</th>
                    <th className="px-3 py-2 font-semibold">Margin %</th>
                    <th className="px-3 py-2 font-semibold">Base Floor</th>
                    <th className="px-3 py-2 font-semibold">GST %</th>
                    <th className="px-3 py-2 font-semibold">State Overrides</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const overrides = overridesByProduct[p.id] || []
                    return (
                      <tr key={p.id} className={`border-b border-border last:border-0 ${p.is_active ? '' : 'opacity-50'}`}>
                        <td className="px-3 py-2 text-text">{p.name}</td>
                        <td className="px-3 py-2 text-text">{p.category}</td>
                        <td className="px-3 py-2 text-text">{p.unit}</td>
                        <td className="px-3 py-2 text-text">₹{Number(p.cost_price).toFixed(2)}</td>
                        <td className="px-3 py-2 text-text">{Number(p.default_margin_pct).toFixed(1)}%</td>
                        <td className="px-3 py-2 text-text">₹{productFloor(p).toFixed(2)}</td>
                        <td className="px-3 py-2 text-text">{Number(p.gst_pct).toFixed(1)}%</td>
                        <td className="px-3 py-2">
                          {overrides.length ? (
                            <div className="flex flex-wrap gap-1">
                              {overrides.map((o) => (
                                <span key={o.id} className="rounded-full bg-primary-tint border border-primary/20 text-primary text-[10.5px] px-2 py-0.5">
                                  {o.state}: ₹{Number(o.cost_price).toFixed(2)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-text-muted text-[11.5px]">Base cost only</span>
                          )}
                        </td>
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
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      <ProductModal
        open={modalOpen}
        product={editingProduct}
        overrides={editingProduct ? overridesByProduct[editingProduct.id] || [] : []}
        onClose={() => setModalProductId(undefined)}
        onProductCreated={(created) => {
          setProducts((prev) => [...prev, created])
          setModalProductId(created.id)
        }}
        onProductUpdated={(id, payload) => {
          setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...payload } : p)))
        }}
        onOverrideAdded={(productId, created) => {
          setOverridesByProduct((prev) => ({ ...prev, [productId]: [...(prev[productId] || []), created] }))
        }}
        onOverrideUpdated={(productId, overrideId, costPrice) => {
          setOverridesByProduct((prev) => ({
            ...prev,
            [productId]: (prev[productId] || []).map((o) => (o.id === overrideId ? { ...o, cost_price: costPrice } : o)),
          }))
        }}
        onOverrideDeleted={(productId, overrideId) => {
          setOverridesByProduct((prev) => ({ ...prev, [productId]: (prev[productId] || []).filter((o) => o.id !== overrideId) }))
        }}
      />
    </div>
  )
}
