import { useCallback, useEffect, useRef, useState } from 'react'
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import OrgChartFlowNode, { OrgChartLabelNode } from './OrgChartFlowNode'
import OrgChartGroupNode from './OrgChartGroupNode'
import OrgChartGroupEditModal from './OrgChartGroupEditModal'
import {
  BRANCHES,
  collectBranchNodesAndEdges,
  fetchOrgChartGroups,
  addOrgChartGroup,
  updateOrgChartGroup,
  removeOrgChartGroup,
  updateNodePosition,
} from '../../../lib/orgChart'
import { computeDagreLayout } from '../../../lib/orgChartLayout'

// Phase 2 (combined with the originally-separate department-heading phase — see project notes):
// drag-to-reposition (persisted to position_x/position_y) + org_chart_groups background headings.
// Node RESIZE stays Phase 4 — only headings get NodeResizer in this phase.
// 'heading', not 'group' — React Flow reserves the literal type name 'group' for its own
// built-in parent/group-node feature and applies a default CSS selected-state box-shadow
// (`.react-flow__node-group.selectable.selected`, a thin near-black outline) to ANY node whose
// `type` is that exact string, regardless of which custom renderer handles it. Using our own
// name avoids that collision entirely instead of fighting it with CSS overrides.
const nodeTypes = { orgNode: OrgChartFlowNode, label: OrgChartLabelNode, heading: OrgChartGroupNode }

const LABEL_OFFSET_Y = 40
const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1, minZoom: 0.6 }

export default function OrgChartTree({ roots, childrenByManager, onSelectNode, branch, canManage }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [groups, setGroups] = useState([])
  const [selectedGroup, setSelectedGroup] = useState(null)
  // Restricts fitView's bounding box to just the org-chart nodes (people + cross-branch labels),
  // never heading boxes — a heading placed even moderately far from the node cluster (completely
  // normal; see handleAddHeading's own default placement) would otherwise skew fitView's computed
  // center away from the actual hierarchy, pushing it toward one edge of the framed view instead
  // of centering it. undefined (not []) until first computed, so fitView falls back to "all
  // nodes" rather than "fit nothing" on the very first render before this is populated.
  const [fitNodeIds, setFitNodeIds] = useState(undefined)
  const seededRef = useRef(new Set())
  const rfInstanceRef = useRef(null)

  // Groups are a genuinely separate fetch from nodes/employees (no containment/ownership of
  // members — see project notes), scoped to the current branch, refetched on branch switch.
  const loadGroups = useCallback(async () => {
    try {
      setGroups(await fetchOrgChartGroups(branch))
    } catch (e) {
      console.error('Error loading org chart groups:', e)
    }
  }, [branch])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches groups fresh on mount and on every branch switch
    loadGroups()
  }, [loadGroups])

  const handleGroupResizeEnd = useCallback((groupId, params) => {
    updateOrgChartGroup(groupId, { positionX: params.x, positionY: params.y, width: params.width, height: params.height }).catch(
      (e) => console.error('Error saving heading size:', e)
    )
  }, [])

  // Rebuilds React Flow's node/edge state whenever the underlying data changes (branch switch,
  // an employee added/removed, groups loaded). Persisted position_x/position_y wins when present;
  // a node still missing one (brand new, or never seeded) falls back to a live dagre-computed
  // position so it always renders somewhere sensible instead of stacking at (0,0). A plain drag
  // (which doesn't change roots/childrenByManager/groups) never re-triggers this, so it can't
  // clobber a position the user just dragged into place.
  useEffect(() => {
    const { nodes: branchNodes, edges: branchEdges, depthById } = collectBranchNodesAndEdges(roots, childrenByManager)
    if (!branchNodes.length && !groups.length) {
      setNodes([])
      setEdges([])
      return
    }

    const dagrePositions = computeDagreLayout(branchNodes, branchEdges)
    const missing = []

    const orgNodes = branchNodes.map((n) => {
      const hasPersisted = n.position_x != null && n.position_y != null
      if (!hasPersisted) missing.push(n)
      const position = hasPersisted ? { x: n.position_x, y: n.position_y } : dagrePositions.get(n.id)
      return {
        id: String(n.id),
        type: 'orgNode',
        position,
        data: { row: n, depth: depthById.get(n.id) ?? 0, onSelect: onSelectNode },
        draggable: canManage,
        zIndex: 1,
      }
    })

    const labelNodes = []
    roots.forEach(({ row, crossBranch, managerLocation }) => {
      if (!crossBranch) return
      const own = orgNodes.find((fn) => fn.id === String(row.id))
      if (!own) return
      labelNodes.push({
        id: `label-${row.id}`,
        type: 'label',
        position: { x: own.position.x, y: own.position.y - LABEL_OFFSET_Y },
        data: { label: BRANCHES.find((b) => b.key === managerLocation)?.label || managerLocation },
        draggable: false,
        selectable: false,
        zIndex: 1,
      })
    })

    const groupNodes = groups.map((g) => ({
      id: `group-${g.id}`,
      type: 'heading',
      position: { x: g.position_x, y: g.position_y },
      style: { width: g.width, height: g.height },
      data: { group: g, canManage, onSelect: setSelectedGroup, onResizeEnd: (params) => handleGroupResizeEnd(g.id, params) },
      draggable: canManage,
      selectable: canManage,
      zIndex: 0,
    }))

    const flowEdges = branchEdges.map((e) => ({
      id: `e${e.source}-${e.target}`,
      source: String(e.source),
      target: String(e.target),
      type: 'smoothstep',
      style: { stroke: 'var(--color-text-muted)', strokeWidth: 1.5 },
    }))

    setNodes([...groupNodes, ...orgNodes, ...labelNodes])
    setEdges(flowEdges)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- drives fitViewOptions' `nodes` restriction, must stay in sync with the node rebuild above
    setFitNodeIds([...orgNodes, ...labelNodes].map((n) => ({ id: n.id })))

    // One-time seed: persists a sensible position for any node that doesn't have one yet, so
    // existing data (and every newly-added employee) carries forward instead of staying
    // un-positioned. Only a manager writes; a read-only viewer just sees the live dagre fallback
    // above, nothing gets persisted on their behalf.
    if (canManage && missing.length) {
      const toSeed = missing.filter((n) => !seededRef.current.has(n.id))
      if (toSeed.length) {
        toSeed.forEach((n) => seededRef.current.add(n.id))
        Promise.all(toSeed.map((n) => updateNodePosition(n.id, dagrePositions.get(n.id).x, dagrePositions.get(n.id).y))).catch((e) =>
          console.error('Error seeding org chart positions:', e)
        )
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setNodes/setEdges are stable; handleGroupResizeEnd is memoized
  }, [roots, childrenByManager, groups, canManage, onSelectNode])

  function handleNodeDragStop(_, node) {
    if (node.type === 'orgNode') {
      updateNodePosition(Number(node.id), node.position.x, node.position.y).catch((e) => console.error('Error saving position:', e))
    } else if (node.type === 'heading') {
      const groupId = Number(node.id.replace('group-', ''))
      updateOrgChartGroup(groupId, { positionX: node.position.x, positionY: node.position.y }).catch((e) =>
        console.error('Error saving heading position:', e)
      )
    }
  }

  async function handleAddHeading() {
    // "Somewhere sensible" — centered on the bounding box of whatever's currently rendered,
    // rather than requiring exact coordinates upfront.
    const xs = nodes.map((n) => n.position.x)
    const ys = nodes.map((n) => n.position.y)
    const centerX = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0
    const topY = ys.length ? Math.min(...ys) : 0
    try {
      const saved = await addOrgChartGroup({ branch, label: 'New Heading', positionX: centerX - 150, positionY: topY - 220 })
      setGroups((g) => [...g, saved])
      setSelectedGroup(saved)
    } catch (e) {
      console.error('Error adding heading:', e)
    }
  }

  async function handleSaveGroup({ label, bgColor, fontSize }) {
    await updateOrgChartGroup(selectedGroup.id, { label, bgColor, fontSize })
    setGroups((g) => g.map((x) => (x.id === selectedGroup.id ? { ...x, label, bg_color: bgColor, font_size: fontSize } : x)))
  }

  async function handleDeleteGroup() {
    await removeOrgChartGroup(selectedGroup.id)
    setGroups((g) => g.filter((x) => x.id !== selectedGroup.id))
  }

  if (!nodes.length) {
    return <div className="text-center py-16 text-text-muted text-[14px]">No employees in this chart yet.</div>
  }

  return (
    <div className="relative h-full w-full rounded-lg border border-border bg-surface-2/30 overflow-hidden">
      {/* key={branch} forces a full remount on branch switch, so the initial fitView re-runs against the new subtree */}
      <ReactFlow
        key={branch}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        onInit={(instance) => {
          rfInstanceRef.current = instance
        }}
        nodeTypes={nodeTypes}
        nodesDraggable={canManage}
        nodesConnectable={false}
        elementsSelectable={canManage}
        fitView
        fitViewOptions={{ ...FIT_VIEW_OPTIONS, nodes: fitNodeIds }}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background gap={24} color="var(--color-border)" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>

      <div className="absolute top-3 left-3 z-10 flex gap-2">
        {canManage && (
          <button
            type="button"
            onClick={handleAddHeading}
            className="text-[12px] font-semibold text-primary border border-primary/30 bg-surface rounded-md px-3 py-1.5 shadow-sm"
          >
            + Add Heading
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => rfInstanceRef.current?.fitView({ ...FIT_VIEW_OPTIONS, nodes: fitNodeIds })}
        className="absolute top-3 right-3 z-10 text-[12px] font-semibold text-primary border border-primary/30 bg-surface rounded-md px-3 py-1.5 shadow-sm"
      >
        ⤢ Fit to Screen
      </button>

      <OrgChartGroupEditModal
        group={selectedGroup}
        onClose={() => setSelectedGroup(null)}
        onSave={handleSaveGroup}
        onDelete={handleDeleteGroup}
      />
    </div>
  )
}
