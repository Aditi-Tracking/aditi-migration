import { SB_HDRS, SUPABASE_URL } from './supabaseClient'

// Ported from old-portal/js/leads.js — the SmartFleet dashboard.
// Data source: leads_normalized (a Supabase view combining Odoo + Google
// Sheets synced leads). 100% read-only — no writes anywhere in this module.

export const LEADS_FIELDS =
  'lead_name,contact_name,phone,email,funnel_stage,demo_reached,quotation_reached,source_system,salesperson_name,salesperson_email,team_name,source_channel,hero_product,city,lead_created_at,lead_updated_at,demo_given,quotation_sent,calls_made,order_value,won_revenue,orphan_matched_revenue,probability,activity_state,is_active,lost_reason_name'

export const PAGE_SIZE = 15

// Hardcoded rep lookup — real business config (app.js's REP_MAP), not
// sample data. Drives display name/color for every sales rep shown here.
const REP_MAP = {
  'supportmum@adititracking.com': { name: 'Support MUM', color: '#f0a500', bg: 'rgba(240,165,0,0.2)' },
  'salesmumbai@adititracking.com': { name: 'Sales Mumbai', color: '#00d4aa', bg: 'rgba(0,212,170,0.2)' },
  'salesgoa@adititracking.com': { name: 'Sales Goa', color: '#ff5c7c', bg: 'rgba(255,92,124,0.2)' },
  'salesgujarat@adititracking.com': { name: 'Sales Gujarat', color: '#a78bfa', bg: 'rgba(167,139,250,0.2)' },
  'coolbus.enterprise@adititracking.com': { name: 'CoolBus', color: '#4e9af1', bg: 'rgba(78,154,241,0.2)' },
}
export function repName(email) {
  return REP_MAP[email]?.name || String(email || '').split('@')[0]
}
export function repColor(email) {
  return REP_MAP[email]?.color || '#888'
}
export function repBg(email) {
  return REP_MAP[email]?.bg || 'rgba(128,128,128,0.2)'
}

// Categorical palette for charts with multiple distinct series (Source
// Breakdown, Team Breakdown) — shades of the single primary palette, not
// production's arbitrary rainbow set.
export const CHART_BLUES = ['#1D4ED8', '#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#1E3A8A']

// Compact Indian-style money format — Cr for 1,00,00,000+, L for
// 1,00,000+, K for 1,000+, else plain.
export function formatINR(v) {
  v = v || 0
  if (v >= 1e7) return (v / 1e7).toFixed(2) + 'Cr'
  if (v >= 1e5) return (v / 1e5).toFixed(2) + 'L'
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K'
  return String(Math.round(v))
}

// Won: funnel_stage='Won'. Lost: funnel_stage='Lost' (sheets) OR
// is_active=false (odoo, which never sets a literal 'Lost' funnel_stage).
// Else Pending.
export function deriveStage(r) {
  if (r.funnel_stage === 'Won') return 'Won'
  if (r.funnel_stage === 'Lost' || r.is_active === false) return 'Lost'
  return 'Pending'
}

// For a Pending lead, which pipeline stage it's actually sitting in (table
// display only — doesn't affect Won/Lost/Pending used by KPIs/charts/filters).
export function pendingSubStage(r) {
  const fs = r.funnel_stage
  return fs && fs !== 'Won' && fs !== 'Lost' ? fs : null
}

export function normalizeLead(r) {
  const n = { ...r }
  n.probability = n.probability != null ? parseFloat(n.probability) || 0 : 0
  n.order_value = n.order_value != null ? parseFloat(n.order_value) : null
  n.won_revenue = n.won_revenue != null ? parseFloat(n.won_revenue) : null
  n.orphan_matched_revenue = n.orphan_matched_revenue != null ? parseFloat(n.orphan_matched_revenue) : null
  n.effective_revenue = n.won_revenue ?? n.orphan_matched_revenue ?? n.order_value ?? 0
  n.Stage = deriveStage(n)
  n.PendingSubStage = n.Stage === 'Pending' ? pendingSubStage(n) : null
  n.RepName = n.salesperson_name || (n.salesperson_email ? repName(n.salesperson_email) : null)
  return n
}

// Supabase caps a single request's row count — this loops via the Range
// header until a short batch signals the end, so 1000+ leads don't get
// silently truncated.
export async function fetchAllLeads() {
  const pageSize = 1000
  const hdrs = SB_HDRS()
  const baseUrl = `${SUPABASE_URL}/rest/v1/leads_normalized?select=${LEADS_FIELDS}&order=lead_created_at.desc`
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
    .map(normalizeLead)
    .filter((r) => r.contact_name || r.lead_name)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

// KPI tile VALUES always reflect the full source-scoped list (L), never
// re-filtered by the KPI's own click state — matches lRenderKPIs reading
// from L, not from the KPI/chart-filtered D. Only the charts (and table)
// respond to which KPI tile is selected.
export function computeKpiSummary(L) {
  const t = L.length
  const calls = L.filter((r) => r.calls_made === true).length
  const q = L.filter((r) => r.quotation_reached === true).length
  const dm = L.filter((r) => r.demo_reached === true).length
  const won = L.filter((r) => r.Stage === 'Won')
  const wonRevenue = won.reduce((s, r) => s + r.effective_revenue, 0)
  const todayCount = L.filter((r) => (r.lead_created_at || '').slice(0, 10) === today()).length
  return { total: t, calls, quoted: q, demo: dm, wonCount: won.length, wonRevenue, todayCount }
}

// Drives both the KPI-tile click filter and (combined with chart filters)
// what feeds the charts.
export function matchesKpiFilter(r, kpi) {
  if (!kpi || kpi === 'all') return true
  if (kpi === 'calls') return r.calls_made === true
  if (kpi === 'quoted') return r.quotation_reached === true
  if (kpi === 'demo') return r.demo_reached === true
  if (kpi === 'won') return r.Stage === 'Won'
  if (kpi === 'today') return (r.lead_created_at || '').slice(0, 10) === today()
  return true
}

function productList(heroProduct) {
  return (heroProduct || '')
    .split(/[,/]/)
    .map((p) => p.trim().replace(/\s+/g, '').toUpperCase())
    .filter(Boolean)
}

// Chart-click filters (source/team/product/lostReason) — affects charts
// (dimming) and the table, but NOT the rep leaderboard.
export function matchesChartFilter(r, cf) {
  if (cf.source && (r.source_channel || 'Unknown') !== cf.source) return false
  if (cf.team && (r.team_name || 'Unassigned') !== cf.team) return false
  if (cf.product && !productList(r.hero_product).includes(cf.product)) return false
  if (cf.lostReason && (r.lost_reason_name || 'Unspecified') !== cf.lostReason) return false
  return true
}

// Stage buttons (All/Won/Pending/Lost) — table only, deliberately not
// applied to the charts/KPIs above.
export function matchesStageFilter(r, stage) {
  return !stage || r.Stage === stage
}

// The Lead Explorer's 3 select dropdowns (source channel/team/rep) —
// independent state from the chart-click source filter above; both check
// source_channel but are two separate constraints that both must pass
// (matches production's lApply exactly, including the edge case where a
// dropdown pick and a chart click disagree and the table simply empties).
export function matchesSelectFilters(r, { sourceChannel, team, rep }) {
  if (sourceChannel && r.source_channel !== sourceChannel) return false
  if (team && r.team_name !== team) return false
  if (rep && r.RepName !== rep) return false
  return true
}

export function matchesSearch(r, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    (r.contact_name || r.lead_name || '').toLowerCase().includes(q) ||
    String(r.phone || '').includes(q) ||
    (r.email || '').toLowerCase().includes(q)
  )
}

export function sortLeads(rows, sortKey, sortDir) {
  if (!sortKey) return rows
  const sorted = [...rows]
  sorted.sort((a, b) => {
    let av, bv
    if (sortKey === 'revenue') {
      av = a.effective_revenue
      bv = b.effective_revenue
    } else {
      av = a[sortKey] ?? ''
      bv = b[sortKey] ?? ''
    }
    if (!isNaN(av) && !isNaN(bv) && av !== '' && bv !== '') return (+av - +bv) * sortDir
    return String(av).localeCompare(String(bv)) * sortDir
  })
  return sorted
}

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
