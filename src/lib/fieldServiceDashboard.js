// Field Service Dashboard — read-only analytics on top of Field Service data. Ported from
// old-portal/js/fieldservice-dashboard.js. Phase 2 of 2 — reuses Phase 1's lib/fieldService.js
// for JOB_TYPE_CONFIG, canViewAllFieldService, publicPhotoUrl, and the module-level cached
// fetchEngineerOptions/engineerName (shared with the List tab without either needing to know
// about the other's fetch).
// Tables/views read: field_service_daily_stats (pre-aggregated, RLS-scoped automatically),
// field_service_entries + field_service_photos (RLS-scoped: own rows only, or all rows if
// field_service_view_all). Access control is the same gate as Field Service itself — reaching
// this tab at all already implies hasFieldServiceAccess(), so nothing here re-checks it;
// field_service_view_all only controls the engineer column/filter/chart, exactly like
// canViewAllFieldService() elsewhere — RLS is what actually restricts rows, never a client-side
// engineer_id filter.
import { SUPABASE_URL, SB_HDRS } from './supabaseClient'

export const FSD_PAGE_SIZE = 25
export const FSD_CHART_PALETTE = ['#00d4aa', '#3b82f6', '#f0a500', '#a78bfa', '#10b981', '#ff5c7c', '#f5a623', '#6366f1', '#ec4899', '#14b8a6']

// Local calendar date -> 'YYYY-MM-DD', using local getters (getFullYear/getMonth/getDate), NOT
// toISOString(). toISOString() first converts to UTC, which silently shifts the date by a day
// depending on the browser's timezone offset — entry_date comes back from PostgREST as a plain
// 'YYYY-MM-DD' string (no time component), and `new Date('2026-07-31')` parses THAT as UTC
// midnight. For any positive-UTC-offset viewer (e.g. IST), UTC-midnight-of-day-D is *later* in
// absolute time than *local*-midnight-of-day-D, so a boundary check like `t <= localMidnight(...)`
// was false for that day's own entries — silently dropping the last day of "last month" (and
// today's entries from "this month"). This is the fix for a real "vs 0 last month" production
// bug — comparing plain date strings instead removes the entire class of bug. Not "improved"
// back to Date-object comparisons.
export function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Preset -> {from, to} as 'YYYY-MM-DD' local-calendar strings. Every rolling preset anchors its
// end on today and counts back. 'alltime' returns blank from/to so the query-building code's
// `if (f.from)`/`if (f.to)` checks skip the date filter entirely.
export function presetRange(preset) {
  if (preset === 'alltime') return { from: '', to: '' }
  const now = new Date()
  if (preset === 'yesterday') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    return { from: dateStr(d), to: dateStr(d) }
  }
  if (preset === 'today') {
    const todayStr = dateStr(now)
    return { from: todayStr, to: todayStr }
  }
  const to = dateStr(now)
  let from
  if (preset === 'mtd') from = new Date(now.getFullYear(), now.getMonth(), 1)
  else if (preset === '30d') from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
  else if (preset === '3m') from = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
  else if (preset === '6m') from = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())
  else from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6) // '7d' + fallback
  return { from: dateStr(from), to }
}

export function resolveActiveFilters({ preset, customFrom, customTo, jobType, engineerId }) {
  const range = preset === 'custom' ? { from: customFrom, to: customTo } : presetRange(preset || '30d')
  return { from: range.from, to: range.to, jobType: jobType || '', engineer: engineerId || '' }
}

export function groupSum(rows, key) {
  const map = new Map()
  rows.forEach((r) => map.set(r[key], (map.get(r[key]) || 0) + Number(r.entry_count || 0)))
  return map
}

// ── Summary rows — the ONE fetch actually scoped by the active preset/custom range (+ job
// type/engineer). Powers every chart AND all 4 KPI tiles now — the earlier fetchKpiComparisonStats()
// split (3 tiles pinned to real calendar windows, independent of this range) is gone. ──
export async function fetchDailyStats({ from, to, jobType, engineer, viewAll }) {
  let url = `${SUPABASE_URL}/rest/v1/field_service_daily_stats?select=*`
  if (from) url += `&entry_date=gte.${from}`
  if (to) url += `&entry_date=lte.${to}`
  if (jobType) url += `&job_type=eq.${encodeURIComponent(jobType)}`
  if (viewAll && engineer) url += `&engineer_id=eq.${encodeURIComponent(engineer)}`
  const res = await fetch(url, { headers: SB_HDRS() })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
}

// ── Detailed entries list — from field_service_entries directly (RLS-scoped), paginated. No
// client-side engineer_id filter is added for the own-data case — RLS already returns exactly
// the right rows, same convention as the List tab (Phase 1). ──
export async function fetchDashboardEntries({ from, to, jobType, engineer, viewAll, page }) {
  let url =
    `${SUPABASE_URL}/rest/v1/field_service_entries` +
    `?select=id,created_at,job_type,client_name,location,engineer_id,details,field_service_photos(id,field_label,storage_path,file_name)` +
    `&order=created_at.desc`
  if (from) url += `&created_at=gte.${from}T00:00:00`
  if (to) url += `&created_at=lte.${to}T23:59:59`
  if (jobType) url += `&job_type=eq.${encodeURIComponent(jobType)}`
  if (viewAll && engineer) url += `&engineer_id=eq.${encodeURIComponent(engineer)}`

  const rangeFrom = page * FSD_PAGE_SIZE
  const rangeTo = rangeFrom + FSD_PAGE_SIZE - 1
  const res = await fetch(url, {
    headers: { ...SB_HDRS(), 'Range-Unit': 'items', Range: `${rangeFrom}-${rangeTo}`, Prefer: 'count=exact' },
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const rows = await res.json()
  return { rows, total: parseContentRangeTotal(res.headers.get('content-range')) }
}

function parseContentRangeTotal(headerVal) {
  if (!headerVal) return 0
  const m = /\/(\d+|\*)$/.exec(headerVal)
  return m && m[1] !== '*' ? Number(m[1]) : 0
}
