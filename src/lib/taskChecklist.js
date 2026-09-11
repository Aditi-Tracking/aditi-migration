import { SB_HDRS, SB_HDRS_JSON, SUPABASE_ANON, SUPABASE_URL, getAuthToken } from './supabaseClient'
import { fetchEmployeeId } from './employeeProfile'

// Ported from old-portal/js/tasks.js — Phase 1 (core checklist view: KPIs,
// charts, leaderboard, filters, table, Mark Done/Undo/Ongoing, uploads,
// bulk delete). Phase 2 (Task Scheduler tab) and Phase 3 (async nav-reveal
// live-sync + Home Task Alert Banner) are separate, deliberately deferred.
//
// One confirmed-dead fallback NOT ported: old-portal reads
// `r.planned_date || r.planned_data` — a legacy misspelled column. Queried
// the live table directly: `planned_data` returns 42703 "column does not
// exist" today, so this fallback can never fire — dropped entirely.
//
// localStorage-backed optimistic caches (aditiDoneTasks/aditiOngoingTasks/
// aditiTaskUploads) are NOT ported — production's own MAX_AGE_MS=0 already
// disables the done-task cache in practice ("sheet is ALWAYS source of
// truth"), and React state serves the same "instant feedback before the
// PATCH confirms" purpose without needing browser storage as a relay.

// Ported verbatim (Akshay More / Sakshi Tupe-Vinit Singh-Chirag Gupta /
// Ronak Shah-Sowbhagya-Tawab Panja checklists) — a task on this list can't
// be marked Done without an attachment, no matter what actual_timestamp says.
export const MANDATORY_ATTACHMENT_TASKS = [
  'open tickets less than 24 hours',
  'open tickets more than 24 hours',
  'open tickets more than 48 hours',
  'open tickets more than 96 hours',
  'checkin pending activity',
  'checkout pending activity',
  'training videos creation',
  '1 1 meetings with l1 team',
  '1 1 meetings with l2 team',
  'l1 team utilization',
  'un read emails',
  'missed calls response',
  'un read whatsapp',
  'escalations',
  'ims status check',
  'daily commitment morning',
  'unique connected calls 60',
  'demo given',
  'unique quotations sent',
  'follow up calls',
  'weekly achievement 25',
  'morning standup meeting',
  'evening achievement meeting',
  'achievement report evening',
  'monitoring team performance',
  'auditing sales pitch',
  'monthly achievement self team',
  'monthly achievement self',
]

export function normalizeTaskName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

export function taskRequiresAttachment(taskName) {
  const norm = normalizeTaskName(taskName)
  return !!norm && MANDATORY_ATTACHMENT_TASKS.includes(norm)
}

export function hasAttachment(row) {
  return !!row?.uploadUrl
}

// A row counts as Done only if actual_timestamp is set AND (if the task
// requires a mandatory attachment) that attachment exists — matches
// tIsDone exactly, including that a DB-completed mandatory-attachment task
// with no upload still displays as Pending.
export function isDone(row) {
  if (!row?.actual) return false
  if (taskRequiresAttachment(row.task) && !hasAttachment(row)) return false
  return true
}

export function isOngoing(row) {
  if (isDone(row)) return false
  return !!row?.expectedDate
}

// Ported from tIsVisibleOnDate — done rows show only on their planned date
// (never the completion date), ongoing rows show only on their expected
// date, everything else on planned date.
export function isVisibleOnDate(row, dateStr) {
  if (!row.plannedRaw) return false
  if (isDone(row)) return row.plannedRaw === dateStr
  if (isOngoing(row)) {
    const exp = row.expectedDate
    return exp ? exp === dateStr : row.plannedRaw === dateStr
  }
  return row.plannedRaw === dateStr
}

// Which rows count toward a given date's KPI/score — active ongoing rows
// are excluded entirely; done rows count on their completion date OR their
// planned date. Matches tGetCountableForDate exactly.
export function getCountableForDate(dateStr, rows) {
  return rows.filter((r) => {
    if (isOngoing(r)) return false
    if (isDone(r)) {
      const actualDate = (r.actual || '').slice(0, 10)
      if (actualDate && actualDate === dateStr) return true
      return r.plannedRaw === dateStr
    }
    return r.plannedRaw === dateStr
  })
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

async function buildEmpMap(rows) {
  const empIdSet = [...new Set(rows.map((r) => String(r.emp_id || '').trim()).filter(Boolean))]
  const empMap = {}
  if (!empIdSet.length) return empMap
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/Employee_details?select=Emp_id,Employee_name,Employee_Dept,Email_Id,Location&Emp_id=in.(${empIdSet.join(',')})`,
    { headers: SB_HDRS() }
  )
  const edRows = await res.json()
  if (Array.isArray(edRows)) {
    edRows.forEach((r) => {
      const id = String(r.Emp_id || '').trim()
      if (id) {
        empMap[id] = {
          name: String(r.Employee_name || '').trim(),
          dept: String(r.Employee_Dept || '').trim(),
          email: String(r.Email_Id || '').trim(),
          loc: String(r.Location || '').trim(),
        }
      }
    })
  }
  return empMap
}

function shapeChecklistRows(rows, empMap) {
  return rows.map((r) => {
    const empIdStr = String(r.emp_id || '').trim()
    const ed = empMap[empIdStr] || {}
    const expectedDate = r.ongoing ? String(r.ongoing).trim() : null
    const planned = String(r.planned_date || '').trim()
    return {
      id: r.id,
      empId: empIdStr,
      name: ed.name || empIdStr || '',
      email: ed.email || '',
      department: ed.dept || '',
      seriesId: String(r.sheet_task_id || '').trim(),
      freq: String(r.frequency || '').trim(),
      task: String(r.task_name || '').trim(),
      planned,
      plannedRaw: parseDateOnly(planned),
      actual: String(r.actual_timestamp || '').trim(),
      remarks: String(r.remarks || '').trim(),
      location: ed.loc || String(r.branch_id || '').trim(),
      expectedDate,
      uploadUrl: r.upload ? String(r.upload).trim() : null,
    }
  })
}

export async function fetchChecklistRows({ scope, empId, dateFrom, dateTo }) {
  const isAll = scope === 'all'
  const from = dateFrom || todayISO()
  const to = dateTo || todayISO()

  // (planned_date in range) OR (ongoing expected-date in range AND not yet done)
  const orFilter = `or=(and(planned_date.gte.${from},planned_date.lte.${to}),and(ongoing.gte.${from},ongoing.lte.${to},actual_timestamp.is.null))`
  let url = `${SUPABASE_URL}/rest/v1/employee_checklists?select=*&${orFilter}&order=planned_date.desc,id.asc`
  if (!isAll) url += `&emp_id=eq.${encodeURIComponent(empId)}`

  const rows = await fetchAllPages(url)
  const empMap = await buildEmpMap(rows)
  return shapeChecklistRows(rows, empMap)
}

// Ported from old-portal/js/tasks.js's tSilentRefresh — wider than
// fetchChecklistRows's initial-load query (loadTasks' shape): a 3rd OR
// clause also catches a task completed today even if its planned_date
// falls outside [from,to] (e.g. planned yesterday, done today), plus a
// second unbounded "ongoing due from `from` onward, not yet done" fetch
// merged in (dedup by id) so a future-dated ongoing task still counts
// toward "does this employee have any tasks at all". Used only by the
// nav/Home-banner live-sync poll (TaskChecklistNavContext) — the
// checklist panel itself keeps the simpler loadTasks-era query, matching
// production's own loadTasks()/tSilentRefresh split.
export async function fetchChecklistRowsWide({ scope, empId, dateFrom, dateTo }) {
  const isAll = scope === 'all'
  const from = dateFrom || todayISO()
  const to = dateTo || todayISO()

  const orFilter = `or=(and(planned_date.gte.${from},planned_date.lte.${to}),and(ongoing.gte.${from},ongoing.lte.${to},actual_timestamp.is.null),and(actual_timestamp.gte.${from},actual_timestamp.lte.${to}T23:59:59))`
  let url = `${SUPABASE_URL}/rest/v1/employee_checklists?select=*&${orFilter}&order=planned_date.desc,id.asc`
  if (!isAll) url += `&emp_id=eq.${encodeURIComponent(empId)}`
  const mainRows = await fetchAllPages(url)

  let ongoingRows = []
  try {
    let ongoingUrl = `${SUPABASE_URL}/rest/v1/employee_checklists?select=*&ongoing=gte.${from}&actual_timestamp=is.null&order=planned_date.desc,id.asc`
    if (!isAll) ongoingUrl += `&emp_id=eq.${encodeURIComponent(empId)}`
    const res = await fetch(`${ongoingUrl}&limit=500`, { headers: SB_HDRS() })
    const json = await res.json()
    if (Array.isArray(json)) ongoingRows = json
  } catch {
    /* best-effort widen — matches production's own try/catch swallow around ongoingTasksSync */
  }

  const seenIds = new Set(mainRows.map((r) => r.id))
  const merged = [...mainRows, ...ongoingRows.filter((r) => !seenIds.has(r.id))]

  const empMap = await buildEmpMap(merged)
  return shapeChecklistRows(merged, empMap)
}

// Ported from old-portal/js/tasks.js's loadTasks()/tSilentRefresh's shared
// nav-reveal decision (_tRevealTasksNav). NOTE: this function only fetches
// rows (for the Home banner's KPI data) — it does NOT decide 'all'-scope
// nav visibility, since that reveal must fire before/independent of any
// fetch (see TaskChecklistNavContext, which mirrors _tRevealTasksNav(true)
// being called before loadTasks()'s fetch in production, with no way for a
// failed fetch to hide it again). For 'own' scope, this resolves the
// employee's Emp_id by email and reports `ownVisible` — true only once real
// rows come back — fails closed (hidden) if the email can't be resolved or
// no rows exist. `wide` selects which query the caller wants (plain for the
// very first load, wide for the live-sync poll).
export async function fetchTaskChecklistNavSnapshot({ scope, email, wide = false }) {
  const today = todayISO()
  const fetchRows = wide ? fetchChecklistRowsWide : fetchChecklistRows
  if (scope === 'all') {
    const rows = await fetchRows({ scope: 'all', dateFrom: today, dateTo: today })
    return { rows }
  }
  const empId = await fetchEmployeeId(email)
  if (!empId) return { rows: [], ownVisible: false }
  const rows = await fetchRows({ scope: 'own', empId: String(empId), dateFrom: today, dateTo: today })
  return { rows, ownVisible: rows.length > 0 }
}

// Ported from updateHomeTaskBanner's role exclusion — Managing
// Director/MIS/PC/Executive Assistant/admin never see the Home Task Alert
// Banner (independent of checklist_scope/nav visibility, a separate check
// in production too).
export function isHomeBannerHiddenForRole(currentUser) {
  if (!currentUser) return true
  const r = String(currentUser.rawRole || '').toLowerCase().trim()
  return (
    currentUser.role === 'owner' ||
    r === 'owner' ||
    r === 'mis' ||
    r === 'pc' ||
    r === 'executive assistant' ||
    r === 'ea' ||
    r === 'admin'
  )
}

function parseDateOnly(v) {
  if (!v) return ''
  const s = String(v).trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return iso[0]
  return s.slice(0, 10)
}

// Supabase caps a single request's row count — loops via limit/offset until
// a short batch signals the end (safety-capped at 100k, matching production).
async function fetchAllPages(baseUrl) {
  const BATCH = 1000
  let all = []
  let offset = 0
  while (true) {
    const res = await fetch(`${baseUrl}&limit=${BATCH}&offset=${offset}`, { headers: SB_HDRS() })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const batch = await res.json()
    if (!Array.isArray(batch) || !batch.length) break
    all = [...all, ...batch]
    if (batch.length < BATCH) break
    offset += BATCH
    if (offset > 100000) break
  }
  return all
}

// ── Role-gating helpers — kept deliberately separate, NOT merged into one
// "isPrivileged()" check, since the three lists genuinely diverge in
// production (e.g. EA gets date-range + undo, but not the Location filter).
export function canSeeDateRange(currentUser) {
  const raw = currentUser?.rawRole
  return (
    currentUser?.role === 'owner' ||
    raw === 'owner' ||
    raw === 'mis' ||
    raw === 'pc' ||
    raw === 'executive assistant' ||
    raw === 'ea'
  )
}

export function canUndo(currentUser) {
  const r = String(currentUser?.rawRole || '').toLowerCase().trim()
  return r === 'mis' || r === 'pc' || r === 'executive assistant' || r === 'ea'
}

export function canSeeLocationFilter(currentUser) {
  const r = String(currentUser?.rawRole || '').toLowerCase().trim()
  return currentUser?.role === 'owner' || r === 'mis' || r === 'pc' || r === 'process coordinator'
}

export function canDeleteTasks(permissions) {
  return permissions?.can_delete_tasks === 'true'
}

export function canViewUploads(currentUser) {
  if (!currentUser) return false
  const r = String(currentUser.rawRole || currentUser.role || '').toLowerCase().trim()
  if (currentUser.role === 'owner' || r === 'owner' || r === 'mis') return true
  return String(currentUser.name || '').trim().toLowerCase() === 'saajan jain'
}

// ── Filtering ────────────────────────────────────────────────────────────
// Base for KPIs/charts: person/dept/location/freq/date-range/search — no
// status/kpi filter. Matches tGetDateFiltered exactly.
export function getDateFiltered(rows, f) {
  return rows.filter((r) => {
    if (f.person && r.name !== f.person) return false
    if (f.department && r.department !== f.department) return false
    if (f.location && (r.location || '') !== f.location) return false
    if (f.freq && r.freq !== f.freq) return false
    if (f.dateFrom || f.dateTo) {
      const df = f.dateFrom || '0000-01-01'
      const dt = f.dateTo || '9999-12-31'
      if (isOngoing(r)) {
        const exp = r.expectedDate || r.plannedRaw || ''
        if (exp < df || exp > dt) return false
      } else {
        if ((r.plannedRaw || '') < df || (r.plannedRaw || '') > dt) return false
      }
    }
    if (f.search) {
      const q = f.search.toLowerCase()
      if (!(r.name.toLowerCase().includes(q) || r.task.toLowerCase().includes(q) || r.department.toLowerCase().includes(q))) return false
    }
    return true
  })
}

// Adds the status/kpi filter on top of getDateFiltered — matches tGetFiltered.
export function getFiltered(rows, f) {
  return getDateFiltered(rows, f).filter((r) => {
    if (f.status === 'done' && !isDone(r)) return false
    if (f.status === 'pending' && (isDone(r) || isOngoing(r))) return false
    if (f.status === 'ongoing' && (!isOngoing(r) || isDone(r))) return false
    return true
  })
}

const SCORE_BANDS = [
  { min: -10, color: '#00d4aa' },
  { min: -30, color: '#34d399' },
  { min: -50, color: '#4e9af1' },
  { min: -75, color: '#f0a500' },
  { min: -Infinity, color: '#ff5c7c' },
]
export function scoreColor(score) {
  return SCORE_BANDS.find((b) => score >= b.min).color
}

// Matches tRenderKPIs exactly: ongoing rows are excluded from the
// completion-rate math; if viewing a single day, uses getCountableForDate
// (an ongoing task completed today counts toward today specifically).
export function computeKpiSummary(dateFilteredRows, { dateFrom, dateTo }) {
  const ongoingRows = dateFilteredRows.filter(isOngoing)
  const ongoingCount = ongoingRows.length

  const countable =
    dateFrom && dateFrom === dateTo
      ? getCountableForDate(dateFrom, dateFilteredRows)
      : dateFilteredRows.filter((r) => !isOngoing(r))

  const total = countable.length
  const done = countable.filter(isDone).length
  const pending = total - done
  const uniqueEmployees = new Set(dateFilteredRows.map((r) => r.name).filter(Boolean)).size
  const score = total ? Math.round((done / total) * 100) - 100 : -100

  return { total, done, pending, ongoingCount, uniqueEmployees, score }
}

export function fmtDate(v) {
  if (!v) return '—'
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v)
}

// UTC -> IST (+5:30) display, matching fmtDateTime exactly (Supabase's
// plain timestamp column carries no timezone, so a bare 'Z' must be forced
// before parsing or the browser treats it as already-local).
export function fmtDateTime(v) {
  if (!v) return '—'
  try {
    let s = String(v).trim()
    if (!s) return '—'
    if (!/[Zz]|[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z'
    const d = new Date(s)
    if (isNaN(d.getTime())) return String(v)
    const ist = new Date(d.getTime() + 330 * 60 * 1000)
    const dd = String(ist.getUTCDate()).padStart(2, '0')
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][ist.getUTCMonth()]
    const hh = String(ist.getUTCHours()).padStart(2, '0')
    const mn = String(ist.getUTCMinutes()).padStart(2, '0')
    return `${dd} ${mon} ${ist.getUTCFullYear()}, ${hh}:${mn}`
  } catch {
    return String(v)
  }
}

// ── Write actions ────────────────────────────────────────────────────────
export async function markDone({ id, remarks }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/employee_checklists?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: SB_HDRS_JSON(),
    body: JSON.stringify({ actual_timestamp: new Date().toISOString(), remarks: remarks || null }),
  })
  if (!res.ok) throw new Error('Could not save')
}

export async function undoTask({ id }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/employee_checklists?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: SB_HDRS_JSON(),
    body: JSON.stringify({ actual_timestamp: null, remarks: null }),
  })
  if (!res.ok) throw new Error('Could not undo')
}

export async function setOngoing({ id, date }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/employee_checklists?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: SB_HDRS_JSON(),
    body: JSON.stringify({ ongoing: date }),
  })
  if (!res.ok) throw new Error('Could not set ongoing date')
}

export async function deleteTasks(ids) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/employee_checklists?id=in.(${ids.join(',')})`, {
    method: 'DELETE',
    headers: SB_HDRS(),
  })
  if (!res.ok) throw new Error('Delete failed')
}

// Shared by both upload entry points (inline 📎 icon and the upload modal)
// — old-portal duplicates this into tProcessTaskFile/tSubmitTaskUpload,
// same Storage path pattern and same URL-or-filename fallback on failure.
export async function uploadTaskAttachment({ id, file }) {
  const ts = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filePath = `task_docs/task_${id}/${ts}_${safeName}`

  let fileUrl = null
  try {
    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/files/${filePath}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${getAuthToken()}`,
        'Content-Type': file.type || 'application/octet-stream',
        'Cache-Control': '3600',
        'x-upsert': 'true',
      },
      body: file,
    })
    if (uploadRes.ok) fileUrl = `${SUPABASE_URL}/storage/v1/object/public/files/${filePath}`
  } catch {
    /* fall through — save the bare filename below, matching production */
  }

  const saveValue = fileUrl || file.name
  await fetch(`${SUPABASE_URL}/rest/v1/employee_checklists?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: SB_HDRS_JSON(),
    body: JSON.stringify({ upload: saveValue }),
  })
  return saveValue
}

// ── "Uploaded Files" viewer (owner/MIS/canViewUploads carve-out) ──────────
export async function fetchAllUploads({ dateFrom, dateTo }) {
  let url = `${SUPABASE_URL}/rest/v1/employee_checklists?select=*&upload=not.is.null`
  if (dateFrom) url += `&planned_date=gte.${dateFrom}`
  if (dateTo) url += `&planned_date=lte.${dateTo}`
  url += `&order=planned_date.desc,id.desc&limit=500`

  const res = await fetch(url, { headers: SB_HDRS() })
  const rows = await res.json()
  if (!Array.isArray(rows)) throw new Error('Could not load uploads')

  const edRes = await fetch(`${SUPABASE_URL}/rest/v1/Employee_details?select=Emp_id,Employee_name,Employee_Dept&limit=500`, {
    headers: SB_HDRS(),
  })
  const edRows = await edRes.json()
  const edCache = {}
  if (Array.isArray(edRows)) {
    edRows.forEach((e) => {
      edCache[String(e.Emp_id || '')] = { name: e.Employee_name || '', dept: e.Employee_Dept || '' }
    })
  }

  return rows
    .map((r) => {
      const cloudUrl = r.upload ? String(r.upload).trim() : null
      if (!cloudUrl) return null
      const rawName = cloudUrl.split('/').pop().replace(/^\d+_/, '').replace(/_/g, ' ')
      const pd = String(r.planned_date || '').slice(0, 10)
      const ed = edCache[String(r.emp_id || '')] || {}
      const ext = rawName.split('.').pop().toLowerCase()
      const icon = ['pdf'].includes(ext) ? '📄' : ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext) ? '🖼️' : ['xls', 'xlsx', 'csv'].includes(ext) ? '📊' : ['doc', 'docx'].includes(ext) ? '📝' : '📎'
      return {
        taskId: String(r.id || ''),
        task: String(r.task_name || '—').trim(),
        employee: ed.name || String(r.emp_id || '') || '—',
        dept: ed.dept || '—',
        fileName: rawName,
        fileUrl: cloudUrl,
        plannedDate: pd,
        icon,
      }
    })
    .filter(Boolean)
}
