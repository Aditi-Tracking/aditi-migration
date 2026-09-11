import CNSectionPanel from '../../shared/CNSectionPanel'

// Ported from old-portal/js/products.js's loadProducts — plain content_nodes
// grid, same shape as Marketing/Finance/IT Admin. The "flat video gallery"
// code (renderProdVideos) is dead in production — see MIGRATION-NOTES.md's
// "Dead code observed" note — so it's not ported here.
export default function ProductsPanel() {
  return <CNSectionPanel sectionName="Products" title="Products" breadcrumb="Home › Products" />
}
