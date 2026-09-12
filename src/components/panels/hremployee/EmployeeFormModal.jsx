import { useEffect, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import OverlayShell from '../../shared/OverlayShell'
import { CATEGORIES, calcProbationDate, saveEmployee } from '../../../lib/hrEmployee'

const BLANK_FORM = {
  fullName: '',
  category: 'Probationary Staff',
  joiningMonth: '',
  doj: '',
  department: '',
  designation: '',
  location: '',
  contactOfficial: '',
  contactPersonal: '',
  emailOfficial: '',
  emailPersonal: '',
  dob: '',
  gender: '',
  exitDate: '',
}

// Ported from old-portal/js/hrEmployee.js's heOpenEmployeeModal/heEmpCategoryChanged/
// heEmpDojChanged/heSaveEmployee. Probation Completion Date is read-only, recomputed live from
// Date of Joining for display, and recomputed again fresh at save time (never trusted from
// whatever the field happens to show). The Exit section only appears when Category is Exited
// Staff, and a category-history row is only written when EDITING an existing employee whose
// category actually changed — never on creation (no baseline row).
export default function EmployeeFormModal({ open, employee, exitDetail, canEdit, checklistItems, onClose, onSaved }) {
  const { currentUser } = useAuth()
  const isEditing = !!employee
  const [form, setForm] = useState(BLANK_FORM)
  const [exitFormFile, setExitFormFile] = useState(null)
  const [existingExitFormUrl, setExistingExitFormUrl] = useState(null)
  const [origCategory, setOrigCategory] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the form whenever the modal opens or the target employee changes, not a render loop
    setError('')
    setExitFormFile(null)
    if (employee) {
      setForm({
        fullName: employee.full_name || '',
        category: employee.category || 'Probationary Staff',
        joiningMonth: employee.joining_month || '',
        doj: employee.doj ? String(employee.doj).slice(0, 10) : '',
        department: employee.department || '',
        designation: employee.designation || '',
        location: employee.location || '',
        contactOfficial: employee.contact_official || '',
        contactPersonal: employee.contact_personal || '',
        emailOfficial: employee.email_official || '',
        emailPersonal: employee.email_personal || '',
        dob: employee.dob ? String(employee.dob).slice(0, 10) : '',
        gender: employee.gender || '',
        exitDate: exitDetail?.exit_date ? String(exitDetail.exit_date).slice(0, 10) : '',
      })
      setOrigCategory(employee.category || null)
      setExistingExitFormUrl(exitDetail?.exit_form_url || null)
    } else {
      setForm(BLANK_FORM)
      setOrigCategory(null)
      setExistingExitFormUrl(null)
    }
  }, [open, employee, exitDetail])

  function set(patch) {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  const probationDate = calcProbationDate(form.doj)
  const showExitSection = form.category === 'Exited Staff'

  async function handleSave() {
    if (!canEdit) return
    const fullName = form.fullName.trim()
    if (!fullName) {
      setError('❌ Full Name is required.')
      return
    }
    if (form.category === 'Exited Staff') {
      if (!form.exitDate) {
        setError('❌ Exit Date is required when Category is Exited Staff.')
        return
      }
      if (!exitFormFile && !existingExitFormUrl) {
        setError('❌ Exit Form upload is required when Category is Exited Staff.')
        return
      }
    }

    setSaving(true)
    setError('')
    try {
      const employeeId = await saveEmployee({
        editingId: employee?.id || null,
        origCategory,
        changedByEmail: currentUser?.email,
        form: { ...form, fullName },
        exitFormFile,
        existingExitFormUrl,
        checklistItems,
      })
      onSaved(employeeId)
    } catch (e) {
      setError('❌ Save failed: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-2xl">
      <div className="text-[15px] font-semibold text-text mb-4">{isEditing ? `Edit Employee — ${employee.full_name}` : 'Add Employee'}</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <Field label="Full Name" required className="sm:col-span-2">
          <input type="text" value={form.fullName} disabled={!canEdit} onChange={(e) => set({ fullName: e.target.value })} placeholder="Employee full name" className={inputClass} />
        </Field>
        <Field label="Category" required>
          <select value={form.category} disabled={!canEdit} onChange={(e) => set({ category: e.target.value })} className={inputClass}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Location">
          <input type="text" value={form.location} disabled={!canEdit} onChange={(e) => set({ location: e.target.value })} placeholder="e.g. Goa, Mumbai..." className={inputClass} />
        </Field>
        <Field label="Department">
          <input type="text" value={form.department} disabled={!canEdit} onChange={(e) => set({ department: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Designation">
          <input type="text" value={form.designation} disabled={!canEdit} onChange={(e) => set({ designation: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Date of Joining">
          <input type="date" value={form.doj} disabled={!canEdit} onChange={(e) => set({ doj: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Joining Month">
          <input type="text" value={form.joiningMonth} disabled={!canEdit} onChange={(e) => set({ joiningMonth: e.target.value })} placeholder="e.g. Jan-2026" className={inputClass} />
        </Field>
        <Field label="Probation Completion Date">
          <input type="date" value={probationDate || ''} readOnly disabled title="Auto-calculated as Date of Joining + 6 months" className={`${inputClass} bg-surface-2 cursor-not-allowed`} />
        </Field>
        <Field label="Date of Birth">
          <input type="date" value={form.dob} disabled={!canEdit} onChange={(e) => set({ dob: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Gender">
          <input type="text" value={form.gender} disabled={!canEdit} onChange={(e) => set({ gender: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Contact (Official)">
          <input type="text" value={form.contactOfficial} disabled={!canEdit} onChange={(e) => set({ contactOfficial: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Contact (Personal)">
          <input type="text" value={form.contactPersonal} disabled={!canEdit} onChange={(e) => set({ contactPersonal: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Email (Official)">
          <input type="email" value={form.emailOfficial} disabled={!canEdit} onChange={(e) => set({ emailOfficial: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Email (Personal)">
          <input type="email" value={form.emailPersonal} disabled={!canEdit} onChange={(e) => set({ emailPersonal: e.target.value })} className={inputClass} />
        </Field>

        {showExitSection && (
          <div className="sm:col-span-2 rounded-lg border border-danger/25 bg-danger-tint p-3.5">
            <div className="text-[11px] font-extrabold text-danger uppercase tracking-wide mb-2.5">Exit Details</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Field label="Exit Date" required>
                <input type="date" value={form.exitDate} disabled={!canEdit} onChange={(e) => set({ exitDate: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Exit Form" required>
                <label className={`inline-block px-3.5 py-2 rounded-lg border border-dashed border-border bg-surface text-text text-[12.5px] ${canEdit ? 'cursor-pointer' : 'opacity-60'}`}>
                  📎 Choose file
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    disabled={!canEdit}
                    onChange={(e) => setExitFormFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
                <span className="text-[11.5px] text-text-muted ml-2">{exitFormFile ? exitFormFile.name : 'No file chosen'}</span>
                {existingExitFormUrl && (
                  <div>
                    <a href={existingExitFormUrl} target="_blank" rel="noopener noreferrer" className="text-[11.5px] text-primary">
                      View existing exit form ↗
                    </a>
                  </div>
                )}
              </Field>
            </div>
          </div>
        )}
      </div>

      {error && <div className="text-danger text-[12px] mt-3.5">{error}</div>}

      <div className="flex gap-3 mt-5">
        {canEdit && (
          <button type="button" onClick={handleSave} disabled={saving} className="rounded-lg px-4 py-2 font-bold text-white bg-primary disabled:opacity-60">
            {saving ? 'Saving…' : '💾 Save Employee'}
          </button>
        )}
        <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 font-semibold border border-border text-text">
          Cancel
        </button>
      </div>
    </OverlayShell>
  )
}

const inputClass = 'w-full box-border px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[13px] outline-none disabled:opacity-60'

function Field({ label, required, className = '', children }) {
  return (
    <div className={className}>
      <label className="block text-[11.5px] font-semibold text-text-muted mb-1">
        {label}
        {required ? ' *' : ''}
      </label>
      {children}
    </div>
  )
}
