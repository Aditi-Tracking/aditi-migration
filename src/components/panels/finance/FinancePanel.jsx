import CNSectionPanel from '../../shared/CNSectionPanel'

// Ported from old-portal/js/app.js's loadSimpleCNPanel('finance', 'Finance')
// — plain content-nodes grid, same shape as Marketing/IT Admin/After Sales.
// The "Purchase Request" tool card (_injectPurchaseCard() in js/vendor.js,
// gated by vendor_access permission or MIS/owner role) is intentionally
// deferred — see MIGRATION-NOTES.md's Deferred items, same treatment as
// Sales' Deal Calculator card.
export default function FinancePanel() {
  return <CNSectionPanel sectionName="Finance" title="Finance" breadcrumb="Home › Finance" />
}
