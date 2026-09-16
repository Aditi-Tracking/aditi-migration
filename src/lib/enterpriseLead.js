// Enterprise Lead Dashboard. Ported from old-portal/js/enterprise.js. Data source: a single
// Google Apps Script web app (EN_URL) — a call-tracking lead funnel sheet, one row per lead, up
// to 6 dialling attempts (Connected/Time/Stage per call). 100% read-only — no writes anywhere.
const EN_URL = 'https://script.google.com/macros/s/AKfycbwDeTRXcVrBVoanjxapudBwQFIxSxtoUEBdKUbz979yyeoGoVWO1s1jnYwg-jN2O2o/exec'
const CALL_SUFFIXES = ['1st', '2nd', '3rd', '4th', '5th', '6th']

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
// calendar day, ts sorts numerically.
function parseEntryDateTime(s) {
  const m = (s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (!m) return { key: '', ts: 0 }
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

export function enterpriseTodayKey() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function normalizeLeadRow(r) {
  // The sheet's 1st-call block has bare "Connected"/"Time"/"Stage" headers (no
  // "1st Call - " prefix like every later call) — its Stage cell is also the
  // sheet's single authoritative "Master Stage" column, so that's what
  // Won/Lost/Demo/Quotation counts are driven by, not the later calls.
  const calls = CALL_SUFFIXES.map((suf) => {
    const prefix = suf === '1st' ? '' : suf + ' Call - '
    return {
      connected: (r[prefix + 'Connected'] || '').toString().trim(),
      time: (r[prefix + 'Time'] || '').toString().trim(),
      stage: (r[prefix + 'Stage'] || '').toString().trim(),
    }
  })
  const attempted = calls.filter((c) => c.connected)
  const connected = calls.filter((c) => c.connected === 'Yes')
  const masterStage = calls[0].stage || 'Not Contacted'
  const entry = parseEntryDateTime((r['Lead Entry'] || '').toString().trim())
  const revenue = parseFloat(String(r['Revenue'] || '').replace(/[^0-9.-]/g, '')) || 0
  return {
    SrNo: r['SR.No'] ?? '',
    Name: (r['Lead Name'] || '').toString().trim(),
    Phone: (r['Contact No'] || '').toString().trim(),
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
    Revenue: revenue,
    CallsMade: attempted.length,
    Connected: connected.length,
    CurrentStage: masterStage,
    ReachedInterested: masterStage === 'Interested',
    ReachedDemo: masterStage === 'Demo',
    ReachedQuotation: masterStage === 'Quotation',
    ReachedWon: masterStage === 'Won',
  }
}

export async function fetchEnterpriseLeads() {
  const res = await fetchWithRetry(EN_URL)
  const raw = parseEnterpriseResponse(await res.json())
  if (!Array.isArray(raw) || !raw.length) throw new Error('API returned empty or invalid data')
  const rows = raw.map(normalizeLeadRow).filter((r) => r.Name)
  if (!rows.length) throw new Error('No data — could not detect a Lead Name column.')
  return rows
}

// ── Stage color (real semantic mapping — Won/Lost/etc carry actual meaning, not decorative) ──
export function enterpriseStageColor(stage) {
  const s = (stage || '').toString().toLowerCase()
  if (s === 'interested') return '#4e9af1'
  if (s === 'demo scheduled' || s === 'demo') return '#f0a500'
  if (s === 'quotation') return '#a78bfa'
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
  if (cf.milestone === 'contacted' && r.CallsMade === 0) return false
  if (cf.milestone === 'demo' && !r.ReachedDemo) return false
  if (cf.milestone === 'quotation' && !r.ReachedQuotation) return false
  if (cf.milestone === 'won' && !r.ReachedWon) return false
  if (cf.milestone === 'lost' && r.CurrentStage !== 'Lost') return false
  if (cf.milestone === 'revenue' && !(r.Revenue > 0)) return false
  if (cf.milestone === 'today' && r.EntryKey !== enterpriseTodayKey()) return false
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
  const totalCalls = rows.reduce((s, r) => s + r.CallsMade, 0)
  const totalConnected = rows.reduce((s, r) => s + r.Connected, 0)
  const demo = rows.filter((r) => r.ReachedDemo).length
  const quotation = rows.filter((r) => r.ReachedQuotation).length
  const won = rows.filter((r) => r.ReachedWon).length
  const lost = rows.filter((r) => r.CurrentStage === 'Lost').length
  const revenue = rows.reduce((s, r) => s + r.Revenue, 0)
  const todayLeads = rows.filter((r) => r.EntryKey === enterpriseTodayKey()).length
  return { total: t, totalCalls, totalConnected, demo, quotation, won, lost, revenue, todayLeads }
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
