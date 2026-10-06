// Collections & Repeat Orders Dashboard — read-only analytics on top of a Google Apps Script
// endpoint (a Google Sheet exposed as a web app), same integration shape as
// lib/enterpriseSolutions.js's ESOL_URL (plain fetch, no Supabase). 100% read-only.
//
// Raw shape: { success, count, data: [{ month, date, location, name, connectCall, nbd, resale,
// outstanding, total, remark, isSunday }] }. Each row is one telecaller's one day at one branch:
// - date: unambiguous 'DD/MM/YYYY' (unlike the previous sheet's day/month-order-flips-at-13
//   quirk) — parseRowDate no longer needs a month name to disambiguate it.
// - month: full name for some months, 3-letter abbreviation for others as emitted by the sheet
//   itself (seen: 'June'/'July' full, 'Aug'/'Sept' abbreviated) — normalizeMonthName maps
//   whichever form shows up to its canonical full name via prefix match, so sortedMonths/filters
//   never see both 'Aug' and 'August' as two different months.
// - connectCall: that day's calls actually done.
// - nbd: a new per-row value (deal/business value, name as given by the sheet) not surfaced as
//   its own tile/column for now — it's already folded into `total` by the sheet itself (verified:
//   total === resale + outstanding + nbd), so Grand Total still reflects it even though it has no
//   dedicated UI yet.
// - remark: replaces the old Status column ('WO'/'AB'/'SL'/'Visha'/'Off'/'PL'/'HD'/'WF'/blank —
//   shown as-is, no longer just Week Off/On Leave).
// - isSunday: a flag for a Sunday row: always false in every row seen so far (this source hasn't
//   started emitting real Sunday entries yet), carried through but not used for any filtering.
//
// Month-total row quirk (confirmed across all 28 employee×month groups present, zero exceptions):
// the sheet appends one extra row per employee per month, dated as that month's last day so far,
// whose total/resale/outstanding/connectCall exactly equal the SUM of that employee's real daily
// rows for the month — i.e. a running month-to-date total disguised as one more daily row. Left
// in, it would silently double-count every KPI/chart/summary total. normalizeCollectionsRows
// detects and drops it per (name, month) group (matched by total equality, not by date, since its
// date is just "whatever day it is when fetched", not a fixed end-of-month marker).
//
// Commitment/target data lives in a SEPARATE sheet on the same Apps Script, fetched from the same
// URL with `?sheet=Sheet6` and merged in by fetchCollectionsTargetsRaw/mergeCollectionsTargets.
// Its raw shape: [{ date, name, location, monthlyTarget, commitment, commitmentCalls }] — no
// `month`/`total`/other fields, joined onto the main rows by (date, name). Only covers Aug 2026
// onward (49 dates) — earlier months (June/July) have no commitment data at all, since this sheet
// simply doesn't go back that far, so those rows show 0 Calls Planned/Commitment/Achievement %.
// One data-quality quirk here too: 29/08/2026 has a literal duplicate row per employee (typo
// re-entry, not a computed total like the main sheet's quirk) — mergeCollectionsTargets keeps
// whichever occurrence comes last in the sheet, on the assumption a later duplicate is a
// correction of an earlier one, not the other way round.
const COLLECTIONS_URL = 'https://script.google.com/macros/s/AKfycbwCerophLS1zNBzdN1Uhd5-zyCSrGxs_LzAyGcntyIv96SrSr0TuENkjvoSwTvLXt8/exec'
const COLLECTIONS_TARGETS_URL = `${COLLECTIONS_URL}?sheet=Sheet6`

export const COLLECTIONS_PAGE_SIZE = 25
export const COLLECTIONS_CHART_PALETTE = ['#00d4aa', '#3b82f6', '#f0a500', '#a78bfa', '#10b981', '#ff5c7c', '#f5a623', '#6366f1']

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

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

// This Apps Script deployment's content-delivery layer is intermittently flaky — a request can
// 404 even though the script itself ran fine (confirmed directly in the Apps Script Executions
// log: every single doGet shows "Completed" in 1-8s, with no errors at all — the install-triggers
// cache-warming fix made the SCRIPT itself fast and reliable; the 404s happen one layer above it,
// in Google's own delivery of the response, which no amount of script-side optimization fixes).
// A failing attempt can still take a while to give up and return that 404 (seen: 10-80s), but a
// SUCCEEDING one is now fast (same 1-8s the Executions log shows), so retrying is cheap when it
// works — 4 attempts here, up from 2, trading a slightly larger worst-case wait (if every attempt
// happens to fail) for meaningfully better odds of landing on a working one.
async function fetchWithRetry(url, attempts = 4, delayMs = 700) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return res
      lastErr = new Error(String(res.status))
    } catch (e) {
      lastErr = e
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs))
  }
  throw lastErr
}

// sessionStorage cache so a merely-slow (not failing) load only has to happen once per tab per
// window, not on every mount/navigation back to this dashboard — same pattern as
// lib/enterpriseLead.js's own fetchEnterpriseLeads cache, just keyed per endpoint here since the
// main sheet and the targets sheet are two independent fetches.
const CACHE_TTL_MS = 5 * 60 * 1000
function readCache(key) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(key) || 'null')
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data
  } catch {
    // Corrupt/inaccessible cache (private browsing, quota, bad JSON) — fall through to a real fetch.
  }
  return undefined
}
function writeCache(key, data) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
  } catch {
    // Storage full/unavailable — caching is a pure optimization, safe to skip silently.
  }
}

export async function fetchCollectionsRaw({ forceRefresh = false } = {}) {
  const cacheKey = 'collectionsRaw:cache:v1'
  if (!forceRefresh) {
    const cached = readCache(cacheKey)
    if (cached) return cached
  }
  const res = await fetchWithRetry(COLLECTIONS_URL)
  const json = await res.json()
  if (!json || !Array.isArray(json.data)) throw new Error('API returned an unexpected shape — expected {data:[]}')
  writeCache(cacheKey, json.data)
  return json.data
}

export async function fetchCollectionsTargetsRaw({ forceRefresh = false } = {}) {
  const cacheKey = 'collectionsTargetsRaw:cache:v1'
  if (!forceRefresh) {
    const cached = readCache(cacheKey)
    if (cached) return cached
  }
  const res = await fetchWithRetry(COLLECTIONS_TARGETS_URL)
  const json = await res.json()
  if (!json || !Array.isArray(json.data)) throw new Error('Targets API returned an unexpected shape — expected {data:[]}')
  writeCache(cacheKey, json.data)
  return json.data
}

// 'DD/MM/YYYY' -> Date (local). Day and year come from the string, but month comes from the row's
// own stated month name (`monthName`, already run through normalizeMonthName by the caller) rather
// than the string's own middle segment — the sheet has had rows where that segment was mistyped
// (e.g. '07/01/2026' on a row stated as "Oct", clearly meant to be '07/10/2026'). Left as the
// string's own month, a typo like that silently misfiles the row into an unrelated calendar month,
// which then blows up any month-scoped computation built from these dates (getWeekOptions' min/max
// range, in particular, since one such row can stretch "this month's weeks" back to January). Falls
// back to the string's own month segment only if `monthName` doesn't resolve to a real month.
export function parseRowDate(raw, monthName) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(raw || '').trim())
  if (!m) return null
  const day = +m[1]
  const year = +m[3]
  const monthIdx = MONTH_NAMES.indexOf(normalizeMonthName(monthName))
  const month = monthIdx !== -1 ? monthIdx + 1 : +m[2]
  const d = new Date(year, month - 1, day)
  return isNaN(d.getTime()) ? null : d
}

// Maps whichever form the sheet emits ('Aug', 'Sept', 'June', ...) to its canonical full name —
// see header comment. Falls back to the trimmed raw value if it matches no month at all.
function normalizeMonthName(raw) {
  const trimmed = String(raw || '').trim().toLowerCase()
  const found = MONTH_NAMES.find((mn) => mn.toLowerCase().startsWith(trimmed) && trimmed.length >= 3)
  return found || String(raw || '').trim()
}

// Local calendar date -> 'YYYY-MM-DD', using local getters (not toISOString(), which converts to
// UTC first and can silently shift the date by a day) — matches the <input type="date"> value
// format exactly, so the date filter can compare them directly.
export function isoDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Aggregate display (KPI tiles, chart axes/tooltips/labels) — Lakhs below 1 crore, Crores at or
// above it (a whole-dataset/"All Months" total routinely clears 1 Cr, where "512.34L" reads worse
// than "5.12Cr"). Only the Entries table keeps exact per-row rupee amounts, where a single day's
// value is small enough that this would lose precision.
export function formatLakh(n) {
  const v = Number(n) || 0
  const sign = v < 0 ? '-' : ''
  const abs = Math.abs(v)
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)}Cr`
  return `${sign}₹${(abs / 100000).toFixed(2)}L`
}

// Same idea as formatLakh, but for the Employee Summary table — a single week's per-employee
// amounts are often well under a lakh, where "₹0.06L" reads worse than "₹6.0k". Steps down to
// thousands below 1 lakh and to plain rupees below 1 thousand, and up to Crores at/above 1 crore,
// instead of always dividing by 100000.
export function formatMoneyAdaptive(n) {
  const v = Number(n) || 0
  const sign = v < 0 ? '-' : ''
  const abs = Math.abs(v)
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)}Cr`
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2)}L`
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}k`
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`
}

// Builds a (date, name) -> {commitment, commitmentCalls, monthlyTarget} lookup from the targets
// sheet's raw rows — see header comment for the join key and the 29/08 duplicate-row handling
// (a plain Map keeps whichever occurrence is set last, i.e. the later one in sheet order).
function buildTargetsLookup(targetRows) {
  const map = new Map()
  for (const r of targetRows || []) {
    const name = String(r.name || '').trim().toLowerCase()
    const dateStr = String(r.date || '').trim()
    if (!name || !dateStr) continue
    map.set(`${dateStr}|${name}`, {
      commitment: Number(r.commitment) || 0,
      commitmentCalls: Number(r.commitmentCalls) || 0,
      monthlyTarget: Number(r.monthlyTarget) || 0,
    })
  }
  return map
}

// Normalizes the raw API payload into one row per telecaller-day, coercing every numeric field
// defensively, trimming stray whitespace on text fields, dropping each employee-month's synthetic
// running-total row, and merging in that day's commitment/target data from the separate targets
// sheet (see header comment) — `targetRows` defaults to none, so callers that only need the main
// sheet's numbers can omit it entirely.
export function normalizeCollectionsRows(rawRows, targetRows = []) {
  const targets = buildTargetsLookup(targetRows)
  const parsed = []
  for (const r of rawRows || []) {
    const month = normalizeMonthName(r.month)
    const location = String(r.location || '').trim() || 'Unspecified'
    const name = String(r.name || '').trim()
    const date = parseRowDate(r.date, month)
    if (!date || !name) continue

    const connectCall = Number(r.connectCall) || 0
    const resale = Number(r.resale) || 0
    const outstanding = Number(r.outstanding) || 0
    const total = Number(r.total) || 0
    const remark = String(r.remark || '').trim()
    const target = targets.get(`${String(r.date || '').trim()}|${name.toLowerCase()}`)
    const commitment = target?.commitment || 0
    const commitmentCalls = target?.commitmentCalls || 0
    const monthlyTarget = target?.monthlyTarget || 0

    parsed.push({
      month, location, name, date, dateStr: r.date, connectCall, resale, outstanding, total, remark,
      commitment, commitmentCalls, monthlyTarget,
    })
  }

  // Group indices by employee+month, then within each group find the one row whose total equals
  // the sum of every other row's total in that group — that's the synthetic month-total row.
  // `total > 0` guards against a degenerate all-zero group falsely "matching" every row in it.
  //
  // Candidates are checked LATEST-DATED FIRST, not in raw array order — when a month has only one
  // real reporting day so far, that one real row's total and the synthetic row's total are
  // identical (the "sum" of a single day is just that day), so both rows satisfy the equality
  // check and which one gets dropped becomes a coin flip by iteration order. The synthetic row is
  // structurally always the latest-dated one for that employee that month (it's appended as/after
  // the month rolls on), so preferring the latest match resolves the tie correctly — confirmed
  // against a real case where Oct had only 1 Oct active day: the real 01/10 row and a duplicate
  // 31/10 row both totaled the same, and checking in array order wrongly dropped the real 01/10 row.
  const groups = new Map()
  parsed.forEach((r, i) => {
    const key = `${r.name}|${r.month}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(i)
  })
  const dropped = new Set()
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue
    const byLatestFirst = [...idxs].sort((a, b) => parsed[b].date - parsed[a].date)
    for (const i of byLatestFirst) {
      const sumOthers = idxs.filter((j) => j !== i).reduce((s, j) => s + parsed[j].total, 0)
      if (parsed[i].total > 0 && Math.abs(parsed[i].total - sumOthers) < 0.01) {
        dropped.add(i)
        break
      }
    }
  }

  const daily = parsed.filter((_, i) => !dropped.has(i))

  // The main sheet can also have a plain stray duplicate row for the SAME (date, name) that isn't
  // the month-total pattern above — seen on 30/09/2026, where every employee has both their real
  // day's row and an extra all-zero one. Harmless for connectCall/resale/outstanding/total (the
  // duplicate just adds 0), but commitment/commitmentCalls/monthlyTarget come from the separate
  // by-(date,name) targets lookup and get attached to EVERY row sharing that key — so a duplicate
  // row doubles them when a caller sums per row (KPI tiles, Employee Summary). Keep those 3 fields
  // on only one row per (date, name) — whichever one actually has real activity, since that's the
  // row genuinely representing the day — and zero them out on any other row sharing the same key.
  const byDateName = new Map()
  daily.forEach((r) => {
    const key = `${r.dateStr}|${r.name}`
    if (!byDateName.has(key)) byDateName.set(key, [])
    byDateName.get(key).push(r)
  })
  for (const group of byDateName.values()) {
    if (group.length < 2) continue
    const primary = group.find((r) => r.total !== 0 || r.connectCall !== 0) || group[0]
    for (const r of group) {
      if (r === primary) continue
      r.commitment = 0
      r.commitmentCalls = 0
      r.monthlyTarget = 0
    }
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

// Per-employee rollup for the Employee Summary table. Achievement % is measured against this same
// scope's own Commitment total (not monthlyTarget), so it stays meaningful whatever date range is
// selected — a single week's achievement vs a whole month's target would understate every
// employee by construction. monthlyTarget itself is shown separately, taken from this employee's
// most recent row in scope (rows arrive date-sorted ascending), since it can change month to month.
export function summarizeByEmployee(rows) {
  const names = uniqueSorted(rows, 'name')
  return names.map((name) => {
    const rowsForName = rows.filter((r) => r.name === name)
    const callsPlanned = rowsForName.reduce((s, r) => s + r.commitmentCalls, 0)
    const callsDone = rowsForName.reduce((s, r) => s + r.connectCall, 0)
    const commitment = rowsForName.reduce((s, r) => s + r.commitment, 0)
    const outstanding = rowsForName.reduce((s, r) => s + r.outstanding, 0)
    const resale = rowsForName.reduce((s, r) => s + r.resale, 0)
    const total = rowsForName.reduce((s, r) => s + r.total, 0)
    const achievementPct = commitment > 0 ? (total / commitment) * 100 : 0
    const monthlyTarget = rowsForName[rowsForName.length - 1]?.monthlyTarget || 0
    return { name, callsPlanned, callsDone, commitment, outstanding, resale, total, achievementPct, monthlyTarget }
  })
}
