import OverlayShell from '../../shared/OverlayShell'
import Icon from '../../shared/Icon'
import StatusBadge from '../../shared/table/StatusBadge'
import { formatEntryDateTime, formatINR, formatPlainDate, leadStageTone } from '../../../lib/fieldSalesForm'

// Read-only detail view for one Field Sales entry — the fallback for the table's truncated cells and home to the
// fields the table leaves out (Email, Current GPS Provider, the full product list, who logged it and when).
// Entries are write-once, so there are no edit controls. Unlike a table cell, long values here wrap (break-words) —
// the fixed-height rule is about rows, not about a modal. `admin` only controls whether the "Logged by" line shows:
// it means nothing to a rep looking at their own entries.
export default function FieldSalesDetailModal({ entry, admin, onClose }) {
  if (!entry) return null

  const rows = [
    ['Source of Lead', entry.source_of_lead],
    ['Purpose of Call / Visit', entry.visit_purpose],
    ['Contact Number', entry.contact_number],
    ['Email ID', entry.email_id],
    ['Location', [entry.city, entry.state].filter(Boolean).join(', ')],
    ['Current GPS Provider', entry.current_gps_provider],
    ['Fleet Size', entry.fleet_size],
    ['Expected Revenue', formatINR(entry.expected_revenue)],
    ['Expected Amount Receiving Date', formatPlainDate(entry.expected_amount_receiving_date)],
  ]
  const products = entry.product_interested || []

  return (
    <OverlayShell open onClose={onClose} maxWidth="max-w-lg" closeIcon={<Icon name="x" size={16} />}>
      <div className="text-[17px] font-extrabold text-text mb-1 pr-10 break-words">{entry.lead_name}</div>
      <div className="text-[12.5px] text-text-muted mb-3">Logged {formatEntryDateTime(entry.created_at)}</div>

      <div className="flex flex-wrap gap-2 mb-4">
        <StatusBadge tone={leadStageTone(entry.lead_stage)}>{entry.lead_stage}</StatusBadge>
        <StatusBadge tone="neutral">Demo given: {entry.demo_given ? 'Yes' : 'No'}</StatusBadge>
        {entry.sent_to_fms_at ? <StatusBadge tone="success">
            <Icon name="check" size={11} strokeWidth={3} />
            Pushed to FMS
          </StatusBadge> : <StatusBadge tone="neutral">Not pushed to FMS</StatusBadge>}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 text-[13px]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-text-muted font-semibold">{label}</dt>
            <dd className="m-0 break-words">{value === null || value === undefined || value === '' ? '—' : value}</dd>
          </div>
        ))}
        <div className="contents">
          <dt className="text-text-muted font-semibold">Products</dt>
          <dd className="m-0 flex flex-wrap gap-1.5">
            {products.length ? products.map((p) => <StatusBadge key={p}>{p}</StatusBadge>) : '—'}
          </dd>
        </div>
        {admin && (
          <div className="contents">
            <dt className="text-text-muted font-semibold">Logged by</dt>
            <dd className="m-0 break-words">
              {entry.entered_by_name || '—'}
              {entry.entered_by_email ? <span className="text-text-muted"> · {entry.entered_by_email}</span> : null}
            </dd>
          </div>
        )}
        {entry.sent_to_fms_at && (
          <div className="contents">
            <dt className="text-text-muted font-semibold">Pushed to FMS</dt>
            <dd className="m-0">{formatEntryDateTime(entry.sent_to_fms_at)}</dd>
          </div>
        )}
      </dl>
    </OverlayShell>
  )
}
