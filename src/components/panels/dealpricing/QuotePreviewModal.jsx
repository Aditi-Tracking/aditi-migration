import OverlayShell from '../../shared/OverlayShell'
import { round2 } from '../../../lib/dealPricing'

// On-screen, read-only preview of a just-submitted quote — deliberately no
// download/print action. Totals come from submit_quote's own result
// (subtotal / gst_amount / grand_total); the per-rate GST breakup is only a
// presentation split of that same gst_amount.
// `lines` carry { name, line_type, qty, selling_price, gst_pct } snapshots
// taken at submit time, so the preview never depends on the live catalog.
const fmt = (n) => `₹${Number(n).toFixed(2)}`

function LineTypeBadge({ lineType }) {
  const renewal = lineType === 'renewal'
  return (
    <span
      className={`ml-2 inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide align-middle ${
        renewal ? 'bg-depth-amber-tint border-depth-amber/30 text-depth-amber' : 'bg-primary-tint border-primary/25 text-primary'
      }`}
    >
      {renewal ? 'Renewal' : 'New'}
    </span>
  )
}

export default function QuotePreviewModal({ open, preview, onClose }) {
  if (!open || !preview) return null
  const { result, customerName, state, repName, lines } = preview

  const gstByRate = {}
  lines.forEach((l) => {
    gstByRate[l.gst_pct] = (gstByRate[l.gst_pct] || 0) + (l.qty * l.selling_price * l.gst_pct) / 100
  })
  const rates = Object.keys(gstByRate).sort((a, b) => a - b)

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-3xl">
      <div className="px-1 py-1 sm:px-4 sm:py-3">
        <div className="pr-10">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">Quotation</div>
          <div className="mt-1 text-[24px] sm:text-[28px] font-bold leading-tight text-text">{result.quote_ref}</div>
        </div>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 rounded-xl border border-border bg-surface-2 px-5 py-4">
          {[
            ['Customer', customerName],
            ['State', state],
            ['Prepared by', repName || '—'],
            ['Date', new Date().toLocaleDateString('en-IN')],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-text-muted">{label}</div>
              <div className="mt-1 text-[13px] font-medium text-text break-words">{value}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-[13px]">
              <thead>
                <tr className="bg-surface-2 text-text-muted text-[10.5px] uppercase tracking-wide border-b border-border">
                  <th className="px-4 py-2.5 text-left font-semibold">Item</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Qty</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Price</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-3.5 text-text font-medium">
                      {l.name}
                      <LineTypeBadge lineType={l.line_type} />
                    </td>
                    <td className="px-4 py-3.5 text-right text-text tabular-nums">{l.qty}</td>
                    <td className="px-4 py-3.5 text-right text-text tabular-nums">{fmt(l.selling_price)}</td>
                    <td className="px-4 py-3.5 text-right text-text font-medium tabular-nums">{fmt(round2(l.qty * l.selling_price))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 ml-auto w-full sm:w-[340px] rounded-xl border border-border bg-surface-2 px-5 py-4">
          <div className="flex justify-between text-[13px] text-text-muted">
            <span>Subtotal</span>
            <span className="tabular-nums text-text">{fmt(result.subtotal)}</span>
          </div>
          {rates.map((rate) => (
            <div key={rate} className="mt-2 flex justify-between text-[13px] text-text-muted">
              <span>GST @ {Number(rate)}%</span>
              <span className="tabular-nums text-text">{fmt(rates.length === 1 ? result.gst_amount : round2(gstByRate[rate]))}</span>
            </div>
          ))}
          <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
            <span className="text-[13px] font-semibold text-text">Grand Total</span>
            <span className="text-[22px] font-bold tabular-nums text-text">{fmt(result.grand_total)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-7 w-full rounded-lg border border-border bg-surface-2 text-text font-semibold text-[13px] py-2.5"
        >
          Close
        </button>
      </div>
    </OverlayShell>
  )
}
