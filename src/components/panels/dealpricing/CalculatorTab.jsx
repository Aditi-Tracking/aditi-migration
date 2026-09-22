import { useEffect, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import {
  DP_STATES,
  computeTotals,
  fetchPricingCatalog,
  hasBelowFloor,
  marginFromPrice,
  priceFromMargin,
  resolveDefaultState,
  round2,
  submitQuote,
} from '../../../lib/dealPricing'
import { downloadQuotePdf } from '../../../lib/dealPricingPdf'

let lineSeq = 0
function newLine() {
  lineSeq += 1
  return { key: lineSeq, product_id: '', qty: 1, floor_price: 0, margin_pct: 0, selling_price: 0 }
}

function DealPricingInfoBanner() {
  const [expanded, setExpanded] = useState(true)
  return (
    <div className="mb-4 rounded-xl border border-primary/20 bg-primary-tint px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[14px] font-bold text-text">Price Smart. Sell Smarter.</div>
          <div className="text-[11.5px] text-text-muted mt-0.5">Your deal, your decision.</div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="shrink-0 text-[11.5px] font-semibold text-primary border border-primary/30 rounded-md px-2.5 py-1"
        >
          {expanded ? '▲ Hide' : '▼ Show'}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-primary/15">
          <p className="text-[12.5px] text-text leading-relaxed">
            The calculator gives you complete visibility of the company's cost price — no need to ask anyone.
            Target a minimum 30% margin to support the company's fixed costs and sustainable growth. Beyond
            that, your selling skill creates the opportunity: the smarter you sell, the higher the margin you
            earn for the company.
          </p>
          <p className="mt-2.5 text-[12.5px] font-bold text-primary">
            Know the cost. Protect the margin. Close the deal.
          </p>
        </div>
      )}
    </div>
  )
}

// Ported from old-portal/js/dealPricing.js's Calculator tab (dpLoadCatalog/
// dpRenderLines/dpRenderTotals/dpGenerateQuote and friends).
export default function CalculatorTab() {
  const { currentUser } = useAuth()
  const [state, setState] = useState(DP_STATES[0])
  const [catalog, setCatalog] = useState([])
  const [categoryFilter, setCategoryFilter] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [quoteMsg, setQuoteMsg] = useState(null) // { ok, message } | null

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const defaultState = await resolveDefaultState(currentUser)
      if (cancelled) return
      setState(defaultState)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once at mount to resolve the rep's default branch
  }, [])

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off the loading state for this state's catalog fetch
    setLoading(true)
    fetchPricingCatalog(state)
      .then((data) => {
        if (cancelled) return
        setCatalog(data)
        // Re-price every existing line against the newly selected state's floor.
        setLines((prev) => {
          const next = prev.map((line) => {
            const item = data.find((p) => p.product_id === line.product_id)
            if (!item) return line
            return { ...line, floor_price: item.floor_price, selling_price: priceFromMargin(item.floor_price, line.margin_pct) }
          })
          return next.length ? next : [newLine()]
        })
      })
      .catch((e) => {
        if (cancelled) return
        setCatalog([])
        setQuoteMsg({ ok: false, message: '⚠️ Could not load pricing catalog: ' + e.message })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [state])

  const categories = [...new Set(catalog.map((p) => p.category))].sort()
  const filteredCatalog = categoryFilter ? catalog.filter((p) => p.category === categoryFilter) : catalog
  const totals = computeTotals(lines, catalog)
  const belowFloor = hasBelowFloor(lines)
  const hasValidLine = lines.some((l) => l.product_id)
  const generateDisabled = belowFloor || !hasValidLine || generating

  function updateLine(key, patch) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function handleAddLine() {
    setLines((prev) => [...prev, newLine()])
  }

  function handleRemoveLine(key) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  function handleProductChange(key, productId) {
    const item = catalog.find((p) => p.product_id === productId)
    const floor = item ? item.floor_price : 0
    // margin 0% => selling = floor by default
    updateLine(key, { product_id: productId, floor_price: floor, margin_pct: 0, selling_price: floor })
  }

  function handleQtyChange(key, qty) {
    updateLine(key, { qty: Math.max(1, parseInt(qty, 10) || 1) })
  }

  function handleMarginChange(key, marginPct) {
    const line = lines.find((l) => l.key === key)
    if (!line) return
    const margin = isNaN(parseFloat(marginPct)) ? 0 : parseFloat(marginPct)
    updateLine(key, { margin_pct: margin, selling_price: priceFromMargin(line.floor_price, margin) })
  }

  function handlePriceChange(key, sellingPrice) {
    const line = lines.find((l) => l.key === key)
    if (!line) return
    const price = isNaN(parseFloat(sellingPrice)) ? 0 : parseFloat(sellingPrice)
    updateLine(key, { selling_price: price, margin_pct: marginFromPrice(line.floor_price, price) })
  }

  // Product <select> options for a line — keeps its own already-picked
  // product selected even if it now falls outside the active category
  // filter, so switching the filter never silently drops a line.
  function productOptionsForLine(line) {
    const extra = line.product_id && !filteredCatalog.some((p) => p.product_id === line.product_id)
      ? catalog.filter((p) => p.product_id === line.product_id)
      : []
    return [...filteredCatalog, ...extra]
  }

  async function handleGenerateQuote() {
    setQuoteMsg(null)
    const name = customerName.trim()
    if (!name) {
      setQuoteMsg({ ok: false, message: '⚠️ Enter a customer name first.' })
      return
    }
    const validLines = lines.filter((l) => l.product_id)
    if (!validLines.length) {
      setQuoteMsg({ ok: false, message: '⚠️ Add at least one product line.' })
      return
    }
    if (hasBelowFloor(lines)) {
      setQuoteMsg({ ok: false, message: '⚠️ Fix the line(s) below floor price before generating.' })
      return
    }

    setGenerating(true)
    try {
      const result = await submitQuote({ state, customerName: name, lines: validLines })
      setQuoteMsg({ ok: true, message: `✅ Quote ${result.quote_ref} saved to the log.` })
      await downloadQuotePdf({ result, customerName: name, state, repName: currentUser?.name, catalog, lines: validLines })
      setLines([newLine()])
      setCustomerName('')
    } catch (e) {
      setQuoteMsg({ ok: false, message: '❌ ' + e.message })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      <DealPricingInfoBanner />

      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <select
          value={state}
          onChange={(e) => setState(e.target.value)}
          className="rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text"
        >
          {DP_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Customer / company name"
          className="flex-1 min-w-[200px] rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text"
        />
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border">
          <span className="text-[12.5px] font-semibold text-text">Line Items</span>
          <button
            type="button"
            onClick={handleAddLine}
            className="text-[12px] font-medium text-primary border border-primary/30 rounded-md px-3 py-1.5"
          >
            + Add Line
          </button>
        </div>

        {loading ? (
          <div className="text-center py-10 text-text-muted text-[12.5px]">Loading catalog…</div>
        ) : !lines.length ? (
          <div className="text-center py-10 text-text-muted text-[12.5px]">No line items yet — click "+ Add Line" to start a quote.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-text-muted text-[11px] uppercase tracking-wide border-b border-border">
                  <th className="px-3 py-2 font-semibold">Product</th>
                  <th className="px-3 py-2 font-semibold">Qty</th>
                  <th className="px-3 py-2 font-semibold">Floor Price</th>
                  <th className="px-3 py-2 font-semibold">Margin %</th>
                  <th className="px-3 py-2 font-semibold">Selling Price</th>
                  <th className="px-3 py-2 font-semibold">Line Total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const belowFloorLine = line.product_id && line.selling_price < line.floor_price
                  const lineTotal = round2(line.qty * line.selling_price)
                  return (
                    <tr key={line.key} className={`border-b border-border last:border-0 ${belowFloorLine ? 'bg-danger-tint' : ''}`}>
                      <td className="px-3 py-2">
                        <select
                          value={line.product_id}
                          onChange={(e) => handleProductChange(line.key, e.target.value)}
                          className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[12px] text-text"
                        >
                          <option value="">Select product…</option>
                          {productOptionsForLine(line).map((p) => (
                            <option key={p.product_id} value={p.product_id}>
                              {p.name} ({p.category})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={line.qty}
                          onChange={(e) => handleQtyChange(line.key, e.target.value)}
                          className="w-16 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[12px] text-text"
                        />
                      </td>
                      <td className="px-3 py-2 text-text">₹{line.floor_price.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.1"
                          value={line.margin_pct}
                          onChange={(e) => handleMarginChange(line.key, e.target.value)}
                          className="w-20 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[12px] text-text"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="1"
                          value={line.selling_price}
                          onChange={(e) => handlePriceChange(line.key, e.target.value)}
                          className="w-24 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[12px] text-text"
                        />
                      </td>
                      <td className="px-3 py-2 text-text">
                        ₹{lineTotal.toFixed(2)}
                        {belowFloorLine && (
                          <span className="ml-1.5 rounded-full bg-danger-tint border border-danger/30 text-danger text-[10px] font-medium px-1.5 py-0.5">
                            Below floor
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => handleRemoveLine(line.key)} title="Remove line" className="text-danger text-[13px]">
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex justify-end mt-4">
        <div className="w-full sm:w-[340px]">
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex justify-between text-[12.5px] text-text-muted mb-1.5">
              <span>Subtotal</span>
              <span>₹{totals.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[12.5px] text-text-muted mb-1.5">
              <span>GST</span>
              <span>₹{totals.gst.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[14px] font-bold text-text border-t border-border pt-2">
              <span>Grand Total</span>
              <span>₹{totals.grand.toFixed(2)}</span>
            </div>
          </div>

          {belowFloor && (
            <div className="text-[11.5px] text-danger mt-2">
              ⚠ One or more lines are below floor price — fix before generating a quotation.
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerateQuote}
            disabled={generateDisabled}
            className="w-full mt-3 rounded-lg bg-primary text-white font-bold text-[13px] py-2.5 disabled:opacity-50"
          >
            {generating ? 'Generating…' : 'Generate Quotation'}
          </button>

          {quoteMsg && (
            <div className={`mt-2.5 text-[12px] font-medium ${quoteMsg.ok ? 'text-primary' : 'text-danger'}`}>{quoteMsg.message}</div>
          )}
        </div>
      </div>
    </div>
  )
}
