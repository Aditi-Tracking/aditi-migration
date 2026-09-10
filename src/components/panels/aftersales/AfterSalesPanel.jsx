import CNSectionPanel from '../../shared/CNSectionPanel'

// Ported from old-portal/js/aftersales.js's loadAfterSales — a plain
// content-nodes grid, identical shape to Sales (no special static cards,
// no injected cards).
export default function AfterSalesPanel() {
  return <CNSectionPanel sectionName="After Sales" title="After Sales" breadcrumb="Home › After Sales" />
}
