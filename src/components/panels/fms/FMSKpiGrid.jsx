import { formatFmsAmount } from '../../../lib/fms'

// Ported from old-portal/js/fms.js's fmsUpdateKPIs + the #fmsKpiRow markup.
// Colors unified to the single primary palette per this project's design
// system, instead of production's 8 distinct accent colors per card — that
// call stands (not reopened here). What production's .kpi-card CSS
// (old-portal/css/styles.css) has that this component was missing, ported
// as effects only: a top accent stripe, a hover lift + shadow, and an
// active-filter glow (ring + shadow) — all using the two colors already in
// play here (primary for the status tiles, danger for Pending Payment), not
// new per-card hues. Hover lift only applies to the clickable tiles — Total
// Amount is a plain, non-interactive div, so lifting it on hover would
// imply clickability that isn't there (production's own CSS lifts it too,
// since its shared .kpi-card:hover rule doesn't check for an onclick, but
// that reads as an inconsistency worth not porting, not a behavior to copy).
const STRIPE = { primary: 'bg-primary', danger: 'bg-danger', neutral: 'bg-border' }

function AccentStripe({ tone }) {
  return <div className={`absolute top-0 left-0 right-0 h-[3px] rounded-t-xl ${STRIPE[tone]}`} />
}

export default function FMSKpiGrid({ summary, statusFilter, onStatusFilter, pendingPaymentActive, onTogglePendingPayment }) {
  const tiles = [
    { key: '', label: 'Total Orders', value: summary.total, sub: 'All orders' },
    { key: 'pending_support', label: 'Awaiting Support', value: summary.pending_support, sub: 'Step 1 done' },
    { key: 'pending_config', label: 'Awaiting Config', value: summary.pending_config, sub: 'With config team' },
    { key: 'pending_engineer', label: 'Awaiting Engineer', value: summary.pending_engineer, sub: 'Config done' },
    { key: 'installing', label: 'Installing', value: summary.installing, sub: 'In progress' },
    { key: 'completed', label: 'Completed', value: summary.completed, sub: 'All done' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-5">
      {tiles.map((t) => {
        const isActive = statusFilter === t.key && t.key !== ''
        return (
          <button
            key={t.label}
            type="button"
            onClick={() => onStatusFilter(t.key)}
            className={`relative overflow-hidden text-left rounded-xl border p-3 transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-md ${
              isActive ? '-translate-y-0.5 border-primary bg-primary-tint ring-2 ring-primary/40 shadow-md' : 'border-border bg-surface'
            }`}
          >
            <AccentStripe tone="primary" />
            <div className="text-[11px] text-text-muted">{t.label}</div>
            <div className="text-[19px] font-bold text-text mt-1">{t.value}</div>
            <div className="text-[10px] text-text-muted mt-0.5">{t.sub}</div>
          </button>
        )
      })}

      <div className="relative overflow-hidden rounded-xl border border-border bg-surface p-3">
        <AccentStripe tone="neutral" />
        <div className="text-[11px] text-text-muted">Total Amount</div>
        <div className="text-[17px] font-bold text-text mt-1">{formatFmsAmount(summary.totalAmt)}</div>
        <div className="text-[10px] text-text-muted mt-0.5">All orders</div>
      </div>

      <button
        type="button"
        onClick={onTogglePendingPayment}
        className={`relative overflow-hidden text-left rounded-xl border p-3 transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-md ${
          pendingPaymentActive ? '-translate-y-0.5 border-danger bg-danger-tint ring-2 ring-danger/40 shadow-md' : 'border-border bg-surface'
        }`}
      >
        <AccentStripe tone="danger" />
        <div className="text-[11px] text-text-muted">Pending Payment</div>
        <div className="text-[17px] font-bold text-danger mt-1">{formatFmsAmount(summary.totalPendingAmt)}</div>
        <div className="text-[10px] text-text-muted mt-0.5">
          {summary.pendingAmtOrders} order{summary.pendingAmtOrders !== 1 ? 's' : ''}
        </div>
      </button>
    </div>
  )
}
