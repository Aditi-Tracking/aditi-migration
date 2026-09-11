import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import {
  FREQUENCY_OPTIONS,
  MAX_OCCURRENCES_PER_BATCH,
  buildPreviewRows,
  dateToISO,
  endOfMonthInput,
  fetchAutoBranchId,
  fetchExistingDatesByTaskName,
  fetchHolidaysByLocation,
  fetchSchedulerEmployees,
  generateOccurrences,
  groupPreviewRowsForSubmit,
  holidaySetForLocation,
  parseDateInput,
  submitGeneratedTasks,
} from '../../../lib/taskScheduler'

function blankRow(id) {
  return { id, taskName: '', frequency: 'D', start: '', endMonth: '' }
}

// Ported from old-portal/js/taskScheduler.js. One employee + branch is
// chosen once per batch; underneath that sits a repeatable list of task
// rows, so a single "Generate" click can create several different
// recurring tasks for the same person at once. Nothing here writes to the
// database directly — the actual INSERT happens server-side via
// submitGeneratedTasks (backend/api.py: POST /api/admin/generate-checklist-tasks),
// which re-checks the caller is MIS/owner (or granted can_use_task_scheduler)
// before touching anything. Task rows are plain React state here (unlike
// production's DOM-node-per-row approach, which existed only to avoid
// vanilla JS re-render losing focus — not needed in React).
export default function TaskSchedulerTab({ onGenerated }) {
  const { currentUser } = useAuth()

  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [employees, setEmployees] = useState([])
  const [holidaysByLoc, setHolidaysByLoc] = useState({})

  const [empSearch, setEmpSearch] = useState('')
  const [empResultsOpen, setEmpResultsOpen] = useState(false)
  const [selectedEmp, setSelectedEmp] = useState(null)
  const [branchId, setBranchId] = useState('')
  const empBoxRef = useRef(null)

  const rowIdSeq = useRef(1)
  const [taskRows, setTaskRows] = useState([blankRow(1)])

  const [formError, setFormError] = useState('')
  const [checkingPreview, setCheckingPreview] = useState(false)
  const [previewRows, setPreviewRows] = useState([])
  const [previewVisible, setPreviewVisible] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState(null) // { text, tone: 'muted'|'success'|'danger' }

  // Lazy-load — mirrors tsInit()'s no-op-on-repeat-visits guard. This
  // component stays mounted (hidden, not unmounted) across tab switches —
  // see TaskChecklistPanel — so this effect only ever runs once per session.
  useEffect(() => {
    if (loaded) return
    let cancelled = false
    Promise.all([fetchSchedulerEmployees(), fetchHolidaysByLocation()])
      .then(([emps, holidays]) => {
        if (cancelled) return
        setEmployees(emps)
        setHolidaysByLoc(holidays)
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setLoadError('❌ Failed to load employee/holiday data — try reopening this tab.')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot, guarded by `loaded`
  }, [])

  // Close the employee results dropdown when clicking anywhere else.
  useEffect(() => {
    function onDocClick(e) {
      if (empBoxRef.current && !empBoxRef.current.contains(e.target)) setEmpResultsOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  function invalidatePreview() {
    setPreviewRows([])
    setPreviewVisible(false)
  }

  const empMatches = empSearch.trim()
    ? employees.filter((e) => String(e.Employee_name || '').toLowerCase().includes(empSearch.trim().toLowerCase())).slice(0, 20)
    : []

  async function handleSelectEmployee(emp) {
    setSelectedEmp(emp)
    setEmpSearch(emp.Employee_name || '')
    setEmpResultsOpen(false)
    invalidatePreview()
    const autoBranchId = await fetchAutoBranchId(emp.Emp_id)
    if (autoBranchId != null) setBranchId(String(autoBranchId))
  }

  function updateRow(id, patch) {
    setTaskRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    invalidatePreview()
  }

  function addRow() {
    rowIdSeq.current += 1
    setTaskRows((rows) => [...rows, blankRow(rowIdSeq.current)])
    invalidatePreview()
  }

  function removeRow(id) {
    setTaskRows((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.id !== id)))
    invalidatePreview()
  }

  async function handlePreview() {
    setFormError('')
    invalidatePreview()

    if (!selectedEmp) {
      setFormError('⚠️ Select an employee first.')
      return
    }

    const taskDefs = []
    for (let i = 0; i < taskRows.length; i++) {
      const row = taskRows[i]
      const taskName = row.taskName.trim()
      if (!taskName || !row.start || !row.endMonth) {
        setFormError(`⚠️ Row ${i + 1}: Task Name, Start Date, and Generate-Through are all required.`)
        return
      }
      const startDate = parseDateInput(row.start)
      const endDate = endOfMonthInput(row.endMonth)
      if (endDate < startDate) {
        setFormError(`⚠️ Row ${i + 1} ("${taskName}"): "Generate Through" is before the Start Date.`)
        return
      }
      taskDefs.push({ taskName, frequency: row.frequency, startDate, endDate })
    }

    const holidaySet = holidaySetForLocation(holidaysByLoc, selectedEmp.Location)
    const perTask = taskDefs.map((t) => ({
      ...t,
      occurrences: generateOccurrences(t.frequency, t.startDate, t.endDate, holidaySet),
    }))

    const totalCount = perTask.reduce((sum, t) => sum + t.occurrences.length, 0)
    if (totalCount === 0) {
      setFormError('⚠️ No dates were generated — every candidate landed on a non-working day, or the ranges are empty.')
      return
    }
    if (totalCount > MAX_OCCURRENCES_PER_BATCH) {
      setFormError(
        `⚠️ This would generate ${totalCount} rows in one batch — narrow the date ranges (max ${MAX_OCCURRENCES_PER_BATCH} per "Generate" click).`
      )
      return
    }

    setCheckingPreview(true)
    try {
      const existingByName = await fetchExistingDatesByTaskName(
        selectedEmp.Emp_id,
        taskDefs.map((t) => t.taskName)
      )
      setPreviewRows(buildPreviewRows(perTask, existingByName))
      setPreviewVisible(true)
    } finally {
      setCheckingPreview(false)
    }
  }

  async function handleConfirm() {
    if (!previewRows.length) return
    const dupCount = previewRows.filter((r) => r.isDuplicate).length
    if (dupCount > 0) {
      const proceed = window.confirm(`${dupCount} of these dates already have a matching task. Insert anyway?`)
      if (!proceed) return
    }

    setSubmitting(true)
    setSubmitStatus({ text: '⏳ Inserting...', tone: 'muted' })
    try {
      const grouped = groupPreviewRowsForSubmit(previewRows)
      const data = await submitGeneratedTasks({
        empId: selectedEmp.Emp_id,
        branchId,
        tasks: grouped,
        callerEmail: currentUser?.email,
      })
      setSubmitStatus({
        text: `✅ ${data.inserted} task row(s) created across ${grouped.length} task(s).${data.warning ? ` (${data.warning})` : ''}`,
        tone: 'success',
      })

      // Reset for the next batch — employee/branch stay as-is (MIS is
      // likely about to add more tasks for the same person); task rows
      // reset to one blank row so a stale preview can't be re-submitted.
      invalidatePreview()
      rowIdSeq.current += 1
      setTaskRows([blankRow(rowIdSeq.current)])

      onGenerated?.()
    } catch (e) {
      setSubmitStatus({ text: `❌ ${e.message}`, tone: 'danger' })
    } finally {
      setSubmitting(false)
    }
  }

  const dupCount = previewRows.filter((r) => r.isDuplicate).length
  const shiftCount = previewRows.filter((r) => r.shiftedFrom).length
  const taskCount = new Set(previewRows.map((r) => r.taskName)).size

  return (
    <div>
      <div className="text-[14.5px] font-semibold text-text mb-3">Generate Recurring Tasks</div>

      <div className="rounded-xl border border-border bg-surface p-4 mb-5 max-w-[920px]">
        {loadError && <div className="text-[12.5px] text-danger mb-3">{loadError}</div>}

        <div className="flex flex-wrap gap-3 mb-3.5">
          <div className="flex-[2] min-w-[220px] relative" ref={empBoxRef}>
            <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Employee</label>
            <input
              type="text"
              placeholder="🔍 Type a name..."
              autoComplete="off"
              value={empSearch}
              onChange={(e) => {
                setEmpSearch(e.target.value)
                setEmpResultsOpen(true)
              }}
              onFocus={() => setEmpResultsOpen(true)}
              className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none"
            />
            {empResultsOpen && empSearch.trim() && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 max-h-[220px] overflow-y-auto bg-surface border border-border rounded-lg shadow-lg">
                {empMatches.length ? (
                  empMatches.map((e) => (
                    <div
                      key={e.Emp_id}
                      onClick={() => handleSelectEmployee(e)}
                      className="px-3 py-2 cursor-pointer border-b border-border last:border-0 hover:bg-surface-2"
                    >
                      <div className="text-[12.5px] font-semibold text-text">{e.Employee_name || '—'}</div>
                      <div className="text-[11px] text-text-muted">
                        {e.Employee_Dept || ''}
                        {e.Location ? ' · ' + e.Location : ''}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-2.5 text-[12px] text-text-muted">No match</div>
                )}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Branch ID</label>
            <input
              type="number"
              placeholder="auto-fills from employee"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none"
            />
          </div>
        </div>

        <label className="block text-[11.5px] font-semibold text-text-muted mb-1.5">Tasks to Generate</label>
        <div className="overflow-x-auto mb-2">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="text-left">
                <th className="px-2 py-1.5 text-[10.5px] text-text-muted">TASK NAME</th>
                <th className="px-2 py-1.5 text-[10.5px] text-text-muted min-w-[170px]">FREQUENCY</th>
                <th className="px-2 py-1.5 text-[10.5px] text-text-muted min-w-[130px]">START DATE</th>
                <th className="px-2 py-1.5 text-[10.5px] text-text-muted min-w-[130px]">GENERATE THROUGH</th>
                <th className="px-2 py-1.5 w-[30px]" />
              </tr>
            </thead>
            <tbody>
              {taskRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      placeholder="e.g. Weekly Review Call"
                      value={row.taskName}
                      onChange={(e) => updateRow(row.id, { taskName: e.target.value })}
                      className="w-full box-border px-2.5 py-1.5 rounded-md border border-border bg-surface-2 text-text text-[12.5px] outline-none"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <select
                      value={row.frequency}
                      onChange={(e) => updateRow(row.id, { frequency: e.target.value })}
                      className="w-full box-border px-2.5 py-1.5 rounded-md border border-border bg-surface-2 text-text text-[12.5px] outline-none cursor-pointer"
                    >
                      {FREQUENCY_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="date"
                      value={row.start}
                      onChange={(e) => updateRow(row.id, { start: e.target.value })}
                      className="w-full box-border px-2 py-1.5 rounded-md border border-border bg-surface-2 text-text text-[12.5px] outline-none cursor-pointer"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="month"
                      value={row.endMonth}
                      onChange={(e) => updateRow(row.id, { endMonth: e.target.value })}
                      className="w-full box-border px-2 py-1.5 rounded-md border border-border bg-surface-2 text-text text-[12.5px] outline-none cursor-pointer"
                    />
                  </td>
                  <td className="px-2 py-1 text-center">
                    {taskRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        title="Remove this task"
                        className="w-[26px] h-[26px] rounded-md border border-danger/30 bg-danger-tint text-danger text-[12px]"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="text-[12px] font-semibold text-text-muted border border-dashed border-border rounded-lg px-3.5 py-1.5 mb-3.5"
        >
          ➕ Add Another Task
        </button>

        {formError && <div className="text-[12px] text-danger mb-2.5">{formError}</div>}

        <button
          type="button"
          onClick={handlePreview}
          disabled={checkingPreview}
          className="bg-primary text-white rounded-lg px-5 py-2.5 text-[13px] font-bold disabled:opacity-60"
        >
          {checkingPreview ? '⏳ Checking…' : '👁 Preview Dates'}
        </button>
      </div>

      {previewVisible && (
        <div>
          <div className="text-[14.5px] font-semibold text-text mb-2.5">Preview — Review Before Inserting</div>
          <div className="text-[12.5px] text-text-muted mb-3">
            {previewRows.length} task row(s) across {taskCount} task{taskCount > 1 ? 's' : ''} will be created.
            {shiftCount ? ` ${shiftCount} shifted off a Sunday/holiday.` : ''}
          </div>

          {dupCount > 0 && (
            <div className="rounded-lg border border-danger/30 bg-danger-tint text-danger text-[12.5px] px-4 py-3 mb-3.5">
              ⚠️ {dupCount} of these dates already have a matching task for this employee — highlighted below.
              Inserting anyway will create a second row on that date.
            </div>
          )}

          <div className="max-w-[720px] rounded-lg border border-border overflow-hidden">
            <div className="overflow-y-auto max-h-[400px]">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="bg-surface-2 border-b border-border text-left">
                    <th className="px-2.5 py-1.5">#</th>
                    <th className="px-2.5 py-1.5">Task</th>
                    <th className="px-2.5 py-1.5">Planned Date</th>
                    <th className="px-2.5 py-1.5">Day</th>
                    <th className="px-2.5 py-1.5">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => {
                    const dayName = r.date.toLocaleDateString('en-IN', { weekday: 'short' })
                    let note = ''
                    if (r.shiftedFrom) note += `shifted from ${r.shiftedFrom} (Sun/holiday)`
                    if (r.isDuplicate) note += (note ? ' · ' : '') + '⚠️ duplicate'
                    return (
                      <tr key={i} className={`border-b border-border last:border-0 ${r.isDuplicate ? 'bg-danger-tint' : ''}`}>
                        <td className="px-2.5 py-1.5 text-text-muted">{i + 1}</td>
                        <td className="px-2.5 py-1.5 font-medium text-text">{r.taskName}</td>
                        <td className="px-2.5 py-1.5 text-text-muted">{dateToISO(r.date)}</td>
                        <td className="px-2.5 py-1.5 text-text-muted">{dayName}</td>
                        <td className={`px-2.5 py-1.5 text-[11px] ${r.isDuplicate ? 'text-danger' : 'text-text-muted'}`}>{note || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center gap-2.5 mt-4">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="bg-[#00d4aa] text-[#04231d] rounded-lg px-5 py-2.5 text-[13px] font-bold disabled:opacity-60"
            >
              ✅ Confirm &amp; Insert
            </button>
            {submitStatus && (
              <span
                className={`text-[12.5px] ${
                  submitStatus.tone === 'success' ? 'text-[#00d4aa]' : submitStatus.tone === 'danger' ? 'text-danger' : 'text-text-muted'
                }`}
              >
                {submitStatus.text}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
