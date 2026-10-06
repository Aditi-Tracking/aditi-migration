// Enterprise Lead Dashboard. Ported from old-portal/js/enterprise.js. Data source: a single
// Google Apps Script web app (EN_URL) — a call-tracking lead funnel sheet, one row per lead.
// 100% read-only — no writes anywhere.
//
// Sheet reshape (headers confirmed live): the old 6-attempt call-tracking block (bare
// "Connected"/"Time"/"Stage" for the 1st call, "Nth Call - " prefixed for the rest) is gone —
// there's now exactly one call, under the sheet's own typo'd header "1nd Call - Connected"/"1nd
// Call - Time" (literally "1nd", not "1st" — must match exactly). Also gone: "SR.No", "Reason for
// Lost" (both read as blank now, their old header names no longer exist) — gained: "Designation",
// "Demo by", "SO Number", "ACV" (now backs `Revenue`), "Received", "Balance", "Next Payment Date",
// "Lead Quality" ('Valid'/'Invalid'/blank), and "Last Known Stage" (the sheet's own current-stage
// label, replacing the old 1st-call "Stage" cell as the authoritative source — values seen: 'Lost',
// 'Quotation Sent', 'Invalid', 'Future Lead', 'Demo Done', 'Won', 'Trials In Progress',
// 'Negotiation', blank).
const EN_URL = 'https://script.google.com/macros/s/AKfycbyWpT5JkfaGSYCbk30iLJJK9ML_tJd4ZaMwtA1YnPbQYY3WsW2EFnE_7OD1y4Yi94Jz/exec'

// This Apps Script deployment is just plain slow server-side (measured ~8s for a clean response,
// before accounting for the content-delivery flakiness fetchWithRetry below works around, which can
// stack multiple ~8s attempts back to back) — nothing client-side can make Google's own execution
// time faster. A short sessionStorage cache is the practical fix: the panel's own mount-time fetch
// re-hits this on every navigation to the page, which otherwise means re-paying that full ~8s (or
// worse) just to re-open a tab you were already on. `forceRefresh` (wired to the panel's own
// Refresh button) bypasses it outright.
const CACHE_KEY = 'enterpriseLeads:cache:v4' // bumped again: v3 was cached against the previous (HTML-dashboard, non-JSON) EN_URL
const CACHE_TTL_MS = 5 * 60 * 1000

// ── Permission ───────────────────────────────────────────────────────────────
// Ported byte-for-byte from _canAccessEnterprise. The Python permissions backend doesn't have a
// can_view_enterprise column yet, so it never sends this key — until it does, fall back to the
// same hardcoded role list production uses. Forward-compatible: once the backend starts
// returning a real 'true'/'false', that value takes over automatically, with no code change here.
export function canAccessEnterprise(currentUser, permissions) {
  if (permissions?.can_view_enterprise === undefined) {
    const r = String(currentUser?.rawRole || currentUser?.role || '').toLowerCase().trim()
    return r === 'owner' || r === 'mis' || r === 'pc' || r === 'executive assistant' || r === 'ea'
  }
  return permissions.can_view_enterprise === 'true'
}

// ── Fetch + parse ────────────────────────────────────────────────────────────
// Apps Script's content-delivery layer for this deployment is intermittently flaky — the script
// itself always completes successfully, but the final response occasionally 404s anyway. A short
// retry clears this up in practice almost every time, so don't surface an error on the first miss.
async function fetchWithRetry(url, attempts = 3, delayMs = 900) {
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

// The response shape has been unstable historically — all 4 branches are preserved even though
// only {h,r} is live today.
function parseEnterpriseResponse(rows) {
  if (rows && !Array.isArray(rows) && rows.h && rows.r) {
    const headers = rows.h
    return rows.r.map((row) => {
      const obj = {}
      headers.forEach((k, i) => {
        obj[k] = row[i] ?? ''
      })
      return obj
    })
  }
  if (rows && !Array.isArray(rows) && Array.isArray(rows.data)) return rows.data
  if (rows && !Array.isArray(rows) && Array.isArray(rows.rows)) return rows.rows
  return rows
}

// "dd/mm/yyyy hh:mm AM/PM" -> {key:'yyyy-mm-dd', ts: epoch millis} — key groups/filters by
// calendar day, ts sorts numerically. Checked in order, for rows that don't match that exact
// shape:
//  1. A bare "dd/mm/yyyy" with NO time at all (confirmed live: some rows are just "02/10/2026") —
//     parsed with the SAME day/month order as the primary pattern above. This one has to come
//     before the generic `new Date(str)` fallback, not after: a plain slash date handed to the
//     native Date constructor is read as MM/DD/YYYY (US order), which silently swapped day and
//     month for any day <= 12 (e.g. "02/10/2026" came out as February 10th instead of October
//     2nd) — exactly backwards from every other row in this same column, so a Period filter like
//     "Today"/"This Week" would correctly match the timestamped rows but skip these ones entirely.
//  2. The SAME day/month swap, already baked into an ISO string by the upstream Apps Script before
//     it ever reaches us — confirmed against 2 real examples: a sheet-displayed "02/10/2026" (2
//     Oct) arrived here as "2026-02-09T18:30:00.000Z" (= midnight 10 Feb IST — month and day
//     swapped), and "05/10/2026" (5 Oct) arrived as "2026-05-09T18:30:00.000Z" (= midnight 10 May
//     IST, same swap). Both share one exact signature: a date-only sheet cell (no real time-of-day)
//     round-tripped through that script's own MM/DD-assuming text conversion always serializes as
//     local midnight IST in UTC, i.e. literally "...T18:30:00.000Z" — a real timestamped entry
//     (actual time of day, e.g. "...T06:58:23.101Z") never matches this and is left untouched.
//  3. Plain ISO 8601 with a real time-of-day ("2026-10-01T06:58:23.101Z") — at least some rows
//     come through from the sheet in ISO instead of its usual dd/mm/yyyy string.
function parseEntryDateTime(s) {
  const str = (s || '').toString().trim()
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (!m) {
    const bareDate = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (bareDate) {
      const [, d, mo, y] = bareDate
      const dt = new Date(+y, +mo - 1, +d)
      if (isNaN(dt.getTime())) return { key: '', ts: 0 }
      const key = y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0')
      return { key, ts: dt.getTime() }
    }
    if (/T18:30:00\.000Z$/.test(str)) {
      const broken = new Date(str)
      if (!isNaN(broken.getTime())) {
        const year = broken.getFullYear()
        const wrongMonth = broken.getMonth() + 1
        const wrongDay = broken.getDate()
        if (wrongDay <= 12) {
          const fixed = new Date(year, wrongDay - 1, wrongMonth)
          const key = year + '-' + String(wrongDay).padStart(2, '0') + '-' + String(wrongMonth).padStart(2, '0')
          return { key, ts: fixed.getTime() }
        }
      }
    }
    const iso = new Date(str)
    if (!str || isNaN(iso.getTime())) return { key: '', ts: 0 }
    const key = iso.getFullYear() + '-' + String(iso.getMonth() + 1).padStart(2, '0') + '-' + String(iso.getDate()).padStart(2, '0')
    return { key, ts: iso.getTime() }
  }
  let [, d, mo, y, h, mi, ap] = m
  h = +h
  if (ap) {
    ap = ap.toUpperCase()
    if (ap === 'PM' && h !== 12) h += 12
    if (ap === 'AM' && h === 12) h = 0
  }
  const dt = new Date(+y, +mo - 1, +d, h, +mi)
  const key = y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0')
  return { key, ts: dt.getTime() }
}

function normalizeLeadRow(r) {
  const callConnected = (r['1nd Call - Connected'] || '').toString().trim()
  const currentStage = (r['Last Known Stage'] || '').toString().trim() || 'Not Contacted'
  const entry = parseEntryDateTime((r['Lead Entry'] || '').toString().trim())
  // "Revenue" is now backed by the sheet's "ACV" column (its old "Revenue" header is gone — see
  // this file's header comment) — every existing `r.Revenue` consumer (KPI tile, table, rep
  // leaderboard) keeps working unchanged, just fed from the new column.
  const revenue = parseFloat(String(r['ACV'] || '').replace(/[^0-9.-]/g, '')) || 0
  const balance = parseFloat(String(r['Balance'] || '').replace(/[^0-9.-]/g, '')) || 0
  const received = parseFloat(String(r['Received'] || '').replace(/[^0-9.-]/g, '')) || 0
  return {
    SrNo: r['SR.No'] ?? '',
    Name: (r['Lead Name'] || '').toString().trim(),
    Phone: (r['ContactNo'] || r['Contact No'] || '').toString().trim(),
    Email: (r['Email id'] || '').toString().trim(),
    City: (r['City'] || '').toString().trim(),
    EntryRaw: (r['Lead Entry'] || '').toString().trim(),
    EntryKey: entry.key,
    EntryTs: entry.ts,
    Source: (r['Source'] || '').toString().trim() || 'Direct / Unspecified',
    Product: (r['Product'] || '').toString().trim() || 'Unspecified',
    Owner: (r['Lead Owner'] || '').toString().trim() || 'Unassigned',
    Comments: (r['Comments'] || '').toString().trim(),
    Reason: (r['Reason for Lost'] || '').toString().trim(),
    SoNumber: (r['SO Number'] || '').toString().trim(),
    Revenue: revenue,
    Received: received,
    Balance: balance,
    CallsMade: callConnected ? 1 : 0,
    Connected: callConnected === 'Yes' ? 1 : 0,
    CurrentStage: currentStage,
    LeadQuality: (r['Lead Quality'] || '').toString().trim(),
    ReachedInterested: currentStage === 'Interested',
    ReachedDemo: currentStage === 'Demo Done',
    // 'Negotiation' counts as Quotation too — a negotiating lead has necessarily already had a
    // quotation sent, so it belongs in that same stage bucket rather than falling out of it.
    ReachedQuotation: currentStage === 'Quotation Sent' || currentStage === 'Negotiation',
    ReachedWon: currentStage === 'Won',
    ReachedTrials: currentStage === 'Trials In Progress' || currentStage === 'PO/LOI',
  }
}

export async function fetchEnterpriseLeads({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null')
      if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.rows
    } catch {
      // Corrupt/inaccessible cache (private browsing, quota, bad JSON) — fall through to a real fetch.
    }
  }
  // `?refresh=1` also bypasses the Apps Script's OWN CacheService cache (doGet's getDataFresh vs
  // getData) — a forced refresh should skip both cache layers, ours and theirs.
  const url = forceRefresh ? `${EN_URL}?refresh=1` : EN_URL
  const res = await fetchWithRetry(url)
  const raw = parseEnterpriseResponse(await res.json())
  if (!Array.isArray(raw) || !raw.length) throw new Error('API returned empty or invalid data')
  const rows = raw.map(normalizeLeadRow).filter((r) => r.Name)
  if (!rows.length) throw new Error('No data — could not detect a Lead Name column.')
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), rows }))
  } catch {
    // Storage full/unavailable — caching is a pure optimization, safe to skip silently.
  }
  return rows
}

// ── Stage color (real semantic mapping — Won/Lost/etc carry actual meaning, not decorative) ──
export function enterpriseStageColor(stage) {
  const s = (stage || '').toString().toLowerCase()
  if (s === 'interested') return '#4e9af1'
  if (s === 'demo scheduled' || s === 'demo' || s === 'demo done') return '#f0a500'
  if (s === 'quotation' || s === 'quotation sent') return '#a78bfa'
  if (s === 'negotiation') return '#ec4899'
  if (s === 'trials in progress') return '#06b6d4'
  if (s === 'future lead') return '#9ca3af'
  if (s === 'won') return '#00d4aa'
  if (s === 'lost') return '#ff5c7c'
  if (s === 'invalid') return '#6b7280'
  return '#9ca3af'
}

// Shared categorical palette for the 4 non-semantic charts (Top Cities/Lead Owner
// Performance/Lead Source Mix/Product Interest) — production uses an arbitrary 8-color rainbow
// with no per-category meaning there; unified here to one palette, same reasoning already applied
// to SmartFleet's Source/Team charts. Lead Status Breakdown/Call Connection Rate/Conversion Funnel
// keep their real semantic colors (enterpriseStageColor, Won=green/Lost=red) — not unified.
export const ENTERPRISE_CATEGORICAL_PALETTE = ['#2563EB', '#7C3AED', '#0D9488', '#D97706', '#DB2777', '#4F46E5', '#059669', '#EA580C']

// ── Rep leaderboard ──────────────────────────────────────────────────────────
// Strip "Dialled By " prefix so "Dialled By Disha" and plain "Disha" merge into one person.
export function enterpriseOwnerName(raw) {
  return (raw || '').replace(/^dialled\s*by\s*/i, '').trim() || 'Unassigned'
}

// Deterministic hash -> 8-color palette — NOT SmartFleet's repColor/repBg (those key off a
// hardcoded 5-email map that doesn't apply here; Lead Owner is an open-ended, dynamic list).
const REP_COLOR_PALETTE = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#f97316']
export function enterpriseRepColor(name) {
  const s = (name || '?').trim()
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return REP_COLOR_PALETTE[Math.abs(h) % REP_COLOR_PALETTE.length]
}

// ── Cross-filter (a single combined object, not 3 separate dimensions like SmartFleet) ────────
// Production's ENcf is one object with 6 fields. A KPI-tile click only ever touches `milestone`
// (and "Total" resets all 6 at once); a chart click touches whichever of the other 5 it owns.
// There is no separate Stage-button row here and no Won-tile-syncs-Stage-button quirk — that's a
// SmartFleet-specific behavior with no equivalent in this module.
export const EMPTY_ENTERPRISE_CROSS_FILTER = { status: null, city: null, owner: null, source: null, product: null, milestone: null }

export function matchesEnterpriseCrossFilter(r, cf) {
  if (cf.status && r.CurrentStage !== cf.status) return false
  if (cf.city && r.City !== cf.city) return false
  if (cf.owner && r.Owner !== cf.owner) return false
  if (cf.source && r.Source !== cf.source) return false
  if (cf.product && r.Product !== cf.product) return false
  if (cf.milestone === 'demo' && !r.ReachedDemo) return false
  if (cf.milestone === 'quotation' && !r.ReachedQuotation) return false
  if (cf.milestone === 'trials' && !r.ReachedTrials) return false
  if (cf.milestone === 'won' && !r.ReachedWon) return false
  if (cf.milestone === 'lost' && r.CurrentStage !== 'Lost') return false
  if (cf.milestone === 'revenue' && !(r.Revenue > 0)) return false
  if (cf.milestone === 'validLead' && r.LeadQuality !== 'Valid') return false
  return true
}

// Toggle-off-if-same-value, ported from enCF.
export function toggleEnterpriseChartFilter(cf, field, value) {
  return { ...cf, [field]: cf[field] === value ? null : value }
}

// 'total' resets every field; otherwise toggles `milestone` only, ported from enKpiClick.
export function applyEnterpriseKpiClick(cf, fk) {
  if (fk === 'total') return { ...EMPTY_ENTERPRISE_CROSS_FILTER }
  return { ...cf, milestone: cf.milestone === fk ? null : fk }
}

// ── KPIs + Funnel — both read the FULL unfiltered set, never the cross-filtered one ──────────
export function computeEnterpriseKpis(rows) {
  const t = rows.length
  const demo = rows.filter((r) => r.ReachedDemo).length
  const quotation = rows.filter((r) => r.ReachedQuotation).length
  const trials = rows.filter((r) => r.ReachedTrials).length
  const won = rows.filter((r) => r.ReachedWon).length
  const lost = rows.filter((r) => r.CurrentStage === 'Lost').length
  const revenue = rows.reduce((s, r) => s + r.Revenue, 0)
  const received = rows.reduce((s, r) => s + r.Received, 0)
  const balance = rows.reduce((s, r) => s + r.Balance, 0)
  const validLeads = rows.filter((r) => r.LeadQuality === 'Valid').length
  const invalidLeads = rows.filter((r) => r.LeadQuality === 'Invalid').length
  return { total: t, demo, quotation, trials, won, lost, revenue, received, balance, validLeads, invalidLeads }
}

// Kept as an explicitly separate function (not derived from chartData) so nothing downstream can
// accidentally cross-filter it — matches production's funnel always reading EN, not D.
export function computeEnterpriseFunnel(rows) {
  const total = rows.length
  const contacted = rows.filter((r) => r.CallsMade > 0).length
  const interested = rows.filter((r) => r.ReachedInterested || r.ReachedDemo || r.ReachedQuotation || r.ReachedWon).length
  const demo = rows.filter((r) => r.ReachedDemo).length
  const quotation = rows.filter((r) => r.ReachedQuotation).length
  const won = rows.filter((r) => r.ReachedWon).length
  return [
    { label: 'Total Leads', value: total, color: '#4e9af1' },
    { label: 'Contacted', value: contacted, color: '#a78bfa' },
    { label: 'Interested', value: interested, color: '#f0a500' },
    { label: 'Demo', value: demo, color: '#f97316' },
    { label: 'Quotation', value: quotation, color: '#ec4899' },
    { label: 'Won', value: won, color: '#00d4aa' },
  ]
}

// ── Period filter — the single upstream scope every other view (KPIs, funnel, charts, table,
// Explorer dropdown options) gets built from, keyed off each lead's own Entry date (EntryTs/
// EntryKey, from the "Lead Entry" column). Applied before the cross-filter/search/Explorer
// selects, not instead of them, so "Today" + a chart-click filter both narrow the data together.
export const ENTERPRISE_PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'overall', label: 'Overall' },
]

function dayKey_(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

// Monday (local midnight) of the week containing `d` — getDay() is 0=Sun..6=Sat, so this walks
// back (day - Monday) days regardless of which day of the week `d` itself falls on.
function mondayOf_(d) {
  const day = d.getDay()
  const diff = (day + 6) % 7
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff)
}

export function filterEnterpriseByPeriod(rows, period) {
  if (!period || period === 'overall') return rows
  const now = new Date()

  if (period === 'today') {
    const todayKey = dayKey_(now)
    return rows.filter((r) => r.EntryKey === todayKey)
  }
  if (period === 'yesterday') {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    const yKey = dayKey_(y)
    return rows.filter((r) => r.EntryKey === yKey)
  }
  if (period === 'weekly') {
    const monday = mondayOf_(now).getTime()
    return rows.filter((r) => r.EntryTs >= monday)
  }
  if (period === 'monthly') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    return rows.filter((r) => r.EntryTs >= monthStart)
  }
  return rows
}

// ── Table-only layer — additive on top of the cross-filter (a second, independent constraint on
// the same fields where applicable, matching production's enApply exactly, including the case
// where a chart-click filter and an Explorer dropdown disagree and the table simply empties —
// same pattern already approved for SmartFleet's own chart-click-vs-dropdown-select filters) ──
export function matchesEnterpriseSearch(r, query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return true
  return (
    (r.Name || '').toLowerCase().includes(q) ||
    (r.City || '').toLowerCase().includes(q) ||
    (r.Phone || '').toLowerCase().includes(q) ||
    (r.Owner || '').toLowerCase().includes(q)
  )
}

export function matchesEnterpriseExplorerSelects(r, { cityFilter, ownerFilter, stageFilter }) {
  if (cityFilter && r.City !== cityFilter) return false
  if (ownerFilter && r.Owner !== ownerFilter) return false
  if (stageFilter && r.CurrentStage !== stageFilter) return false
  return true
}

// Written fresh rather than importing smartFleet.js's sortLeads, which carries a
// sortKey==='revenue' special case specific to that module.
export function sortEnterpriseLeads(rows, sortKey, sortDir) {
  if (!sortKey) return rows
  const sorted = [...rows]
  sorted.sort((a, b) => {
    const av = a[sortKey] ?? ''
    const bv = b[sortKey] ?? ''
    if (av !== '' && bv !== '' && !isNaN(av) && !isNaN(bv)) return (+av - +bv) * sortDir
    return String(av).localeCompare(String(bv)) * sortDir
  })
  return sorted
}
