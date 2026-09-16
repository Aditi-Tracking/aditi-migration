import { TD_STATUS_META } from '../../../lib/taskDelegation'
import StatusBadge from '../../shared/table/StatusBadge'

// Migrated onto the shared StatusBadge. pending's #f0a500 is byte-identical to StatusBadge's own
// warning tone — tone="warning" directly. ongoing's #3b82f6 doesn't match primary (#2563EB, a
// distinctly different blue) and completed's #00d4aa doesn't match success (#16A34A, a different
// green) — both go through the color escape hatch to preserve their exact hex. Note: StatusBadge's
// color escape hatch uses a 1a/4d alpha suffix (~10%/30%) and always renders a border, vs. the
// original's 22 suffix (~13%) and no border — a minor, confirmed cosmetic difference, not a bug,
// same category as CRM Vehicle's tier-badge deltas.
export default function TaskStatusBadge({ status }) {
  const m = TD_STATUS_META[status] || TD_STATUS_META.pending
  return status === 'pending' ? (
    <StatusBadge tone="warning">
      {m.icon} {m.label}
    </StatusBadge>
  ) : (
    <StatusBadge color={m.color}>
      {m.icon} {m.label}
    </StatusBadge>
  )
}
