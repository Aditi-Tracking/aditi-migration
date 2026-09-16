import {
  FMS_STEPS,
  canActOnAssignedStage,
  canActOnConfigStage,
  empName,
  formatTat,
  isCertOrder,
  parseProofUrls,
  productNames,
  stepStateMap,
} from '../../../lib/fms'
import Table from '../../shared/table/Table'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'
import StatusBadge from '../../shared/table/StatusBadge'

const PER_PAGE = 20

// Ported from old-portal/js/fms.js's fmsRenderTable/fmsBuildPipelineRow.
// The action column now mirrors fmsRenderTable's exact status+permission
// branching — one status-specific action button (falling back to "View"
// for anyone without the relevant access, or once an order is completed).
//
// Migrated onto the shared table system. Despite the dense-looking cell
// content (multiple stacked lines per cell, a 5-step diagram in the
// Pipeline cell), this is genuinely one <tr> per order — Table/Th/Tr/Td
// accommodate it with no extension needed, unlike Renewals (which needed
// Tr's explicit-parity escape hatch for interleaved rows) or CRM Vehicle
// (selected-row highlight needing to win over the zebra stripe). No
// selection state exists here — a row's onClick just opens the timeline
// overlay — so plain zebra=true default striping applies with nothing
// special to handle. Pagination kept as the existing flat page-number
// list (not the buildPageList ellipsis-truncation variant CRM
// Vehicle/SmartFleet use) — at PER_PAGE=20 this never approaches enough
// pages to need truncation.
export default function FMSPipelineTable({ orders, page, onPageChange, locations, products, empMap, currentUser, permissions, onOpenTimeline, onOpenAction }) {
  const total = orders.length
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const pageRows = orders.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  return (
    <Table
      footer={
        totalPages > 1 && (
          <div className="flex items-center justify-center gap-1.5 px-4 py-3 border-t border-border flex-wrap">
            <span className="text-[11px] text-text-muted mr-2">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
              className="text-[11.5px] rounded-md border border-border bg-surface-2 text-text px-2.5 py-1 disabled:opacity-40"
            >
              ‹
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                className={`text-[11.5px] rounded-md border px-2.5 py-1 ${
                  p === page ? 'bg-primary text-white border-primary' : 'border-border bg-surface-2 text-text'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
              className="text-[11.5px] rounded-md border border-border bg-surface-2 text-text px-2.5 py-1 disabled:opacity-40"
            >
              ›
            </button>
          </div>
        )
      }
    >
      <TableHead>
        <Th>SO Number</Th>
        <Th>Client</Th>
        <Th>Pipeline</Th>
        <Th align="center">Action</Th>
      </TableHead>
      <tbody>
        {!pageRows.length && (
          <tr>
            <Td colSpan={4} align="center" className="py-10 text-text-muted">
              📭 No orders found
            </Td>
          </tr>
        )}
        {pageRows.map((o) => (
          <OrderRow
            key={o.id}
            order={o}
            locations={locations}
            products={products}
            empMap={empMap}
            currentUser={currentUser}
            permissions={permissions}
            onOpenTimeline={onOpenTimeline}
            onOpenAction={onOpenAction}
          />
        ))}
      </tbody>
    </Table>
  )
}

// Mirrors fmsRenderTable's action-button branching exactly, including the
// two access-boundary quirks confirmed and deliberately kept as-is (see
// MIGRATION-NOTES.md's "Known confusing-but-intentional-looking access
// boundaries"): the Config gate via canActOnConfigStage, and Certify being
// gated the same way as Assign (assigned_to_support-based) rather than by
// config-team membership, even though certification work routes to Anish.
function resolveAction(order, currentUser, permissions) {
  if (order.status === 'pending_support' && canActOnAssignedStage(currentUser, permissions, order)) {
    return isCertOrder(order) ? { kind: 'certify', label: '📶 Certify' } : { kind: 'support', label: '➡️ Assign' }
  }
  if (order.status === 'pending_config' && canActOnConfigStage(currentUser, permissions)) {
    return { kind: 'config', label: '💾 Config' }
  }
  if (order.status === 'pending_engineer' && canActOnAssignedStage(currentUser, permissions, order)) {
    return { kind: 'engineer', label: '🔩 Assign' }
  }
  if (order.status === 'installing' && canActOnAssignedStage(currentUser, permissions, order)) {
    return { kind: 'install', label: '🔧 Update' }
  }
  return null
}

function OrderRow({ order: o, locations, products, empMap, currentUser, permissions, onOpenTimeline, onOpenAction }) {
  const locName = o.location_type === 'outside' ? o.location_manual || 'Outside' : locations.find((l) => l.id === o.location_id)?.location_name || '—'
  const created = o.created_at ? new Date(o.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
  const states = stepStateMap(o.status)
  const proofs = parseProofUrls(o.payment_proof_url)
  const action = resolveAction(o, currentUser, permissions)

  return (
    <Tr onClick={() => onOpenTimeline(o.id)}>
      <Td className="align-middle">
        <div className="flex items-center gap-1.5 leading-tight">
          <span className="font-semibold text-primary text-[12.5px]">{o.so_number || '—'}</span>
          {!!proofs.length && (
            <a
              href={proofs[0]}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-primary"
              title={`View proof (${proofs.length})`}
            >
              📎{proofs.length > 1 ? ` ${proofs.length}` : ''}
            </a>
          )}
        </div>
        <div className="text-[10.5px] text-text-muted leading-tight mt-px">
          {created} · <strong>{o.quantity || 0}</strong> units
        </div>
      </Td>
      <Td className="align-middle">
        <div className="flex items-center gap-1.5 leading-tight">
          <span className="font-semibold text-text text-[12.5px] max-w-[160px] truncate">{o.client_name || '—'}</span>
          {o.client_type === 'nbd' && <StatusBadge tone="primary">NBD</StatusBadge>}
        </div>
        <div className="text-[10.5px] text-text-muted leading-tight truncate max-w-[220px]">
          {locName} · {empName(empMap, o.assigned_to_support)}
        </div>
        <div className="text-[10px] text-text-muted leading-tight mt-px" title={productNames(o.product_ids, o.product_items, products)}>
          {productNames(o.product_ids, o.product_items, products)}
        </div>
      </Td>
      <Td className="align-middle" onClick={(e) => e.stopPropagation()}>
        <FMSPipelineSteps order={o} states={states} />
      </Td>
      <Td align="center" className="align-middle border-l border-border" onClick={(e) => e.stopPropagation()}>
        {action ? (
          <button
            type="button"
            onClick={() => onOpenAction(action.kind, o.id)}
            className="text-[11px] font-semibold text-white bg-primary rounded-md px-2.5 py-1 whitespace-nowrap"
          >
            {action.label}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onOpenTimeline(o.id)}
            className="text-[11px] font-medium text-primary border border-primary/30 rounded-md px-2.5 py-1"
          >
            👁 View
          </button>
        )}
      </Td>
    </Tr>
  )
}

const STEP_TIME_KEYS = [
  null,
  ['step1_completed_at', 'step2_completed_at'],
  ['step3_started_at', 'step3_completed_at'],
  ['step4_started_at', 'step4_completed_at'],
  ['step5_started_at', 'step5_completed_at'],
]

const BADGE_STYLES = {
  done: 'bg-primary-tint text-primary',
  active: 'bg-primary-tint text-primary',
  pending: 'bg-surface-2 text-text-muted',
}

export function FMSPipelineSteps({ order, states }) {
  return (
    <div className="flex items-center w-full min-w-[260px]">
      {FMS_STEPS.map((step, i) => {
        const state = states[i]
        const isDone = state === 'done'
        const isActive = state === 'active'
        const tatKeys = STEP_TIME_KEYS[i]
        const tat = tatKeys ? formatTat(order[tatKeys[0]], order[tatKeys[1]]) : ''

        return (
          <div key={step.key} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[11px] ${
                  isDone ? 'border-primary bg-primary-tint' : isActive ? 'border-primary bg-surface' : 'border-border bg-surface-2 opacity-50'
                }`}
              >
                {step.icon}
              </div>
              <span className={`text-[8.5px] font-bold rounded-full px-1.5 ${BADGE_STYLES[state]}`}>
                {isDone ? 'Done' : isActive ? 'Next' : 'Pend'}
              </span>
            </div>
            {i < FMS_STEPS.length - 1 && (
              <div className="flex-1 min-w-[16px] flex flex-col items-center gap-0.5 px-1">
                {tat && <span className="text-[8px] font-semibold text-text-muted whitespace-nowrap">⏱ {tat}</span>}
                <div className={`w-full h-[2px] rounded ${isDone ? 'bg-primary' : 'bg-border'}`} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
