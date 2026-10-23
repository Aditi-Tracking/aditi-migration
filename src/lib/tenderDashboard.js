// Tender & Project dashboard — backed by a Google Apps Script web app over a tender-tracking
// sheet. The Apps Script's own header row used to be broken (it was reading the wrong sheet row,
// landing on a real data row instead of the labels row) — that's since been fixed on the script
// side, so the response now comes back with clean, stable column names (see FIELDS below) matching
// {success, count, columns, data}. Verified against a live reference screenshot of this sheet:
// Total 42/Submitted 20/Pipeline 4/Not Submitted 18, the month-wise breakdown, and the
// submitted-bids stage breakdown all match exactly.
const TENDER_URL = 'https://script.google.com/macros/s/AKfycbynS2ZkjpOO-71W3_8tAWjcLJRvZM_0Bc0KjpLgAOO0TvdPsJr-Dm4PC5qivqMPheVL/exec'

// ── Permission ───────────────────────────────────────────────────────────────
// Same shape as lib/collectionsDashboard.js's canAccessCollections: the Flask backend has no
// can_view_tender column yet, so permissions.can_view_tender is always undefined today — this
// falls through to a hardcoded owner/mis-only check until that column exists, at which point a
// real 'true'/'false' from the backend takes over automatically (see also PERM_LABELS in
// lib/adminPermissions.js, where the cosmetic label is already in place for whenever it does).
export function canAccessTender(currentUser, permissions) {
  if (permissions?.can_view_tender === undefined) {
    const r = String(currentUser?.rawRole || currentUser?.role || '').toLowerCase().trim()
    return r === 'owner' || r === 'mis'
  }
  return permissions.can_view_tender === 'true'
}

const FIELDS = {
  SR_NO: 'Sr.',
  STATUS: 'Status', // 'Submitted' | 'Not Submitted' | 'Pipeline'
  MONTH: 'Month', // 'Jul 2026', 'Aug 2026', ...
  CLIENT: 'Department / Organisation',
  TENDER_ID: 'Tender ID / Ref.',
  TITLE: 'Tender Description',
  LOCATION: 'Location',
  DUE_DATE: 'Due Date', // 'DD-Mon-YYYY'
  DUE_TIME: 'Time',
  EMD_AMOUNT: 'EMD',
  TENDER_FEE: 'Tender Fee',
  MSME_NOTE: 'EMD Exemption',
  PREBID_NOTE: 'Pre-bid',
  ASSIGNED_TO: 'Assigned To',
  STAGE: 'Bid Stage / Result', // current stage text for Submitted rows
  NOTES: 'Remarks',
}

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

const CACHE_KEY = 'tenderDashboard:cache:v2' // bumped: the Apps Script's header-row fix changed column names from positional garbage to clean field names
const CACHE_TTL_MS = 5 * 60 * 1000
function readCache() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null')
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data
  } catch {
    // Corrupt/inaccessible cache — fall through to a real fetch.
  }
  return undefined
}
function writeCache(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }))
  } catch {
    // Storage full/unavailable — caching is a pure optimization, safe to skip.
  }
}

const MONTH_NAMES = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }

function parseDueDate(s) {
  const m = (s || '').toString().trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
  if (!m) return null
  const mon = MONTH_NAMES[m[2]]
  if (mon === undefined) return null
  return new Date(+m[3], mon, +m[1])
}

// Sortable key for a 'Mon YYYY' month label (e.g. 'Jul 2026') — lets the month-wise table sort
// chronologically regardless of what order the sheet happens to list months in.
function monthSortKey(label) {
  const m = (label || '').trim().match(/^([A-Za-z]{3})\s+(\d{4})$/)
  if (!m) return 0
  const mon = MONTH_NAMES[m[1]]
  if (mon === undefined) return 0
  return +m[2] * 12 + mon
}

export async function fetchTenderRaw({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = readCache()
    if (cached) return cached
  }
  const res = await fetchWithRetry(TENDER_URL)
  const json = await res.json()
  if (!json || json.success === false || !Array.isArray(json.columns) || !Array.isArray(json.data)) {
    throw new Error('API returned an unexpected shape — expected {success, columns:[], data:[]}')
  }
  writeCache(json)
  return json
}

function normalizeRow(row) {
  const get = (field) => (row[field] ?? '').toString().trim()
  return {
    srNo: get(FIELDS.SR_NO),
    status: get(FIELDS.STATUS) || 'Not Submitted',
    month: get(FIELDS.MONTH),
    client: get(FIELDS.CLIENT),
    tenderId: get(FIELDS.TENDER_ID),
    title: get(FIELDS.TITLE),
    location: get(FIELDS.LOCATION),
    dueDateRaw: get(FIELDS.DUE_DATE),
    dueDate: parseDueDate(get(FIELDS.DUE_DATE)),
    dueTime: get(FIELDS.DUE_TIME),
    emdAmount: get(FIELDS.EMD_AMOUNT),
    tenderFee: get(FIELDS.TENDER_FEE),
    msmeNote: get(FIELDS.MSME_NOTE),
    prebidNote: get(FIELDS.PREBID_NOTE),
    assignedTo: get(FIELDS.ASSIGNED_TO),
    stage: get(FIELDS.STAGE),
    notes: get(FIELDS.NOTES),
  }
}

export function normalizeTenderRows(raw) {
  return raw.data.map(normalizeRow).filter((r) => r.client || r.title)
}

// "Due in next 7 days" is about tenders still needing action — a submitted tender's deadline
// already had its action taken, so only Pipeline/Not Submitted rows qualify.
export function isDueInNext7Days(r) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in7Days = new Date(today)
  in7Days.setDate(in7Days.getDate() + 7)
  in7Days.setHours(23, 59, 59, 999)
  return r.status !== 'Submitted' && !!r.dueDate && r.dueDate >= today && r.dueDate <= in7Days
}

export function computeTenderKpis(rows) {
  const total = rows.length
  const submitted = rows.filter((r) => r.status === 'Submitted').length
  const pipeline = rows.filter((r) => r.status === 'Pipeline').length
  const notSubmitted = rows.filter((r) => r.status === 'Not Submitted').length
  const dueIn7Days = rows.filter(isDueInNext7Days).length

  return { total, submitted, pipeline, notSubmitted, dueIn7Days }
}

export function computeMonthSummary(rows) {
  const months = [...new Set(rows.map((r) => r.month).filter(Boolean))].sort((a, b) => monthSortKey(a) - monthSortKey(b))
  const summary = months.map((month) => {
    const monthRows = rows.filter((r) => r.month === month)
    return {
      month,
      total: monthRows.length,
      submitted: monthRows.filter((r) => r.status === 'Submitted').length,
      pipeline: monthRows.filter((r) => r.status === 'Pipeline').length,
      notSubmitted: monthRows.filter((r) => r.status === 'Not Submitted').length,
    }
  })
  const totals = summary.reduce(
    (acc, m) => ({ total: acc.total + m.total, submitted: acc.submitted + m.submitted, pipeline: acc.pipeline + m.pipeline, notSubmitted: acc.notSubmitted + m.notSubmitted }),
    { total: 0, submitted: 0, pipeline: 0, notSubmitted: 0 }
  )
  return { rows: summary, totals }
}

// Fixed bucket order, matching the reference dashboard exactly. Checked in this order because a
// stage note is free text (engineers type whatever's going on, not a controlled value) — more
// specific/unambiguous patterns are checked before the catch-all.
const STAGE_BUCKETS = [
  { label: 'L-rank received (L1, L2...)', test: (s) => /^l-?\d/i.test(s) },
  { label: 'Technical evaluation', test: (s) => /technical\s+evaluation/i.test(s) },
  { label: 'Yet to be opened', test: (s) => /yet to be opened/i.test(s) },
  { label: 'Clarification submitted', test: (s) => /clarification/i.test(s) },
  { label: 'Rejected / Disqualified', test: (s) => /reject|disqualif/i.test(s) },
]

export function computeStageBreakdown(rows) {
  const submitted = rows.filter((r) => r.status === 'Submitted')
  const counts = new Map(STAGE_BUCKETS.map((b) => [b.label, 0]))
  counts.set('Awaiting update (blank)', 0)
  submitted.forEach((r) => {
    const bucket = STAGE_BUCKETS.find((b) => b.test(r.stage))
    counts.set(bucket ? bucket.label : 'Awaiting update (blank)', (counts.get(bucket ? bucket.label : 'Awaiting update (blank)') || 0) + 1)
  })
  return [...counts.entries()].map(([label, count]) => ({ label, count }))
}

// Backs the KPI tiles' click-to-filter — 'total'/null shows everything, the other 4 keys narrow to
// exactly what that tile counted.
export function filterRowsByKpi(rows, kpiKey) {
  switch (kpiKey) {
    case 'submitted':
      return rows.filter((r) => r.status === 'Submitted')
    case 'pipeline':
      return rows.filter((r) => r.status === 'Pipeline')
    case 'notSubmitted':
      return rows.filter((r) => r.status === 'Not Submitted')
    case 'dueIn7Days':
      return rows.filter(isDueInNext7Days)
    default:
      return rows
  }
}
