import OverlayShell from '../../shared/OverlayShell'
import { round2 } from '../../../lib/dealPricing'

// On-screen, read-only preview of a just-submitted quote — deliberately no
// download/print action. Totals come from submit_quote's own result
// (subtotal / gst_amount / grand_total). GST is shown as one flat line: the
// customer's state isn't tracked, so intra- vs inter-state tax can't be split.
// `lines` carry { name, line_type, qty, selling_price, gst_pct } snapshots
// taken at submit time, so the preview never depends on the live catalog.
const fmt = (n) => `₹${Number(n).toFixed(2)}`

export default function QuotePreviewModal({ open, preview, onClose }) {
  if (!open || !preview) return null
  const { result, customerName, state, repName, lines, date } = preview

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-4xl">
      <div className="px-1 py-1 sm:px-4 sm:py-3">
        <div className="pr-10">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">Price Summary</div>
          <div className="mt-1 text-[24px] sm:text-[28px] font-bold leading-tight text-text">{result.quote_ref}</div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 rounded-xl border border-border bg-surface-2 px-5 py-4">
          {[
            ['Customer', customerName],
            ['State', state],
            ['Prepared by', repName || '—'],
            ['Date', (date ? new Date(date) : new Date()).toLocaleDateString('en-IN')],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-text-muted">{label}</div>
              <div className="mt-1 text-[13px] font-medium text-text break-words">{value}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[12.5px]">
              <thead>
                <tr className="bg-surface-2 text-text text-[10.5px] font-bold uppercase tracking-wider border-b border-border">
                  <th className="px-4 py-1.5 text-left">Description</th>
                  <th className="px-4 py-1.5 text-right">Quantity</th>
                  <th className="px-4 py-1.5 text-right">Unit Price</th>
                  <th className="px-4 py-1.5 text-right">Taxes</th>
                  <th className="px-4 py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-1.5 align-top">
                      <div className="font-bold leading-tight text-text">{l.name}</div>
                      <div className="text-[10.5px] leading-tight text-text-muted">{l.line_type === 'renewal' ? 'Renewal' : 'New'}</div>
                    </td>
                    <td className="px-4 py-1.5 align-top text-right text-text tabular-nums">{l.qty}</td>
                    <td className="px-4 py-1.5 align-top text-right text-text tabular-nums">{fmt(l.selling_price)}</td>
                    <td className="px-4 py-1.5 align-top text-right text-text-muted tabular-nums">{l.gst_pct == null ? '—' : `GST ${Number(l.gst_pct)}%`}</td>
                    <td className="px-4 py-1.5 align-top text-right text-text font-medium tabular-nums">{fmt(round2(l.qty * l.selling_price))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 ml-auto w-full sm:w-[340px] rounded-xl border border-border bg-surface-2 overflow-hidden">
          <div className="flex justify-between px-4 py-2.5 text-[13px] border-b border-border">
            <span className="text-text-muted">Untaxed Amount</span>
            <span className="tabular-nums text-text">{fmt(result.subtotal)}</span>
          </div>
          <div className="flex justify-between px-4 py-2.5 text-[13px] border-b border-border">
            <span className="text-text-muted">GST</span>
            <span className="tabular-nums text-text">{fmt(result.gst_amount)}</span>
          </div>
          <div className="flex items-baseline justify-between px-4 py-3">
            <span className="text-[13px] font-bold text-text">Total</span>
            <span className="text-[18px] font-bold text-text tabular-nums">{fmt(result.grand_total)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg border border-border bg-surface-2 text-text font-semibold text-[13px] py-2.5"
        >
          Close
        </button>
      </div>
    </OverlayShell>
  )
}
