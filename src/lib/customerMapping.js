// Customer Mapping — GPS Portal <-> Odoo customer name mapping. Ported from
// old-portal/js/mapping.js. Talks entirely to the same Railway PAPI_URL Flask backend already
// used by Access Control/Task Scheduler/Field Service — no Supabase table/Storage bucket is
// touched anywhere in this module.
//
// Unlike canAccessCRM/canViewHREmployee, there is no hardcoded owner/mis role-string bypass here
// — _canAccessMapping()/_mpCanEdit in production are a plain `PERMISSIONS.x === 'true'` check with
// nothing else. The owner/mis "bypass" that shows up in practice comes entirely from the backend's
// own role_defaults already resolving can_view_mapping/can_edit_mapping/every mapping_region_* flag
// to 'true' for those roles before `permissions` ever reaches the frontend (confirmed in
// lib/permissions.js's ROLE_DEFAULT_PERMISSIONS) — same trust model as every other
// `permissions.x === 'true'` check in this project, not a client-side fallback.
import { PAPI_URL } from './permissions'

export function canAccessMapping(permissions) {
  return permissions?.can_view_mapping === 'true'
}
export function canEditMapping(permissions) {
  return permissions?.can_edit_mapping === 'true'
}

// Fixed order, ported verbatim from loadMappingDashboard's sequential if-pushes — NOT
// alphabetical, and independent of which flags a given user actually has set.
export const MAPPING_REGIONS = ['HeadOffice', 'Goa', 'Bangalore', 'Gujarat']

// If none of the 4 region flags are 'true', production falls back to ALL FOUR regions rather than
// zero — a permissive-by-default design, ported exactly (not "fixed" to fail closed).
export function getAllowedMappingRegions(permissions) {
  const allowed = []
  if (permissions?.mapping_region_headoffice === 'true') allowed.push('HeadOffice')
  if (permissions?.mapping_region_goa === 'true') allowed.push('Goa')
  if (permissions?.mapping_region_bangalore === 'true') allowed.push('Bangalore')
  if (permissions?.mapping_region_gujarat === 'true') allowed.push('Gujarat')
  return allowed.length ? allowed : [...MAPPING_REGIONS]
}

// ── Fetch ────────────────────────────────────────────────────────────────────
// region: 'All' or one of MAPPING_REGIONS. 'All' is sent to the API as an empty string.
export async function fetchMappingData(region) {
  const q = region === 'All' ? '' : region
  const res = await fetch(`${PAPI_URL}/api/mapping-data?region=${encodeURIComponent(q)}`)
  return res.ok ? res.json() : []
}

// Live per-row Odoo-universe search — entirely separate from filterByCanonicalName below, which
// only searches rows already loaded into the table. This one hits the API on every keystroke
// (caller debounces) and can return any Odoo customer, mapped to this GPS row or not.
export async function searchOdooCustomers(query) {
  const res = await fetch(`${PAPI_URL}/api/odoo-search?q=${encodeURIComponent(query)}`)
  return res.ok ? res.json() : []
}

export async function saveMapping({ gpsAliasId, gpsName, odooId, canonicalName, tier }, callerEmail) {
  const res = await fetch(`${PAPI_URL}/api/save-mapping`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Email': callerEmail || '' },
    body: JSON.stringify({
      gps_alias_id: gpsAliasId,
      gps_name: gpsName,
      odoo_alias_ids: [odooId],
      canonical_name: canonicalName,
      tier: tier || '',
    }),
  })
  if (!res.ok) throw new Error('Save failed')
}

export async function clearMapping(gpsAliasId, callerEmail) {
  const res = await fetch(`${PAPI_URL}/api/clear-mapping`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Email': callerEmail || '' },
    body: JSON.stringify({ gps_alias_id: gpsAliasId }),
  })
  if (!res.ok) throw new Error('Clear failed')
}

// ── KPIs ─────────────────────────────────────────────────────────────────────
// Always computed off the full unfiltered data set for the current region — not the
// search/status-filtered rows, matching production's mpUpdateProgress exactly.
export function computeMappingKpis(rows) {
  const total = rows.length
  const mapped = rows.filter((r) => r.is_mapped).length
  const unmapped = total - mapped
  const vehicles = rows.filter((r) => r.is_mapped).reduce((s, r) => s + (r.total_vehicles || 0), 0)
  return {
    total,
    mapped,
    unmapped,
    vehicles,
    mappedPct: total ? Math.round((mapped / total) * 100) : 0,
    unmappedPct: total ? Math.round((unmapped / total) * 100) : 0,
  }
}

// ── Filter + sort (table) ─────────────────────────────────────────────────────
// Two genuinely separate searches, kept as separate functions so they can't bleed into each
// other: `gpsSearch` matches gps_name (the "Search GPS company" box); `odooSearch` matches
// canonical_name of rows ALREADY LOADED (the "Search Odoo customer" box) — NOT
// searchOdooCustomers()'s live Odoo-universe lookup above, despite the near-identical box label.
export function filterAndSortMappingRows(rows, { status, gpsSearch, odooSearch }) {
  const gq = (gpsSearch || '').toLowerCase().trim()
  const oq = (odooSearch || '').toLowerCase().trim()
  return rows
    .filter((r) => {
      if (status === 'mapped' && !r.is_mapped) return false
      if (status === 'unmapped' && r.is_mapped) return false
      if (gq && !(r.gps_name || '').toLowerCase().includes(gq)) return false
      if (oq && !(r.canonical_name || '').toLowerCase().includes(oq)) return false
      return true
    })
    .sort((a, b) => (b.total_vehicles || 0) - (a.total_vehicles || 0))
}
