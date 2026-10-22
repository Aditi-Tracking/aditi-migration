// Field Sales Form — a field rep logs a lead from their phone; a manager can push entries into the Enquiry
// Capture Sheet's FMS pipeline. A module of its own (not a part of lib/enquiries.js): own table, own
// permission keys (lib/fieldSalesFormPermissions.js), own pick-lists.
//
// Table field_sales_entries — WRITE-ONCE for its data (no update/delete policy, like Field Service); the one thing that changes after
// insert is a SOFT delete (deleted_at / deleted_by, set only by delete_field_sales_entries() or by deleting its pushed enquiry — below):
//   id, entered_by [auth UID, DB default auth.uid()], entered_by_name / entered_by_email [set by a BEFORE INSERT
//   trigger from Employee_details / the JWT — never sent], source_of_lead, city, state, visit_purpose,
//   lead_name, contact_number, email_id (optional), current_gps_provider, fleet_size int, lead_stage,
//   demo_given bool, product_interested text[], expected_revenue numeric, expected_amount_receiving_date date,
//   sent_to_fms_at / linked_enquiry_id [stamped together, only by send_field_sales_to_fms()], created_at,
//   deleted_at / deleted_by [a deleted entry vanishes from every read; linked_enquiry_id is kept so a restore re-links it].
// Server-enforced, so the checks here are only the friendly first line: text columns non-blank, fleet and
// revenue >= 0, at least one product, and source / purpose / stage / every product must be a CURRENTLY ACTIVE
// option of their list (the trigger rejects others with messages like `"X" is not an active Lead Stage option`
// — errcode 23514 — which surface to the user as they are).
// Pick-lists live in enquiry_dropdown_options under four types (below); who may read / change them is decided by
// RLS via the field_sales_form_* keys, and the order is the seeded sort_order, not A→Z.
// Every entry is pushed to Sales FMS BY THE DATABASE the moment it is submitted (trigger on field_sales_entries, step 18 — fms_push_field_sales_entry):
// one new `enquiries` row (already marked sent, entry channel 'field_sales_form', the 4 pipeline stages; a lead entered as Won / Lost is closed at once),
// the entry stamped and locked. There is no Push button and no push permission any more.
import { SUPABASE_URL, SB_HDRS, SB_HDRS_JSON, SB_HDRS_REPR } from './supabaseClient'
import { assertFilterBudget, buildFilterParams, buildOrderParam, emptyFilters } from './tableFilters'
import { clearColumnValuesCache, fetchColumnValues } from './columnValues'

const SB = SUPABASE_URL + '/rest/v1'

// ── Vocabulary ──────────────────────────────────────────────────────────────
export const FS_LIST = { SOURCE: 'field_sales_source', PURPOSE: 'visit_purpose', STAGE: 'field_sales_lead_stage', PRODUCT: 'product_interested' }
// The wording the DB trigger uses in its messages.
export const FS_LIST_LABELS = { [FS_LIST.SOURCE]: 'Source of Lead', [FS_LIST.PURPOSE]: 'Purpose of Call/Visit', [FS_LIST.STAGE]: 'Lead Stage', [FS_LIST.PRODUCT]: 'Product Interested' }
// StatusBadge / chip tones. Unknown (a stage added later) → neutral.
export const LEAD_STAGE_TONE = { Hot: 'danger', Warm: 'warning', Cold: 'primary', Lost: 'neutral', Won: 'success' }
export const leadStageTone = (stage) => LEAD_STAGE_TONE[stage] || 'neutral'
export const FMS_FILTER_OPTIONS = [
  { value: 'unsent', label: 'Not pushed' },
  { value: 'sent', label: 'Pushed' },
]
export const DEMO_FILTER_OPTIONS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
]
// 28 states + 8 union territories, offered as suggestions for the free-text State field.
export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
]

// ── Small helpers ───────────────────────────────────────────────────────────
const clean = (v) => String(v ?? '').trim()
const IST = 'Asia/Kolkata'

// created_at is a timestamptz; people think in India dates.
export function formatEntryDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d) ? String(iso) : d.toLocaleDateString('en-IN', { timeZone: IST, day: 'numeric', month: 'short', year: 'numeric' })
}
export function formatEntryDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d) ? String(iso) : d.toLocaleString('en-IN', { timeZone: IST, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
// A plain date column ('YYYY-MM-DD') — no timezone conversion (it is already a calendar date).
export function formatPlainDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return isNaN(d) ? String(iso) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
export const formatINR = (n) => (n === null || n === undefined || n === '' ? '—' : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }))

async function httpError(res, fallback) {
  const text = await res.text().catch(() => '')
  let msg = text
  try {
    const j = JSON.parse(text)
    msg = j.message || j.hint || text
  } catch {
    /* not JSON — use the raw text */
  }
  if (res.status === 401 || res.status === 403 || /row-level security|42501|not authorised/i.test(msg || '')) return "You don't have permission to do that."
  return friendlyFieldSalesError(msg) || fallback || 'HTTP ' + res.status
}

// The trigger's own messages ("… is not an active Lead Stage option", "Select at least one …") are already
// readable and pass through. Raw check-constraint failures are rewritten; client validation normally stops
// them first, so this is the backstop.
const CONSTRAINT_MESSAGES = {
  field_sales_entries_text_check: "City, State, Lead Name, Contact Number and Current GPS Provider can't be blank.",
  field_sales_entries_fleet_check: "Fleet size can't be negative.",
  field_sales_entries_revenue_check: "Expected revenue can't be negative.",
  field_sales_entries_products_check: 'Select at least one Product Interested option.',
}
export function friendlyFieldSalesError(message) {
  const m = /violates check constraint "([^"]+)"/.exec(message || '')
  return m && CONSTRAINT_MESSAGES[m[1]] ? CONSTRAINT_MESSAGES[m[1]] : message
}

// ── The form ────────────────────────────────────────────────────────────────
export const emptyFieldSalesForm = () => ({
  source_of_lead: '',
  city: '',
  state: '',
  visit_purpose: '',
  lead_name: '',
  contact_number: '',
  email_id: '',
  current_gps_provider: '',
  fleet_size: '',
  lead_stage: '',
  demo_given: '', // 'yes' | 'no' | '' — deliberately NO default: the column is NOT NULL and a silent "No" would be made-up data
  product_interested: [],
  expected_revenue: '',
  expected_amount_receiving_date: '',
})

const FLEET_RE = /^\d{1,9}$/
const MONEY_RE = /^\d{1,12}(\.\d{1,2})?$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// Indian-style grouping ("1,50,000") and stray spaces are fine in the amount box.
const moneyText = (v) => clean(v).replace(/[,\s]/g, '')

// Everything is required except Email. Returns { field: message }.
export function validateFieldSalesForm(form) {
  const e = {}
  if (!clean(form.source_of_lead)) e.source_of_lead = 'Choose a source of lead.'
  if (!clean(form.city)) e.city = 'City is required.'
  if (!clean(form.state)) e.state = 'State is required.'
  if (!clean(form.visit_purpose)) e.visit_purpose = 'Choose the purpose of the call / visit.'
  if (!clean(form.lead_name)) e.lead_name = 'Lead name is required.'
  if (!clean(form.contact_number)) e.contact_number = 'Contact number is required.'
  if (clean(form.email_id) && !EMAIL_RE.test(clean(form.email_id))) e.email_id = 'Enter a valid email address.'
  if (!clean(form.current_gps_provider)) e.current_gps_provider = 'Current GPS provider is required.'
  if (!clean(form.fleet_size)) e.fleet_size = 'Fleet size is required.'
  else if (!FLEET_RE.test(clean(form.fleet_size))) e.fleet_size = 'Fleet size must be a whole number (0 or more).'
  if (!clean(form.lead_stage)) e.lead_stage = 'Choose a lead stage.'
  if (form.demo_given !== 'yes' && form.demo_given !== 'no') e.demo_given = 'Choose Yes or No for demo given.'
  if (!Array.isArray(form.product_interested) || !form.product_interested.length) e.product_interested = 'Select at least one product.'
  if (!moneyText(form.expected_revenue)) e.expected_revenue = 'Expected revenue is required.'
  else if (!MONEY_RE.test(moneyText(form.expected_revenue))) e.expected_revenue = 'Enter a valid amount (0 or more, up to 2 decimals).'
  if (!clean(form.expected_amount_receiving_date)) e.expected_amount_receiving_date = 'Expected amount receiving date is required.'
  else if (!ISO_DATE_RE.test(clean(form.expected_amount_receiving_date)) || isNaN(new Date(form.expected_amount_receiving_date + 'T00:00:00'))) e.expected_amount_receiving_date = 'Enter a valid date.'
  return e
}

// entered_by / entered_by_name / entered_by_email / sent_to_fms_at / linked_enquiry_id are deliberately absent —
// the DB sets or refuses them. Assumes validateFieldSalesForm() passed.
export function buildFieldSalesPayload(form) {
  return {
    source_of_lead: clean(form.source_of_lead),
    city: clean(form.city),
    state: clean(form.state),
    visit_purpose: clean(form.visit_purpose),
    lead_name: clean(form.lead_name),
    contact_number: clean(form.contact_number),
    email_id: clean(form.email_id) || null,
    current_gps_provider: clean(form.current_gps_provider),
    fleet_size: parseInt(clean(form.fleet_size), 10),
    lead_stage: clean(form.lead_stage),
    demo_given: form.demo_given === 'yes',
    product_interested: [...new Set(form.product_interested.map(clean).filter(Boolean))],
    expected_revenue: Number(moneyText(form.expected_revenue)),
    expected_amount_receiving_date: clean(form.expected_amount_receiving_date),
  }
}

export async function createFieldSalesEntry(form) {
  const res = await fetch(`${SB}/field_sales_entries`, { method: 'POST', headers: SB_HDRS_REPR(), body: JSON.stringify(buildFieldSalesPayload(form)) })
  if (!res.ok) throw new Error(await httpError(res, 'Could not save the entry.'))
  const [saved] = await res.json()
  clearColumnValuesCache() // the filter value lists are cached; this entry may add a value
  return saved
}

// ── The list ────────────────────────────────────────────────────────────────
export const FIELD_SALES_PAGE_SIZE = 50

// The table's column filters (see lib/tableFilters.js). Date is the created_at TIMESTAMP, compared on India day
// boundaries. The FMS column is derived (sent_to_fms_at null / not null), so it is the extra `fms` array.
// Products, Fleet and Revenue have no filter (tableFilters has no array-overlap / numeric-range kinds yet). Rep, Lead,
// Contact, City and State are free text but filter like Excel: a checklist of the values the column actually holds
// (fetchFieldSalesColumnValues), not "contains".
export const FIELD_SALES_FILTER_SPEC = {
  date: { column: 'created_at', kind: 'dateRange', timestamp: true },
  rep: { column: 'entered_by_name', kind: 'checklist' },
  lead: { column: 'lead_name', kind: 'checklist' },
  contact: { column: 'contact_number', kind: 'checklist' },
  city: { column: 'city', kind: 'checklist' },
  state: { column: 'state', kind: 'checklist' },
  source: { column: 'source_of_lead', kind: 'checklist' },
  purpose: { column: 'visit_purpose', kind: 'checklist' },
  stage: { column: 'lead_stage', kind: 'checklist' },
  demo: { column: 'demo_given', kind: 'checklist' },
}
export const emptyFieldSalesFilters = () => ({ ...emptyFilters(FIELD_SALES_FILTER_SPEC), fms: [] })

// ── Sorting ──
// EVERY column sorts, for every user (an ORDER BY on rows the user may already see). key → database column, and the kind
// the sort menu words it by. Nothing sorted = newest first; the default order ends in a unique id so paging by
// limit/offset is stable. Lead stage sorts alphabetically (Cold, Hot, Lost, Warm, Won), products by their array.
export const FIELD_SALES_DEFAULT_ORDER = 'created_at.desc,id.desc'
export const FIELD_SALES_SORT_COLUMNS = {
  date: 'created_at',
  rep: 'entered_by_name',
  lead: 'lead_name',
  contact: 'contact_number',
  city: 'city',
  state: 'state',
  source: 'source_of_lead',
  purpose: 'visit_purpose',
  stage: 'lead_stage',
  demo: 'demo_given',
  products: 'product_interested',
  fleet: 'fleet_size',
  revenue: 'expected_revenue',
  expected: 'expected_amount_receiving_date',
  fms: 'sent_to_fms_at',
}
export const FIELD_SALES_SORT_KINDS = { date: 'date', rep: 'text', lead: 'text', contact: 'text', city: 'text', state: 'text', source: 'text', purpose: 'text', stage: 'text', demo: 'boolean', products: 'text', fleet: 'number', revenue: 'number', expected: 'date', fms: 'date' }
// The filter keys whose checklist is built from the column's own values.
const FIELD_SALES_VALUE_KEYS = ['rep', 'lead', 'contact', 'city', 'state']

function fmsParams(fms) {
  const want = new Set(fms || [])
  if (want.size !== 1) return []
  return [want.has('sent') ? 'sent_to_fms_at=not.is.null' : 'sent_to_fms_at=is.null']
}

// The filter state as URL params. `omit` leaves one column's own filter out — a column's value list shows what still
// occurs GIVEN THE OTHER columns' filters (Excel's cascading), not the column's own.
function fieldSalesFilterParams(filters, omit) {
  const spec = omit ? Object.fromEntries(Object.entries(FIELD_SALES_FILTER_SPEC).filter(([k]) => k !== omit)) : FIELD_SALES_FILTER_SPEC
  const params = [...buildFilterParams(spec, filters), ...fmsParams(filters?.fms)]
  assertFilterBudget(params)
  return params
}

// Filters only ever apply for a view_all viewer — an own-scope viewer's list is never client-filtered, RLS alone
// already returns exactly their own rows. Server-side paging (limit/offset + exact count): PostgREST silently
// caps a plain response at this project's 1000-row max.
export async function fetchFieldSalesEntries({ filters = {}, sort = null, page = 0, pageSize = FIELD_SALES_PAGE_SIZE } = {}) {
  const q = ['select=*', buildOrderParam(FIELD_SALES_SORT_COLUMNS, sort, FIELD_SALES_DEFAULT_ORDER), `limit=${pageSize}`, `offset=${page * pageSize}`, ...fieldSalesFilterParams(filters)]
  const res = await fetch(`${SB}/field_sales_entries?${q.join('&')}`, { headers: { ...SB_HDRS(), Prefer: 'count=exact' } })
  if (!res.ok) throw new Error(await httpError(res, 'Could not load the entries.'))
  const total = parseInt((res.headers.get('content-range') || '').split('/')[1], 10)
  const rows = await res.json()
  return { rows, total: Number.isFinite(total) ? total : rows.length }
}

// The distinct values of Rep / Lead / Contact / City / State for that column's filter checklist, given the other
// columns' current filters. → { values, hasBlank, truncated } (see lib/columnValues.js). Only these five keys: the column
// name comes from the spec, never from the caller.
export function fetchFieldSalesColumnValues(key, filters = {}) {
  if (!FIELD_SALES_VALUE_KEYS.includes(key)) return Promise.reject(new Error(`No value list for "${key}".`))
  let params
  try {
    params = fieldSalesFilterParams(filters, key)
  } catch (e) {
    return Promise.reject(e)
  }
  return fetchColumnValues({ table: 'field_sales_entries', column: FIELD_SALES_FILTER_SPEC[key].column, params })
}

// ── Pick-lists (enquiry_dropdown_options, four types) ───────────────────────
// Resolves to { field_sales_source: [{id, value, is_active}], visit_purpose: [...], … }, each in the seeded
// sort_order. RLS decides what is visible: a plain user gets ACTIVE rows only, a manager (manage_dropdowns /
// view_all) also gets retired ones — so a form must always go through activeFieldSalesOptions(), never the raw list.
// Cached for the session; cleared by every add / retire / restore.
let _optionsCache = null
export const clearFieldSalesOptionsCache = () => {
  _optionsCache = null
}
export async function fetchFieldSalesOptions({ force = false } = {}) {
  if (_optionsCache && !force) return _optionsCache
  const types = Object.values(FS_LIST).join(',')
  const res = await fetch(`${SB}/enquiry_dropdown_options?select=id,dropdown_type,value,is_active,sort_order&dropdown_type=in.(${types})&order=sort_order.asc.nullslast,value.asc&limit=1000`, { headers: SB_HDRS() })
  if (!res.ok) throw new Error(await httpError(res, 'Could not load the pick-lists.'))
  const grouped = Object.fromEntries(Object.values(FS_LIST).map((t) => [t, []]))
  for (const r of await res.json()) grouped[r.dropdown_type]?.push({ id: r.id, value: r.value, is_active: r.is_active })
  _optionsCache = grouped
  return grouped
}
export const activeFieldSalesOptions = (list) => (list || []).filter((o) => o.is_active).map((o) => ({ value: o.value, label: o.value }))

// A new value is appended after the existing ones (the DB assigns its sort_order). 409 = the value exists —
// possibly RETIRED, which is restored with Restore, not re-added.
export async function addFieldSalesOption(type, value) {
  if (!Object.values(FS_LIST).includes(type)) throw new Error(`Unknown pick-list "${type}".`)
  const v = clean(value).replace(/\s+/g, ' ')
  if (!v) throw new Error('Enter a value to add.')
  const res = await fetch(`${SB}/enquiry_dropdown_options`, { method: 'POST', headers: SB_HDRS_REPR(), body: JSON.stringify({ dropdown_type: type, value: v }) })
  if (res.status === 409) throw new Error(`"${v}" is already in this list (it may be retired — use Restore).`)
  if (!res.ok) throw new Error(await httpError(res, 'Could not add the value.'))
  const [saved] = await res.json()
  clearFieldSalesOptionsCache()
  return { id: saved.id, value: saved.value, is_active: saved.is_active }
}

// Remove / Restore — a soft delete (is_active only, the one client-updatable column). RLS turns a forbidden
// UPDATE into zero rows rather than an error, so return=representation is used to tell "done" from "nothing happened".
export async function setFieldSalesOptionActive(id, active) {
  const res = await fetch(`${SB}/enquiry_dropdown_options?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: SB_HDRS_REPR(), body: JSON.stringify({ is_active: !!active }) })
  if (!res.ok) throw new Error(await httpError(res, active ? 'Could not restore the value.' : 'Could not remove the value.'))
  const rows = await res.json()
  if (!rows.length) throw new Error('That value could not be changed — you may not have permission, or it no longer exists.')
  clearFieldSalesOptionsCache()
  return { id: rows[0].id, value: rows[0].value, is_active: rows[0].is_active }
}

// ── Delete (soft) ───────────────────────────────────────────────────────────
// One RPC, one transaction (field_sales_form_delete): marks the caller's own entries (anyone's with field_sales_form_view_all) as
// deleted — they disappear for everyone, and from Sales Rep MeCa (past periods' meeting counts change too); an administrator can
// restore one from the database. An entry already PUSHED to FMS is deleted only for a caller who also holds enquiry_delete_sent,
// and its enquiry (with its Sales FMS pipeline) is deleted with it. Everything else — not the caller's, already deleted, pushed
// without that permission, unknown ids — is skipped, not an error.
// Resolves to { requested, deleted, skipped, deleted_sent (pushed entries among the deleted), enquiries_deleted }.
export async function deleteFieldSalesEntries(ids) {
  const res = await fetch(`${SB}/rpc/delete_field_sales_entries`, { method: 'POST', headers: SB_HDRS_JSON(), body: JSON.stringify({ p_ids: ids }) })
  if (!res.ok) throw new Error(await httpError(res, 'Could not delete the entries.'))
  clearColumnValuesCache() // a deleted row may have been the only one holding a filter value
  return res.json()
}
