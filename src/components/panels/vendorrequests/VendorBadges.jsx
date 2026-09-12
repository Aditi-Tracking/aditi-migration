import { STATUS_BADGE_STYLE } from '../../../lib/vendorRequests'

export function VendorStatusBadge({ status }) {
  const s = status || 'On Hold'
  const style = STATUS_BADGE_STYLE[s] || STATUS_BADGE_STYLE['On Hold']
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${style.bg} ${style.text}`}>{s}</span>
}

export function VendorPayBadge({ status }) {
  if (status === 'Paid') return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap bg-[#a855f7]/15 text-[#a855f7]">💳 Paid</span>
  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap bg-surface-2 text-text-muted border border-border">Unpaid</span>
}
