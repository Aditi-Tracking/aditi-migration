import { useEffect, useMemo, useRef, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { branchLocation, bulkAddOrgChartNodes, rowLabel } from '../../../lib/orgChart'

// Manager-by-manager bulk workflow: HR picks one manager, checks all of that manager's direct
// reports from a filterable checklist, saves them all in one action, then repeats for the next
// manager — the intended way to populate the full hierarchy without one-by-one adds. The
// existing single "+ Add Employee" modal (OrgChartEmployeePicker) stays for one-off/mixed-manager
// additions and reparenting; this is additive, not a replacement.
export default function OrgChartBulkAddModal({ open, branch, rows, employeesList, existingEmpIds, onClose, onSaved }) {
  const [filterText, setFilterText] = useState('')
  const [selectedEmpIds, setSelectedEmpIds] = useState(() => new Set())
  const [displayRoleByEmpId, setDisplayRoleByEmpId] = useState({})

  const [managerSearch, setManagerSearch] = useState('')
  const [managerResultsOpen, setManagerResultsOpen] = useState(false)
  const [selectedManagerId, setSelectedManagerId] = useState(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [resultSummary, setResultSummary] = useState(null) // { successCount, failures }

  const managerBoxRef = useRef(null)

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the form whenever the modal opens
    setFilterText('')
    setSelectedEmpIds(new Set())
    setDisplayRoleByEmpId({})
    setManagerSearch('')
    setSelectedManagerId(null)
    setError('')
    setResultSummary(null)
  }, [open])

  useEffect(() => {
    function onDocClick(e) {
      if (managerBoxRef.current && !managerBoxRef.current.contains(e.target)) setManagerResultsOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  // Candidates: not yet in the chart, in the currently-open branch. Re-derives automatically
  // after a partial-failure save (existingEmpIds grows to include the newly-succeeded people,
  // so only the failed rows remain — a natural "retry just the failures" flow).
  const candidates = useMemo(
    () => employeesList.filter((e) => !existingEmpIds.has(e.Emp_id) && branchLocation(e.Location) === branch),
    [employeesList, existingEmpIds, branch]
  )

  const fq = filterText.toLowerCase().trim()
  const visible = fq
    ? candidates.filter((e) => (e.Employee_name || '').toLowerCase().includes(fq) || (e.Employee_Dept || '').toLowerCase().includes(fq))
    : candidates

  const managerScopeLocations = useMemo(() => new Set([branch, 'Mumbai']), [branch])
  const mq = managerSearch.toLowerCase().trim()
  const managerMatches = mq
    ? rows
        .filter((r) => managerScopeLocations.has(r.location))
        .filter((r) => rowLabel(r).toLowerCase().includes(mq))
        .slice(0, 20)
    : []

  function toggleRow(emp) {
    setSelectedEmpIds((prev) => {
      const next = new Set(prev)
      if (next.has(emp.Emp_id)) {
        next.delete(emp.Emp_id)
      } else {
        next.add(emp.Emp_id)
        setDisplayRoleByEmpId((r) => (r[emp.Emp_id] !== undefined ? r : { ...r, [emp.Emp_id]: emp.Employee_Dept || '' }))
      }
      return next
    })
  }

  function selectAllVisible() {
    setSelectedEmpIds((prev) => {
      const next = new Set(prev)
      visible.forEach((e) => next.add(e.Emp_id))
      return next
    })
    setDisplayRoleByEmpId((prevRoles) => {
      const next = { ...prevRoles }
      visible.forEach((e) => {
        if (next[e.Emp_id] === undefined) next[e.Emp_id] = e.Employee_Dept || ''
      })
      return next
    })
  }

  function selectNoneVisible() {
    setSelectedEmpIds((prev) => {
      const next = new Set(prev)
      visible.forEach((e) => next.delete(e.Emp_id))
      return next
    })
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
    if (!selectedEmpIds.size) return
    setSaving(true)
    setError('')
    setResultSummary(null)
    try {
      const entries = candidates
        .filter((e) => selectedEmpIds.has(e.Emp_id))
        .map((e) => ({ empId: e.Emp_id, name: e.Employee_name, displayRole: displayRoleByEmpId[e.Emp_id] ?? e.Employee_Dept ?? '' }))
      const { successCount, failures } = await bulkAddOrgChartNodes(entries, selectedManagerId)
      await onSaved()
      if (failures.length) {
        setResultSummary({ successCount, failures })
        setSelectedEmpIds(new Set(failures.map((f) => f.empId))) // keep only the failures selected, ready to retry
      } else {
        onClose()
      }
    } catch (e) {
      setError('❌ Failed to save: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-2xl" height="max-h-[85vh]">
      <div className="text-[15px] font-semibold text-text mb-1">Bulk Add Employees</div>
      <div className="text-[12.5px] text-text-muted mb-4">Pick a manager, check their direct reports, and save them all at once.</div>

      <div className="mb-3">
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Manager (applies to everyone checked below)</label>
        <div ref={managerBoxRef} className="relative">
          <input
            type="text"
            value={managerSearch}
            autoComplete="off"
            placeholder="Search manager, or leave blank for roots…"
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

      <div className="flex items-center gap-2 mb-2">
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter by name or department…"
          className="flex-1 box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none"
        />
        <button type="button" onClick={selectAllVisible} className="text-[12px] font-semibold text-primary shrink-0">
          Select All
        </button>
        <button type="button" onClick={selectNoneVisible} className="text-[12px] font-semibold text-text-muted shrink-0">
          Select None
        </button>
      </div>

      <div className="text-[11.5px] text-text-muted mb-2">
        {selectedEmpIds.size} selected · {visible.length} shown of {candidates.length} not yet in this chart
      </div>

      <div className="border border-border rounded-lg max-h-[320px] overflow-y-auto">
        {visible.length ? (
          visible.map((e) => {
            const checked = selectedEmpIds.has(e.Emp_id)
            return (
              <div key={e.Emp_id} className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-0">
                <input type="checkbox" checked={checked} onChange={() => toggleRow(e)} className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-text truncate" title={e.Employee_name}>
                    {e.Employee_name}
                  </div>
                  <div className="text-[11px] text-text-muted truncate">{e.Employee_Dept || ''}</div>
                </div>
                <input
                  type="text"
                  value={checked ? (displayRoleByEmpId[e.Emp_id] ?? '') : ''}
                  disabled={!checked}
                  onChange={(ev) => setDisplayRoleByEmpId((r) => ({ ...r, [e.Emp_id]: ev.target.value }))}
                  placeholder="Display role"
                  className="w-[150px] shrink-0 box-border px-2 py-1.5 rounded-md border border-border bg-surface text-text text-[12px] outline-none disabled:opacity-40"
                />
              </div>
            )
          })
        ) : (
          <div className="px-3 py-4 text-center text-[12.5px] text-text-muted">No matching employees</div>
        )}
      </div>

      {resultSummary && (
        <div className="mt-3 rounded-lg border border-danger/30 bg-danger-tint px-3 py-2.5 text-[12px] text-danger">
          Added {resultSummary.successCount}, failed {resultSummary.failures.length}:{' '}
          {resultSummary.failures.map((f) => f.name).join(', ')}. Failed rows stay checked below — fix and save again to retry.
        </div>
      )}
      {error && <div className="text-danger text-[12px] mt-2.5">{error}</div>}

      <div className="flex gap-3 mt-5">
        <button
          type="button"
          onClick={handleSave}
          disabled={!selectedEmpIds.size || saving}
          className="rounded-lg px-4 py-2 font-bold text-white bg-primary disabled:opacity-50"
        >
          {saving ? 'Saving…' : `+ Add ${selectedEmpIds.size || ''} Employee${selectedEmpIds.size === 1 ? '' : 's'}`}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 font-semibold border border-border text-text">
          Cancel
        </button>
      </div>
    </OverlayShell>
  )
}
