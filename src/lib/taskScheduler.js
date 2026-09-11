import { SB_HDRS, SUPABASE_ANON, SUPABASE_URL } from './supabaseClient'
import { PAPI_URL } from './permissions'
import { normalizeHolidayLocation } from './holidayLocation'

// Ported from old-portal/js/taskScheduler.js. Generates recurring
// employee_checklists rows in one batch instead of inserting them by hand.
// This is NOT a persisted "schedule" — nothing here is saved as a template;
// the frontend computes the literal occurrence dates and the backend
// (${PAPI_URL}/api/admin/generate-checklist-tasks, the same Flask backend
// Access Control talks to) bulk-inserts them, re-checking the caller is
// MIS/owner (or individually granted can_use_task_scheduler) server-side —
// that's the real security boundary, this gate is UX only.

export const FREQUENCY_OPTIONS = [
  { value: 'D', label: 'Daily' },
  { value: 'W', label: 'Weekly (every 7 days)' },
  { value: '2D', label: 'Every 2 Days' },
  { value: 'F', label: 'Fortnightly (every 14 days)' },
  { value: 'M', label: 'Monthly (same date each month)' },
  { value: 'Q', label: 'Quarterly (every 3 months)' },
  { value: 'Y', label: 'Yearly (same date each year)' },
  { value: 'E2nd', label: 'Monthly — 2nd [weekday]' },
  { value: 'E3rd', label: 'Monthly — 3rd [weekday]' },
]

export const MAX_OCCURRENCES_PER_BATCH = 1000

// Mirrors _tSchedulerAllowed() exactly — MIS/owner by default, PLUS anyone
// individually granted can_use_task_scheduler via Access Control (lets MIS
// hand this to one specific non-MIS employee without changing their role).
export function canUseTaskScheduler(currentUser, permissions) {
  const r = String(currentUser?.rawRole || currentUser?.role || '').toLowerCase().trim()
  return r === 'owner' || r === 'mis' || permissions?.can_use_task_scheduler === 'true'
}

// ── Date utilities ──────────────────────────────────────────────────────
// YYYY-MM-DD in LOCAL time — deliberately not d.toISOString(), which
// converts to UTC first and silently prints the previous day for anyone in
// a timezone behind UTC.
export function dateToISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// The reverse — `new Date('YYYY-MM-DD')` parses as UTC midnight, which then
// displays as the previous day in negative-UTC-offset timezones. Building
// the Date from its Y/M/D parts directly keeps everything in local time.
export function parseDateInput(s) {
  const [y, m, d] = String(s).split('-').map(Number)
  return new Date(y, m - 1, d)
}

// <input type="month"> gives "YYYY-MM" — returns the LAST calendar day of
// that month, as a local Date (the far edge of the generation window).
export function endOfMonthInput(yyyyMm) {
  const [y, m] = String(yyyyMm).split('-').map(Number)
  return new Date(y, m, 0) // day 0 of "next" month = last day of month m
}

function addDays(d, n) {
  const copy = new Date(d.getTime())
  copy.setDate(copy.getDate() + n)
  return copy
}

// "Same day, N months later" — clamped to the target month's last day when
// it's shorter than the anchor day (Jan 31 + 1 month = Feb 28/29, not
// rolled into March).
function addMonthsClamped(d, n) {
  const targetIndex = d.getMonth() + n
  const y = d.getFullYear() + Math.floor(targetIndex / 12)
  const m = ((targetIndex % 12) + 12) % 12
  const lastDayOfTargetMonth = new Date(y, m + 1, 0).getDate()
  const day = Math.min(d.getDate(), lastDayOfTargetMonth)
  return new Date(y, m, day)
}

// The date of the Nth occurrence of `weekday` (0=Sun..6=Sat) inside the
// given month — e.g. "the 2nd Saturday of March 2026". May land in the
// FOLLOWING month if that occurrence doesn't exist (e.g. a "5th Sunday"
// some months don't have) — the caller checks for that overflow.
function nthWeekdayOfMonth(year, monthIndex0, weekday, n) {
  const first = new Date(year, monthIndex0, 1)
  const firstWeekday = first.getDay()
  const dayOfMonth = 1 + ((weekday - firstWeekday + 7) % 7) + (n - 1) * 7
  return new Date(year, monthIndex0, dayOfMonth)
}

// ── Holiday-aware working-day helpers ───────────────────────────────────
// A "working day" for scheduling = not a Sunday AND not listed in the
// Holiday List for this employee's location.
function isSunday(d) {
  return d.getDay() === 0
}

function isWorkingDay(d, holidaySet) {
  if (isSunday(d)) return false
  return !holidaySet.has(dateToISO(d))
}

// If it lands on a Sunday/holiday, shift forward — and keep shifting if the
// NEXT day is also a Sunday/holiday. A while loop (not a single if) on
// purpose: a holiday sitting right next to a Sunday, or two holidays
// back-to-back, both need walking past correctly.
function shiftToWorkingDay(d, holidaySet) {
  const shifted = new Date(d.getTime())
  while (!isWorkingDay(shifted, holidaySet)) {
    shifted.setDate(shifted.getDate() + 1)
  }
  return shifted
}

// ── Per-frequency raw occurrence generators ─────────────────────────────
// Each returns the RAW anchor dates (BEFORE the Sunday/holiday shift) from
// `start` through `end`, inclusive. Keeping "raw" separate from "shifted"
// matters: each occurrence is shifted independently, so a shift never moves
// where the NEXT occurrence is anchored — e.g. Fortnightly stays exactly 14
// days apart even across a holiday, instead of drifting.
function rawDaily(start, end) {
  const out = []
  let cur = new Date(start.getTime())
  while (cur <= end) {
    out.push(new Date(cur.getTime()))
    cur = addDays(cur, 1)
  }
  return out
}

// Covers Weekly (n=7), "2D" (n=2), and Fortnightly (n=14).
function rawEveryNDays(start, end, n) {
  const out = []
  let cur = new Date(start.getTime())
  while (cur <= end) {
    out.push(new Date(cur.getTime()))
    cur = addDays(cur, n)
  }
  return out
}

// Covers Monthly (everyNMonths=1), Quarterly (3), and Yearly (12).
function rawMonthly(start, end, everyNMonths) {
  const out = []
  let step = 0
  while (true) {
    const d = addMonthsClamped(start, step * everyNMonths)
    if (d > end) break
    out.push(d)
    step++
  }
  return out
}

// Covers E2nd (n=2) and E3rd (n=3) — the Nth occurrence of the anchor's
// weekday, every month. The anchor's weekday is fixed for the whole series
// (e.g. if start_date is a Saturday, every generated date is the Nth
// Saturday of its month).
function rawNthWeekdayEachMonth(start, end, n) {
  const weekday = start.getDay()
  const out = []
  let y = start.getFullYear()
  let m = start.getMonth()
  while (true) {
    const d = nthWeekdayOfMonth(y, m, weekday, n)
    if (d > end) break
    if (d.getMonth() === m) out.push(d) // drop if the Nth occurrence overflowed past this month
    m++
    if (m > 11) {
      m = 0
      y++
    }
  }
  return out
}

// ── Main entry point ─────────────────────────────────────────────────────
// Returns [{ date, iso, shiftedFrom }].
export function generateOccurrences(frequency, startDate, endDate, holidaySet) {
  let raw
  switch (frequency) {
    case 'D':
      raw = rawDaily(startDate, endDate)
      break
    case 'W':
      raw = rawEveryNDays(startDate, endDate, 7)
      break
    case '2D':
      raw = rawEveryNDays(startDate, endDate, 2)
      break
    case 'F':
      raw = rawEveryNDays(startDate, endDate, 14)
      break
    case 'M':
      raw = rawMonthly(startDate, endDate, 1)
      break
    case 'Q':
      raw = rawMonthly(startDate, endDate, 3)
      break
    case 'Y':
      raw = rawMonthly(startDate, endDate, 12)
      break
    case 'E2nd':
      raw = rawNthWeekdayEachMonth(startDate, endDate, 2)
      break
    case 'E3rd':
      raw = rawNthWeekdayEachMonth(startDate, endDate, 3)
      break
    default:
      raw = []
  }

  const seenISO = new Set() // guards against two shifted dates colliding on the same day, within this one task's own series
  const out = []

  raw.forEach((rawDate) => {
    if (frequency === 'D') {
      // Daily is DENSE — there's already a candidate for every calendar
      // day. A non-working day is EXCLUDED here, never shifted: shifting
      // Sunday's task onto Monday would collide with Monday's own,
      // separately-generated, Daily occurrence — a guaranteed duplicate.
      if (!isWorkingDay(rawDate, holidaySet)) return
      out.push({ date: rawDate, iso: dateToISO(rawDate), shiftedFrom: null })
      return
    }
    // Every other frequency is SPARSE (days/weeks/months apart) — shifting
    // one occurrence forward by a day or two is safe because it can't
    // reach the next occurrence in the series.
    const shifted = shiftToWorkingDay(rawDate, holidaySet)
    const iso = dateToISO(shifted)
    if (seenISO.has(iso)) return // two occurrences collapsed onto the same shifted day — drop the second rather than duplicate it
    seenISO.add(iso)
    const rawISO = dateToISO(rawDate)
    out.push({ date: shifted, iso, shiftedFrom: iso !== rawISO ? rawISO : null })
  })

  return out
}

// ── Fetches ───────────────────────────────────────────────────────────────
export async function fetchSchedulerEmployees() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/Employee_details?select=Emp_id,Employee_name,Employee_Dept,Location,Email_Id&order=Employee_name`,
    { headers: SB_HDRS() }
  )
  const rows = await res.json()
  return Array.isArray(rows) ? rows : []
}

// Holiday List's RLS policy is scoped to the 'anon' role specifically (see
// HolidayOverlay.jsx) — it must be fetched with the anon key even though
// the user is logged in, not with SB_HDRS()'s user JWT. Grouped by the
// RAW (unnormalized) Location value, matching production's tsInit()
// exactly — normalization only happens on the lookup side, in
// holidaySetForLocation below.
export async function fetchHolidaysByLocation() {
  const holAnonHdrs = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, Accept: 'application/json' }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/Holiday%20List?select=Date,Location`, { headers: holAnonHdrs })
  const rows = await res.json()
  const byLoc = {}
  ;(Array.isArray(rows) ? rows : []).forEach((h) => {
    const loc = h.Location || 'Mumbai'
    if (!byLoc[loc]) byLoc[loc] = new Set()
    byLoc[loc].add(String(h.Date).slice(0, 10))
  })
  return byLoc
}

// Ported from tsHolidaySetForEmployee — looks up the employee's NORMALIZED
// location in the RAW-keyed map fetchHolidaysByLocation returned.
export function holidaySetForLocation(holidaysByLoc, employeeLocation) {
  const locKey = normalizeHolidayLocation(employeeLocation)
  return holidaysByLoc[locKey] || new Set()
}

// Auto-fill branch_id from this employee's most recent existing checklist
// row. branch_id isn't stored on Employee_details (only Location is), and
// the `branches` table isn't readable with the anon/user key, so this is
// the most reliable source available. MIS can still type over it by hand.
export async function fetchAutoBranchId(empId) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/employee_checklists?select=branch_id&emp_id=eq.${encodeURIComponent(empId)}&branch_id=not.is.null&order=id.desc&limit=1`,
      { headers: SB_HDRS() }
    )
    const rows = await res.json()
    if (Array.isArray(rows) && rows[0] && rows[0].branch_id != null) return rows[0].branch_id
  } catch {
    /* non-fatal — MIS can enter branch_id manually */
  }
  return null
}

// Advisory duplicate check — one query per DISTINCT task name in the batch
// (two rows sharing a task name only need one lookup), all in parallel.
// Read-only, advisory only — MIS can still choose to insert anyway.
export async function fetchExistingDatesByTaskName(empId, taskNames) {
  const distinctNames = [...new Set(taskNames)]
  const existingByName = {}
  await Promise.all(
    distinctNames.map(async (name) => {
      existingByName[name] = new Set()
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/employee_checklists?select=planned_date&emp_id=eq.${encodeURIComponent(empId)}&task_name=eq.${encodeURIComponent(name)}`,
          { headers: SB_HDRS() }
        )
        const rows = await res.json()
        if (Array.isArray(rows)) {
          rows.forEach((r) => {
            if (r.planned_date) existingByName[name].add(String(r.planned_date).slice(0, 10))
          })
        }
      } catch {
        /* non-fatal */
      }
    })
  )
  return existingByName
}

// Flattens per-task occurrence lists into one combined, ordered preview
// list. `seenKeys` catches duplicates against the database AND against an
// earlier row in this SAME batch (e.g. two task rows that happen to land
// on the same date under the same task name).
export function buildPreviewRows(perTask, existingByName) {
  const seenKeys = new Set()
  const previewRows = []
  perTask.forEach((t) => {
    t.occurrences.forEach((o) => {
      const key = t.taskName + '|' + o.iso
      const isDuplicate = (existingByName[t.taskName] && existingByName[t.taskName].has(o.iso)) || seenKeys.has(key)
      seenKeys.add(key)
      previewRows.push({ ...o, taskName: t.taskName, frequency: t.frequency, isDuplicate })
    })
  })
  return previewRows
}

// Regroups the flat preview list back into one entry per (task name,
// frequency) — the shape the backend endpoint expects, since it does one
// insert batch per task.
export function groupPreviewRowsForSubmit(previewRows) {
  const grouped = []
  const indexByKey = {}
  previewRows.forEach((r) => {
    const key = r.taskName + '|' + r.frequency
    if (!(key in indexByKey)) {
      indexByKey[key] = grouped.length
      grouped.push({ task_name: r.taskName, frequency: r.frequency, planned_dates: [] })
    }
    grouped[indexByKey[key]].planned_dates.push(r.iso)
  })
  return grouped
}

export async function submitGeneratedTasks({ empId, branchId, tasks, callerEmail }) {
  const res = await fetch(`${PAPI_URL}/api/admin/generate-checklist-tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Email': callerEmail },
    body: JSON.stringify({
      emp_id: Number(empId),
      branch_id: branchId ? Number(branchId) : null,
      tasks,
    }),
  })
  const data = await res.json()
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}
