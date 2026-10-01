import { Fragment, useEffect, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { MQ_PAGE_SIZE, fetchMyQuotes, quoteToPreview } from '../../../lib/dealPricing'
import TopPagination from '../../shared/table/TopPagination'
import QuotePreviewModal from './QuotePreviewModal'

const fmt = (n) => `₹${Number(n).toFixed(2)}`
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

// A rep's own submitted quotes. Row-expand pattern from DashboardEntriesTable:
// expanding is local state only, no re-fetch. Mounted only while the tab is
// active, so it always fetches fresh (a quote submitted a minute ago shows up).
// No Status column on purpose: submit_quote always stores 'draft' and nothing
// updates it, so showing it would only confuse reps.
export default function MyQuotesTab() {
  const { currentUser } = useAuth()
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading state for this page's fetch
    setLoading(true)
    setError('')
    setExpandedId(null)
    fetchMyQuotes({ repEmail: currentUser?.email, offset: (page - 1) * MQ_PAGE_SIZE })
      .then(({ rows: r, total: t }) => {
        if (cancelled) return
        setRows(r)
        setTotal(t)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch on page change only
  }, [page])

  return (
    <div className="rounded-xl border border-border bg-surface p-3.5">
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-[13px] font-semibold text-text">My Quotes</div>
        <TopPagination page={page} pageSize={MQ_PAGE_SIZE} total={total} onPageChange={setPage} />
      </div>

      {loading && <div className="text-center py-10 text-text-muted text-[13px]">⏳ Loading quotes…</div>}
      {!loading && error && <div className="text-center py-10 text-danger text-[13px]">⚠️ Could not load quotes — {error}</div>}
      {!loading && !error && !rows.length && (
        <div className="text-center py-10 text-text-muted text-[13px]">No quotes yet — price a deal in the Calculator and it will appear here.</div>
      )}

      {!loading && !error && !!rows.length && (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b-2 border-border">
                {['Quote Ref', 'Customer', 'State', 'Grand Total', 'Date'].map((h) => (
                  <th key={h} className="text-left px-2.5 py-2 text-[10.5px] font-bold uppercase tracking-wide text-text-muted whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => {
                const expanded = expandedId === q.id
                const lines = q.pricing_quote_lines || []
                return (
                  <Fragment key={q.id}>
                    <tr
                      onClick={() => setExpandedId(expanded ? null : q.id)}
                      className="border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer"
                    >
                      <td className="px-2.5 py-2 font-semibold text-text whitespace-nowrap">{q.quote_ref}</td>
                      <td className="px-2.5 py-2">{q.customer_name}</td>
                      <td className="px-2.5 py-2">{q.state}</td>
                      <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">{fmt(q.grand_total)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">{fmtDate(q.created_at)}</td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={5} className="p-0">
                          <div className="px-4 py-3 bg-surface-2 border-t border-border">
                            <table className="w-full text-[12px]">
                              <thead>
                                <tr className="text-[10.5px] font-bold uppercase tracking-wide text-text-muted">
                                  <th className="text-left py-1">Product</th>
                                  <th className="text-left py-1">Type</th>
                                  <th className="text-right py-1">Qty</th>
                                  <th className="text-right py-1">Selling Price</th>
                                  <th className="text-right py-1">GST %</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lines.map((l, i) => (
                                  <tr key={l.id ?? i} className="border-t border-border">
                                    <td className="py-1.5 font-semibold text-text">{l.product_name || 'Unknown product'}</td>
                                    <td className="py-1.5 text-text-muted">{l.line_type === 'renewal' ? 'Renewal' : 'New'}</td>
                                    <td className="py-1.5 text-right tabular-nums">{l.qty}</td>
                                    <td className="py-1.5 text-right tabular-nums">{fmt(l.selling_price)}</td>
                                    <td className="py-1.5 text-right tabular-nums">{l.gst_pct == null ? '—' : `${Number(l.gst_pct)}%`}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <button
                              type="button"
                              onClick={() => setPreview(quoteToPreview(q, currentUser?.name))}
                              className="mt-3 text-[12px] font-semibold text-primary border border-primary/30 rounded-md px-3 py-1.5"
                            >
                              Open Price Summary
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <QuotePreviewModal open={!!preview} preview={preview} onClose={() => setPreview(null)} />
    </div>
  )
}
