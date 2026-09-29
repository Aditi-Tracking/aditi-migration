import dagre from '@dagrejs/dagre'

// One-time (per render, not persisted yet — see Phase 2) hierarchical auto-layout via dagre,
// computed live from the manager_id-derived edges. Must match OrgChartNode.jsx's card size
// closely enough for dagre's spacing to look right; doesn't need to be pixel-exact since this
// only affects layout spacing, not the card's own rendered size.
const NODE_WIDTH = 200
const NODE_HEIGHT = 70
const RANK_SEP = 90
const NODE_SEP = 40

// dagre reports each node's CENTER x/y — React Flow positions nodes by their top-left corner, so
// every position gets shifted by half the node's own size.
export function computeDagreLayout(nodes, edges) {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', ranksep: RANK_SEP, nodesep: NODE_SEP })
  g.setDefaultEdgeLabel(() => ({}))
  nodes.forEach((n) => g.setNode(String(n.id), { width: NODE_WIDTH, height: NODE_HEIGHT }))
  edges.forEach((e) => g.setEdge(String(e.source), String(e.target)))
  dagre.layout(g)

  const positions = new Map()
  nodes.forEach((n) => {
    const p = g.node(String(n.id))
    positions.set(n.id, { x: p.x - NODE_WIDTH / 2, y: p.y - NODE_HEIGHT / 2 })
  })
  return positions
}
