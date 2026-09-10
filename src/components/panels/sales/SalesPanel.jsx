import CNSectionPanel from '../../shared/CNSectionPanel'

// Ported from old-portal/js/sales.js's loadSalesDocs — a plain content-nodes
// grid, no special static cards (unlike HR). The "Deal Calculator" tool card
// (gated by can_view_pricing / is_pricing_admin) is intentionally omitted —
// it links to a separate, not-yet-built module.
export default function SalesPanel() {
  return <CNSectionPanel sectionName="Sales" title="Sales" breadcrumb="Home › Sales" />
}
