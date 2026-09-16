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
// cell is the live-search inline editor (MappingOdooCell) or plain read-only text. Migrated onto
// the shared table system. GPS Company Name already had truncate+tooltip before this migration
// (no detail modal exists for this table, so tooltip-only is the fallback — same AssigneesTab
// precedent); Odoo Customer's read-only text gains the same treatment now, closing a real gap.
// Vehicles stays a plain colored number (not a badge), left-aligned exactly as before — an
// existing, intentional choice, same as CRM Vehicle's quantitative columns.
export default function MappingTable({ rows, canEdit, callerEmail, onRowSaved }) {
  return (
    // Note: for rows near the bottom, MappingOdooCell's dropdown can get visually clipped by
    // Table's own overflow-x-auto scroll wrapper — a real, pre-existing limitation of production's
    // own `.mp-table-wrap{overflow-x:auto}` CSS (no `overflow-y:visible` override there either),
    // not something introduced by this port or by the shared Table system. Not worth a portal-based
    // fix production itself doesn't have.
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
        {!rows.length ? (
          <tr>
            <Td colSpan={7} align="center" className="py-10 text-text-muted">
              No customers found.
            </Td>
          </tr>
        ) : (
          rows.map((r, i) => (
            <Tr key={r.gps_alias_id}>
              <Td className="text-text-muted">{i + 1}</Td>
              <Td className="font-semibold max-w-[180px] truncate" title={r.gps_name}>
                {r.gps_name}
              </Td>
              <Td className="text-text-muted">{r.region || '—'}</Td>
              <Td>
                {r.tier === 'Platinum' ? (
                  <StatusBadge tone="purple">Platinum</StatusBadge>
                ) : r.tier === 'Gold' ? (
                  <StatusBadge color="#f59e0b">Gold</StatusBadge>
                ) : r.tier === 'Silver' ? (
                  <StatusBadge tone="neutral">Silver</StatusBadge>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </Td>
              <Td className="font-bold" style={{ color: '#10b981' }}>
                {r.total_vehicles || 0}
              </Td>
              {canEdit ? (
                <Td className="min-w-[200px]">
                  <MappingOdooCell row={r} callerEmail={callerEmail} onSaved={onRowSaved} />
                </Td>
              ) : (
                <Td
                  className={`min-w-[200px] max-w-[220px] truncate ${r.canonical_name ? 'text-text' : 'text-text-muted italic'}`}
                  title={r.canonical_name || 'Not mapped'}
                >
                  {r.canonical_name || 'Not mapped'}
                </Td>
              )}
              <Td>
                {r.is_mapped ? (
                  <StatusBadge color="#10b981">✅ Mapped</StatusBadge>
                ) : (
                  <StatusBadge color="#ef4444">❌ Unmapped</StatusBadge>
                )}
              </Td>
            </Tr>
          ))
        )}
      </tbody>
    </Table>
  )
}
