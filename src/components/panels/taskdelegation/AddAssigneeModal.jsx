import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import OverlayShell from '../../shared/OverlayShell'
import { addAssignee, fetchAssignableEmployees } from '../../../lib/taskDelegation'

// Ported from old-portal/js/taskDelegation.js's tdOpenAssigneeModal/tdFilterEmployeeOptions/
// tdSelectEmployeeOption/tdSaveAssignee. Only ACTIVE assignees are excluded from the search results
// (matches production exactly) — a previously-deactivated employee can be re-added, which creates a
// second delegation_assignees row for them rather than reactivating the old one. Not "fixed" here;
// that's how production behaves.
export default function AddAssigneeModal({ open, assignees, onClose, onSaved }) {
  const { currentUser } = useAuth()
  const [employees, setEmployees] = useState(null)
  const [search, setSearch] = useState('')
  const [resultsOpen, setResultsOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the form whenever the modal opens, not a render loop
    setSearch('')
    setSelected(null)
    setError('')
    setResultsOpen(false)
    if (employees == null) {
      fetchAssignableEmployees().then(setEmployees)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lazily fetched once, cached for the modal's lifetime
  }, [open])

  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setResultsOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  const activeEmails = new Set(assignees.filter((a) => a.is_active).map((a) => String(a.email_id || '').toLowerCase()))
  const q = search.toLowerCase().trim()
  const matches = q
    ? (employees || [])
        .filter((e) => !activeEmails.has(String(e.Email_Id || '').toLowerCase()))
        .filter((e) => (e.Employee_name || '').toLowerCase().includes(q) || (e.Employee_Dept || '').toLowerCase().includes(q))
        .slice(0, 20)
    : []

  function handleSelect(emp) {
    setSelected(emp)
    setSearch(emp.Employee_name)
    setResultsOpen(false)
  }

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      const saved = await addAssignee(selected, currentUser.email)
      onSaved(saved)
    } catch (e) {
      setError('❌ Failed to add assignee: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-md">
      <div className="text-[15px] font-semibold text-text mb-4">Add Assignee</div>

      <div className="mb-1">
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Employee *</label>
        <div ref={boxRef} className="relative">
          <input
            type="text"
            value={search}
            autoComplete="off"
            placeholder="Search by name or department…"
            onChange={(e) => {
              setSearch(e.target.value)
              setSelected(null)
              setResultsOpen(true)
            }}
            onFocus={() => setResultsOpen(true)}
            className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none"
          />
          {resultsOpen && q && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 max-h-[220px] overflow-y-auto bg-surface border border-border rounded-lg shadow-lg">
              {matches.length ? (
                matches.map((e) => (
                  <div
                    key={e.Emp_id}
                    onClick={() => handleSelect(e)}
                    className="px-3 py-2 cursor-pointer border-b border-border last:border-0 hover:bg-surface-2"
                  >
                    <div className="text-[12.5px] font-semibold text-text">{e.Employee_name}</div>
                    <div className="text-[11px] text-text-muted">
                      {e.Employee_Dept || ''} · {e.Email_Id || ''}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-3 py-2.5 text-[12px] text-text-muted">No matching employees</div>
              )}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="mt-2.5 px-3 py-2.5 rounded-lg bg-surface-2 text-[12.5px]">
          Selected: <span className="font-bold">{selected.Employee_name} ({selected.Email_Id})</span>
        </div>
      )}

      {error && <div className="text-danger text-[12px] mt-2.5">{error}</div>}

      <div className="flex gap-3 mt-5">
        <button
          type="button"
          onClick={handleSave}
          disabled={!selected || saving}
          className="rounded-lg px-4 py-2 font-bold text-white bg-primary disabled:opacity-50"
        >
          {saving ? 'Saving…' : '+ Add Assignee'}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 font-semibold border border-border text-text">
          Cancel
        </button>
      </div>
    </OverlayShell>
  )
}
