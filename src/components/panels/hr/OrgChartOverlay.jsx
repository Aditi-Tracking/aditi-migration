import { useCallback, useEffect, useMemo, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { useAuth } from '../../../context/AuthContext'
import { BRANCHES, buildTree, canManageOrgChart, fetchOrgChartData, getVisibleRoots, removeOrgChartNode, rowLabel } from '../../../lib/orgChart'
import OrgChartTree from './OrgChartTree'
import OrgChartEmployeePicker from './OrgChartEmployeePicker'
import OrgChartBulkAddModal from './OrgChartBulkAddModal'

// Full replacement of the old static CMS document picker (Head Office / Branch Office buttons
// opening uploaded PDFs) with a live, database-driven tree — see src/lib/orgChart.js for the
// schema/data-model notes. hrSectionId is no longer needed (nothing here reads content_nodes).
export default function OrgChartOverlay({ open, onClose }) {
  const { currentUser, permissions } = useAuth()
  const canManage = canManageOrgChart(currentUser, permissions)

  const [branch, setBranch] = useState('Mumbai')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [nodes, setNodes] = useState([])
  const [employeesById, setEmployeesById] = useState({})
  const [employeesList, setEmployeesList] = useState([])

  const [selectedNode, setSelectedNode] = useState(null)
  const [picker, setPicker] = useState(null) // { mode: 'add' | 'reparent', node? }
  const [bulkAddOpen, setBulkAddOpen] = useState(false)
  const [removing, setRemoving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchOrgChartData()
      setNodes(data.nodes)
      setEmployeesById(data.employeesById)
      setEmployeesList(data.employeesList)
    } catch (e) {
      setError('Error loading org chart: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset to Head Office each time the overlay opens
      setBranch('Mumbai')
      setSelectedNode(null)
      setPicker(null)
      setBulkAddOpen(false)
      load()
    }
  }, [open, load])

  const { rows, byId, childrenByManager } = useMemo(() => buildTree(nodes, employeesById), [nodes, employeesById])
  const roots = useMemo(() => getVisibleRoots(rows, byId, branch), [rows, byId, branch])
  const existingEmpIds = useMemo(() => new Set(rows.map((r) => r.emp_id)), [rows])

  async function handleRemove(node) {
    setRemoving(true)
    try {
      await removeOrgChartNode(node, rows)
      setSelectedNode(null)
      await load()
    } catch (e) {
      setError('Error removing employee: ' + e.message)
    } finally {
      setRemoving(false)
    }
  }

  if (!open) return null

  return (
    <>
      <OverlayShell open={open} onClose={onClose} maxWidth="max-w-[96vw]" height="h-[92vh]">
        <div className="flex flex-col h-full">
        <div className="flex items-center justify-between gap-3 mb-1 pr-8">
          <div>
            <div className="text-[17px] font-bold text-text">🏢 Organization Chart</div>
            <div className="text-[13.5px] text-text-muted mt-0.5">Aditi Tracking — team structure by office</div>
          </div>
          {canManage && (
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setBulkAddOpen(true)}
                className="text-[13px] font-semibold text-primary border border-primary/30 rounded-md px-3 py-1.5"
              >
                📋 Bulk Add
              </button>
              <button
                type="button"
                onClick={() => setPicker({ mode: 'add' })}
                className="text-[13px] font-semibold text-primary border border-primary/30 rounded-md px-3 py-1.5"
              >
                + Add Employee
              </button>
              <button
                type="button"
                onClick={() => setPicker({ mode: 'tba' })}
                className="text-[13px] font-semibold text-primary border border-primary/30 rounded-md px-3 py-1.5"
              >
                + Add TBA Role
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-4 mb-5">
          {BRANCHES.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setBranch(b.key)}
              className={`text-[13px] font-semibold rounded-md px-3 py-1.5 border transition-colors ${
                branch === b.key ? 'bg-primary text-white border-primary' : 'border-border text-text-muted hover:border-primary/40'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0">
          {loading && <div className="text-center py-16 text-text-muted text-[14.5px]">Loading…</div>}
          {!loading && error && <div className="text-center py-16 text-danger text-[14.5px]">⚠️ {error}</div>}
          {!loading && !error && (
            <OrgChartTree
              roots={roots}
              childrenByManager={childrenByManager}
              onSelectNode={setSelectedNode}
              branch={branch}
              canManage={canManage}
            />
          )}
        </div>
        </div>
      </OverlayShell>

      {selectedNode && (
        <OverlayShell open={!!selectedNode} onClose={() => setSelectedNode(null)} maxWidth="max-w-sm">
          <div className="text-[16px] font-bold text-text mb-1 pr-8">{rowLabel(selectedNode)}</div>
          <div className="text-[13.5px] text-text-muted mb-4">
            {selectedNode.is_tba ? 'Vacant — no employee assigned' : selectedNode.display_role || 'No role set'}
          </div>
          <div className="text-[12.5px] text-text-muted mb-5">
            {!selectedNode.is_tba && selectedNode.department ? `${selectedNode.department} · ` : ''}
            {BRANCHES.find((b) => b.key === selectedNode.location)?.label || selectedNode.location}
          </div>
          {canManage && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPicker({ mode: 'reparent', node: selectedNode })}
                className="rounded-lg px-4 py-2 font-semibold text-primary border border-primary/30"
              >
                {selectedNode.is_tba ? 'Edit / Fill Role' : 'Edit Manager / Role'}
              </button>
              <button
                type="button"
                onClick={() => handleRemove(selectedNode)}
                disabled={removing}
                className="rounded-lg px-4 py-2 font-semibold text-danger border border-danger/30 disabled:opacity-50"
              >
                {removing ? 'Removing…' : 'Remove'}
              </button>
            </div>
          )}
        </OverlayShell>
      )}

      {picker && (
        <OrgChartEmployeePicker
          open={!!picker}
          mode={picker.mode}
          branch={branch}
          rows={rows}
          childrenByManager={childrenByManager}
          employeesList={employeesList}
          existingEmpIds={existingEmpIds}
          node={picker.node}
          onClose={() => setPicker(null)}
          onSaved={async () => {
            await load()
            setSelectedNode(null)
          }}
        />
      )}

      <OrgChartBulkAddModal
        open={bulkAddOpen}
        branch={branch}
        rows={rows}
        employeesList={employeesList}
        existingEmpIds={existingEmpIds}
        onClose={() => setBulkAddOpen(false)}
        onSaved={load}
      />
    </>
  )
}
