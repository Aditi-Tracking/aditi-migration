// Enterprise Solutions Dashboard (ClickTask + CoolBus). Ported from old-portal/js/entsol.js.
// Data source: a single Google Apps Script endpoint (ESOL_URL) returning {clicktask, coolbus,
// lastUpdated}. 100% read-only. Genuinely independent from Enterprise Lead (js/enterprise.js)
// despite index.html's stale doc-comment claiming shared permission logic — own permission key,
// own endpoint, own load/render functions. The one real (trivial) cross-file reuse in production
// is enPagerHTML for pagination — mapped here to reusing lib/smartFleet.js's PAGE_SIZE/buildPageList.
//
// FIXED-LIGHT-THEME PANEL — confirmed via styles.css's #panel-entsol rules, which are 100%
// literal hex colors, never this project's var(--surface)/var(--text) tokens. This dashboard is a
// "product card" reskin that stays light regardless of the app's dark/light toggle, matching
// production's own explicit comment ("do NOT swap in chartColors()"). Do not use useChartTheme()
// or this project's theme-aware Tailwind tokens (bg-surface/text-text/etc.) anywhere in this
// module's components — use the hardcoded ESOL_COLORS below and literal hex Tailwind values.
import { PAGE_SIZE, buildPageList } from './smartFleet'

export { PAGE_SIZE, buildPageList }

const ESOL_URL = 'https://script.google.com/macros/s/AKfycby5CHFwhQnIhLKetozrK6Tnf-81gyV9eaMt57fQawzXk5T384VrJCrbydCGaOWtXncF/exec'

export const ESOL_COLORS = {
  tick: '#475569',
  grid: 'rgba(15,23,42,0.07)',
  dim: 'rgba(15,23,42,0.09)',
  palette: ['#00d4aa', '#f0a500', '#4e9af1', '#a78bfa', '#ff5c7c', '#f97316', '#10b981', '#ec4899'],
  tooltip: { backgroundColor: '#1e293b', titleColor: '#fff', bodyColor: '#e2e8f0', padding: 10, cornerRadius: 8, displayColors: false },
}

// ── Permission ───────────────────────────────────────────────────────────────
// Ported byte-for-byte from _canAccessEnterpriseSolutions — same shape as
// lib/enterpriseLead.js's canAccessEnterprise. The Python backend has no can_view_entsol column
// yet either (confirmed by the function's own comment in old-portal), so this is ALSO currently
// dead from the real backend, same situation as Enterprise Lead — not IMS's genuinely-functioning
// can_view_ims.
export function canAccessEnterpriseSolutions(currentUser, permissions) {
  if (permissions?.can_view_entsol === undefined) {
    const r = String(currentUser?.rawRole || currentUser?.role || '').toLowerCase().trim()
    return r === 'owner' || r === 'mis' || r === 'pc' || r === 'executive assistant' || r === 'ea'
  }
  return permissions.can_view_entsol === 'true'
}

// ── Fetch ────────────────────────────────────────────────────────────────────
export async function fetchEnterpriseSolutionsRaw() {
  const res = await fetch(ESOL_URL)
  if (!res.ok) throw new Error(String(res.status))
  const data = await res.json()
  if (!data || !data.clicktask || !data.coolbus) throw new Error('API returned an unexpected shape — expected {clicktask, coolbus}')
  return data
}

// Sums every transaction's changeKey grouped by nameKey — used to derive each customer/school's
// TRUE current count. Includes every transaction unconditionally (including undated baseline-
// import rows) — this is deliberately different from filteredActivityTxns below, which excludes
// undated rows since those aren't real tracked changes.
function netByName(txns, nameKey, changeKey) {
  const map = new Map()
  ;(txns || []).forEach((t) => {
    if (!t || !t[nameKey] || typeof t[changeKey] !== 'number') return
    map.set(t[nameKey], (map.get(t[nameKey]) || 0) + t[changeKey])
  })
  return map
}

// Normalizes the raw API payload: corrects real customers'/schools' licenseCount (and CoolBus's
// buses) to their true current value via the transaction log, and builds each tab's combined
// customer+trial row list with a _Type tag.
//
// CONFIRMED GAP, ported as-is, not fixed: trial customers/schools do NOT get this same
// correction — live data shows a real, populated `trialTransactions` array for CoolBus (4 trial
// schools today) that production never reads anywhere. Trials always show their raw, potentially
// stale snapshot licenseCount/buses. This is a business-logic question for the team, not a
// rendering bug — see MIGRATION-NOTES.md.
export function normalizeEnterpriseSolutionsData(raw) {
  const ct = raw.clicktask
  const cb = raw.coolbus

  const ctTxns = ct.transactions || []
  const cbTxns = cb.schoolTransactions || cb.transactions || cb.busTransactions || []

  const ctNet = netByName(ctTxns, 'customer', 'licenseCount')
  const cbLicNet = netByName(cbTxns, 'school', 'licenseCount')
  const cbBusNet = netByName(cbTxns, 'school', 'buses')

  const ctCustomers = (ct.customers || []).map((r) => ({ ...r, licenseCount: ctNet.has(r.customer) ? ctNet.get(r.customer) : r.licenseCount }))
  const cbSchools = (cb.schools || []).map((r) => ({
    ...r,
    licenseCount: cbLicNet.has(r.school) ? cbLicNet.get(r.school) : r.licenseCount,
    buses: cbBusNet.has(r.school) ? cbBusNet.get(r.school) : r.buses,
  }))

  const totalCustomerLicenses = ctCustomers.reduce((s, r) => s + (Number(r.licenseCount) || 0), 0)
  const totalSchoolLicenses = cbSchools.reduce((s, r) => s + (Number(r.licenseCount) || 0), 0)
  const totalSchoolBuses = cbSchools.reduce((s, r) => s + (Number(r.buses) || 0), 0)

  return {
    clicktask: {
      ...ct,
      customers: ctCustomers,
      totalCustomerLicenses,
      transactions: ctTxns,
      rows: [...ctCustomers.map((r) => ({ ...r, _Type: 'Customer' })), ...(ct.trials || []).map((r) => ({ ...r, _Type: 'Trial' }))],
    },
    coolbus: {
      ...cb,
      schools: cbSchools,
      totalSchoolLicenses,
      totalSchoolBuses,
      transactions: cbTxns,
      rows: [...cbSchools.map((r) => ({ ...r, _Type: 'Customer' })), ...(cb.trials || []).map((r) => ({ ...r, _Type: 'Trial' }))],
    },
    lastUpdated: raw.lastUpdated,
  }
}

// ── Transaction date parsing (Activity section only) ──────────────────────────
// Backend sends dates as DD-MM-YYYY; blank string = baseline import row. Accepts day-first
// DD-MM-YYYY/D-M-YYYY (dash or slash), plus YYYY-MM-DD as a fallback. Deliberately does NOT fall
// back to native Date parsing (unlike IMS's parser) — that would assume US MM/DD and silently
// misread day-first entries. A fresh, small parser — not shared with lib/ims.js's 5-strategy one,
// which solves a different problem (cross-location sheet format drift) with a different rationale.
export function parseTxnDate(raw) {
  if (!raw) return null
  const str = String(raw).trim()
  let m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (m) {
    const d = new Date(+m[3], +m[2] - 1, +m[1])
    return isNaN(d.getTime()) ? null : d
  }
  m = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3])
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

// Excludes undated (baseline-import) rows — those aren't real tracked changes, only netByName
// above includes them.
export function filteredActivityTxns(transactions, scope, { nameKey, changeKey }) {
  const now = new Date()
  return (transactions || [])
    .filter((t) => t && typeof t[changeKey] === 'number' && t[changeKey] !== 0)
    .map((t) => ({ ...t, _change: t[changeKey], _name: t[nameKey], _date: parseTxnDate(t.date) }))
    .filter((t) => {
      if (!t._date) return false
      if (scope === 'today') return t._date.getFullYear() === now.getFullYear() && t._date.getMonth() === now.getMonth() && t._date.getDate() === now.getDate()
      if (scope === 'month') return t._date.getFullYear() === now.getFullYear() && t._date.getMonth() === now.getMonth()
      return true // 'all'
    })
}

// Fixed "this month" Added/Removed for the MTD KPI tile — deliberately independent of whatever
// scope pill is selected in the Activity section below (matches production's own comment).
// CoolBus rows carry both a licenseCount delta and a buses delta in one row, so both are summed
// (ClickTask only ever has licenseCount).
export function computeMTD(transactions) {
  const now = new Date()
  const inMonth = (t) => {
    const d = parseTxnDate(t.date)
    return !!d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }
  const sumChange = (txns, key) => {
    const rows = txns.filter((t) => typeof t[key] === 'number' && t[key] !== 0)
    return { added: rows.filter((t) => t[key] > 0).reduce((s, t) => s + t[key], 0), removed: rows.filter((t) => t[key] < 0).reduce((s, t) => s + Math.abs(t[key]), 0) }
  }
  const monthTxns = (transactions || []).filter(inMonth)
  return { lic: sumChange(monthTxns, 'licenseCount'), bus: sumChange(monthTxns, 'buses') }
}

// ── Rep-style avatar (deterministic hash -> initial + color) ─────────────────
// Same hashing technique as Enterprise Lead's enterpriseRepColor, but uses ESOL's OWN hardcoded
// palette (matching the fixed-light theme) and returns an initial letter too — not reused
// directly since the palette and return shape both differ.
export function avatarFor(name) {
  const s = (name || '?').trim()
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return { initial: s[0] ? s[0].toUpperCase() : '?', color: ESOL_COLORS.palette[Math.abs(h) % ESOL_COLORS.palette.length] }
}

// ── Cross-filter ─────────────────────────────────────────────────────────────
// Deliberately omits `customer` (present in production's ESOLcf shape and checked in esolApply's
// ClickTask branch, but confirmed via full-file grep to never be SET anywhere — no chart, no row
// click, nothing writes to it; consistent with ClickTask's Top-Customers bar chart having no
// onClick at all). Approved exclusion — see MIGRATION-NOTES.md's "Dead code observed".
export const EMPTY_ESOL_CROSS_FILTER = { location: null, type: null, school: null }

export function matchesEsolCrossFilter(row, cf) {
  if (cf.location && (row.location || 'Unspecified') !== cf.location) return false
  if (cf.type && row._Type !== cf.type) return false
  if (cf.school && row.school !== cf.school) return false
  return true
}

export function toggleEsolCrossFilter(cf, key, val) {
  return { ...cf, [key]: cf[key] === val ? null : val }
}

// ── Table filter + sort ────────────────────────────────────────────────────────
// nameKey is 'customer' for ClickTask rows, 'school' for CoolBus rows.
export function filterEsolRows(rows, { search, typeFilter, crossFilter }, nameKey) {
  const q = (search || '').toLowerCase().trim()
  return rows.filter((r) => {
    if (q && !((r[nameKey] || '').toLowerCase().includes(q) || (r.location || '').toLowerCase().includes(q))) return false
    if (typeFilter && r._Type !== typeFilter) return false
    return matchesEsolCrossFilter(r, crossFilter)
  })
}

export function sortEsolRows(rows, sortKey, sortDir) {
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
