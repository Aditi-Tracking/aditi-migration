// CRM Vehicle Dashboard (GPS fleet tracking). Ported from old-portal/js/crm.js.
// Tables/views (Supabase, all read-only from this module except acknowledgeCustomerAlert):
//   server_customer_summary — company, region ("<Name> Server"), tier (Platinum/Gold/Silver),
//     total_vehicles, running_count, idle_count, stop_count, inactive_count, assigned_to,
//     last_synced. Fed by an external smartfleet_sync.py process — nothing here writes to it.
//   vehicle_changes — imeino, vehicle_no, vehicle_name, company, tier, region, change_date,
//     change_type ('added'|'removed').
//   daily_fleet_stats — snapshot_date, region, tier (queried at the 'All' sentinel — whole-fleet
//     rows only), total_vehicles, active_vehicles, running_vehicles, idle_vehicles, stop_vehicles,
//     inactive_vehicles.
//   customer_alerts — id, company_name, pct_drop, baseline_avg, current_count, alert_date,
//     acknowledged, acknowledged_by, acknowledged_at.
// No relation to Renewals' crm_customers/crm_persons tables — confirmed no naming overlap.
//
// Distinct from every other permission-gated module: nav visibility and the access-level
// resolution here are plain synchronous checks against `permissions` (no Supabase round-trip),
// same as leadsPerm/fmsPerm — no NavContext/Provider needed.
import { SUPABASE_URL, SB_HDRS, SB_HDRS_MIN } from './supabaseClient'

export const CRM_SERVERS = [
  { key: 'both', label: 'All' },
  { key: 'Premium Server', label: 'Premium' },
  { key: 'PRO Server', label: 'PRO' },
  { key: 'Goa Server', label: 'Goa' },
  { key: 'Bangalore Server', label: 'Bangalore' },
  { key: 'Gujarat Server', label: 'Gujarat' },
]

export const CRM_TIERS = [
  { key: '', label: 'All' },
  { key: 'Platinum', label: '💎 Platinum' },
  { key: 'Gold', label: '🥇 Gold' },
  { key: 'Silver', label: '🥈 Silver' },
]

// Hardcoded GPS-fleet assignee -> color map, ported verbatim as real business config (ported from
// crm.js's `ec`) — used to color-code the "Assigned To" chip.
export const CRM_ASSIGNEE_COLORS = {
  guddu: '#6366f1',
  darshil: '#f59e0b',
  'chirag gupta': '#ef4444',
  ankush: '#0ea5e9',
  kinchit: '#a855f7',
  priyanka: '#ec4899',
  disha: '#14b8a6',
}

export function assigneeColor(assignedTo) {
  const name = String(assignedTo || '').toLowerCase()
  const key = Object.keys(CRM_ASSIGNEE_COLORS).find((k) => name.includes(k))
  return key ? CRM_ASSIGNEE_COLORS[key] : 'var(--color-text-muted)'
}

// ── Access level ─────────────────────────────────────────────────────────────
export function canAccessCRM(permissions) {
  return (permissions?.can_view_crm || 'false') !== 'false'
}

// Returns 'none' | 'all' | 'restricted' | a literal tier name (e.g. 'Platinum'). See
// MIGRATION-NOTES.md's "Known confusing-but-intentional-looking access boundaries" — the
// tier-name branch is real and ported faithfully, but nothing in Access Control's UI can
// currently write a tier-name string into can_view_crm; it only takes effect if someone
// hand-edits the permission row directly in the database.
export function getCrmAccessLevel(currentUser, permissions) {
  if (!currentUser) return 'none'
  const p = permissions?.can_view_crm || 'false'
  if (p === 'false') return 'none'
  const rawRole = String(currentUser.rawRole || currentUser.role || '').toLowerCase().trim()
  const isSuperAdmin = rawRole === 'owner' || rawRole === 'managing director' || rawRole === 'mis'
  const hasAnyServerPerm =
    permissions.crm_server_premium === 'true' ||
    permissions.crm_server_pro === 'true' ||
    permissions.crm_server_goa === 'true' ||
    permissions.crm_server_bangalore === 'true' ||
    permissions.crm_server_gujarat === 'true'
  if (isSuperAdmin && !hasAnyServerPerm) return 'all'
  if (isSuperAdmin && hasAnyServerPerm) return 'restricted'
  if (p === 'true') return 'restricted'
  return p
}

export function canViewCrmChanges(currentUser, permissions) {
  if (!currentUser) return false
  if (getCrmAccessLevel(currentUser, permissions) === 'all') return true
  return (permissions?.can_view_crm_changes || 'false') === 'true'
}

// Server-scoping is independent of access-level *type* (restricted vs. tier-locked) — see the
// server-scoping-inconsistency wrinkle in MIGRATION-NOTES.md: this list governs which server
// buttons show and which regions Vehicle Changes queries include, but NOT the main table for a
// tier-locked viewer (ported as-is, not fixed).
export function getCrmAllowedServers(currentUser, permissions) {
  const lvl = getCrmAccessLevel(currentUser, permissions)
  if (lvl === 'all') return CRM_SERVERS.map((s) => s.key)
  if (lvl === 'none') return []
  const map = {
    'Premium Server': permissions.crm_server_premium || 'false',
    'PRO Server': permissions.crm_server_pro || 'false',
    'Goa Server': permissions.crm_server_goa || 'false',
    'Bangalore Server': permissions.crm_server_bangalore || 'false',
    'Gujarat Server': permissions.crm_server_gujarat || 'false',
  }
  const allowed = Object.keys(map).filter((k) => map[k] === 'true')
  if (allowed.length > 1) allowed.unshift('both')
  return allowed
}

// ── Paginated fetch — bypasses Supabase's 1000-row default cap ──────────────────────────────
export async function fetchAllPaginated(baseUrl) {
  const pageSize = 1000
  const hdrs = SB_HDRS()
  let all = []
  let offset = 0
  while (true) {
    const res = await fetch(`${baseUrl}&limit=${pageSize}&offset=${offset}`, {
      headers: { ...hdrs, 'Range-Unit': 'items', Range: `${offset}-${offset + pageSize - 1}` },
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const batch = await res.json()
    if (!Array.isArray(batch) || !batch.length) break
    all = [...all, ...batch]
    if (batch.length < pageSize) break
    offset += pageSize
  }
  return all
}

// ── Main dashboard data ──────────────────────────────────────────────────────────────────────
// Fetches server_customer_summary for `server`, then applies the access-level scoping exactly as
// loadCRMDashboard does: 'restricted' filters by allowed servers; a tier-name access level filters
// by that tier only (no server filter — see the server-scoping wrinkle); 'all' filters nothing.
export async function fetchCrmDashboardData(server, currentUser, permissions) {
  const acc = getCrmAccessLevel(currentUser, permissions)
  const baseUrl =
    server === 'both'
      ? `${SUPABASE_URL}/rest/v1/server_customer_summary?order=total_vehicles.desc`
      : `${SUPABASE_URL}/rest/v1/server_customer_summary?region=eq.${encodeURIComponent(server)}&order=total_vehicles.desc`
  let data = await fetchAllPaginated(baseUrl)
  if (acc === 'restricted') {
    const allowedSrvs = getCrmAllowedServers(currentUser, permissions).filter((s) => s !== 'both')
    if (allowedSrvs.length > 0) data = data.filter((r) => allowedSrvs.includes(r.region))
  }
  if (acc !== 'all' && acc !== 'none' && acc !== 'restricted') data = data.filter((r) => r.tier === acc)
  return { data, acc }
}

// ── IST date helpers ─────────────────────────────────────────────────────────────────────────
function fmtDateIST(d) {
  const ist = new Date(d.getTime() + (5 * 60 + 30) * 60000)
  return ist.toISOString().split('T')[0]
}

function istToday() {
  const now = new Date()
  const istNow = new Date(now.getTime() + (5 * 60 + 30) * 60000)
  return new Date(istNow.toISOString().split('T')[0] + 'T00:00:00.000Z')
}

// Ported from crmChgQuick — 'yesterday' is literally yesterday's change_date batch (not "last
// 24h"); '7d'/'30d' run through today.
export function resolveQuickPeriod(period) {
  const today = istToday()
  if (period === 'yesterday') {
    const yest = new Date(today)
    yest.setDate(yest.getDate() - 1)
    const d = fmtDateIST(yest)
    return { fromDate: d, toDate: d, periodLabel: `Yesterday's changes (${d})`, isLiveToday: false }
  }
  if (period === '7d') {
    const d = new Date(today)
    d.setDate(d.getDate() - 7)
    return { fromDate: fmtDateIST(d), toDate: fmtDateIST(today), periodLabel: `Last 7 days — ${fmtDateIST(d)} → Today`, isLiveToday: false }
  }
  // '30d'
  const d = new Date(today)
  d.setDate(d.getDate() - 30)
  return { fromDate: fmtDateIST(d), toDate: fmtDateIST(today), periodLabel: `Last 30 days — ${fmtDateIST(d)} → Today`, isLiveToday: false }
}

// Ported from crmChgCustom. Returns null if the range is invalid (from > to) — caller should
// alert and skip the load in that case, matching production.
export function resolveCustomPeriod(from, to) {
  if (!from || !to || from > to) return null
  const todayStr = fmtDateIST(new Date())
  const toVal = to === todayStr ? 'live' : to
  const label = `${from} 11:50PM → ${toVal === 'live' ? 'Now (live)' : to + ' 11:50PM'}`
  const isLiveToday = from === to && to === todayStr
  return { fromDate: from, toDate: toVal, periodLabel: label, isLiveToday }
}

function regionFilterClause(server, allowedServers) {
  if (server !== 'both') return `&region=eq.${encodeURIComponent(server)}`
  const allowedSrvs = allowedServers.filter((s) => s !== 'both')
  if (allowedSrvs.length > 0 && allowedSrvs.length < 5) {
    return `&region=in.(${allowedSrvs.map((s) => encodeURIComponent(s)).join(',')})`
  }
  return ''
}

// Ported from crmChgLoad's fetchChanges — powers both the Added/Removed summary cards and the
// company-breakdown detail panel. Applies the tier filter when one is active (see the
// tier-inconsistency wrinkle vs. fetchVehicleChangeCount, which deliberately does not).
//
// Uses fetchAllPaginated instead of a single fetch with a client-side &limit — that limit was
// never actually effective: PostgREST's own server-side max-rows setting (1000, the same one
// fetchAllPaginated exists to bypass) silently truncates any single response regardless of what
// limit the client requests, unless the request is paginated via Range headers. A busy tier/date
// range could genuinely exceed 1000 change rows, so this was a real, unintentional cap, not a
// deliberate one.
export async function fetchVehicleChanges(type, { fromDate, toDate, server, tier, allowedServers }) {
  let url = `${SUPABASE_URL}/rest/v1/vehicle_changes?select=imeino,vehicle_no,vehicle_name,company,tier,region,change_date&change_type=eq.${type}&change_date=gte.${fromDate}&change_date=lte.${toDate}`
  url += regionFilterClause(server, allowedServers)
  if (tier) url += `&tier=eq.${encodeURIComponent(tier)}`
  url += `&order=change_date.desc`
  return fetchAllPaginated(url)
}

// Ported from crmLoadKpiDeltas's fetchCount — deliberately has NO tier clause, unlike
// fetchVehicleChanges above (see the Total-Vehicles-delta tier-inconsistency wrinkle). Same
// fetchAllPaginated fix as fetchVehicleChanges above, for the same reason.
//
// `company` is a new, optional filter (not a port — vehicle_changes already has a `company`
// column, just never used as a filter clause here before) that powers the per-selected-company
// added/removed delta on the Total Vehicles KPI tile. Deliberately not combined with `tier` for
// the same reason this function never took a tier clause — a company is uniquely identified on
// its own, no need to also constrain by a property of that same row.
export async function fetchVehicleChangeCount(type, { fromDate, toDate, server, allowedServers, company }) {
  let url = `${SUPABASE_URL}/rest/v1/vehicle_changes?select=imeino&change_type=eq.${type}&change_date=gte.${fromDate}&change_date=lte.${toDate}`
  url += regionFilterClause(server, allowedServers)
  if (company) url += `&company=eq.${encodeURIComponent(company)}`
  const rows = await fetchAllPaginated(url)
  return rows.length
}

// Ported from crmLoadKpiDeltas's statsUrl — tier=eq.All is a sentinel for "whole-fleet snapshot",
// unrelated to the viewer's own tier filter (see the KPI-delta-denominator wrinkle).
export async function fetchDailyFleetStats(server) {
  let url = `${SUPABASE_URL}/rest/v1/daily_fleet_stats?select=snapshot_date,region,tier,total_vehicles,active_vehicles,running_vehicles,idle_vehicles,stop_vehicles,inactive_vehicles&tier=eq.All&order=snapshot_date.asc&limit=500`
  if (server !== 'both') url += `&region=eq.${encodeURIComponent(server)}`
  const res = await fetch(url, { headers: SB_HDRS() })
  const rows = await res.json()
  return Array.isArray(rows) ? rows : []
}

// Ported from crmLoadKpiDeltas's stats-comparison logic. `liveCurrent` (the currently-displayed
// aggregate KPI values) is only used for the isLiveToday branch — every other branch reads
// its "current" straight from a snapshot row, exactly as production does (never from the DOM).
export function computeStatsDelta(statsRows, { fromDate, toDate, isLiveToday, liveCurrent }) {
  if (!Array.isArray(statsRows) || !statsRows.length) return null
  const byDate = {}
  statsRows.forEach((r) => {
    if (!byDate[r.snapshot_date]) byDate[r.snapshot_date] = { active: 0, running: 0, idle: 0, stop: 0, inactive: 0 }
    byDate[r.snapshot_date].active += r.active_vehicles || 0
    byDate[r.snapshot_date].running += r.running_vehicles || 0
    byDate[r.snapshot_date].idle += r.idle_vehicles || 0
    byDate[r.snapshot_date].stop += r.stop_vehicles || 0
    byDate[r.snapshot_date].inactive += r.inactive_vehicles || 0
  })
  const dates = Object.keys(byDate).sort()
  if (!dates.length) return null

  let current, baseDate
  if (isLiveToday) {
    current = liveCurrent
    const baseDates = dates.filter((d) => d <= fromDate)
    baseDate = baseDates.length ? baseDates[baseDates.length - 1] : dates[0]
  } else if (fromDate === toDate) {
    const currDates = dates.filter((d) => d <= toDate)
    const currDate = currDates.length ? currDates[currDates.length - 1] : null
    if (!currDate) return null
    current = byDate[currDate]
    const baseDates = dates.filter((d) => d < currDate)
    baseDate = baseDates.length ? baseDates[baseDates.length - 1] : null
    if (!baseDate) return null
  } else {
    const currDates = dates.filter((d) => d <= toDate)
    const currDate = currDates.length ? currDates[currDates.length - 1] : null
    if (!currDate) return null
    current = byDate[currDate]
    const baseDates = dates.filter((d) => d <= fromDate)
    baseDate = baseDates.length ? baseDates[baseDates.length - 1] : dates[0]
  }

  const base = baseDate ? byDate[baseDate] : null
  if (!base || !current) return null

  const result = {}
  ;['active', 'running', 'idle', 'stop', 'inactive'].forEach((key) => {
    const diff = current[key] - base[key]
    if (diff === 0) {
      result[key] = { text: 'No change', tone: 'neutral' }
      return
    }
    const pct = base[key] > 0 ? ((Math.abs(diff) / base[key]) * 100).toFixed(1) : '—'
    const arrow = diff > 0 ? '▲' : '▼'
    const sign = diff > 0 ? '+' : ''
    result[key] = { text: `${arrow} ${sign}${diff.toLocaleString()} (${pct}%)`, tone: diff > 0 ? 'up' : 'down' }
  })
  return result
}

export function totalVehiclesDeltaText(net) {
  if (net === 0) return { text: 'No change', tone: 'neutral' }
  const arrow = net > 0 ? '▲' : '▼'
  const sign = net > 0 ? '+' : ''
  return { text: `${arrow} ${sign}${net.toLocaleString()} vehicles`, tone: net > 0 ? 'up' : 'down' }
}

// ── Customer table pagination ────────────────────────────────────────────────────────────────
// Not a port — production's crmRenderTable rendered the full filtered list every time. Added
// after profiling confirmed CRMCustomerTable's own unbounded render (not the KPI grid, not
// Vehicle Changes' grouping) was the dominant, user-facing lag at the real ~3,938-row volume:
// ~700-1000ms per render, including on every search keystroke. Mirrors SmartFleetTable's
// pagination exactly (same shared Table `footer` slot, same buildPageList ellipsis truncation) —
// picked over EnterpriseSolutions'/Enterprise's plain full-page-number-list variant because at
// ~3,938 rows this table can have dozens of pages, where an unellipsized page-number list would
// itself become unwieldy. buildPageList is duplicated here rather than imported from
// lib/smartFleet.js, matching this project's existing per-panel duplication convention (see
// lib/enterpriseSolutions.js's own copy) rather than introducing a cross-panel lib dependency.
export const CRM_TABLE_PAGE_SIZE = 50

export function buildPageList(cur, tot) {
  const delta = 2
  const range = [1]
  for (let i = Math.max(2, cur - delta); i <= Math.min(tot - 1, cur + delta); i++) range.push(i)
  if (tot > 1) range.push(tot)
  const out = []
  range.forEach((p, i) => {
    if (i && p - range[i - 1] > 1) out.push('…')
    out.push(p)
  })
  return out
}

// Groups vehicle_changes rows by company for the detail breakdown panel — ported from
// crmChgRenderDetail's companyMap, sorted by count descending.
export function groupChangesByCompany(rows) {
  const map = {}
  rows.forEach((r) => {
    const co = r.company || 'Unknown'
    if (!map[co]) map[co] = { count: 0, tier: r.tier || '', region: r.region || '' }
    map[co].count++
  })
  return Object.entries(map)
    .map(([company, info]) => ({ company, ...info }))
    .sort((a, b) => b.count - a.count)
}

// ── Customer Alerts (Platinum vehicle-count-drop alerts) ─────────────────────────────────────
// No tier/server scoping at all — every viewer who can open the panel sees and can acknowledge
// every alert company-wide (see the Customer-Alerts-scoping wrinkle). Ported as-is.
export async function fetchCustomerAlerts() {
  const url = `${SUPABASE_URL}/rest/v1/customer_alerts?select=*&acknowledged=eq.false&order=pct_drop.desc&limit=20`
  const res = await fetch(url, { headers: SB_HDRS() })
  const rows = await res.json()
  return Array.isArray(rows) ? rows : []
}

// The one real write in this module.
export async function acknowledgeCustomerAlert(id, ackByName) {
  const url = `${SUPABASE_URL}/rest/v1/customer_alerts?id=eq.${id}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: SB_HDRS_MIN(),
    body: JSON.stringify({
      acknowledged: true,
      acknowledged_by: ackByName || 'Unknown',
      acknowledged_at: new Date().toISOString(),
    }),
  })
  if (!res.ok) throw new Error(await res.text())
}
