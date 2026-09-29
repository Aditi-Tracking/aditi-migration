import { useEffect, useMemo, useRef, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { addOrgChartNode, branchLocation, getDescendantIds, rowLabel, updateOrgChartNode } from '../../../lib/orgChart'

// Employee search (add mode, and reparent mode when the node being edited is a TBA row — the
// fill-in-place conversion) mirrors AddAssigneeModal.jsx's search-input/dropdown pattern, scoped
// to the currently-open branch's Location — but queries the already-fetched Employee_details list
// (passed down from OrgChartOverlay) rather than re-fetching.
// Manager search always includes Head Office (Mumbai) alongside the current branch, since
// cross-branch management (a branch employee reporting to someone at HO) is expected — one
// `scopeLocations`-style filter handles both the branch-only "add" search and the branch+HQ
// "manager" search, just called with a different location set. A TBA row is a perfectly valid
// manager candidate (a placeholder "Support Head" can have real reports) — rowLabel() (name if
// real, else display_role) is used everywhere a row's human-readable label is needed, since a TBA
// row's `name` is null.
export default function OrgChartEmployeePicker({
  open,
  mode, // 'add' | 'reparent' | 'tba'
  branch,
  rows,
  childrenByManager,
  employeesList,
  existingEmpIds,
  node, // reparent/tba-fill mode only
  onClose,
  onSaved,
}) {
  const isFillableTBA = mode === 'reparent' && node?.is_tba
  const showEmployeeSearch = mode === 'add' || isFillableTBA

  const [employeeSearch, setEmployeeSearch] = useState('')
  const [employeeResultsOpen, setEmployeeResultsOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState(null)

  const [managerSearch, setManagerSearch] = useState('')
  const [managerResultsOpen, setManagerResultsOpen] = useState(false)
  const [selectedManagerId, setSelectedManagerId] = useState(null)

  const [displayRole, setDisplayRole] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const employeeBoxRef = useRef(null)
  const managerBoxRef = useRef(null)

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the form whenever the modal opens
    setEmployeeSearch('')
    setEmployeeResultsOpen(false)
    setSelectedEmployee(null)
    setError('')
    if (mode === 'reparent' && node) {
      const mgr = node.manager_id ? rows.find((r) => r.id === node.manager_id) : null
      setSelectedManagerId(node.manager_id || null)
      setManagerSearch(mgr ? rowLabel(mgr) : '')
      setDisplayRole(node.display_role || '')
    } else {
      setSelectedManagerId(null)
      setManagerSearch('')
      setDisplayRole('')
    }
    setManagerResultsOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only keyed to the modal opening
  }, [open, mode, node])

  useEffect(() => {
    function onDocClick(e) {
      if (employeeBoxRef.current && !employeeBoxRef.current.contains(e.target)) setEmployeeResultsOpen(false)
      if (managerBoxRef.current && !managerBoxRef.current.contains(e.target)) setManagerResultsOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  // Reparenting excludes the node itself and its own descendants (would create a cycle).
  const excludedManagerIds = useMemo(() => {
    if (mode !== 'reparent' || !node) return new Set()
    return new Set([node.id, ...getDescendantIds(node.id, childrenByManager)])
  }, [mode, node, childrenByManager])

  const managerScopeLocations = useMemo(() => new Set([branch, 'Mumbai']), [branch])

  const eq = employeeSearch.toLowerCase().trim()
  const employeeMatches =
    showEmployeeSearch && eq
      ? employeesList
          .filter((e) => !existingEmpIds.has(e.Emp_id))
          .filter((e) => branchLocation(e.Location) === branch)
          .filter((e) => (e.Employee_name || '').toLowerCase().includes(eq) || (e.Employee_Dept || '').toLowerCase().includes(eq))
          .slice(0, 20)
      : []

  const mq = managerSearch.toLowerCase().trim()
  const managerMatches = mq
    ? rows
        .filter((r) => managerScopeLocations.has(r.location))
        .filter((r) => !excludedManagerIds.has(r.id))
        .filter((r) => rowLabel(r).toLowerCase().includes(mq))
        .slice(0, 20)
    : []

  function handleSelectEmployee(emp) {
    setSelectedEmployee(emp)
    setEmployeeSearch(emp.Employee_name)
    setEmployeeResultsOpen(false)
    if (!displayRole) setDisplayRole(emp.Employee_Dept || '')
  }

  function handleSelectManager(mgrRow) {
    setSelectedManagerId(mgrRow.id)
    setManagerSearch(rowLabel(mgrRow))
    setManagerResultsOpen(false)
  }

  function clearManager() {
    setSelectedManagerId(null)
    setManagerSearch('')
  }

  async function handleSave() {
    if (mode === 'add' && !selectedEmployee) return
    if (mode === 'tba' && !displayRole.trim()) return
    setSaving(true)
    setError('')
    try {
      if (mode === 'add') {
        await addOrgChartNode({ empId: selectedEmployee.Emp_id, managerId: selectedManagerId, displayRole })
      } else if (mode === 'tba') {
        await addOrgChartNode({ empId: null, managerId: selectedManagerId, displayRole, branch })
      } else {
        // isFillableTBA + a selected employee converts the TBA row in place (UPDATE emp_id on the
        // same node id), preserving position_x/position_y and any org_chart_edges — not a
        // delete+recreate. Leaving the employee field empty just edits manager/role as before.
        await updateOrgChartNode(node.id, {
          managerId: selectedManagerId,
          displayRole,
          ...(isFillableTBA && selectedEmployee ? { empId: selectedEmployee.Emp_id } : {}),
        })
      }
      await onSaved()
      onClose()
    } catch (e) {
      setError('❌ Failed to save: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const title = mode === 'add' ? 'Add Employee to Chart' : mode === 'tba' ? 'Add TBA Role' : 'Edit Manager / Role'
  const saveLabel = saving ? 'Saving…' : mode === 'add' ? '+ Add to Chart' : mode === 'tba' ? '+ Add TBA Role' : 'Save'
  const saveDisabled = saving || (mode === 'add' && !selectedEmployee) || (mode === 'tba' && !displayRole.trim())

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-md">
      <div className="text-[15px] font-semibold text-text mb-4">{title}</div>

      {showEmployeeSearch && (
        <div className="mb-3">
          <label className="block text-[11.5px] font-semibold text-text-muted mb-1">
            Employee {mode === 'add' ? '*' : '(optional — fills this TBA role)'}
          </label>
          <div ref={employeeBoxRef} className="relative">
            <input
              type="text"
              value={employeeSearch}
              autoComplete="off"
              placeholder="Search by name or department…"
              onChange={(e) => {
                setEmployeeSearch(e.target.value)
                setSelectedEmployee(null)
                setEmployeeResultsOpen(true)
              }}
              onFocus={() => setEmployeeResultsOpen(true)}
              className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none"
            />
            {employeeResultsOpen && eq && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 max-h-[200px] overflow-y-auto bg-surface border border-border rounded-lg shadow-lg">
                {employeeMatches.length ? (
                  employeeMatches.map((e) => (
                    <div
                      key={e.Emp_id}
                      onClick={() => handleSelectEmployee(e)}
                      className="px-3 py-2 cursor-pointer border-b border-border last:border-0 hover:bg-surface-2"
                    >
                      <div className="text-[12.5px] font-semibold text-text">{e.Employee_name}</div>
                      <div className="text-[11px] text-text-muted">{e.Employee_Dept || ''}</div>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-2.5 text-[12px] text-text-muted">No matching employees</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mb-3">
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Manager</label>
        <div ref={managerBoxRef} className="relative">
          <input
            type="text"
            value={managerSearch}
            autoComplete="off"
            placeholder="Search manager, or leave blank for a root…"
            onChange={(e) => {
              setManagerSearch(e.target.value)
              setSelectedManagerId(null)
              setManagerResultsOpen(true)
            }}
            onFocus={() => setManagerResultsOpen(true)}
            className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none"
          />
          {managerSearch && (
            <button
              type="button"
              onClick={clearManager}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted text-[12px]"
            >
              ✕
            </button>
          )}
          {managerResultsOpen && mq && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 max-h-[200px] overflow-y-auto bg-surface border border-border rounded-lg shadow-lg">
              {managerMatches.length ? (
                managerMatches.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => handleSelectManager(r)}
                    className="px-3 py-2 cursor-pointer border-b border-border last:border-0 hover:bg-surface-2"
                  >
                    <div className="text-[12.5px] font-semibold text-text">
                      {rowLabel(r)}
                      {r.is_tba ? ' (TBA)' : ''}
                    </div>
                    <div className="text-[11px] text-text-muted">
                      {r.is_tba ? '' : `${r.display_role || ''} · `}
                      {r.location}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-3 py-2.5 text-[12px] text-text-muted">No matching managers</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mb-1">
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Display Role {mode === 'tba' ? '*' : ''}</label>
        <input
          type="text"
          value={displayRole}
          onChange={(e) => setDisplayRole(e.target.value)}
          placeholder="e.g. Sales Executive"
          className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none"
        />
      </div>

      {error && <div className="text-danger text-[12px] mt-2.5">{error}</div>}

      <div className="flex gap-3 mt-5">
        <button
          type="button"
          onClick={handleSave}
          disabled={saveDisabled}
          className="rounded-lg px-4 py-2 font-bold text-white bg-primary disabled:opacity-50"
        >
          {saveLabel}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 font-semibold border border-border text-text">
          Cancel
        </button>
      </div>
    </OverlayShell>
  )
}
