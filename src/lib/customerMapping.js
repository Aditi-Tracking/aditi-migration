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
//
// DATA SHAPE (one entry per GPS company, i.e. per customer_gps_aliases row):
//   { gps_alias_id, gps_name, region, customer_id, canonical_name, tier, total_vehicles,
//     is_mapped, shared_gps_count,
//     odoo_links: [{ odoo_alias_id, odoo_name, odoo_partner_id, is_company, parent_name }] }
// A company with several Odoo names has several odoo_links — all of them point at the SAME
// customer_master row. KPIs/search/sort work on companies; buildDisplayRows() flattens them into
// table rows (one per Odoo name) only at the last step.
import { PAPI_URL } from './permissions'
import { getAuthToken } from './supabaseClient'

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
// zero — a permissive-by-default design, ported exactly (not "fixed" to fail closed). The server
// now applies the same rule (see _mapping_region_scope in api.py), so this is display-only.
export function getAllowedMappingRegions(permissions) {
  const allowed = []
  if (permissions?.mapping_region_headoffice === 'true') allowed.push('HeadOffice')
  if (permissions?.mapping_region_goa === 'true') allowed.push('Goa')
  if (permissions?.mapping_region_bangalore === 'true') allowed.push('Bangalore')
  if (permissions?.mapping_region_gujarat === 'true') allowed.push('Gujarat')
  return allowed.length ? allowed : [...MAPPING_REGIONS]
}

// ── API ──────────────────────────────────────────────────────────────────────
export class MappingApiError extends Error {
  constructor(message, status, code, detail) {
    super(message)
    this.name = 'MappingApiError'
    this.status = status
    this.code = code
    this.detail = detail
  }
}

// Every mapping endpoint now requires the signed-in user's Supabase JWT. getAuthToken() is the
// same token SB_HDRS() uses for REST calls — kept fresh by AuthContext's onAuthStateChange.
async function mappingRequest(path, { method = 'GET', body, signal } = {}) {
  const headers = { Authorization: `Bearer ${getAuthToken()}` }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${PAPI_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    // empty or non-JSON body — fall through to the status check below
  }
  if (!res.ok) throw new MappingApiError(data?.error || `Request failed (${res.status})`, res.status, data?.code, data?.detail)
  return data
}

export function mappingErrorMessage(e, fallback) {
  if (e?.status === 401) return 'Your session has expired — please reload the page and sign in again.'
  if (e?.status === 403) return "You don't have permission to do that."
  if (e?.code === 'ODOO_IN_USE_BY_OTHER_CUSTOMER') {
    return `That Odoo name is already linked to another customer${e.detail ? ` (${e.detail})` : ''}. Unlink it there first.`
  }
  if (e?.code === 'ODOO_INACTIVE') return 'That Odoo partner is archived in Odoo and cannot be linked.'
  return `${fallback}${e?.message ? `: ${e.message}` : ''}`
}

// region: 'All' or one of MAPPING_REGIONS. 'All' is sent to the API as an empty string.
export function fetchMappingData(region, signal) {
  const q = region === 'All' ? '' : region
  return mappingRequest(`/api/mapping-data?region=${encodeURIComponent(q)}`, { signal })
}

export const ODOO_SEARCH_MIN_CHARS = 2
export const ODOO_SEARCH_DEBOUNCE_MS = 250

// Live Odoo-universe search (search_odoo_aliases RPC behind /api/odoo-search, max 20 rows).
// Entirely separate from filterAndSortMappingRows below, which only searches rows already loaded.
export function searchOdooCustomers(query, signal) {
  return mappingRequest(`/api/odoo-search?q=${encodeURIComponent(query)}`, { signal })
}

// Links ONE more Odoo alias to a GPS company. First link creates the customer_master row, later
// links join the company's existing one (never overwriting its tier/mapped_by). mapped_by is
// stamped server-side from the verified token — the client never sends an email.
export function saveMapping({ gpsAliasId, odooAliasId }) {
  return mappingRequest('/api/save-mapping', {
    method: 'POST',
    body: { gps_alias_id: gpsAliasId, odoo_alias_id: odooAliasId },
  })
}

// odooAliasId given: unlink that one Odoo name (or the whole company if it is the last name).
// Omitted: unlink the whole GPS company.
export function clearMapping({ gpsAliasId, odooAliasId }) {
  const body = { gps_alias_id: gpsAliasId }
  if (odooAliasId !== undefined && odooAliasId !== null) body.odoo_alias_id = odooAliasId
  return mappingRequest('/api/clear-mapping', { method: 'POST', body })
}

// True when picking this search result would touch a customer that a GPS company (live or
// archived) really uses. A "stale" Odoo link — one pointing at a customer nobody uses — comes back
// from the server with in_use = false and is treated exactly like a free name: no marker, no confirm.
export function isOptionInUse(option) {
  return option.customer_id != null && option.in_use === true
}

// Who else loses the Odoo name if it is unlinked from this company's (shared) customer:
// { names: [up to 9 other GPS company names], more: N }.
export function fetchMappingShared(gpsAliasId) {
  return mappingRequest(`/api/mapping-shared?gps_alias_id=${encodeURIComponent(gpsAliasId)}`)
}

export function fetchMappingArchive({ q, limit = 200, offset = 0, signal }) {
  const params = new URLSearchParams({ q: q || '', limit: String(limit), offset: String(offset) })
  return mappingRequest(`/api/mapping-archive?${params}`, { signal })
}

// Merges a save/clear result into `rows` — keeps KPIs and the table in sync without a refetch.
// Other companies on the same customer_master (shared customer) get the new link list too.
export function applyMappingResult(rows, r) {
  const cleared = r.action === 'cleared_company' || r.action === 'nothing_to_clear'
  return rows.map((row) => {
    if (row.gps_alias_id === r.gps_alias_id) {
      return cleared
        ? { ...row, customer_id: null, is_mapped: false, canonical_name: '', odoo_links: [], shared_gps_count: 0 }
        : {
            ...row,
            customer_id: r.customer_id,
            is_mapped: true,
            canonical_name: r.canonical_name ?? row.canonical_name,
            odoo_links: r.odoo_links,
            shared_gps_count: r.shared_gps_count,
          }
    }
    if (r.customer_id != null && row.customer_id === r.customer_id) {
      return { ...row, canonical_name: r.canonical_name ?? row.canonical_name, odoo_links: r.odoo_links, shared_gps_count: r.shared_gps_count }
    }
    return row
  })
}

// ── KPIs ─────────────────────────────────────────────────────────────────────
// Always computed off the full unfiltered data set for the current region — not the
// search/status-filtered rows, matching production's mpUpdateProgress exactly. Counts GPS
// COMPANIES (one entry each, however many Odoo names it has) — never display rows.
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

// ── Filter + sort (companies) ────────────────────────────────────────────────
// Two genuinely separate searches, kept as separate functions so they can't bleed into each
// other: `gpsSearch` matches gps_name (the "Search GPS company" box); `odooSearch` matches the
// customer's canonical_name OR any of its linked Odoo names, on companies ALREADY LOADED (the
// "Search Odoo customer" box) — NOT searchOdooCustomers()'s live Odoo-universe lookup above.
export function filterAndSortMappingRows(rows, { status, gpsSearch, odooSearch }) {
  const gq = (gpsSearch || '').toLowerCase().trim()
  const oq = (odooSearch || '').toLowerCase().trim()
  return rows
    .filter((r) => {
      if (status === 'mapped' && !r.is_mapped) return false
      if (status === 'unmapped' && r.is_mapped) return false
      if (gq && !(r.gps_name || '').toLowerCase().includes(gq)) return false
      if (oq) {
        const hit =
          (r.canonical_name || '').toLowerCase().includes(oq) ||
          (r.odoo_links || []).some((l) => (l.odoo_name || '').toLowerCase().includes(oq))
        if (!hit) return false
      }
      return true
    })
    .sort((a, b) => (b.total_vehicles || 0) - (a.total_vehicles || 0))
}

// ── Table rows ───────────────────────────────────────────────────────────────
// Flattens companies into display rows, one per Odoo name. Only the `first` row of a company
// carries the #, GPS name, region, tier, vehicles and status — so those show once per company.
// `last` marks the row that gets the "+" button. `addingFor` is the gps_alias_id that currently
// has an empty "pick another Odoo name" row appended (client-side only until a name is chosen).
export function buildDisplayRows(companies, addingFor) {
  const out = []
  companies.forEach((company, companyIndex) => {
    const links = company.odoo_links || []
    const adding = addingFor === company.gps_alias_id && company.is_mapped
    if (!links.length) {
      out.push({ key: `${company.gps_alias_id}:0`, company, link: null, first: true, last: !adding, pending: false, companyIndex })
    } else {
      links.forEach((link, i) => {
        out.push({
          key: `${company.gps_alias_id}:${link.odoo_alias_id}`,
          company,
          link,
          first: i === 0,
          last: i === links.length - 1 && !adding,
          pending: false,
          companyIndex,
        })
      })
    }
    if (adding) out.push({ key: `${company.gps_alias_id}:new`, company, link: null, first: false, last: true, pending: true, companyIndex })
  })
  return out
}
