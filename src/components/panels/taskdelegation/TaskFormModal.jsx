import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import OverlayShell from '../../shared/OverlayShell'
import {
  assigneeEmailsForTask,
  createOneTimeTask,
  createRecurringTask,
  sendAssignmentEmail,
  updateTask,
} from '../../../lib/taskDelegation'

const FREQUENCIES = [
  { value: 'one_time', label: 'One-time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

// Ported from old-portal/js/taskDelegation.js's tdOpenTaskModal/tdSaveTask/
// tdToggleAssigneeMultiDropdown/tdOnFrequencyChange. Recurrence (frequency/start/end date) is only
// configurable at creation — editing an existing task never touches
// delegation_recurring_templates, matching production (the frequency row is hidden entirely when
// editing).
export default function TaskFormModal({ open, editingTask, assignees, taskAssigneeMap, onClose, onSaved }) {
  const { currentUser } = useAuth()
  const isEditing = !!editingTask
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [frequency, setFrequency] = useState('one_time')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedEmails, setSelectedEmails] = useState([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dropdownRef = useRef(null)

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the form whenever the modal opens or the target task changes, not a render loop
    setError('')
    setDropdownOpen(false)
    if (editingTask) {
      setTitle(editingTask.task_title || '')
      setDescription(editingTask.task_description || '')
      setDueDate(editingTask.due_date || '')
      setFrequency('one_time')
      setSelectedEmails(assigneeEmailsForTask(editingTask, taskAssigneeMap))
    } else {
      setTitle('')
      setDescription('')
      setDueDate('')
      setStartDate('')
      setEndDate('')
      setFrequency('one_time')
      setSelectedEmails([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the modal opens or the target task changes
  }, [open, editingTask])

  useEffect(() => {
    function onDocClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  // If the task is currently assigned to someone who's since been deactivated, the active-only
  // list would silently drop them from the selection on open — append them explicitly, matching
  // production's tdOpenTaskModal.
  let options = assignees.filter((a) => a.is_active)
  const currentEmails = editingTask ? assigneeEmailsForTask(editingTask, taskAssigneeMap) : []
  currentEmails.forEach((email) => {
    if (!options.some((a) => a.email_id === email)) {
      const known = assignees.find((a) => a.email_id === email)
      options = [...options, { email_id: email, employee_name: (known ? known.employee_name : email) + ' (inactive)' }]
    }
  })

  function toggleEmail(email, checked) {
    setSelectedEmails((prev) => (checked ? [...prev, email] : prev.filter((e) => e !== email)))
  }

  const isRecurring = !isEditing && frequency !== 'one_time'

  function handleFrequencyChange(value) {
    setFrequency(value)
    if (value !== 'one_time' && !startDate) setStartDate(dueDate || '')
  }

  async function handleSave() {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('❌ Task title is required.')
      return
    }
    if (!selectedEmails.length) {
      setError('❌ Please choose at least one assignee.')
      return
    }
    let effectiveStart = dueDate || null
    let effectiveEnd = null
    if (isRecurring) {
      effectiveStart = startDate || dueDate
      effectiveEnd = endDate || null
      if (!effectiveStart) {
        setError('❌ Please choose a start date.')
        return
      }
    }

    setSaving(true)
    setError('')
    try {
      if (isEditing) {
        const prevEmails = assigneeEmailsForTask(editingTask, taskAssigneeMap)
        const { payload, toAdd } = await updateTask(
          editingTask.id,
          { title: trimmedTitle, description: description.trim(), dueDate: dueDate || null },
          { prevEmails, newEmails: selectedEmails }
        )
        // Only the newly-added assignees get notified — anyone already on the task doesn't get a
        // duplicate email just because it was edited.
        if (toAdd.length) sendAssignmentEmail({ ...editingTask, ...payload }, toAdd, assignees, currentUser.email)
        onSaved({ mode: 'edit', taskId: editingTask.id, payload, assigneeEmails: selectedEmails })
      } else if (frequency === 'one_time') {
        const saved = await createOneTimeTask({
          title: trimmedTitle,
          description: description.trim(),
          dueDate: dueDate || null,
          assignees: selectedEmails,
          assignedByEmail: currentUser.email,
        })
        sendAssignmentEmail(saved, selectedEmails, assignees, currentUser.email)
        onSaved({ mode: 'create', task: saved, assigneeEmails: selectedEmails })
      } else {
        const saved = await createRecurringTask({
          title: trimmedTitle,
          description: description.trim(),
          frequency,
          startDate: effectiveStart,
          endDate: effectiveEnd,
          assignees: selectedEmails,
          createdByEmail: currentUser.email,
        })
        sendAssignmentEmail(saved, selectedEmails, assignees, currentUser.email)
        onSaved({ mode: 'create', task: saved, assigneeEmails: selectedEmails })
      }
    } catch (e) {
      setError('❌ Failed to save task: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const selectedLabel = selectedEmails.length
    ? selectedEmails
        .map((email) => {
          const a = options.find((o) => o.email_id === email)
          return a ? a.employee_name.replace(/ \(inactive\)$/, '') : email
        })
        .join(', ')
    : 'Select assignees…'

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="text-[15px] font-semibold text-text mb-4">{isEditing ? 'Edit Task' : 'New Task'}</div>

      <div className="mb-3.5">
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Task Title *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
          className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none"
        />
      </div>

      <div className="mb-3.5">
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Task description"
          className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none resize-none"
        />
      </div>

      <div className="mb-3.5 relative" ref={dropdownRef}>
        <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Assign To *</label>
        <button
          type="button"
          onClick={() => setDropdownOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] text-left"
        >
          <span className="truncate">{selectedLabel}</span>
          <span className="text-text-muted shrink-0">▾</span>
        </button>
        {dropdownOpen && (
          <div className="absolute z-20 top-full left-0 right-0 mt-1 max-h-[220px] overflow-y-auto bg-surface border border-border rounded-lg shadow-lg p-1">
            {options.map((a) => (
              <label key={a.email_id} className="flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-surface-2 cursor-pointer text-[12.5px]">
                <input
                  type="checkbox"
                  checked={selectedEmails.includes(a.email_id)}
                  onChange={(e) => toggleEmail(a.email_id, e.target.checked)}
                />
                <span>{a.employee_name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {!isRecurring && (
          <div>
            <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none"
            />
          </div>
        )}
        {!isEditing && (
          <div>
            <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Frequency</label>
            <select
              value={frequency}
              onChange={(e) => handleFrequencyChange(e.target.value)}
              className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none"
            >
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {isRecurring && (
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-[11.5px] font-semibold text-text-muted mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none"
            />
          </div>
          <div>
            <label className="block text-[11.5px] font-semibold text-text-muted mb-1">End Date (optional)</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none"
            />
          </div>
        </div>
      )}

      {error && <div className="text-danger text-[12px] mt-3">{error}</div>}

      <div className="flex gap-3 mt-5">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg px-4 py-2 font-bold text-white bg-primary disabled:opacity-60"
        >
          {saving ? 'Saving…' : '💾 Save Task'}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 font-semibold border border-border text-text">
          Cancel
        </button>
      </div>
    </OverlayShell>
  )
}
