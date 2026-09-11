import { SB_HDRS, SUPABASE_URL } from './supabaseClient'

// Ported from old-portal/js/activitylog.js — Part A (read-only reporting
// panel) only. The write side (logActivity/_actOnCardOpen/etc., called live
// from HR/Sales/Products/Training/Home/auth.js) is a separate, deliberately
// deferred task — see MIGRATION-NOTES.md.

export const EVENT_TYPE_OPTIONS = [
  { value: '', label: 'All Events' },
  { value: 'login', label: '🔐 Login' },
  { value: 'logout', label: '🚪 Logout' },
  { value: 'page_view', label: '👁️ Page View' },
  { value: 'card_open', label: '📂 Card Open' },
  { value: 'video_play', label: '▶️ Video Play' },
  { value: 'video_pause', label: '⏸️ Video Pause' },
  { value: 'video_complete', label: '✅ Video Complete' },
  { value: 'file_open', label: '📄 File Open' },
  { value: 'training_module_open', label: '📚 Training Module' },
  { value: 'training_submodule_open', label: '📖 Training Sub-Module' },
  { value: 'page_unload', label: '💤 Page Unload' },
]

const EVENT_ICON = {
  login: '🔐',
  logout: '🚪',
  page_view: '👁️',
  card_open: '📂',
  video_play: '▶️',
  video_pause: '⏸️',
  video_complete: '✅',
  file_open: '📄',
  training_module_open: '📚',
  training_submodule_open: '📖',
  page_unload: '💤',
}
export function eventIcon(eventType) {
  return EVENT_ICON[eventType] || '📌'
}

// Try the FK-hinted join first (avoids PostgREST ambiguity), fall back to a
// plain select if the join fails — same two-step fetch as loadActivityLog.
export async function fetchActivityLogRows() {
  try {
    const res1 = await fetch(
      `${SUPABASE_URL}/rest/v1/activity_logs?select=*,employee:Employee_details!emp_id(Employee_name)&order=created_at.desc&limit=2000`,
      { headers: SB_HDRS() }
    )
    if (res1.ok) {
      const data = await res1.json()
      if (Array.isArray(data)) return data
    }
  } catch {
    /* fall through to plain select */
  }
  const res2 = await fetch(`${SUPABASE_URL}/rest/v1/activity_logs?select=*&order=created_at.desc&limit=2000`, {
    headers: SB_HDRS(),
  })
  if (!res2.ok) throw new Error('HTTP ' + res2.status)
  const data2 = await res2.json()
  return Array.isArray(data2) ? data2 : []
}

// Resolves display names for every row — tries the numeric emp_id FK first
// (reliable even when employee_email drifted from Employee_details.Email_Id),
// then falls back to an email lookup. Returns { empIdNameMap, emailNameMap }.
export async function fetchEmpNames(rows) {
  const empIdNameMap = {}
  const emailNameMap = {}

  const empIds = [...new Set(rows.map((r) => r.emp_id).filter((id) => id != null))]
  const emails = [...new Set(rows.map((r) => (r.employee_email || '').toLowerCase()).filter(Boolean))]

  const fetches = []
  if (empIds.length) {
    fetches.push(
      fetch(`${SUPABASE_URL}/rest/v1/Employee_details?select=Emp_id,Employee_name,Email_Id&Emp_id=in.(${empIds.join(',')})`, {
        headers: SB_HDRS(),
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((arr) =>
          arr.forEach((r) => {
            if (r.Emp_id) empIdNameMap[r.Emp_id] = r.Employee_name || ''
            const em = (r.Email_Id || '').toLowerCase().trim()
            if (em && r.Employee_name) emailNameMap[em] = r.Employee_name
          })
        )
        .catch(() => {})
    )
  }
  if (emails.length) {
    const orFilter = emails.map((e) => `Email_Id.ilike.${encodeURIComponent(e)}`).join(',')
    fetches.push(
      fetch(`${SUPABASE_URL}/rest/v1/Employee_details?select=Email_Id,Employee_name&or=(${orFilter})`, { headers: SB_HDRS() })
        .then((r) => (r.ok ? r.json() : []))
        .then((arr) =>
          arr.forEach((r) => {
            const key = (r.Email_Id || '').toLowerCase().trim()
            if (key && r.Employee_name) emailNameMap[key] = r.Employee_name
          })
        )
        .catch(() => {})
    )
  }
  await Promise.all(fetches)
  return { empIdNameMap, emailNameMap }
}

export function getEmpDisplayName(row, { empIdNameMap, emailNameMap }) {
  if (row.emp_id && empIdNameMap[row.emp_id]) return empIdNameMap[row.emp_id]
  const email = (row.employee_email || '').toLowerCase()
  if (email && emailNameMap[email]) return emailNameMap[email]
  if (row.employee?.Employee_name) return row.employee.Employee_name
  return email ? email.split('@')[0] : '—'
}

export function buildEmployeeFilterOptions(rows, names) {
  const seen = new Map()
  rows.forEach((r) => {
    const email = (r.employee_email || '').toLowerCase().trim()
    if (!email || seen.has(email)) return
    seen.set(email, getEmpDisplayName(r, names))
  })
  return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([email, name]) => ({ email, name }))
}

export function filterRows(rows, { eventType, empEmail, dateFrom, dateTo }) {
  return rows.filter((row) => {
    const matchEvent = !eventType || row.event_type === eventType
    const matchEmp = !empEmail || (row.employee_email || '').toLowerCase() === empEmail.toLowerCase()
    let matchDate = true
    if (dateFrom || dateTo) {
      const rowDate = row.created_at ? row.created_at.substring(0, 10) : ''
      if (dateFrom && rowDate < dateFrom) matchDate = false
      if (dateTo && rowDate > dateTo) matchDate = false
    }
    return matchEvent && matchEmp && matchDate
  })
}

// card_open events are deliberately never persisted by the write side
// (_actOnCardOpen's own comment: "too many rows") — so "Cards Opened" here
// always reads 0 against real data. Kept for exact parity with production.
export function computeStats(rows) {
  const logins = rows.filter((r) => r.event_type === 'login').length
  const cardOpens = rows.filter((r) => r.event_type === 'card_open').length
  const videoPlay = rows.filter((r) => r.event_type === 'video_play').length
  const trainingOpen = rows.filter(
    (r) => r.event_type === 'training_module_open' || r.event_type === 'training_submodule_open'
  ).length
  const uniqueEmps = new Set(rows.map((r) => r.employee_email || String(r.emp_id || '')).filter(Boolean)).size

  return [
    { icon: '🔐', label: 'Total Logins', value: logins },
    { icon: '👥', label: 'Unique Users', value: uniqueEmps },
    { icon: '📚', label: 'Training Opens', value: trainingOpen },
    { icon: '▶️', label: 'Videos Played', value: videoPlay },
    { icon: '📂', label: 'Cards Opened', value: cardOpens },
    { icon: '📊', label: 'Total Events', value: rows.length },
  ]
}

export function formatDuration(seconds) {
  if (seconds == null) return '—'
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${seconds}s`
}
