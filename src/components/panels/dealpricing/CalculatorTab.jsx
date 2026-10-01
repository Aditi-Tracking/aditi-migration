import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import {
  DP_STATES,
  buildCatalogMap,
  computeTotals,
  fetchPricingCatalog,
  floorFor,
  hasBelowFloor,
  hasBlockedLines,
  lineStatus,
  marginFromPrice,
  priceFromMargin,
  round2,
  submitQuote,
} from '../../../lib/dealPricing'
import SearchableSelect from '../../shared/SearchableSelect'
import QuotePreviewModal from './QuotePreviewModal'

let lineSeq = 0
// `floor_price` on a line is the floor applicable to its line_type (New or
// Renewal) — null while that price isn't set or the product isn't offered in
// the selected state.
function newLine(item) {
  lineSeq += 1
  const floor = floorFor(item, 'new')
  return {
    key: lineSeq,
    product_id: item.product_id,
    name: item.name,
    product_type: item.product_type,
    line_type: 'new',
    qty: 1,
    floor_price: floor,
    margin_pct: 0,
    selling_price: floor ?? 0, // margin 0% => selling = floor by default
  }
}

// Re-derives a line's floor/selling price from the catalog — used when the
// catalog reloads (state change) or the line's type flips. A product missing
// from the catalog (state-specific, not offered in this state) keeps its row
// but loses its floor, so it's flagged rather than silently dropped.
function repriceLine(line, catalogMap) {
  const item = catalogMap.get(line.product_id)
  if (!item) return { ...line, floor_price: null, selling_price: 0 }
  const floor = floorFor(item, line.line_type)
  return { ...line, floor_price: floor, selling_price: floor == null ? 0 : priceFromMargin(floor, line.margin_pct) }
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
// dpRenderLines/dpRenderTotals/dpGenerateQuote and friends), since reworked
// for Products/Accessories, New/Renewal lines and the on-screen quote preview.
function toOptions(catalog, type) {
  return catalog
    .filter((p) => p.product_type === type)
    .map((p) => ({ value: p.product_id, label: p.name + (p.floor_price == null && p.renewal_floor_price == null ? ' — price TBA' : '') }))
}

// `initialState` is the rep's default branch, resolved by DealPricingPanel
// before this mounts (so the first catalog fetch is already the right one).
export default function CalculatorTab({ initialState }) {
  const { currentUser } = useAuth()
  const [state, setState] = useState(initialState)
  const [catalog, setCatalog] = useState([])
  const [customerName, setCustomerName] = useState('')
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [quoteMsg, setQuoteMsg] = useState(null) // { ok, message } | null
  const [preview, setPreview] = useState(null) // submitted quote shown in the preview modal

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off the loading state for this state's catalog fetch
    setLoading(true)
    fetchPricingCatalog(state)
      .then((data) => {
        if (cancelled) return
        const map = buildCatalogMap(data)
        setCatalog(data)
        // Re-price every existing line against the newly selected state's catalog.
        setLines((prev) => prev.map((line) => repriceLine(line, map)))
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

  const catalogMap = useMemo(() => buildCatalogMap(catalog), [catalog])
  const productOptions = useMemo(() => toOptions(catalog, 'product'), [catalog])
  const accessoryOptions = useMemo(() => toOptions(catalog, 'accessory'), [catalog])
  const totals = useMemo(() => computeTotals(lines, catalogMap), [lines, catalogMap])
  const belowFloor = hasBelowFloor(lines)
  const blocked = useMemo(() => hasBlockedLines(lines, catalogMap), [lines, catalogMap])
  const hasValidLine = lines.some((l) => l.product_id)
  // loading: the visible prices belong to the previous state until the refetch lands
  const generateDisabled = belowFloor || blocked || !hasValidLine || generating || loading

  function updateLine(key, patch) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function handleAddItem(productId) {
    const item = catalogMap.get(productId)
    if (!item) return
    setLines((prev) => [...prev, newLine(item)])
  }

  function handleRemoveLine(key) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  // Flipping New/Renewal switches which floor applies; margin resets to 0%
  // (selling = that floor), same as picking a product used to.
  function handleLineTypeChange(key, lineType) {
    setLines((prev) => prev.map((l) => (l.key === key ? repriceLine({ ...l, line_type: lineType, margin_pct: 0 }, catalogMap) : l)))
  }

  function handleQtyChange(key, qty) {
    updateLine(key, { qty: Math.max(1, parseInt(qty, 10) || 1) })
  }

  function handleMarginChange(key, marginPct) {
    const line = lines.find((l) => l.key === key)
    if (!line || line.floor_price == null) return
    const margin = isNaN(parseFloat(marginPct)) ? 0 : parseFloat(marginPct)
    updateLine(key, { margin_pct: margin, selling_price: priceFromMargin(line.floor_price, margin) })
  }

  function handlePriceChange(key, sellingPrice) {
    const line = lines.find((l) => l.key === key)
    if (!line || line.floor_price == null) return
    const price = isNaN(parseFloat(sellingPrice)) ? 0 : parseFloat(sellingPrice)
    updateLine(key, { selling_price: price, margin_pct: marginFromPrice(line.floor_price, price) })
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
      setQuoteMsg({ ok: false, message: '⚠️ Add at least one line.' })
      return
    }
    if (hasBlockedLines(lines, catalogMap)) {
      setQuoteMsg({ ok: false, message: '⚠️ Remove or change the line(s) that are unavailable or have no price yet before calculating.' })
      return
    }
    if (hasBelowFloor(lines)) {
      setQuoteMsg({ ok: false, message: '⚠️ Fix the line(s) below floor price before calculating.' })
      return
    }

    setGenerating(true)
    try {
      const result = await submitQuote({ state, customerName: name, lines: validLines })
      setPreview({
        result,
        customerName: name,
        state,
        repName: currentUser?.name,
        lines: validLines.map((l) => ({
          name: l.name,
          line_type: l.line_type,
          qty: l.qty,
          selling_price: l.selling_price,
          gst_pct: catalogMap.get(l.product_id)?.gst_pct ?? 0,
        })),
      })
    } catch (e) {
      setQuoteMsg({ ok: false, message: '❌ ' + e.message })
    } finally {
      setGenerating(false)
    }
  }

  // The quote is already saved server-side by the time the preview opens, so
  // closing it starts the next quote from a clean slate.
  function handleClosePreview() {
    setPreview(null)
    setLines([])
    setCustomerName('')
    setQuoteMsg(null)
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
        <input
          type="text"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Customer / company name"
          className="flex-1 min-w-[200px] rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text"
        />
      </div>

      <div className="rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-2.5 border-b border-border">
          <span className="text-[12.5px] font-semibold text-text">Line Items</span>
          {loading && lines.length > 0 && <span className="text-[11.5px] text-text-muted">⏳ Updating prices…</span>}
          <div className="flex flex-wrap items-center gap-2">
            <SearchableSelect
              options={productOptions}
              placeholder="+ Add product…"
              onSelect={handleAddItem}
              disabled={loading || !productOptions.length}
              className="w-[220px]"
            />
            <SearchableSelect
              options={accessoryOptions}
              placeholder="+ Add accessory…"
              onSelect={handleAddItem}
              disabled={loading || !accessoryOptions.length}
              className="w-[220px]"
            />
          </div>
        </div>

        {loading && !lines.length ? (
          <div className="text-center py-10 text-text-muted text-[12.5px]">Loading catalog…</div>
        ) : !lines.length ? (
          <div className="text-center py-10 text-text-muted text-[12.5px]">No line items yet — use "+ Add product" or "+ Add accessory" above to start a quote.</div>
        ) : (
          <div className={`overflow-x-auto rounded-b-xl transition-opacity ${loading ? 'opacity-60' : ''}`}>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-text-muted text-[11px] uppercase tracking-wide border-b border-border">
                  <th className="px-3 py-2 font-semibold">Item</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
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
                  const status = lineStatus(line, catalogMap)
                  const priceable = status === 'ok'
                  const belowFloorLine = priceable && line.selling_price < line.floor_price
                  const lineTotal = round2(line.qty * line.selling_price)
                  const isAccessory = line.product_type === 'accessory'
                  return (
                    <tr key={line.key} className={`border-b border-border last:border-0 ${belowFloorLine || status === 'unavailable' ? 'bg-danger-tint' : ''}`}>
                      <td className="px-3 py-2 text-text">
                        {line.name}
                        {isAccessory && (
                          <span className="ml-1.5 rounded-full bg-border/40 border border-border text-text-muted text-[10px] font-medium px-1.5 py-0.5">Accessory</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={isAccessory ? 'new' : line.line_type}
                          onChange={(e) => handleLineTypeChange(line.key, e.target.value)}
                          disabled={isAccessory}
                          className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[12px] text-text disabled:opacity-50"
                        >
                          <option value="new">New</option>
                          <option value="renewal">Renewal</option>
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
                      {priceable ? (
                        <>
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
                        </>
                      ) : (
                        <td colSpan={4} className="px-3 py-2 text-[12px] text-danger">
                          {status === 'unavailable' ? `Not available in ${state}` : 'Price not available yet'}
                        </td>
                      )}
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

          {blocked && (
            <div className="text-[11.5px] text-danger mt-2">
              ⚠ Some lines are unavailable in {state} or have no price yet — remove or change them before calculating the price.
            </div>
          )}
          {belowFloor && (
            <div className="text-[11.5px] text-danger mt-2">
              ⚠ One or more lines are below floor price — fix before calculating the price.
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerateQuote}
            disabled={generateDisabled}
            className="w-full mt-3 rounded-lg bg-primary text-white font-bold text-[13px] py-2.5 disabled:opacity-50"
          >
            {generating ? 'Calculating…' : 'Calculate Price'}
          </button>

          {quoteMsg && (
            <div className="mt-2.5 text-[12px] font-medium text-danger">{quoteMsg.message}</div>
          )}
        </div>
      </div>

      <QuotePreviewModal open={!!preview} preview={preview} onClose={handleClosePreview} />
    </div>
  )
}
