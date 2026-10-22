import Icon from '../../shared/Icon'
import OverlayShell from '../../shared/OverlayShell'
import StatusBadge from '../../shared/table/StatusBadge'
import { CHANNEL_LABELS, CLIENT_TYPE_OPTIONS, formatEnquiryDate, requirementText, statusLabel, statusTone } from '../../../lib/enquiries'

const CLIENT_TYPE_LABELS = Object.fromEntries(CLIENT_TYPE_OPTIONS.map((o) => [o.value, o.label]))
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('en-IN') : '—')

// Read-only detail view for one enquiry — the fallback for the table's truncated cells (Name /
// Company / Requirement / Source / Sales Person are all single-line-ellipsis there, per the shared
// table system's fixed-row-height rule) and home to the fields the table leaves out entirely
// (Email, Client Type, timestamps). Deliberately has no edit controls in Phase 1. `admin` only
// controls whether the internal "Entered via" channel line shows — it means nothing to someone
// looking at their own entries.
// Unlike a table cell, long values here are allowed to wrap (break-words) — the fixed-height rule
// is about rows, not about a modal.
export default function EnquiryDetailModal({ enquiry, admin, onClose }) {
  if (!enquiry) return null

  const rows = [
    ['Date', formatEnquiryDate(enquiry.enquiry_date)],
    ['Phone', enquiry.phone],
    ['Email', enquiry.email],
    ['Source', enquiry.source],
    ['Sales Person', enquiry.sales_person_accountable],
    ['Client Type', CLIENT_TYPE_LABELS[enquiry.client_type] || enquiry.client_type],
  ]

  return (
    <OverlayShell open onClose={onClose} maxWidth="max-w-lg" closeIcon={<Icon name="x" size={16} />}>
      <div className="text-[17px] font-extrabold text-text mb-1 pr-10 break-words">{enquiry.name}</div>
      <div className="text-[12.5px] text-text-muted mb-3 break-words">{enquiry.company_name || 'No company'}</div>

      <div className="flex flex-wrap gap-2 mb-4">
        <StatusBadge tone={statusTone(enquiry.status)}>{statusLabel(enquiry.status)}</StatusBadge>
        {enquiry.sent_to_fms_at ? <StatusBadge tone="success">
            <span className="inline-flex items-center gap-1">
              <Icon name="check" size={11} />
              Sent to FMS
            </span>
          </StatusBadge> : <StatusBadge tone="neutral">Not sent to FMS</StatusBadge>}
        {enquiry.import_flag === 'duplicate_phone' && <StatusBadge tone="warning">
            <span className="inline-flex items-center gap-1">
              <Icon name="alert" size={11} />
              Duplicate phone
            </span>
          </StatusBadge>}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 text-[13px]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-text-muted font-semibold">{label}</dt>
            <dd className="m-0 break-words">{value || '—'}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4">
        <div className="text-[13px] text-text-muted font-semibold mb-1">Requirement</div>
        <div className="text-[13px] whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-2 px-3 py-2.5">{requirementText(enquiry.requirement) || '—'}</div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 text-[13px] mt-4">
        {admin && (
          <div className="contents">
            <dt className="text-text-muted font-semibold">Entered via</dt>
            <dd className="m-0">{CHANNEL_LABELS[enquiry.entry_channel] || enquiry.entry_channel}</dd>
          </div>
        )}
        <div className="contents">
          <dt className="text-text-muted font-semibold">Sent to FMS</dt>
          <dd className="m-0">{fmtDateTime(enquiry.sent_to_fms_at)}</dd>
        </div>
        <div className="contents">
          <dt className="text-text-muted font-semibold">Saved on</dt>
          <dd className="m-0">{fmtDateTime(enquiry.created_at)}</dd>
        </div>
      </dl>

      {enquiry.import_flag === 'duplicate_phone' && (
        <div className="mt-4 text-[12px] text-text-muted">
          This phone number appeared more than once in the Excel file it was imported from. Every row in that group is flagged so none looks unique.
        </div>
      )}
    </OverlayShell>
  )
}
