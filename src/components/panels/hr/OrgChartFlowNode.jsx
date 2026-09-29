import { Handle, Position } from '@xyflow/react'
import OrgChartNode from './OrgChartNode'

// Wraps the existing card visual (unchanged) with React Flow's connection handles. Read-only for
// Phase 1 (nodesConnectable={false} on the graph), so these handles are purely visual anchors for
// where edges attach, not yet interactive.
export default function OrgChartFlowNode({ data }) {
  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="!bg-text-muted !w-2 !h-2 !border-0" />
      <OrgChartNode row={data.row} depth={data.depth} onClick={() => data.onSelect(data.row)} />
      <Handle type="source" position={Position.Bottom} className="!bg-text-muted !w-2 !h-2 !border-0" />
    </div>
  )
}

// Cross-branch "reports to <Head Office>" header — positioned just above its root, not connected
// by an edge (matches the prior inline-above-the-card look), purely a static label.
export function OrgChartLabelNode({ data }) {
  return (
    <div className="px-2 py-0.5 rounded-md bg-surface-2 border border-border text-[11px] font-semibold text-text-muted whitespace-nowrap">
      {data.label}
    </div>
  )
}
