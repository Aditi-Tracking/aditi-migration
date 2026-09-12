import { SB_HDRS, SB_HDRS_JSON, SB_HDRS_MIN, SUPABASE_URL } from './supabaseClient'

// Ported from old-portal/js/renewals.js — Renewals & Collections.
// Phase 1a: nav-visibility/location-scoping foundation + the My Customers
// tab's list/calendar/inline-edit/status/category/reassign functionality.
// Call logging + screenshot attachments + the customer detail modal/call
// history are Phase 1b; Closed/Paid, Unassigned Pool, Upload, Resolve
// Unmatched, Overview/Team Performance, and Accounts are later phases.

export const RU_LOCATIONS = [
  { value: 'original', label: 'Mumbai HO' }, // display-only relabel — stored value stays 'original'
  { value: 'gujarat', label: 'Gujarat' },
  { value: 'bangalore', label: 'Bangalore' },
  { value: 'goa', label: 'Goa' },
]

export const RU_CATEGORY_ORDER = ['Platinum', 'Gold', 'Silver']
export const RU_CATEGORY_FREQ = { Platinum: 'Once a Week', Gold: 'Twice a Week', Silver: 'Thrice a Week' }

// crm_customers.crm_status — matches the "SCOT Sheet" status list/colors.
// Distinct from crm_customers.status, an internal active/inactive lifecycle
// field that is NOT user-editable from this table.
export const RU_CRM_STATUS_OPTIONS = [
  { value: 'Payment Recieved', color: '#00d4aa' },
  { value: 'Deactivated', color: '#a855f7' },
  { value: 'Patch', color: '#4e9af1' },
  { value: 'Shared Details', color: '#eab308' },
  { value: 'Inactive', color: '#ff5c7c' },
  { value: 'Partial Payment', color: '#9aa3b2' },
]

// collection_calls.not_connected_reason stores the raw value — mapped back
// to a label for the calendar cell's hover tooltip.
export const RU_NOT_CONNECTED_REASON_LABELS = { no_answer: 'No Answer', switched_off: 'Switched Off', call_later: 'Call Later' }

// Optional columns for the My Customers table — Billing Name and Action are
// always shown and aren't part of this list. Visibility is a display
// preference only, persisted client-side, not synced server-side.
export const RU_COLUMNS = [
  { key: 'assigned_to', label: 'Assigned To' },
  { key: 'city', label: 'City' },
  { key: 'contact_person', label: 'Contact Person' },
  { key: 'contact_number', label: 'Contact Number' },
  { key: 'frequency', label: 'Frequency' },
  { key: 'outstanding', label: 'Outstanding', align: 'right' },
  { key: 'last_call', label: 'Last Call' },
  { key: 'crm_status', label: 'Status' },
  { key: 'recovered_amount', label: 'Received Amount', align: 'right' },
  { key: 'current_outstanding', label: 'Current Outstanding', align: 'right' },
]
const COLUMNS_STORAGE_KEY = 'ru_my_customers_columns_v1'

export const RU_CALENDAR_DAYS_OPTIONS = [5, 10, 15, 20]
const CALENDAR_DAYS_STORAGE_KEY = 'ru_my_customers_calendar_days_v1'

// Keys with a meaningful order to sort by. Contact Person/Number have none,
// and Frequency is 1:1 with the category a row is already grouped under.
export const RU_SORTABLE_KEYS = new Set([
  'billing_name',
  'outstanding',
  'last_call',
  'crm_status',
  'recovered_amount',
  'current_outstanding',
  'assigned_to',
  'city',
])

// ── Column-visibility prefs (client-side only) ────────────────────────────
export function loadColumnPrefs() {
  try {
    const raw = localStorage.getItem(COLUMNS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {} // corrupt/blocked storage — fall back to all-visible
  }
}

export function saveColumnPrefs(prefs) {
  try {
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

// Only "assigned_to" is role-conditional — irrelevant noise for a CRM person
// (who only ever sees their own name), but the whole point of the column
// when MIS/full-access is browsing everyone's book at once.
export function isColumnVisible(prefs, key, { isMIS, fullDataAccess }) {
  const pref = prefs[key]
  if (pref !== undefined) return pref
  return key === 'assigned_to' ? isMIS || fullDataAccess : true
}

export function loadCalendarDaysPref() {
  try {
    const raw = parseInt(localStorage.getItem(CALENDAR_DAYS_STORAGE_KEY), 10)
    if (RU_CALENDAR_DAYS_OPTIONS.includes(raw)) return raw
  } catch {
    /* ignore */
  }
  return 10
}

export function saveCalendarDaysPref(n) {
  try {
    localStorage.setItem(CALENDAR_DAYS_STORAGE_KEY, String(n))
  } catch {
    /* ignore */
  }
}

// ── Nav visibility / access resolution ────────────────────────────────────
// Ported from _applyRenewalsNavVisibility. Three independent grant paths:
// MIS-tier (role OR renewals_mis_grants), Accounts-tier (renewals_accounts_access,
// independent of MIS status), and a matching active crm_persons row (own book).
export async function fetchRenewalsAccessSnapshot(currentUser) {
  const rawRole = String(currentUser?.rawRole || currentUser?.role || '').toLowerCase().trim()
  const isRoleMIS = rawRole === 'owner' || rawRole === 'mis'
  const email = currentUser?.email
  let isMIS = isRoleMIS
  let isAccounts = false
  let crmPerson = null
  let fullDataAccess = false

  // Full MIS-tier grant without reclassifying Employee_Dept — some grant-only
  // accounts also have a real crm_persons row (so they can log calls, which
  // requires a crm_persons id), so this is guarded by the ORIGINAL role check
  // (isRoleMIS), not the post-grant isMIS, and must not skip the crm_persons
  // lookup below for them.
  if (!isRoleMIS && email) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/renewals_mis_grants?email=ilike.${encodeURIComponent(email)}&select=email&limit=1`,
        { headers: SB_HDRS() }
      )
      const rows = await res.json()
      if (Array.isArray(rows) && rows.length) isMIS = true
    } catch {
      /* treat as not granted */
    }
  }

  // Accounts-tier grant — independent of MIS status (an MIS account could
  // also independently be Accounts-tier).
  if (email) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/renewals_accounts_access?email=ilike.${encodeURIComponent(email)}&select=email&limit=1`,
        { headers: SB_HDRS() }
      )
      const rows = await res.json()
      if (Array.isArray(rows) && rows.length) isAccounts = true
    } catch {
      /* treat as not granted */
    }
  }

  if (!isRoleMIS && email) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/crm_persons?email=ilike.${encodeURIComponent(email)}&is_active=eq.true&select=id,name,full_data_access,location&limit=1`,
        { headers: SB_HDRS() }
      )
      const rows = await res.json()
      if (Array.isArray(rows) && rows.length) {
        crmPerson = rows[0]
        fullDataAccess = !!crmPerson.full_data_access
      }
    } catch {
      /* treat as no match — nav item just won't show */
    }
  }

  let allowedLocations
  if (isMIS) {
    allowedLocations = RU_LOCATIONS.map((l) => l.value)
  } else {
    const granted = new Set()
    if (crmPerson?.location) granted.add(crmPerson.location)
    if (email) {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/renewals_location_access?email=ilike.${encodeURIComponent(email)}&select=location`,
          { headers: SB_HDRS() }
        )
        const rows = await res.json()
        if (Array.isArray(rows)) rows.forEach((r) => r.location && granted.add(r.location))
      } catch {
        /* treat as no extra grants */
      }
    }
    allowedLocations = granted.size ? RU_LOCATIONS.map((l) => l.value).filter((v) => granted.has(v)) : ['original']
  }

  return { isMIS, isAccounts, crmPerson, fullDataAccess, allowedLocations }
}

// ── Pagination helper — Range-header batching past PostgREST's default cap,
// same local pattern every other module keeps its own copy of (e.g.
// lib/smartFleet.js's fetchAllLeads) — a location like Goa runs to ~1000
// customers, which a single request would silently truncate. ────────────
async function fetchAllRows(url, pageSize = 1000) {
  const rows = []
  let offset = 0
  while (true) {
    const res = await fetch(url, {
      headers: { ...SB_HDRS(), 'Range-Unit': 'items', Range: `${offset}-${offset + pageSize - 1}` },
    })
    if (res.status === 416) break // offset landed exactly on the end of a full multiple of pageSize
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const page = await res.json()
    rows.push(...page)
    if (page.length < pageSize) break
    offset += pageSize
  }
  return rows
}

// MIS/owner or a full_data_access CRM person see every customer across every
// CRM person; a regular CRM person only sees their own assigned book.
function scopeQuery({ isMIS, fullDataAccess, crmPersonId }) {
  return isMIS || fullDataAccess || !crmPersonId ? '' : `&assigned_crm_person_id=eq.${crmPersonId}`
}

function callScopeQuery({ isMIS, fullDataAccess, crmPersonId }) {
  return isMIS || fullDataAccess || !crmPersonId ? '' : `&crm_customers.assigned_crm_person_id=eq.${crmPersonId}`
}

// ── My Customers fetchers ──────────────────────────────────────────────────
export async function fetchMyCustomers({ location, isMIS, fullDataAccess, crmPersonId }) {
  const scope = scopeQuery({ isMIS, fullDataAccess, crmPersonId })
  return fetchAllRows(
    `${SUPABASE_URL}/rest/v1/crm_customers?select=*&order=billing_name.asc&location=eq.${encodeURIComponent(location)}${scope}`
  )
}

export async function fetchLatestOutstandingSnapshots(location) {
  return fetchAllRows(
    `${SUPABASE_URL}/rest/v1/latest_outstanding_snapshots?location=eq.${encodeURIComponent(location)}&select=customer_id,grand_total`
  )
}

// Filtered by location (+ person scope) via the embedded crm_customers
// relation rather than an IN-list of customer_id — an IN-list breaks past
// ~1000 customers (Goa-scale) with an opaque 400 from the URL-length limit.
export async function fetchLatestCollectionCalls({ location, isMIS, fullDataAccess, crmPersonId }) {
  const scope = callScopeQuery({ isMIS, fullDataAccess, crmPersonId })
  return fetchAllRows(
    `${SUPABASE_URL}/rest/v1/latest_collection_calls?select=customer_id,call_date,connected,crm_customers!inner(location)&crm_customers.location=eq.${encodeURIComponent(location)}${scope}`
  )
}

export async function fetchCrmPersons(location) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/crm_persons?is_active=eq.true&location=eq.${encodeURIComponent(location)}&select=id,name&order=name.asc`,
    { headers: SB_HDRS() }
  )
  if (!res.ok) throw new Error('crm_persons: HTTP ' + res.status)
  return res.json()
}

// Scoped to the current working-day window only — never the whole history —
// so this stays fast regardless of how far back a person's call log goes.
export async function fetchCalendarCalls({ location, isMIS, fullDataAccess, crmPersonId, start, end }) {
  const scope = callScopeQuery({ isMIS, fullDataAccess, crmPersonId })
  return fetchAllRows(
    `${SUPABASE_URL}/rest/v1/collection_calls?select=customer_id,call_date,connected,conversation_notes,not_connected_reason,crm_customers!inner(location)&crm_customers.location=eq.${encodeURIComponent(location)}${scope}&call_date=gte.${start}&call_date=lte.${end}&order=call_date.asc`
  )
}

export function mergeCustomerRows(customers, snapshots, calls) {
  const snapMap = new Map(snapshots.map((s) => [s.customer_id, s]))
  const callMap = new Map(calls.map((c) => [c.customer_id, c]))
  return customers.map((c) => ({ ...c, _snapshot: snapMap.get(c.id) || null, _lastCall: callMap.get(c.id) || null }))
}

// CRM only calls customers who actually owe money — a customer with no
// snapshot at all (never uploaded) or a latest grand_total of 0 (paid up)
// no longer belongs here. Zero-balance customers move to Closed/Paid
// (Phase 2); a never-uploaded customer isn't in either tab.
export function filterCallableCustomers(customers) {
  return customers.filter((c) => c._snapshot && Number(c._snapshot.grand_total) > 0)
}

// MIS/owner-only filter — irrelevant/'' for a CRM person, who's already
// scoped to their own book by the fetch itself.
export function filterByAssignedTo(customers, assignedToFilter) {
  if (!assignedToFilter) return customers
  return customers.filter((c) =>
    assignedToFilter === '__unassigned__' ? !c.assigned_crm_person_id : c.assigned_crm_person_id === assignedToFilter
  )
}

export function filterBySearch(customers, search) {
  const q = search.trim().toLowerCase()
  if (!q) return customers
  return customers.filter((c) => (c.billing_name || '').toLowerCase().includes(q))
}

// ── Pure derivations ───────────────────────────────────────────────────────
// grand_total comes from the latest snapshot (import-driven); recovered_amount
// is a DB-trigger-maintained derived total (SUM of collection_calls.
// amount_recovered for this customer). Current Outstanding itself is not
// stored anywhere — cheap to derive live from the two source values.
export function currentOutstandingValue(c) {
  if (!c._snapshot) return null
  return Number(c._snapshot.grand_total) - Number(c.recovered_amount || 0)
}

export function lastCallText(c) {
  const lastCall = c._lastCall
  return lastCall && lastCall.call_date
    ? `${lastCall.call_date} · ${lastCall.connected ? 'Connected' : 'Not connected'}`
    : 'Never called'
}

export function assignedPersonName(c, persons) {
  if (!c.assigned_crm_person_id) return null // truly unassigned
  const person = persons.find((p) => p.id === c.assigned_crm_person_id)
  return person ? person.name : '(inactive person)' // id set but no longer an active crm_persons row
}

export function sortValue(key, c, persons) {
  switch (key) {
    case 'billing_name':
      return c.billing_name || ''
    case 'outstanding':
      return c._snapshot ? Number(c._snapshot.grand_total) : -Infinity
    case 'last_call':
      return (c._lastCall && c._lastCall.call_date) || ''
    case 'crm_status':
      return c.crm_status || ''
    case 'recovered_amount':
      return Number(c.recovered_amount || 0)
    case 'current_outstanding': {
      const v = currentOutstandingValue(c)
      return v === null ? -Infinity : v
    }
    case 'assigned_to':
      return assignedPersonName(c, persons) || ''
    case 'city':
      return c.city || ''
    default:
      return ''
  }
}

// Stable tiebreak, always ascending by name regardless of the primary
// column's direction.
export function myCustomersComparator(key, dir, persons) {
  return (a, b) => {
    const av = sortValue(key, a, persons)
    const bv = sortValue(key, b, persons)
    const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
    return (cmp !== 0 ? cmp * dir : 0) || a.billing_name.localeCompare(b.billing_name)
  }
}

// Category-grouped (Platinum/Gold/Silver) sections, each independently
// sorted — a category with no rows is dropped entirely, matching production.
export function groupByCategory(customers, sortKey, sortDir, persons) {
  return RU_CATEGORY_ORDER.map((category) => {
    const inCat = customers.filter((c) => c.category === category)
    if (!inCat.length) return null
    const sorted = [...inCat].sort(myCustomersComparator(sortKey, sortDir, persons))
    return { category, freq: RU_CATEGORY_FREQ[category], rows: sorted }
  }).filter(Boolean)
}

// ── Calendar date math — Sunday is never a working day ────────────────────
export function dateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayStr() {
  return dateStr(new Date())
}

// Never use toISOString() for this — it converts to UTC, which silently
// shifts the date backward by one day for any timezone ahead of UTC (e.g.
// IST), turning the working-day loops below into infinite loops.
export function addDays(dateString, days) {
  const d = new Date(dateString + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return dateStr(d)
}

export function isSunday(dateString) {
  return new Date(dateString + 'T00:00:00').getDay() === 0
}

// Steps n working days (Sundays skipped) from dateString; negative n steps backward.
export function addWorkingDays(dateString, n) {
  let d = dateString
  const step = n < 0 ? -1 : 1
  let remaining = Math.abs(n)
  while (remaining > 0) {
    d = addDays(d, step)
    if (!isSunday(d)) remaining--
  }
  return d
}

// Sunday has no working-day column, so an anchor that lands on one snaps back to Saturday.
export function latestWorkingDay(dateString) {
  return isSunday(dateString) ? addWorkingDays(dateString, -1) : dateString
}

export function calendarDateRange(windowEnd, workingDays) {
  const end = latestWorkingDay(windowEnd || todayStr())
  const start = addWorkingDays(end, -(workingDays - 1))
  return { start, end }
}

// Newest-first (today/latest leftmost, oldest rightmost) — the single place
// this ordering is decided.
export function calendarDateList(windowEnd, workingDays) {
  const { start, end } = calendarDateRange(windowEnd, workingDays)
  const dates = []
  let d = start
  while (d <= end) {
    if (!isSunday(d)) dates.push(d)
    d = addDays(d, 1)
  }
  return dates.reverse()
}

// ── Writes ─────────────────────────────────────────────────────────────────
export async function updateCustomerField(customerId, field, value) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_customers?id=eq.${customerId}`, {
    method: 'PATCH',
    headers: SB_HDRS_MIN(),
    body: JSON.stringify({ [field]: value || null }),
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
}

export async function updateCustomerStatus(customerId, value) {
  return updateCustomerField(customerId, 'crm_status', value)
}

// Category decides which section of the My Customers list a row lives
// under, so it carries calling_frequency along with it (Platinum/Gold/Silver
// -> frequency mapping). Returns the derived calling_frequency so the caller
// can update its local cache without a refetch.
export async function updateCustomerCategory(customerId, category) {
  const calling_frequency = category ? RU_CATEGORY_FREQ[category] : null
  const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_customers?id=eq.${customerId}`, {
    method: 'PATCH',
    headers: SB_HDRS_MIN(),
    body: JSON.stringify({ category: category || null, calling_frequency }),
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return calling_frequency
}

// SECURITY DEFINER RPC, not a direct PATCH — a plain PATCH hits crm_customers'
// RLS requirement that the row remain SELECT-visible to the caller after the
// write, which a hand-away update can never satisfy.
export async function reassignCustomer({ customerId, newPersonId }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/reassign_crm_customer`, {
    method: 'POST',
    headers: SB_HDRS_JSON(),
    body: JSON.stringify({ p_customer_id: customerId, p_new_person_id: newPersonId }),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(errBody.message || 'HTTP ' + res.status)
  }
}
