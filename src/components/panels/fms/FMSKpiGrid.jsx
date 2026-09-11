import { formatFmsAmount } from '../../../lib/fms'

// Ported from old-portal/js/fms.js's fmsUpdateKPIs + the #fmsKpiRow markup.
// Colors unified to the single primary palette per this project's design
// system, instead of production's 8 distinct accent colors per card.
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
            className={`text-left rounded-xl border p-3 ${isActive ? 'border-primary bg-primary-tint' : 'border-border bg-surface'}`}
          >
            <div className="text-[11px] text-text-muted">{t.label}</div>
            <div className="text-[19px] font-bold text-text mt-1">{t.value}</div>
            <div className="text-[10px] text-text-muted mt-0.5">{t.sub}</div>
          </button>
        )
      })}

      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="text-[11px] text-text-muted">Total Amount</div>
        <div className="text-[17px] font-bold text-text mt-1">{formatFmsAmount(summary.totalAmt)}</div>
        <div className="text-[10px] text-text-muted mt-0.5">All orders</div>
      </div>

      <button
        type="button"
        onClick={onTogglePendingPayment}
        className={`text-left rounded-xl border p-3 ${pendingPaymentActive ? 'border-danger bg-danger-tint' : 'border-border bg-surface'}`}
      >
        <div className="text-[11px] text-text-muted">Pending Payment</div>
        <div className="text-[17px] font-bold text-danger mt-1">{formatFmsAmount(summary.totalPendingAmt)}</div>
        <div className="text-[10px] text-text-muted mt-0.5">
          {summary.pendingAmtOrders} order{summary.pendingAmtOrders !== 1 ? 's' : ''}
        </div>
      </button>
    </div>
  )
}
