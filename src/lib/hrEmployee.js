// HR Employee Master (CRUD + category history + 5-item exit checklist). Ported from
// old-portal/js/hrEmployee.js.
// Tables (Supabase): employees (id, full_name, category [Permanent Staff/Probationary Staff/
// Exited Staff], joining_month, doj, probation_completion_date [client-computed doj+6mo,
// read-only], department, designation, location, contact_official, contact_personal,
// email_official, email_personal, dob, gender, updated_at), employee_category_history
// (employee_id, old_category, new_category, changed_by — written only on an EDIT where category
// actually changes, never on initial creation), employee_exit_details (employee_id [upsert
// target], exit_date, exit_form_url, updated_at), employee_exit_checklist_items (id, item_name,
// sort_order — the master list; its actual 5 rows are DB-seeded data, not hardcoded here),
// employee_exit_checklist_status (id, employee_id, checklist_item_id, status, completed_by,
// completed_on, remarks — one row per employee/item pair, backfilled from the master list).
//
// IMPORTANT — confirmed during investigation, not assumed: `employees` is a completely separate,
// unlinked table from Employee_details (the table HR/Directory/Celebrations/Activity Log/Task
// Checklist/etc. all share). No other module reads or writes `employees`, and this module never
// touches Employee_details — no FK, no shared id, no sync. Two independent sources of truth for
// "who are our employees." A real pre-existing data-governance gap in the business, not something
// to fix during migration — see MIGRATION-NOTES.md's general note on this.
//
// Access: hr_employee_view/hr_employee_edit, each with an owner-or-MIS role shortcut (unlike
// leadsPerm/fmsPerm's owner-only shortcut) — both roles get view+edit regardless of the explicit
// permission flags.
import { SUPABASE_URL, SB_HDRS, SB_HDRS_JSON, SB_HDRS_MIN, SB_HDRS_REPR, SUPABASE_ANON, getAuthToken } from './supabaseClient'

export const HE_CHECKLIST_BUCKET = 'Documents'
export const HE_CHECKLIST_FOLDER = 'ExitForms'

const CATEGORIES = ['Permanent Staff', 'Probationary Staff', 'Exited Staff']

function role(currentUser) {
  return String(currentUser?.rawRole || currentUser?.role || '').toLowerCase().trim()
}
export function canViewHREmployee(currentUser, permissions) {
  if (permissions?.hr_employee_view === 'true') return true
  const r = role(currentUser)
  return r === 'owner' || r === 'mis'
}
export function canEditHREmployee(currentUser, permissions) {
  if (permissions?.hr_employee_edit === 'true') return true
  const r = role(currentUser)
  return r === 'owner' || r === 'mis'
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export function fmtDate(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return d
  }
}
export function calcProbationDate(doj) {
  if (!doj) return null
  const d = new Date(doj + 'T00:00:00')
  if (isNaN(d)) return null
  d.setMonth(d.getMonth() + 6)
  return d.toISOString().slice(0, 10)
}
export function dayDiff(d) {
  if (!d) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  return Math.round((target - today) / 86400000)
}

export const CATEGORY_BADGE_TONE = {
  'Permanent Staff': 'won',
  'Probationary Staff': 'warm',
  'Exited Staff': 'lost',
}

export function checklistCountFor(employeeId, checklistStatusAll, checklistItemsLength) {
  const rows = checklistStatusAll.filter((r) => r.employee_id === employeeId)
  const total = checklistItemsLength || 5
  const completed = rows.filter((r) => r.status === 'completed').length
  return { completed, total: rows.length ? rows.length : total }
}

// ── Fetches ──────────────────────────────────────────────────────────────────
export async function fetchAll() {
  const [empRes, itemsRes, exitRes, statusRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/employees?select=*&order=full_name.asc`, { headers: SB_HDRS() }),
    fetch(`${SUPABASE_URL}/rest/v1/employee_exit_checklist_items?select=*&order=sort_order.asc`, { headers: SB_HDRS() }),
    fetch(`${SUPABASE_URL}/rest/v1/employee_exit_details?select=*`, { headers: SB_HDRS() }),
    fetch(`${SUPABASE_URL}/rest/v1/employee_exit_checklist_status?select=*`, { headers: SB_HDRS() }),
  ])
  const employees = empRes.ok ? await empRes.json() : []
  const checklistItems = itemsRes.ok ? await itemsRes.json() : []
  const exitRows = exitRes.ok ? await exitRes.json() : []
  const exitDetailsByEmployeeId = {}
  exitRows.forEach((r) => {
    exitDetailsByEmployeeId[r.employee_id] = r
  })
  const checklistStatusAll = statusRes.ok ? await statusRes.json() : []
  return { employees, checklistItems, exitDetailsByEmployeeId, checklistStatusAll }
}

export async function refreshExitData() {
  const [exitRes, statusRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/employee_exit_details?select=*`, { headers: SB_HDRS() }),
    fetch(`${SUPABASE_URL}/rest/v1/employee_exit_checklist_status?select=*`, { headers: SB_HDRS() }),
  ])
  const exitRows = exitRes.ok ? await exitRes.json() : []
  const exitDetailsByEmployeeId = {}
  exitRows.forEach((r) => {
    exitDetailsByEmployeeId[r.employee_id] = r
  })
  const checklistStatusAll = statusRes.ok ? await statusRes.json() : []
  return { exitDetailsByEmployeeId, checklistStatusAll }
}

// ── Employee List / Exited Staff filtering ────────────────────────────────────
export function distinctValues(employees, field) {
  const vals = new Set()
  employees.forEach((e) => {
    const v = (e[field] || '').trim()
    if (v) vals.add(v)
  })
  return Array.from(vals).sort((a, b) => a.localeCompare(b))
}

export function filterEmployees(employees, { search, location, department, category, designation }) {
  const q = (search || '').trim().toLowerCase()
  return employees.filter((e) => {
    if (location && (e.location || '') !== location) return false
    if (department && (e.department || '') !== department) return false
    if (category && (e.category || '') !== category) return false
    if (designation && (e.designation || '') !== designation) return false
    if (q) {
      const hay = [e.full_name, e.email_official, e.email_personal, e.contact_official, e.contact_personal].join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export { CATEGORIES }

// ── Exit form upload — plain fetch(), no progress UI needed (production itself uses fetch()
// here, not XHR, unlike Field Service's photo upload). Public 'Documents' bucket — the same
// bucket HR's Mediclaim feature uses (whose real upload is still deferred elsewhere in this
// project); this is the first real write to it. ──
export async function uploadExitForm(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  const safeName = `${HE_CHECKLIST_FOLDER}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${HE_CHECKLIST_BUCKET}/${safeName}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${getAuthToken()}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: file,
  })
  if (!res.ok) throw new Error('Upload failed: ' + (await res.text()))
  return `${SUPABASE_URL}/storage/v1/object/public/${HE_CHECKLIST_BUCKET}/${safeName}`
}

// ── Shared checklist backfill — ported from the identical logic that appeared twice in
// production (heSaveEmployee's Exited-Staff branch, and heOpenExitChecklistModal's own
// defensive check for checklist items added after someone already exited). Diffs against
// existing status rows for this employee and inserts any missing ones as 'pending'. Real
// duplication removed, not a speculative abstraction. ──
export async function backfillChecklistStatus(employeeId, checklistItems, existingStatusRowsForEmployee) {
  const existingIds = new Set(existingStatusRowsForEmployee.map((r) => r.checklist_item_id))
  const missing = checklistItems.filter((item) => !existingIds.has(item.id)).map((item) => ({ employee_id: employeeId, checklist_item_id: item.id, status: 'pending' }))
  if (missing.length) {
    await fetch(`${SUPABASE_URL}/rest/v1/employee_exit_checklist_status`, {
      method: 'POST',
      headers: SB_HDRS_MIN(),
      body: JSON.stringify(missing),
    })
  }
  return missing.length > 0
}

// ── Save employee (create or edit) ───────────────────────────────────────────
// `origCategory` is the employee's category BEFORE this edit (null for a brand-new employee) —
// a category-history row is only ever written when editing an EXISTING employee whose category
// actually changed; creation never logs a baseline row.
export async function saveEmployee({ editingId, origCategory, changedByEmail, form, exitFormFile, existingExitFormUrl, checklistItems }) {
  const payload = {
    full_name: form.fullName,
    category: form.category,
    joining_month: form.joiningMonth || null,
    doj: form.doj || null,
    probation_completion_date: calcProbationDate(form.doj),
    department: form.department || null,
    designation: form.designation || null,
    location: form.location || null,
    contact_official: form.contactOfficial || null,
    contact_personal: form.contactPersonal || null,
    email_official: form.emailOfficial || null,
    email_personal: form.emailPersonal || null,
    dob: form.dob || null,
    gender: form.gender || null,
    updated_at: new Date().toISOString(),
  }

  let exitFormUrl = existingExitFormUrl
  if (form.category === 'Exited Staff' && exitFormFile) {
    exitFormUrl = await uploadExitForm(exitFormFile)
  }

  let employeeId = editingId

  if (employeeId) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/employees?id=eq.${employeeId}`, { method: 'PATCH', headers: SB_HDRS_MIN(), body: JSON.stringify(payload) })
    if (!res.ok) throw new Error(await res.text())

    if (origCategory && origCategory !== form.category) {
      await fetch(`${SUPABASE_URL}/rest/v1/employee_category_history`, {
        method: 'POST',
        headers: SB_HDRS_MIN(),
        body: JSON.stringify({ employee_id: employeeId, old_category: origCategory, new_category: form.category, changed_by: changedByEmail }),
      })
    }
  } else {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/employees`, { method: 'POST', headers: SB_HDRS_REPR(), body: JSON.stringify(payload) })
    if (!res.ok) throw new Error(await res.text())
    const [saved] = await res.json()
    employeeId = saved.id
  }

  if (form.category === 'Exited Staff') {
    await fetch(`${SUPABASE_URL}/rest/v1/employee_exit_details?on_conflict=employee_id`, {
      method: 'POST',
      headers: { ...SB_HDRS_JSON(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ employee_id: employeeId, exit_date: form.exitDate, exit_form_url: exitFormUrl, updated_at: new Date().toISOString() }),
    })

    const existingRes = await fetch(`${SUPABASE_URL}/rest/v1/employee_exit_checklist_status?employee_id=eq.${employeeId}&select=checklist_item_id`, { headers: SB_HDRS() })
    const existing = existingRes.ok ? await existingRes.json() : []
    await backfillChecklistStatus(employeeId, checklistItems, existing)
  }

  return employeeId
}

// ── Exit checklist modal actions ─────────────────────────────────────────────
export async function toggleChecklistItem(row, changedByEmail) {
  const newStatus = row.status === 'completed' ? 'pending' : 'completed'
  const payload = newStatus === 'completed' ? { status: 'completed', completed_by: changedByEmail, completed_on: new Date().toISOString() } : { status: 'pending', completed_by: null, completed_on: null }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/employee_exit_checklist_status?id=eq.${row.id}`, { method: 'PATCH', headers: SB_HDRS_MIN(), body: JSON.stringify(payload) })
  if (!res.ok) throw new Error(await res.text())
  return payload
}

export async function saveChecklistRemarks(rowId, value) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/employee_exit_checklist_status?id=eq.${rowId}`, { method: 'PATCH', headers: SB_HDRS_MIN(), body: JSON.stringify({ remarks: value }) })
  if (!res.ok) throw new Error(await res.text())
}
