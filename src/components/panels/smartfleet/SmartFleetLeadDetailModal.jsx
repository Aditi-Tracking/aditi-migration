import OverlayShell from '../../shared/OverlayShell'
import StatusBadge from '../../shared/table/StatusBadge'
import AvatarChip from '../../shared/table/AvatarChip'
import { repBg, repColor } from '../../../lib/smartFleet'

function fmtDateTime(s) {
  if (!s) return '—'
  return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Read-only full-record view for a Lead Explorer row. New UI, not a port —
// production has no row-click/detail view for this table at all — added
// specifically so the shared table system's truncated Source/Sales Rep/City
// columns have a real fallback for their full values, same as every other
// migrated table's click-to-detail affordance.
export default function SmartFleetLeadDetailModal({ lead, onClose }) {
  if (!lead) return null

  const name = lead.contact_name || lead.lead_name || '—'
  const rep = lead.RepName || '—'
  const stage = lead.Stage
  const stageLabel = stage === 'Won' ? '✓ Won' : stage === 'Lost' ? '✕ Lost' : `● ${lead.PendingSubStage || 'Pending'}`
  const stageTone = stage === 'Won' ? 'primary' : stage === 'Lost' ? 'danger' : 'neutral'

  const details = [
    ['Phone', lead.phone || '—'],
    ['Email', lead.email || '—'],
    ['City', lead.city || '—'],
    ['Source', lead.source_channel || '—'],
    ['Hero Product', lead.hero_product || '—'],
    ['Probability', `${Math.round(lead.probability || 0)}%`],
    ['Calls Made', lead.calls_made === true ? '✓ Yes' : '✕ No'],
    ['Demo Given', lead.demo_given === true ? '✓ Yes' : '✕ No'],
    ['Quotation Sent', lead.quotation_sent === true ? '✓ Sent' : '✕ No'],
    ['Revenue', lead.effective_revenue ? '₹' + lead.effective_revenue.toLocaleString('en-IN') : '—'],
    ['Lead Created', fmtDateTime(lead.lead_created_at)],
    ['Lead Updated', fmtDateTime(lead.lead_updated_at)],
  ]
  if (stage === 'Lost' && lead.lost_reason_name) details.push(['Lost Reason', lead.lost_reason_name])

  return (
    <OverlayShell open={!!lead} onClose={onClose} maxWidth="max-w-lg">
      <div className="flex items-center gap-3 mb-1 pr-8">
        <AvatarChip name={rep} color={repColor(lead.salesperson_email)} bg={repBg(lead.salesperson_email)} size="md" />
        <div>
          <div className="text-[16px] font-bold text-text">{name}</div>
          <div className="text-[12px] text-text-muted">{rep}</div>
        </div>
      </div>

      <div className="mt-3 mb-4">
        <StatusBadge tone={stageTone}>{stageLabel}</StatusBadge>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12.5px]">
        {details.map(([l, v]) => (
          <div key={l}>
            <div className="text-[10.5px] text-text-muted">{l}</div>
            <div className="font-semibold text-text">{v}</div>
          </div>
        ))}
      </div>
    </OverlayShell>
  )
}
