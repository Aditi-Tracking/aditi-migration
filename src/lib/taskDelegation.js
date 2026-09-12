// Task Delegation (MD delegates tasks to specific employees; assignees manage their own list)
// Ported from old-portal/js/taskDelegation.js.
// Tables (Supabase): delegation_assignees (id, emp_id, employee_name, email_id, is_active, added_by,
//                    added_at)
//                    delegation_tasks (id, task_title, task_description, assigned_to_email,
//                    assigned_by, due_date, status, note, tentative_date, completed_at, created_at,
//                    updated_at, source_recurring_template_id)
//                    delegation_task_assignees (id, task_id, assignee_email, added_at) — many-to-many;
//                    this (not assigned_to_email) is the RLS source of truth for who can see/edit a
//                    task. assigned_to_email is kept in sync with the first-selected assignee only as
//                    a denormalized "primary assignee" convenience column (migration 0038).
//                    delegation_recurring_templates / delegation_recurring_template_assignees — MD-only
//                    config read by the daily delegation_generate_recurring_tasks() pg_cron job, which
//                    stamps generated delegation_tasks rows with source_recurring_template_id. That
//                    job is pure SQL server-side — the only client-side date math is advanceDate()
//                    below, used once to compute a new template's next_run_date.
//                    delegation_task_attachments + 'delegation-task-attachments' storage bucket — a
//                    6th delegation_* table not mentioned in the module's own header comment. Unlike
//                    Renewals' call_attachments bucket, this one allows any file type, not images-only.
// Access: MD (chirag@adititracking.com) always gets the full Manage view (assignees + all tasks).
// Anyone else whose email matches an active delegation_assignees row gets a read-mostly "My Tasks"
// view. This is a direct email/assignee-row check, not a role_defaults/user_permissions gate like
// every other module — RLS (migrations 0033/0034) backs this up server-side; these checks are UX
// gating only.
import { SUPABASE_URL, SB_HDRS, SB_HDRS_MIN, SB_HDRS_REPR, getAuthToken, SUPABASE_ANON } from './supabaseClient'

export const TD_MD_EMAIL = 'chirag@adititracking.com'

export const TD_ATTACHMENTS_BUCKET = 'delegation-task-attachments'
export const TD_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024 // matches the bucket's file_size_limit (migration 0036)

export const TD_STATUS_META = {
  pending: { label: 'Pending', icon: '⏳', color: '#f0a500' },
  ongoing: { label: 'Ongoing', icon: '🔄', color: '#3b82f6' },
  completed: { label: 'Completed', icon: '✅', color: '#00d4aa' },
}

export function isTdMD(currentUser) {
  return !!currentUser && String(currentUser.email || '').trim().toLowerCase() === TD_MD_EMAIL
}

export function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d.length <= 10 ? d + 'T00:00:00' : d)
  if (isNaN(dt)) return String(d)
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtDateTime(d) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt)) return String(d)
  return dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// due_date is a DATE (no time component) — compare at end-of-day so "due today" never reads as
// overdue the instant the clock ticks past midnight in a later timezone.
export function isTaskOverdue(t) {
  if (!t.due_date || t.status === 'completed') return false
  const due = new Date(t.due_date + 'T23:59:59')
  return !isNaN(due) && due < new Date()
}

// ── Nav visibility ──────────────────────────────────────────────────────────
// Ported from _applyTaskDelegationNavVisibility. One-shot per login, no live-sync poll — same as
// Renewals' nav context, unlike Task Checklist's 15s poll (production has none for this module).
export async function fetchTaskDelegationAccessSnapshot(currentUser) {
  const isMD = isTdMD(currentUser)
  let isActiveAssignee = false
  if (!isMD && currentUser?.email) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/delegation_assignees?select=id&email_id=ilike.${encodeURIComponent(currentUser.email)}&is_active=eq.true&limit=1`,
        { headers: SB_HDRS() }
      )
      const rows = res.ok ? await res.json() : []
      isActiveAssignee = Array.isArray(rows) && rows.length > 0
    } catch {
      isActiveAssignee = false
    }
  }
  return { isMD, isActiveAssignee, navVisible: isMD || isActiveAssignee }
}

// ── Fetches ──────────────────────────────────────────────────────────────────
export async function fetchAssignees() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/delegation_assignees?select=*&order=employee_name.asc`, { headers: SB_HDRS() })
  return res.ok ? res.json() : []
}

export async function fetchAllTasksForMD() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/delegation_tasks?select=*&order=created_at.desc`, { headers: SB_HDRS() })
  return res.ok ? res.json() : []
}

export async function fetchTaskAssigneeLinks() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/delegation_task_assignees?select=*`, { headers: SB_HDRS() })
  return res.ok ? res.json() : []
}

// No assigned_to_email filter here — RLS (delegation_task_assignees junction check) is the real
// scoping, and filtering on the denormalized primary-assignee column would hide tasks where this
// user is a secondary (non-primary) assignee.
export async function fetchMyTasks() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/delegation_tasks?select=*&order=due_date.asc`, { headers: SB_HDRS() })
  return res.ok ? res.json() : []
}

export function buildTaskAssigneeMap(links) {
  const map = new Map()
  for (const l of links || []) {
    if (!map.has(l.task_id)) map.set(l.task_id, [])
    map.get(l.task_id).push(l.assignee_email)
  }
  return map
}

// Falls back to assigned_to_email for a task whose junction rows haven't loaded/exist yet
// (defensive only — every task written by this module always gets a junction row too).
export function assigneeEmailsForTask(t, taskAssigneeMap) {
  const list = taskAssigneeMap.get(t.id)
  if (list && list.length) return list
  return t.assigned_to_email ? [t.assigned_to_email] : []
}

export function assigneeNamesForTask(t, taskAssigneeMap, assignees) {
  const emails = assigneeEmailsForTask(t, taskAssigneeMap)
  if (!emails.length) return '—'
  return emails
    .map((e) => {
      const a = assignees.find((a) => a.email_id === e)
      return a ? a.employee_name : e
    })
    .join(', ')
}

export function taskHasAssignee(t, email, taskAssigneeMap) {
  if (!email) return true
  return assigneeEmailsForTask(t, taskAssigneeMap).includes(email)
}

// ── Manage Assignees ─────────────────────────────────────────────────────────
export async function fetchAssignableEmployees() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/Employee_details?select=Emp_id,Employee_name,Employee_Dept,Email_Id`, { headers: SB_HDRS() })
  return res.ok ? res.json() : []
}

export async function addAssignee(employee, addedByEmail) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/delegation_assignees`, {
    method: 'POST',
    headers: SB_HDRS_REPR(),
    body: JSON.stringify({
      emp_id: employee.Emp_id,
      employee_name: employee.Employee_name,
      email_id: String(employee.Email_Id || '').trim().toLowerCase(),
      is_active: true,
      added_by: addedByEmail,
      added_at: new Date().toISOString(),
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  const [saved] = await res.json()
  return saved
}

// No hard delete anywhere in this module — only an active/inactive toggle.
export async function setAssigneeActive(id, isActive) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/delegation_assignees?id=eq.${id}`, {
    method: 'PATCH',
    headers: SB_HDRS_MIN(),
    body: JSON.stringify({ is_active: isActive }),
  })
  if (!res.ok) throw new Error(await res.text())
}

// ── New/Edit Task ────────────────────────────────────────────────────────────
export function advanceDate(dateStr, frequency) {
  const d = new Date(dateStr + 'T00:00:00')
  if (frequency === 'daily') d.setDate(d.getDate() + 1)
  if (frequency === 'weekly') d.setDate(d.getDate() + 7)
  if (frequency === 'monthly') d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

export async function updateTask(taskId, { title, description, dueDate }, { prevEmails, newEmails }) {
  const payload = {
    task_title: title,
    task_description: description,
    assigned_to_email: newEmails[0],
    due_date: dueDate,
    updated_at: new Date().toISOString(),
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/delegation_tasks?id=eq.${taskId}`, {
    method: 'PATCH',
    headers: SB_HDRS_MIN(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())

  const toAdd = newEmails.filter((e) => !prevEmails.includes(e))
  const toRemove = prevEmails.filter((e) => !newEmails.includes(e))
  if (toRemove.length) {
    const inList = toRemove.map((e) => encodeURIComponent(e)).join(',')
    await fetch(`${SUPABASE_URL}/rest/v1/delegation_task_assignees?task_id=eq.${taskId}&assignee_email=in.(${inList})`, {
      method: 'DELETE',
      headers: SB_HDRS_MIN(),
    })
  }
  if (toAdd.length) {
    await fetch(`${SUPABASE_URL}/rest/v1/delegation_task_assignees`, {
      method: 'POST',
      headers: SB_HDRS_MIN(),
      body: JSON.stringify(toAdd.map((email) => ({ task_id: taskId, assignee_email: email }))),
    })
  }
  return { payload, toAdd }
}

export async function createOneTimeTask({ title, description, dueDate, assignees, assignedByEmail }) {
  const payload = {
    task_title: title,
    task_description: description,
    assigned_to_email: assignees[0],
    due_date: dueDate,
    assigned_by: assignedByEmail,
    status: 'pending',
    created_at: new Date().toISOString(),
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/delegation_tasks`, {
    method: 'POST',
    headers: SB_HDRS_REPR(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  const [saved] = await res.json()
  await fetch(`${SUPABASE_URL}/rest/v1/delegation_task_assignees`, {
    method: 'POST',
    headers: SB_HDRS_MIN(),
    body: JSON.stringify(assignees.map((email) => ({ task_id: saved.id, assignee_email: email }))),
  })
  return saved
}

// Creates the template (advanced past today, to the *next* occurrence) AND the first occurrence as
// a normal task right away, so MD/assignees see it immediately instead of waiting for tomorrow's
// cron run. delegation_generate_recurring_tasks() picks up generation from here on — pure SQL, no
// HTTP call, so cron-generated instances never trigger the assignment email.
export async function createRecurringTask({ title, description, frequency, startDate, endDate, assignees, createdByEmail }) {
  const tmplPayload = {
    task_title: title,
    task_description: description,
    frequency,
    start_date: startDate,
    next_run_date: advanceDate(startDate, frequency),
    end_date: endDate,
    is_active: true,
    created_by: createdByEmail,
    created_at: new Date().toISOString(),
  }
  const tmplRes = await fetch(`${SUPABASE_URL}/rest/v1/delegation_recurring_templates`, {
    method: 'POST',
    headers: SB_HDRS_REPR(),
    body: JSON.stringify(tmplPayload),
  })
  if (!tmplRes.ok) throw new Error(await tmplRes.text())
  const [tmpl] = await tmplRes.json()
  await fetch(`${SUPABASE_URL}/rest/v1/delegation_recurring_template_assignees`, {
    method: 'POST',
    headers: SB_HDRS_MIN(),
    body: JSON.stringify(assignees.map((email) => ({ template_id: tmpl.id, assignee_email: email }))),
  })

  const taskPayload = {
    task_title: title,
    task_description: description,
    assigned_to_email: assignees[0],
    due_date: startDate,
    assigned_by: createdByEmail,
    status: 'pending',
    created_at: new Date().toISOString(),
    source_recurring_template_id: tmpl.id,
  }
  const taskRes = await fetch(`${SUPABASE_URL}/rest/v1/delegation_tasks`, {
    method: 'POST',
    headers: SB_HDRS_REPR(),
    body: JSON.stringify(taskPayload),
  })
  if (!taskRes.ok) throw new Error(await taskRes.text())
  const [savedTask] = await taskRes.json()
  await fetch(`${SUPABASE_URL}/rest/v1/delegation_task_assignees`, {
    method: 'POST',
    headers: SB_HDRS_MIN(),
    body: JSON.stringify(assignees.map((email) => ({ task_id: savedTask.id, assignee_email: email }))),
  })
  return savedTask
}

// ── Assignment email (Resend, via the send-delegation-task-email Edge Function) ──────────────────
// Fire-and-forget: a failed/slow send should never block the save flow or the modal closing.
export function sendAssignmentEmail(task, emails, assignees, assignedByEmail) {
  if (!emails || !emails.length) return
  const assigneePayload = emails.map((email) => {
    const a = assignees.find((a) => a.email_id === email)
    return { email, name: a ? a.employee_name : email }
  })
  fetch(`${SUPABASE_URL}/functions/v1/send-delegation-task-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task_title: task.task_title,
      task_description: task.task_description,
      due_date: task.due_date,
      assigned_by: assignedByEmail,
      assignees: assigneePayload,
    }),
  }).catch((e) => console.warn('Task assignment email failed to send:', e))
}

// ── Assignee: My Tasks actions ───────────────────────────────────────────────
// completed_at is only ever meaningful for 'completed' — moving away from it (to Pending or back
// to Ongoing) clears it.
export async function setMyTaskStatus(id, newStatus) {
  const payload = { status: newStatus, completed_at: newStatus === 'completed' ? new Date().toISOString() : null }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/delegation_tasks?id=eq.${id}`, {
    method: 'PATCH',
    headers: SB_HDRS_MIN(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  return payload
}

export async function saveNote(id, note) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/delegation_tasks?id=eq.${id}`, {
    method: 'PATCH',
    headers: SB_HDRS_MIN(),
    body: JSON.stringify({ note }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function saveTentativeDate(id, value) {
  const newVal = value || null
  const res = await fetch(`${SUPABASE_URL}/rest/v1/delegation_tasks?id=eq.${id}`, {
    method: 'PATCH',
    headers: SB_HDRS_MIN(),
    body: JSON.stringify({ tentative_date: newVal }),
  })
  if (!res.ok) throw new Error(await res.text())
  return newVal
}

// ── Attachments (shared thread on the task, not per-user) ────────────────────
export async function fetchAttachments(taskId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/delegation_task_attachments?task_id=eq.${taskId}&select=*&order=uploaded_at.asc`, {
    headers: SB_HDRS(),
  })
  return res.ok ? res.json() : []
}

// MD can remove any attachment. An assignee can remove only what they personally uploaded, on
// their own task — matches the DELETE policy added by migration 0037, checked client-side here
// only for hiding the control (RLS is the real enforcement).
export function canRemoveAttachment(a, currentUser, isMdUser) {
  if (isMdUser) return true
  return !!currentUser && String(a.uploaded_by || '').trim().toLowerCase() === String(currentUser.email || '').trim().toLowerCase()
}

// Uses fetch() (matching the technique already established for every other storage upload in this
// project — lib/fms.js's uploadFmsProof, lib/renewals.js's uploadCallScreenshot), not production's
// raw XHR.
export async function uploadTaskAttachment(taskId, file, uploaderEmail) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${taskId}/${Date.now()}_${safeName}`
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${TD_ATTACHMENTS_BUCKET}/${encodeURIComponent(path)}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${getAuthToken()}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'false',
    },
    body: file,
  })
  if (!res.ok) throw new Error('HTTP ' + res.status + ' — ' + (await res.text()).slice(0, 200))

  const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/delegation_task_attachments`, {
    method: 'POST',
    headers: SB_HDRS_MIN(),
    body: JSON.stringify([
      {
        task_id: taskId,
        file_name: file.name,
        file_path: path,
        file_type: file.type || 'application/octet-stream',
        file_size_bytes: file.size,
        uploaded_by: uploaderEmail,
        uploaded_at: new Date().toISOString(),
      },
    ]),
  })
  if (!dbRes.ok) throw new Error(await dbRes.text())
}

export async function fetchAttachmentBlob(path) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${TD_ATTACHMENTS_BUCKET}/${encodeURIComponent(path)}`, { headers: SB_HDRS() })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.blob()
}

// Storage-object-then-DB-row delete order mirrors js/upload.js's _deleteFilesOfNode — if the
// storage delete fails, bail before touching the DB row so we never end up with a DB row pointing
// at a file we already tried (and failed) to remove.
export async function deleteAttachment(a) {
  const stRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${TD_ATTACHMENTS_BUCKET}/${encodeURIComponent(a.file_path)}`, {
    method: 'DELETE',
    headers: SB_HDRS(),
  })
  if (!stRes.ok) throw new Error('Storage delete failed: HTTP ' + stRes.status)
  const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/delegation_task_attachments?id=eq.${a.id}`, {
    method: 'DELETE',
    headers: SB_HDRS_MIN(),
  })
  if (!dbRes.ok) throw new Error(await dbRes.text())
}
