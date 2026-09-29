import { NodeResizer } from '@xyflow/react'
import { getColorPreset } from '../../../lib/orgChart'

// Background-colored label box, not a container — deliberately has no knowledge of which regular
// nodes visually sit near it (see project notes on the no-containment decision). Resizable only
// when canManage (NodeResizer's handles only render while `selected`, which itself requires
// elementsSelectable to be enabled for managers).
export default function OrgChartGroupNode({ data, selected }) {
  const preset = getColorPreset(data.group.bg_color)
  return (
    <>
      {data.canManage && (
        <NodeResizer
          isVisible={selected}
          minWidth={160}
          minHeight={100}
          onResizeEnd={(_, params) => data.onResizeEnd(params)}
          lineClassName="!border-primary !border-2"
          handleClassName="!bg-primary !border-2 !border-surface !w-3.5 !h-3.5 !rounded-sm"
        />
      )}
      <div
        onClick={() => data.canManage && data.onSelect(data.group)}
        className={`w-full h-full flex items-center justify-center rounded-xl border-2 ${preset.border} ${preset.bg} px-2 py-1.5 ${data.canManage ? 'cursor-pointer' : ''}`}
      >
        <div
          className="max-w-full min-w-0 font-bold text-text-muted uppercase tracking-wide truncate text-center"
          style={{ fontSize: data.group.font_size || 36 }}
        >
          {data.group.label}
        </div>
      </div>
    </>
  )
}
