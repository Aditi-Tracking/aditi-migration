import { memo } from 'react'
import MappingOdooCell from './MappingOdooCell'
import Table from '../../shared/table/Table'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'
import StatusBadge from '../../shared/table/StatusBadge'

// Platinum's #a855f7 is byte-identical to StatusBadge's own purple tone —
// tone="purple" directly. Gold's #f59e0b doesn't match StatusBadge's
// warning tone (#F0A500, a different amber) — preserved exactly via the
// color escape hatch. Silver's original color is var(--color-text-muted),
// which the color escape hatch can't take (it string-concatenates an alpha
// suffix onto whatever's passed, which only works for a literal hex) —
// tone="neutral" is the only clean option, sharing the same text-muted
// color but a different background surface token, a confirmed minor
// difference, not a bug. Same exact three-way split as CRM Vehicle's tier
// badge, since both are built from the same underlying business concept.

// Ported from old-portal/js/mapping.js's mpRenderTable. canEdit gates whether the Odoo Customer
// cell is the live-search editor (MappingOdooCell) or plain read-only text. Migrated onto
// the shared table system. GPS Company Name already had truncate+tooltip before this migration
// (no detail modal exists for this table, so tooltip-only is the fallback — same AssigneesTab
// precedent); Odoo Customer's read-only text gains the same treatment now, closing a real gap.
// Vehicles stays a plain colored number (not a badge), left-aligned exactly as before — an
// existing, intentional choice, same as CRM Vehicle's quantitative columns.
//
// One DISPLAY row per Odoo name (see buildDisplayRows): a GPS company with 3 Odoo names is 3
// rows, but only its first row shows #, name, region, tier, vehicles and status — everything
// else stays blank, so those read once per company. Striping is per company (not per <tr>) so a
// multi-row company reads as one block. Every row is the same fixed height.
//
// The Odoo dropdown is portalled to <body> (see MappingOdooCell), which is what fixes it being
// clipped by Table's overflow wrappers — the shared Table itself is untouched.
//
// MappingRow is memoized with a field-wise comparator, not shallow props: buildDisplayRows makes
// fresh row objects on every search keystroke, but `company`/`link` keep their identity, so rows
// whose content didn't change skip re-rendering. (Handlers from MappingPanel are useCallback([]).)
function sameRow(a, b) {
  const x = a.row
  const y = b.row
  return (
    a.canEdit === b.canEdit &&
    x.company === y.company &&
    x.link === y.link &&
    x.first === y.first &&
    x.last === y.last &&
    x.pending === y.pending &&
    x.companyIndex === y.companyIndex
  )
}

const MappingRow = memo(function MappingRow({ row, canEdit, onPick, onUnlink, onAdd, onCancelAdd, onClearAll }) {
  const { company: c, first } = row
  const linkCount = (c.odoo_links || []).length
  return (
    <Tr zebra={false} striped={row.companyIndex % 2 === 1}>
      <Td className="text-text-muted">{first ? row.companyIndex + 1 : ''}</Td>
      <Td className="font-semibold max-w-[180px] truncate" title={first ? c.gps_name : undefined}>
        {first ? c.gps_name : ''}
      </Td>
      <Td className="text-text-muted">{first ? c.region || '—' : ''}</Td>
      <Td>
        {first &&
          (c.tier === 'Platinum' ? (
            <StatusBadge tone="purple">Platinum</StatusBadge>
          ) : c.tier === 'Gold' ? (
            <StatusBadge color="#f59e0b">Gold</StatusBadge>
          ) : c.tier === 'Silver' ? (
            <StatusBadge tone="neutral">Silver</StatusBadge>
          ) : (
            <span className="text-text-muted">—</span>
          ))}
      </Td>
      <Td className="font-bold" style={{ color: '#10b981' }}>
        {first ? c.total_vehicles || 0 : ''}
      </Td>
      <Td className="min-w-[280px] max-w-[360px]">
        <MappingOdooCell row={row} canEdit={canEdit} onPick={onPick} onUnlink={onUnlink} onAdd={onAdd} onCancelAdd={onCancelAdd} />
      </Td>
      <Td>
        {first && (
          <div className="flex items-center gap-1.5">
            {c.is_mapped ? <StatusBadge color="#10b981">✅ Mapped</StatusBadge> : <StatusBadge color="#ef4444">❌ Unmapped</StatusBadge>}
            {canEdit && linkCount > 1 && (
              <button
                type="button"
                onClick={() => onClearAll(c)}
                title="Unlink all Odoo names from this GPS company"
                className="text-[11px] text-danger underline whitespace-nowrap"
              >
                unlink all
              </button>
            )}
          </div>
        )}
      </Td>
    </Tr>
  )
}, sameRow)

export default function MappingTable({ displayRows, canEdit, onPick, onUnlink, onAdd, onCancelAdd, onClearAll }) {
  return (
    <Table>
      <TableHead>
        <Th>#</Th>
        <Th>GPS Company Name</Th>
        <Th>Region</Th>
        <Th>Tier</Th>
        <Th>Vehicles</Th>
        <Th>Odoo Customer</Th>
        <Th>Status</Th>
      </TableHead>
      <tbody>
        {!displayRows.length ? (
          <tr>
            <Td colSpan={7} align="center" className="py-10 text-text-muted">
              No customers found.
            </Td>
          </tr>
        ) : (
          displayRows.map((row) => (
            <MappingRow
              key={row.key}
              row={row}
              canEdit={canEdit}
              onPick={onPick}
              onUnlink={onUnlink}
              onAdd={onAdd}
              onCancelAdd={onCancelAdd}
              onClearAll={onClearAll}
            />
          ))
        )}
      </tbody>
    </Table>
  )
}
