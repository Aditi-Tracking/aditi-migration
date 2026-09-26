// Collections & Repeat Orders Dashboard — read-only analytics on top of a Google Apps Script
// endpoint (a Google Sheet exposed as a web app), same integration shape as
// lib/enterpriseSolutions.js's ESOL_URL (plain fetch, no Supabase). 100% read-only.
//
// Raw shape: { sheet, count, data: [{ Date, "Month name", No, Name, Location, "Monthly Target",
// Commitment, Achievement, "Commitment Calls", "Achievement Calls", "Resale Amt", MTD, Status }] }.
// Each row is one telecaller's one day at one branch:
// - Commitment / "Commitment Calls": that day's committed (planned) business value and call count
// - Achievement / "Achievement Calls": that day's actual value and calls done — Achievement is
//   shown throughout this dashboard as "Outstanding" (the sheet owner's own naming; the values
//   are unchanged, only the label)
// - "Resale Amt": that day's repeat/resale order value — the "Repeat Orders" half of this
//   dashboard's name
// - MTD: the sheet's own running month-to-date cumulative total (Achievement + Resale, summed
//   from the 1st of the month through this row's date) — NOT a per-row total, so it's kept
//   separate from `total` (this row's own Achievement + Resale) rather than conflated with it
// - "Monthly Target": each employee's monthly target, formatted with Indian digit-grouping
//   commas (e.g. "30,00,000") — parsed to a plain number
// - Status: 'Week Off '/'On Leave '/blank
//
// Date quirk (confirmed by cross-checking every row's Date against its own "Month name"): the
// sheet does NOT emit a single consistent day/month order. Days 1-12 of a month come out
// MM/DD/YYYY while days 13-31 come out DD/MM/YYYY (a classic Google Sheets locale artifact —
// Date objects display MM/DD by default, but flip to DD/MM once the day exceeds 12 and MM/DD
// would be invalid). "Month name" is reliable ground truth, so parseRowDate uses it to
// disambiguate which slash-separated segment is the day vs the month, instead of assuming one
// fixed order like the previous sheet (whose dates were unambiguously DD/MM throughout).
const COLLECTIONS_URL = 'https://script.google.com/macros/s/AKfycbxwLcnPnMH8QJehPf4ot1gWXyNzHZ_MVD1S9vStRSfeX81Uz9_uEYfj4ZZBk5NcdXA/exec'

export const COLLECTIONS_PAGE_SIZE = 25
export const COLLECTIONS_CHART_PALETTE = ['#00d4aa', '#3b82f6', '#f0a500', '#a78bfa', '#10b981', '#ff5c7c', '#f5a623', '#6366f1']

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// ── Permission ───────────────────────────────────────────────────────────────
// Same shape as lib/enterpriseSolutions.js's canAccessEnterpriseSolutions / lib/enterpriseLead.js's
// canAccessEnterprise: the Flask backend has no can_view_collections column yet, so
// permissions.can_view_collections is always undefined today — this falls through to a hardcoded
// owner/mis/pc/executive-assistant/ea role check (same tier as those two other financial
// dashboards) until that column exists, at which point a real 'true'/'false' from the backend
// takes over automatically.
export function canAccessCollections(currentUser, permissions) {
  if (permissions?.can_view_collections === undefined) {
    const r = String(currentUser?.rawRole || currentUser?.role || '').toLowerCase().trim()
    return r === 'owner' || r === 'mis' || r === 'pc' || r === 'executive assistant' || r === 'ea'
  }
  return permissions.can_view_collections === 'true'
}

export async function fetchCollectionsRaw() {
  const res = await fetch(COLLECTIONS_URL)
  if (!res.ok) throw new Error(String(res.status))
  const json = await res.json()
  if (!json || !Array.isArray(json.data)) throw new Error('API returned an unexpected shape — expected {data:[]}')
  return json.data
}

// 'A/B/YYYY' + the row's own stated month name -> Date (local). Whichever of A/B matches the
// stated month's number is treated as the month, the other as the day — see the header comment
// above for why a fixed MM/DD or DD/MM assumption doesn't hold for this sheet. Falls back to
// MM/DD (the sheet's more common emission) if neither segment matches the stated month.
export function parseRowDate(raw, monthName) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(raw || '').trim())
  if (!m) return null
  const a = +m[1]
  const b = +m[2]
  const year = +m[3]
  const monthIdx = MONTH_NAMES.findIndex((mn) => mn.toLowerCase() === String(monthName || '').trim().toLowerCase())
  let day, month
  if (monthIdx !== -1 && b === monthIdx + 1) {
    month = b
    day = a
  } else {
    month = a
    day = b
  }
  const d = new Date(year, month - 1, day)
  return isNaN(d.getTime()) ? null : d
}

function parseMonthlyTarget(raw) {
  return Number(String(raw || '').replace(/,/g, '').trim()) || 0
}

// Local calendar date -> 'YYYY-MM-DD', using local getters (not toISOString(), which converts to
// UTC first and can silently shift the date by a day) — matches the <input type="date"> value
// format exactly, so the date filter can compare them directly.
export function isoDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// All amounts in this sheet run into lakhs, so every aggregate display (KPI tiles, chart axes/
// tooltips/labels) is shown in Lakhs rather than full rupee digit-grouping — only the Entries
// table keeps exact per-row rupee amounts, where a single day's value is small enough that "L"
// would lose precision.
export function formatLakh(n) {
  const v = Number(n) || 0
  const sign = v < 0 ? '-' : ''
  return `${sign}₹${(Math.abs(v) / 100000).toFixed(2)}L`
}

// Same idea as formatLakh, but for the Employee Summary table — a single week's per-employee
// amounts are often well under a lakh, where "₹0.06L" reads worse than "₹6.0k". Steps down to
// thousands below 1 lakh, and to plain rupees below 1 thousand, instead of always dividing by
// 100000.
export function formatMoneyAdaptive(n) {
  const v = Number(n) || 0
  const sign = v < 0 ? '-' : ''
  const abs = Math.abs(v)
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2)}L`
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}k`
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`
}

// Normalizes the raw API payload into one row per telecaller-day, coercing every numeric field
// defensively and trimming the sheet's stray trailing spaces on text fields (e.g. 'Guddu ',
// 'Mumbai ').
export function normalizeCollectionsRows(rawRows) {
  const daily = []
  for (const r of rawRows || []) {
    const month = String(r['Month name'] || '').trim()
    const location = String(r.Location || '').trim() || 'Unspecified'
    const name = String(r.Name || '').trim()
    const date = parseRowDate(r.Date, month)
    if (!date || !name) continue

    const commitment = Number(r.Commitment) || 0
    const outstanding = Number(r.Achievement) || 0 // shown in the UI as "Outstanding"
    const commitmentCalls = Number(r['Commitment Calls']) || 0
    const connectCall = Number(r['Achievement Calls']) || 0
    const resale = Number(r['Resale Amt']) || 0
    const mtd = Number(r.MTD) || 0
    const monthlyTarget = parseMonthlyTarget(r['Monthly Target'])
    const remark = String(r.Status || '').trim()

    daily.push({
      month, location, name, date, dateStr: r.Date,
      commitment, commitmentCalls, connectCall, resale, outstanding, mtd, monthlyTarget, remark,
      total: outstanding + resale,
    })
  }
  daily.sort((a, b) => a.date - b.date)
  return daily
}

export function uniqueSorted(rows, key) {
  return [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort()
}

// Month options in real calendar order (not alphabetical) — derived from whichever months are
// actually present in the data, so a new month appearing in the sheet needs no code change here.
export function sortedMonths(rows) {
  return uniqueSorted(rows, 'month').sort((a, b) => MONTH_NAMES.indexOf(a) - MONTH_NAMES.indexOf(b))
}

export const EMPTY_COLLECTIONS_FILTERS = { month: '', week: '', date: '', location: '', name: '' }

// `week` is a 1-based week-of-month NUMBER ('1'..'N'), only meaningful together with `month` —
// silently ignored if `month` isn't set, matching the filter bar disabling it until a month is
// chosen. Resolved against that month's own real Mon-Sat calendar weeks (getWeekOptions further
// below) — the same week-boundary logic the Employee Weekly Summary table's own week picker uses
// — not artificial day-of-month chunks, so "Week 1" always means an actual calendar week, even
// though its first/last instance can dip a day or two into the adjacent month (a real Mon-Sat
// week sometimes straddles a month boundary; only the rows that actually belong to the selected
// month are ever included, since `scoped` is filtered to that month before the week is applied).
export function filterCollectionsRows(rows, { month, week, date, location, name }) {
  let scoped = month ? rows.filter((r) => r.month === month) : rows
  if (month && week) {
    const weeksInMonth = getWeekOptions(scoped)
    const target = weeksInMonth[Number(week) - 1]
    if (target) scoped = scoped.filter((r) => r.date >= target.start && r.date <= target.end)
  }
  return scoped.filter((r) => {
    if (date && isoDateStr(r.date) !== date) return false
    if (location && r.location !== location) return false
    if (name && r.name !== name) return false
    return true
  })
}

// Options for the global "Week" filter select — numbered Week 1..N within whichever month is
// currently selected (empty until a month is chosen, since a week number means nothing without
// one), each labeled with its real Mon-Sat calendar date range.
export function getMonthWeekOptions(rows, month) {
  if (!month) return []
  const monthRows = rows.filter((r) => r.month === month)
  return getWeekOptions(monthRows).map((w, i) => ({ value: String(i + 1), label: `Week ${i + 1} (${w.label})` }))
}

// Sums a numeric field grouped by key, in first-seen order (Map preserves insertion order) — used
// by both the location and employee charts.
export function groupSumBy(rows, key, valueKey) {
  const map = new Map()
  rows.forEach((r) => map.set(r[key], (map.get(r[key]) || 0) + Number(r[valueKey] || 0)))
  return map
}

// One combined total per date, across whichever rows are currently in scope — powers the trend
// chart's 3 lines (Outstanding/Repeat Orders/Commitment) in one pass.
export function groupByDate(rows) {
  const map = new Map()
  rows.forEach((r) => {
    const key = r.dateStr
    const cur = map.get(key) || { date: r.date, dateStr: r.dateStr, outstanding: 0, resale: 0, commitment: 0 }
    cur.outstanding += r.outstanding
    cur.resale += r.resale
    cur.commitment += r.commitment
    map.set(key, cur)
  })
  return [...map.values()].sort((a, b) => a.date - b.date)
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// The Monday (local midnight) of the week containing `d` — getDay() is 0=Sun..6=Sat, so this
// walks back (day - Monday) days regardless of which day of the week `d` itself falls on.
function mondayOf(d) {
  const day = d.getDay()
  const diff = (day + 6) % 7 // Mon=0, Tue=1, ..., Sun=6
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff)
}

// This sheet's work week is Monday-Saturday (no Sunday rows) — every Mon-Sat window spanning the
// data's date range, earliest first, for the Employee Summary table's own week filter.
export function getWeekOptions(rows) {
  if (!rows.length) return []
  const dates = rows.map((r) => r.date)
  const minDate = new Date(Math.min(...dates))
  const maxDate = new Date(Math.max(...dates))
  const weeks = []
  let monday = mondayOf(minDate)
  const lastMonday = mondayOf(maxDate)
  while (monday <= lastMonday) {
    const saturday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 5)
    const key = isoDateStr(monday)
    const label = `${monday.getDate()} ${MONTH_ABBR[monday.getMonth()]} – ${saturday.getDate()} ${MONTH_ABBR[saturday.getMonth()]}`
    weeks.push({ key, label, start: monday, end: saturday })
    monday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7)
  }
  return weeks
}

export function filterRowsByWeek(rows, weekKey, weeks) {
  if (!weekKey) return rows
  const week = weeks.find((w) => w.key === weekKey)
  if (!week) return rows
  return rows.filter((r) => r.date >= week.start && r.date <= week.end)
}

// Per-employee rollup for the Employee Summary table — Achievement % is measured against this
// same scope's own Commitment total (not the employee's fixed Monthly Target), so it stays
// meaningful whatever date range is selected (a single week's achievement vs a whole month's
// target would understate every employee by construction).
export function summarizeByEmployee(rows) {
  const names = uniqueSorted(rows, 'name')
  return names.map((name) => {
    const rowsForName = rows.filter((r) => r.name === name)
    const callsPlanned = rowsForName.reduce((s, r) => s + r.commitmentCalls, 0)
    const callsDone = rowsForName.reduce((s, r) => s + r.connectCall, 0)
    const commitment = rowsForName.reduce((s, r) => s + r.commitment, 0)
    const outstanding = rowsForName.reduce((s, r) => s + r.outstanding, 0)
    const resale = rowsForName.reduce((s, r) => s + r.resale, 0)
    const total = outstanding + resale
    const achievementPct = commitment > 0 ? (total / commitment) * 100 : 0
    return { name, callsPlanned, callsDone, commitment, outstanding, resale, total, achievementPct }
  })
}
