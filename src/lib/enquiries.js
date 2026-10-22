// Enquiry Capture — Phase 1 of the lead-lifecycle system (Enquiry Capture → Sales FMS → Sales Rep
// MeCa → MD MeCa/GP → SCOT). A new module, not a port: there is no old-portal equivalent.
// Tables (Supabase, schema applied manually — no migration files exist in this repo):
//   enquiries (id, enquiry_date, name, company_name, phone, email, requirement, source,
//     sales_person_accountable, client_type ['new'|'existing'], status [open|interested|rnr|
//     future_lead|lost|won], entry_channel [portal_form|field_sales|excel_upload|field_sales_form|scot_call], entered_by
//     [auth UID, DB default auth.uid()], import_batch_id, import_flag ['duplicate_phone'],
//     sent_to_fms_at, created_at, updated_at, deleted_at / deleted_by [SOFT delete — see deleteEnquiries]; requirement is a
//     text[] of products),
//   enquiry_imports (id, file_name, uploaded_by, uploaded_at, row_count, duplicate_count,
//     rejected_count, status [processing|completed|failed]),
//   lead_pipeline_stages (enquiry_id FK, stage, planned_date, actual_date — written ONLY by the
//     send_enquiries_to_fms() RPC; no UI reads it in Phase 1),
//   enquiry_dropdown_options (id, dropdown_type ['source'|'sales_person'|…future types], value,
//     is_active, created_by, created_at — the managed value lists behind the form's Source and
//     Sales Person dropdowns). enquiries.source / .sales_person_accountable stay plain TEXT (no FK):
//     a retired option is soft-deleted (is_active=false), so historical enquiries keep displaying
//     their value and it simply stops being offered for new entries. Status IS a managed list too
//     (dropdown_type 'status'): six PERMANENT built-ins the database refuses to retire, plus any a manager adds.
//     Requirement draws on the product catalog shared with the Field Sales Form ('product_interested').
// Server-enforced, so never duplicated here: entry_channel is set by a BEFORE INSERT trigger
// from the enquiry_field_sales permission (the form never sends it; Excel rows send
// 'excel_upload'); entered_by defaults to auth.uid(); a row locks once sent_to_fms_at is set;
// entered_by/entry_channel/import_batch_id/import_flag/sent_to_fms_at are not client-updatable.
// Access: one per-person tier decides what a user may do (see lib/enquiryPermissions.js and sql/step20): Sales Person sees the Sheet read-only (own entered /
// assigned leads); Admin does everything — create, edit, delete (also sent rows), send to FMS, Bulk Upload, manage the lists. The database enforces it.
import { SUPABASE_URL, SB_HDRS, SB_HDRS_JSON, SB_HDRS_REPR, SB_HDRS_MIN } from './supabaseClient'
import { assertFilterBudget, buildFilterParams, buildOrderParam, emptyFilters } from './tableFilters'
import { clearColumnValuesCache, fetchColumnValues } from './columnValues'

// ── Vocabulary ──────────────────────────────────────────────────────────────
// 'won' exists in the DB enum but is set by a later phase — never offered on the form or in Excel.
export const FORM_STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'interested', label: 'Interested' },
  { value: 'rnr', label: 'RNR' },
  { value: 'future_lead', label: 'Future Lead' },
  { value: 'lost', label: 'Lost' },
]
export const STATUS_LABELS = { ...Object.fromEntries(FORM_STATUS_OPTIONS.map((o) => [o.value, o.label])), won: 'Won' }
// StatusBadge tones, shared by the list table and the detail modal so the two can't drift apart.
export const ENQUIRY_STATUS_TONE = { open: 'neutral', interested: 'primary', rnr: 'warning', future_lead: 'purple', lost: 'danger', won: 'success' }
// Status is a managed list (dropdown_type 'status') with SIX PERMANENT built-ins — the database refuses to retire, rename
// or delete them, because the Field Sales push, the filters and the later phases (MeCa, SCOT) key off these exact stored
// values. A status a manager adds later is just a tag: its label is the value as typed, its tone neutral, no automation.
export const BUILTIN_STATUS_VALUES = ['open', 'interested', 'rnr', 'future_lead', 'lost', 'won']
export const isBuiltinStatus = (v) => BUILTIN_STATUS_VALUES.includes(v)
export const statusLabel = (v) => STATUS_LABELS[v] || v || ''
export const statusTone = (v) => ENQUIRY_STATUS_TONE[v] || 'neutral'
export const CLIENT_TYPE_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'existing', label: 'Existing' },
]
// field_sales = a portal-form entry by someone with the enquiry_field_sales flag; field_sales_form = pushed
// from the separate Field Sales Form module (set only by send_field_sales_to_fms, never by the API).
export const CHANNEL_LABELS = { portal_form: 'Portal Form', field_sales: 'Field Sales', excel_upload: 'Excel Upload', field_sales_form: 'Field Sales Form', scot_call: 'SCOT Calls' }
export const FMS_FILTER_OPTIONS = [
  { value: 'unsent', label: 'Not sent' },
  { value: 'sent', label: 'Sent' },
]

// ── Access control ──────────────────────────────────────────────────────────
// The permission helpers (canAccessEnquiry, canCreateEnquiry, canViewAllEnquiries,
// canSendEnquiriesToFms, canManageEnquiryDropdowns) live in ./enquiryPermissions.js — a separate,
// dependency-free file so the always-loaded nav code can use them without pulling this whole module
// into the main bundle.

// ── Small helpers ───────────────────────────────────────────────────────────
const SB = SUPABASE_URL + '/rest/v1'
const clean = (v) => String(v ?? '').trim()
const orNull = (v) => clean(v) || null

// Requirement is a LIST of products (text[]; NULL = none). Accepts an array, or — for a legacy / typed single value — a
// string. Trims, drops blanks, removes case-insensitive duplicates (first spelling wins). Elements are never split or
// reworded: a row's own free-text element survives untouched.
export const MAX_PRODUCT_LENGTH = 100
export function normalizeRequirement(v) {
  const list = Array.isArray(v) ? v : v == null || v === '' ? [] : [v]
  const seen = new Set()
  const out = []
  for (const raw of list) {
    const s = clean(raw)
    const k = s.toLowerCase()
    if (!s || seen.has(k)) continue
    seen.add(k)
    out.push(s)
  }
  return out.length ? out : null
}
// How a requirement reads in one line (a cell, a tooltip, the preview).
export const requirementText = (v) => (Array.isArray(v) ? v.join(', ') : v || '')

// Local (not UTC) YYYY-MM-DD, so an enquiry logged late evening IST isn't dated tomorrow/yesterday.
export const todayISO = () => new Date().toLocaleDateString('en-CA')

export function formatEnquiryDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return isNaN(d) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Phones are stored as typed (trimmed). For duplicate detection only, two numbers are "the same"
// when their last 10 digits match — so "+91 98765 43210", "09876543210" and "9876543210" collide.
// A phone with no digits at all has no key (null) and never counts as a duplicate.
export function phoneKey(raw) {
  const digits = clean(raw).replace(/\D/g, '')
  if (!digits) return null
  return digits.length > 10 ? digits.slice(-10) : digits
}

async function httpError(res, fallback) {
  const text = await res.text().catch(() => '')
  let msg = text
  try {
    const j = JSON.parse(text)
    msg = j.message || j.hint || text
  } catch {
    /* not JSON — use the raw text */
  }
  if (res.status === 401 || res.status === 403 || /row-level security|42501|not authorised/i.test(msg || '')) {
    return "You don't have permission to do that."
  }
  return msg || fallback || 'HTTP ' + res.status
}

// ── Manual entry ────────────────────────────────────────────────────────────
export const emptyEnquiryForm = () => ({
  enquiry_date: todayISO(),
  name: '',
  company_name: '',
  phone: '',
  email: '',
  requirement: [],
  source: '',
  sales_person_accountable: '',
  client_type: '',
  status: 'open',
})

// Only Name and Phone are mandatory (matches the Excel rule). Returns { field: message }.
export function validateEnquiryForm(form) {
  const errors = {}
  if (!clean(form.name)) errors.name = 'Name is required.'
  if (!clean(form.phone)) errors.phone = 'Phone is required.'
  if (!form.enquiry_date) errors.enquiry_date = 'Date is required.'
  return errors
}

// entered_by and entry_channel are deliberately absent — both are set server-side.
export function buildEnquiryPayload(form) {
  return {
    enquiry_date: form.enquiry_date || todayISO(),
    name: clean(form.name),
    company_name: orNull(form.company_name),
    phone: clean(form.phone),
    email: orNull(form.email),
    requirement: normalizeRequirement(form.requirement),
    source: orNull(form.source),
    sales_person_accountable: orNull(form.sales_person_accountable),
    client_type: orNull(form.client_type),
    status: form.status || 'open',
  }
}

export async function createEnquiry(form) {
  const res = await fetch(`${SB}/enquiries`, { method: 'POST', headers: SB_HDRS_REPR(), body: JSON.stringify(buildEnquiryPayload(form)) })
  if (!res.ok) throw new Error(await httpError(res, 'Could not save the enquiry.'))
  const [saved] = await res.json()
  clearColumnValuesCache() // the filter value lists are cached; this row may add a value
  return saved
}

// ── List ────────────────────────────────────────────────────────────────────
export const ENQUIRY_PAGE_SIZE = 50

// The sheet's column filters (see lib/tableFilters.js for the value model). Keys are the filter-state keys;
// the FMS column is derived (sent_to_fms_at is null / not null), not a column value, so it is the extra
// `fms` array handled below rather than a spec entry. Name, Company, Phone and Requirement are free text, but they
// filter like Excel: a checklist of the values the column actually holds (fetchEnquiryColumnValues), not "contains".
export const ENQUIRY_FILTER_SPEC = {
  date: { column: 'enquiry_date', kind: 'dateRange' },
  name: { column: 'name', kind: 'checklist' },
  company: { column: 'company_name', kind: 'checklist' },
  phone: { column: 'phone', kind: 'checklist' },
  requirement: { column: 'requirement', kind: 'checklist', array: true }, // a text[] of products: matches rows holding ANY ticked one
  source: { column: 'source', kind: 'checklist' },
  salesPerson: { column: 'sales_person_accountable', kind: 'checklist' },
  clientType: { column: 'client_type', kind: 'checklist' },
  status: { column: 'status', kind: 'checklist' },
  channel: { column: 'entry_channel', kind: 'checklist' },
}
export const emptyEnquiryFilters = () => ({ ...emptyFilters(ENQUIRY_FILTER_SPEC), fms: [] })

// ── Sorting ──
// EVERY column sorts, for every user (it is just an ORDER BY on the rows the user may already see). key → database
// column, and the kind the sort menu words it by ("A to Z", "oldest to newest"). Nothing sorted = the default order,
// which ends in a unique id so paging by limit/offset is stable; a sort puts its column first, blanks last.
export const ENQUIRY_DEFAULT_ORDER = 'enquiry_date.desc,created_at.desc,id.desc'
export const ENQUIRY_SORT_COLUMNS = {
  date: 'enquiry_date',
  name: 'name',
  company: 'company_name',
  phone: 'phone',
  email: 'email',
  requirement: 'requirement',
  source: 'source',
  salesPerson: 'sales_person_accountable',
  clientType: 'client_type',
  status: 'status',
  channel: 'entry_channel',
  fms: 'sent_to_fms_at',
}
export const ENQUIRY_SORT_KINDS = { date: 'date', name: 'text', company: 'text', phone: 'text', email: 'text', requirement: 'text', source: 'text', salesPerson: 'text', clientType: 'text', status: 'text', channel: 'text', fms: 'date' }
// The filter keys whose checklist is built from the column's own values.
const ENQUIRY_VALUE_KEYS = ['name', 'company', 'phone', 'requirement']

// ['sent'] / ['unsent'] filter on sent_to_fms_at; both or neither is "no filter".
function fmsParams(fms) {
  const want = new Set(fms || [])
  if (want.size !== 1) return []
  return [want.has('sent') ? 'sent_to_fms_at=not.is.null' : 'sent_to_fms_at=is.null']
}

// The filter state as URL params. `omit` leaves one column's own filter out — the value list of a column shows what
// still occurs GIVEN THE OTHER columns' filters (Excel's cascading), not the column's own.
function enquiryFilterParams(filters, omit) {
  const spec = omit ? Object.fromEntries(Object.entries(ENQUIRY_FILTER_SPEC).filter(([k]) => k !== omit)) : ENQUIRY_FILTER_SPEC
  const params = [...buildFilterParams(spec, filters), ...fmsParams(filters?.fms)]
  assertFilterBudget(params)
  return params
}

// Filters only ever apply for an admin (view_all) viewer — an own-scope viewer's list is never
// client-filtered, RLS alone already returns exactly their own rows (same convention as Field
// Service). Server-side paging via limit/offset + an exact count: PostgREST silently caps a
// plain response at this project's 1000-row max, so a client-side "fetch all" would truncate.
export async function fetchEnquiries({ filters = {}, sort = null, page = 0, pageSize = ENQUIRY_PAGE_SIZE } = {}) {
  const q = ['select=*', buildOrderParam(ENQUIRY_SORT_COLUMNS, sort, ENQUIRY_DEFAULT_ORDER), `limit=${pageSize}`, `offset=${page * pageSize}`, ...enquiryFilterParams(filters)]
  const res = await fetch(`${SB}/enquiries?${q.join('&')}`, { headers: { ...SB_HDRS(), Prefer: 'count=exact' } })
  if (!res.ok) throw new Error(await httpError(res, 'Could not load enquiries.'))
  const total = parseInt((res.headers.get('content-range') || '').split('/')[1], 10)
  const rows = await res.json()
  return { rows, total: Number.isFinite(total) ? total : rows.length }
}

// The distinct values of Name / Company / Phone / Requirement for that column's filter checklist, given the other
// columns' current filters. → { values, hasBlank, truncated } (see lib/columnValues.js). Only these four keys: the column
// name comes from the spec, never from the caller.
export function fetchEnquiryColumnValues(key, filters = {}) {
  if (!ENQUIRY_VALUE_KEYS.includes(key)) return Promise.reject(new Error(`No value list for "${key}".`))
  let params
  try {
    params = enquiryFilterParams(filters, key)
  } catch (e) {
    return Promise.reject(e)
  }
  const spec = ENQUIRY_FILTER_SPEC[key]
  return fetchColumnValues({ table: 'enquiries', column: spec.column, params, array: !!spec.array, maxLength: spec.array ? MAX_PRODUCT_LENGTH : 0 })
}

// ── Edit in place (the sheet's inline cells) ────────────────────────────────
// The only columns a client may UPDATE (column grant) — anything else in a patch is a programming error.
export const EDITABLE_ENQUIRY_FIELDS = ['enquiry_date', 'name', 'company_name', 'phone', 'email', 'requirement', 'source', 'sales_person_accountable', 'client_type', 'status']
const REQUIRED_FIELD_LABELS = { enquiry_date: 'Date', name: 'Name', phone: 'Phone' } // no DB check for these — validated here
const CLIENT_TYPES = CLIENT_TYPE_OPTIONS.map((o) => o.value)

// Normalises a { field: value } patch the way buildEnquiryPayload does for a whole form: trims, blank
// optional text → null, required fields must not be blank. Throws a user-readable Error otherwise.
export function buildEnquiryPatch(patch) {
  const out = {}
  for (const [field, raw] of Object.entries(patch || {})) {
    if (!EDITABLE_ENQUIRY_FIELDS.includes(field)) throw new Error(`"${field}" cannot be edited.`)
    if (field === 'requirement') {
      out.requirement = normalizeRequirement(raw)
      continue
    }
    const v = clean(raw)
    if (REQUIRED_FIELD_LABELS[field]) {
      if (!v) throw new Error(`${REQUIRED_FIELD_LABELS[field]} is required.`)
      out[field] = v
    } else if (field === 'status') {
      if (!v) throw new Error('Choose a valid status.') // which statuses exist is decided by the managed list; the database validates
      out[field] = v
    } else if (field === 'client_type') {
      if (v && !CLIENT_TYPES.includes(v)) throw new Error('Choose New or Existing.')
      out[field] = v || null
    } else if (field === 'source' || field === 'sales_person_accountable') {
      out[field] = v.replace(/\s+/g, ' ') || null
    } else {
      out[field] = v || null
    }
  }
  if (!Object.keys(out).length) throw new Error('Nothing to save.')
  return out
}

// Why an optimistic-lock save changed nothing. `code`: 'conflict' (someone else saved first — reload),
// 'locked' (sent to FMS meanwhile), 'gone' (deleted / no longer visible), 'denied' (no permission).
export class EnquiryUpdateError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

// Saves a patch ONLY if the row is still the version the caller loaded: the PATCH carries
// updated_at=eq.<loaded>, which the BEFORE UPDATE trigger bumps on every write. The value is passed
// through verbatim (never parsed into a Date — that would lose the microseconds and never match).
// RLS and the lock (sent rows) also make an UPDATE match zero rows rather than fail, so zero rows is
// diagnosed with one follow-up read. Resolves to the saved row, including its NEW updated_at — the
// caller must use that for the next edit of the same row.
export async function updateEnquiry(id, loadedUpdatedAt, patch) {
  const body = buildEnquiryPatch(patch)
  if (!loadedUpdatedAt) throw new EnquiryUpdateError('conflict', 'This row has no version stamp — reload and try again.')
  const rowUrl = `${SB}/enquiries?id=eq.${encodeURIComponent(id)}`
  const res = await fetch(`${rowUrl}&updated_at=eq.${encodeURIComponent(loadedUpdatedAt)}`, { method: 'PATCH', headers: SB_HDRS_REPR(), body: JSON.stringify(body) })
  if (!res.ok) throw new Error(await httpError(res, 'Could not save the change.'))
  const rows = await res.json()
  if (rows.length) {
    clearColumnValuesCache() // an edited cell can add or remove a value from a filter list
    return rows[0]
  }

  const probe = await fetch(`${rowUrl}&select=id,updated_at,sent_to_fms_at`, { headers: SB_HDRS() })
  if (!probe.ok) throw new Error(await httpError(probe, 'Could not save the change.'))
  const [now] = await probe.json()
  if (!now) throw new EnquiryUpdateError('gone', 'This enquiry no longer exists, or you no longer have access to it.')
  if (now.sent_to_fms_at) throw new EnquiryUpdateError('locked', 'This enquiry was sent to FMS in the meantime and is now locked.')
  if (now.updated_at === loadedUpdatedAt) throw new EnquiryUpdateError('denied', "You don't have permission to edit this enquiry.")
  throw new EnquiryUpdateError('conflict', 'Someone else changed this enquiry — reload to see their changes.')
}

// ── Managed dropdown values (enquiry_dropdown_options) ─────────────────────
// Source and Sales Person are managed lists, not free text and not derived from the enquiries
// themselves. What a caller can SEE is decided by RLS: a plain enquiry_view/enquiry_create user
// gets active rows only; enquiry_view_all / enquiry_manage_dropdowns holders also get retired
// rows — so an admin can still filter the list by a since-retired value. Form dropdowns must
// therefore always go through activeOptionValues(), never the raw list.
// Status is a managed list too (six permanent built-ins + added ones); Requirement draws on the SAME product catalog the Field Sales Form
// uses ('product_interested' — one catalog, edited from either module by whoever may manage its lists).
export const DROPDOWN_TYPES = { SOURCE: 'source', SALES_PERSON: 'sales_person', STATUS: 'status', PRODUCT: 'product_interested' }

// What a STATUS means for Sales FMS (enquiry_dropdown_options.fms_rule, set in the status Manage popover by whoever may manage the lists):
//   manual  nothing automatic — the Send button still works (every status unless changed)
//   auto    an UNSENT enquiry is sent to FMS at once and locked when its status is CHANGED to this one, or when a row is CREATED BY HAND
//           with it (Open, Interested, RNR and Future Lead are auto); an Excel import never auto-sends on insert (only a later status change does)
//   never   the enquiry can never be sent: Send skips it, auto-send ignores it (Junk is seeded as never)
export const FMS_RULE_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'auto', label: 'Auto-send' },
  { value: 'never', label: 'Never send' },
]

let _dropdownCache = null
export const clearDropdownCache = () => {
  _dropdownCache = null
}

// Resolves to { source: [{id, value, is_active, sort_order, fms_rule}], sales_person: [...], status: [...], product_interested: [...] }.
// fms_rule ('manual' | 'auto' | 'never') is present on every row once the database has the column; before that it is absent and every status acts as manual.
// A list that carries sort_order (status, products) keeps THAT order — new values go to the end; the others sort A→Z.
// Cached for the session; cleared by every add. (A few dozen values per list is expected — one
// 1000-row request is far more than enough, so there is deliberately no paging loop here.)
export async function fetchDropdownOptions({ force = false } = {}) {
  if (_dropdownCache && !force) return _dropdownCache
  const types = Object.values(DROPDOWN_TYPES).join(',')
  const ask = (cols) => fetch(`${SB}/enquiry_dropdown_options?select=${cols}&dropdown_type=in.(${types})&limit=1000`, { headers: SB_HDRS() })
  let res = await ask('id,dropdown_type,value,is_active,sort_order,fms_rule')
  // Before the database has the fms_rule column the request fails (PostgREST answers 400): try once more without it, so the lists still load —
  // every status then acts as "manual". If that fails too, the error reported is the second one.
  if (!res.ok) res = await ask('id,dropdown_type,value,is_active,sort_order')
  if (!res.ok) throw new Error(await httpError(res, 'Could not load dropdown options.'))
  const rows = await res.json()
  const grouped = Object.fromEntries(Object.values(DROPDOWN_TYPES).map((t) => [t, []]))
  rows.forEach((r) => grouped[r.dropdown_type]?.push({ id: r.id, value: r.value, is_active: r.is_active, sort_order: r.sort_order, ...(r.fms_rule ? { fms_rule: r.fms_rule } : {}) }))
  const byOrder = (a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity) || a.value.localeCompare(b.value)
  Object.values(grouped).forEach((list) => list.sort(byOrder))
  _dropdownCache = grouped
  return grouped
}

export const activeOptionValues = (list) => (list || []).filter((o) => o.is_active).map((o) => o.value)

// The Status choices for a form or a cell: ACTIVE values in list order (the six built-ins first, then any added), without
// 'won' (set only by the Field Sales push / a later phase — never typed). While the list has not loaded the built-ins
// stand in, so the Status cell never goes read-only just because the lists are slow or down.
export function statusOptions(dropdowns) {
  const list = dropdowns?.[DROPDOWN_TYPES.STATUS]
  const values = list?.length ? list.filter((o) => o.is_active).map((o) => o.value) : FORM_STATUS_OPTIONS.map((o) => o.value)
  return values.filter((v) => v !== 'won').map((v) => ({ value: v, label: statusLabel(v) }))
}
// The Status filter's checklist: every status in the list (retired ones flagged, so old rows can still be found), 'won' included.
export function statusFilterOptions(dropdowns) {
  const list = dropdowns?.[DROPDOWN_TYPES.STATUS]
  if (!list?.length) return Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))
  return list.map((o) => ({ value: o.value, label: statusLabel(o.value), hint: o.is_active ? undefined : 'retired' }))
}
// The FMS rule of a status. While the lists have not loaded, the seeded rule stands in (Interested = auto), so the confirmation before an
// auto-sending change is never skipped just because the lists are slow or down.
export function statusRule(dropdowns, value) {
  const list = dropdowns?.[DROPDOWN_TYPES.STATUS]
  if (!list?.length) return value === 'interested' ? 'auto' : 'manual'
  return list.find((o) => o.value === value)?.fms_rule || 'manual'
}
// The display names of the statuses that are never sent ("Junk") — for the Send result message.
export const neverSendStatusLabels = (dropdowns) => (dropdowns?.[DROPDOWN_TYPES.STATUS] || []).filter((o) => o.fms_rule === 'never').map((o) => statusLabel(o.value))
// The product checklist for the Requirement cells: ACTIVE catalog values in catalog order.
export const productOptions = (dropdowns) => activeOptionValues(dropdowns?.[DROPDOWN_TYPES.PRODUCT]).map((v) => ({ value: v, label: v }))

// Inline "+ Add new". Collapses inner whitespace; the DB also enforces case-insensitive
// uniqueness, so "web" can't be added next to "Web". A 409 means the value already exists —
// possibly as a RETIRED option, which only an admin can reactivate (no client UPDATE in Phase 1).
export async function addDropdownOption(type, value) {
  const v = clean(value).replace(/\s+/g, ' ')
  if (!v) throw new Error('Enter a value to add.')
  const res = await fetch(`${SB}/enquiry_dropdown_options`, { method: 'POST', headers: SB_HDRS_REPR(), body: JSON.stringify({ dropdown_type: type, value: v }) })
  if (res.status === 409) throw new Error(`"${v}" is already in this list (it may have been retired — ask an admin to reactivate it).`)
  if (!res.ok) throw new Error(await httpError(res, 'Could not add the value.'))
  const [saved] = await res.json()
  clearDropdownCache()
  return { id: saved.id, value: saved.value, is_active: saved.is_active }
}

// Bulk add, for Excel values the admin chose to add to the lists. ignore-duplicates makes a
// concurrent add of the same value harmless.
// KNOWN EDGE CASE — case-only mismatch fails the WHOLE batch: on_conflict=dropdown_type,value
// targets the case-SENSITIVE unique constraint, but the table also has a case-INSENSITIVE unique
// index (dropdown_type, lower(value)). Adding "web" when "Web" exists is not a conflict on the
// former, so ignore-duplicates doesn't absorb it, and the latter rejects it with a 409/23505 —
// failing every row in this one POST. Normally unreachable: analyseEnquiryGrid() rewrites known
// values to the list's own spelling and collapses new-value variants within a file before this is
// called, and uploaders are told to match existing casing. If an import's "add new values" step
// ever fails with a duplicate-key error, look here first (a value differing only by case from an
// existing — possibly RETIRED — option). Deliberately not handled in code.
export async function addDropdownOptions(items) {
  if (!items.length) return
  const body = items.map((i) => ({ dropdown_type: i.type, value: clean(i.value).replace(/\s+/g, ' ') }))
  const res = await fetch(`${SB}/enquiry_dropdown_options?on_conflict=dropdown_type,value`, {
    method: 'POST',
    headers: { ...SB_HDRS_MIN(), Prefer: 'return=minimal,resolution=ignore-duplicates' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await httpError(res, 'Could not add the new values.'))
  clearDropdownCache()
}

// Remove / Restore from the manage-list popover: a soft delete — flips is_active, never deletes the row, so
// historical enquiries keep showing the value. is_active is the only column a client may update (column
// grant + RLS update policy for enquiry_manage_dropdowns / the type's manage permission). RLS silently
// filters a forbidden UPDATE to zero rows instead of failing, so return=representation is used to tell
// "done" from "nothing happened".
export async function setDropdownOptionActive(id, active) {
  const res = await fetch(`${SB}/enquiry_dropdown_options?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: SB_HDRS_REPR(), body: JSON.stringify({ is_active: !!active }) })
  if (!res.ok) throw new Error(await httpError(res, active ? 'Could not restore the value.' : 'Could not remove the value.'))
  const rows = await res.json()
  if (!rows.length) throw new Error("That value could not be changed — you may not have permission, or it no longer exists.")
  clearDropdownCache()
  return { id: rows[0].id, value: rows[0].value, is_active: rows[0].is_active }
}

// Changes a status's FMS rule (manual | auto | never) — the same permission as retiring / restoring it; the built-ins may carry a rule
// too. RLS silently filters a forbidden UPDATE to zero rows, so return=representation tells "done" from "nothing happened".
export async function setStatusFmsRule(id, rule) {
  if (!FMS_RULE_OPTIONS.some((o) => o.value === rule)) throw new Error('Choose Manual, Auto-send or Never send.')
  const res = await fetch(`${SB}/enquiry_dropdown_options?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: SB_HDRS_REPR(), body: JSON.stringify({ fms_rule: rule }) })
  if (!res.ok) throw new Error(await httpError(res, 'Could not change the rule.'))
  const rows = await res.json()
  if (!rows.length) throw new Error('That rule could not be changed — you may not have permission, or the status no longer exists.')
  clearDropdownCache()
  return { id: rows[0].id, value: rows[0].value, fms_rule: rows[0].fms_rule }
}

// One enquiry, freshly read (null when it is gone or hidden). Used after a status change that the database may have turned into a send:
// the row a client gets back from its own UPDATE is the state BEFORE the auto-send trigger ran.
export async function fetchEnquiry(id) {
  const res = await fetch(`${SB}/enquiries?id=eq.${encodeURIComponent(id)}&select=*`, { headers: SB_HDRS() })
  if (!res.ok) throw new Error(await httpError(res, 'Could not re-read the enquiry.'))
  const rows = await res.json()
  return rows[0] || null
}

// ── Send to FMS ─────────────────────────────────────────────────────────────
// One RPC, one transaction: stamps sent_to_fms_at on unsent rows the caller can see and creates
// their 5 lead_pipeline_stages rows. Already-sent rows are skipped, not errors, and so are rows whose status is "never send" (counted in
// skipped_never as well). (A status change to an "auto" status sends too — in the database, not through this function.)
// Resolves to { requested, sent, skipped, skipped_never }.
export async function sendEnquiriesToFms(ids) {
  const res = await fetch(`${SB}/rpc/send_enquiries_to_fms`, { method: 'POST', headers: SB_HDRS_JSON(), body: JSON.stringify({ p_ids: ids }) })
  if (!res.ok) throw new Error(await httpError(res, 'Could not send to FMS.'))
  clearColumnValuesCache() // sent rows now match the "FMS: sent" filter, which the other columns' lists cascade on
  return res.json()
}

// ── Delete (soft) ────────────────────────────────────────────────────────────
// One RPC, one transaction: marks the caller's not-yet-deleted rows (own, or any with enquiry_view_all) as deleted — they
// disappear for everyone; an administrator can restore one from the database. SENT rows are deleted only for a caller who also
// holds enquiry_delete_sent: deleting one also hides its Sales FMS pipeline and MeCa figures (past periods change too) and, if it
// was pushed from the Field Sales Form, soft-deletes that entry with it. Sent rows without that permission, already-deleted rows,
// rows that are not the caller's and unknown ids are skipped, not errors.
// Resolves to { requested, deleted, skipped, deleted_sent (of the deleted, how many were sent), entries_deleted (Field Sales entries removed with them) }.
export async function deleteEnquiries(ids) {
  const res = await fetch(`${SB}/rpc/delete_enquiries`, { method: 'POST', headers: SB_HDRS_JSON(), body: JSON.stringify({ p_ids: ids }) })
  if (!res.ok) throw new Error(await httpError(res, 'Could not delete.'))
  clearColumnValuesCache() // a deleted row may have been the only one holding a filter value
  return res.json()
}

// ── Excel bulk upload ───────────────────────────────────────────────────────
// Fixed template. Header match is case/space-insensitive; Name and Phone columns must exist.
export const EXCEL_HEADERS = ['Name', 'Company Name', 'Phone', 'Email', 'Requirement', 'Source', 'Sales Person', 'Client Type', 'Status']
const HEADER_TO_FIELD = {
  name: 'name',
  'company name': 'company_name',
  phone: 'phone',
  email: 'email',
  requirement: 'requirement',
  source: 'source',
  'sales person': 'sales_person_accountable',
  'client type': 'client_type',
  status: 'status',
}
// One POST is one transaction, so an import is all-or-nothing (no DELETE policy exists to clean
// up a half-inserted batch). This cap keeps that single request a sane size.
export const MAX_IMPORT_ROWS = 5000
// A real 5,000-row enquiry sheet is well under 1 MB — this only stops a wrong (e.g. image-heavy) file
// from being read into memory at all.
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const isValidExcelFile = (file) => /\.xlsx?$/i.test(file?.name || '')

const normHeader = (h) => clean(h).toLowerCase().replace(/\s+/g, ' ')
const STATUS_ALIASES = { '': 'open', open: 'open', interested: 'interested', rnr: 'rnr', 'future lead': 'future_lead', future_lead: 'future_lead', lost: 'lost' }
const normStatus = (s) => String(s || '').toLowerCase().trim().replace(/[\s_-]+/g, ' ')
// What a Status cell in the file may say: the built-ins (never 'won') plus every ACTIVE status in the managed list, by value or
// label. Returns { alias: value }, and the labels for the rejection message.
function statusAliases(dropdownOptions) {
  const alias = { ...STATUS_ALIASES }
  const labels = FORM_STATUS_OPTIONS.map((o) => o.label)
  ;(dropdownOptions?.[DROPDOWN_TYPES.STATUS] || []).forEach((o) => {
    if (!o.is_active || o.value === 'won') return
    alias[normStatus(o.value)] = o.value
    alias[normStatus(statusLabel(o.value))] = o.value
    if (!isBuiltinStatus(o.value)) labels.push(o.value)
  })
  return { alias, labels }
}

// A Requirement cell is a list of products: separated by comma, semicolon, | or a new line. Catalog names that themselves
// contain one of those characters are matched first, whole. Tokens are trimmed, whitespace-collapsed and de-duplicated
// (case-insensitively); nothing is guessed or reworded here — matching against the catalog is analyseEnquiryGrid's job.
const REQ_DELIMS = /[,;|\n]+/
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function splitRequirement(text, catalogValues = []) {
  let s = String(text ?? '').replace(/\r/g, '')
  const masked = []
  catalogValues
    .filter((v) => /[,;|\n]/.test(v))
    .sort((a, b) => b.length - a.length)
    .forEach((v) => {
      const re = new RegExp(`(^|[,;|\\n]\\s*)(${escapeRe(v)})(?=\\s*([,;|\\n]|$))`, 'gi')
      s = s.replace(re, (m, pre) => {
        masked.push(v)
        return `${pre}\uE000${masked.length - 1}\uE000`
      })
    })
  const seen = new Set()
  const out = []
  for (const part of s.split(REQ_DELIMS)) {
    const t = part.trim().replace(/\uE000(\d+)\uE000/g, (_, i) => masked[Number(i)]).replace(/[^\S\n]+/g, ' ')
    const k = t.toLowerCase()
    if (!t || seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}
const CLIENT_TYPE_ALIASES = { '': null, new: 'new', existing: 'existing' }

// Pure: takes the sheet as an array of rows (header row first). Never silently drops a row —
// every non-blank row ends up in exactly one of `valid` or `rejected` (rejected carries reasons),
// and duplicate phones within the file are FLAGGED, not removed: every row in a duplicate group
// (including the first) gets import_flag='duplicate_phone'. rowNumber is the spreadsheet row.
//
// `dropdownOptions` (optional, the shape fetchDropdownOptions() returns): Source / Sales Person
// cells are matched case-insensitively to the managed lists and rewritten to the list's own
// spelling. A value NOT in the list does not reject the row — it is reported in `unknownValues`
// ({ type, value, rowCount, retired }) so the upload screen can offer to add it (only if the
// user holds enquiry_manage_dropdowns); otherwise it imports as typed. Variants of the same new
// value within the file ("trade show" / "Trade  Show") collapse to the first spelling seen. A
// value matching a RETIRED option is flagged retired:true and must not be re-added.
const DROPDOWN_FIELDS = { source: DROPDOWN_TYPES.SOURCE, sales_person_accountable: DROPDOWN_TYPES.SALES_PERSON }
const lowerKey = (s) => s.replace(/\s+/g, ' ').toLowerCase()

export function analyseEnquiryGrid(grid, dropdownOptions = null) {
  if (!grid || !grid.length) throw new Error('The file is empty.')
  const colIndex = {}
  const usedCols = new Set()
  grid[0].forEach((h, i) => {
    const field = HEADER_TO_FIELD[normHeader(h)]
    if (field && !(field in colIndex)) {
      colIndex[field] = i
      usedCols.add(i)
    }
  })
  const missing = ['name', 'phone'].filter((f) => !(f in colIndex))
  if (missing.length) {
    throw new Error(`Missing required column${missing.length > 1 ? 's' : ''}: ${missing.map((m) => m[0].toUpperCase() + m.slice(1)).join(', ')}. Use the template — columns: ${EXCEL_HEADERS.join(', ')}.`)
  }
  const { alias: statusAlias, labels: statusLabelsAllowed } = statusAliases(dropdownOptions)
  const catalogNames = (dropdownOptions?.[DROPDOWN_TYPES.PRODUCT] || []).map((o) => o.value)
  const headers = grid[0].map(clean)
  const ignoredColumns = headers.filter((h, i) => h && !usedCols.has(i))

  const valid = []
  const rejected = []
  // type -> (lowercased value -> { value, retired, known }) seeded from the managed lists; unknown
  // values are added as first seen. `tally` counts valid rows per (type, value) needing attention.
  const canon = {}
  Object.values(DROPDOWN_TYPES).forEach((t) => {
    canon[t] = new Map((dropdownOptions?.[t] || []).map((o) => [lowerKey(o.value), { value: o.value, retired: !o.is_active, known: true }]))
  })
  const tally = new Map()
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] || []
    if (row.every((c) => !clean(c))) continue // fully blank spreadsheet row
    const get = (f) => (f in colIndex ? clean(row[colIndex[f]]) : '')
    const errors = []
    const name = get('name')
    const phone = get('phone')
    if (!name) errors.push('Name is missing')
    if (!phone) errors.push('Phone is missing')

    const statusRaw = get('status')
    const status = statusAlias[normStatus(statusRaw)]
    if (status === undefined) errors.push(`Unrecognised Status "${statusRaw}" (use ${statusLabelsAllowed.join(', ')}, or leave blank)`)
    const reqTokens = splitRequirement(get('requirement'), catalogNames)
    const tooLong = reqTokens.find((t) => t.length > MAX_PRODUCT_LENGTH)
    if (tooLong) errors.push(`Requirement entry "${tooLong.slice(0, 40)}…" is over ${MAX_PRODUCT_LENGTH} characters — list product names separated by commas or semicolons`)
    const ctRaw = get('client_type')
    const clientType = CLIENT_TYPE_ALIASES[ctRaw.toLowerCase()]
    if (clientType === undefined) errors.push(`Unrecognised Client Type "${ctRaw}" (use New or Existing, or leave blank)`)

    if (errors.length) {
      // `raw` keeps the row's original cells (one per header) so the rejected rows can be handed back
      // to the uploader in a fixable file — see downloadRejectedRows().
      rejected.push({ rowNumber: r + 1, name, phone, errors, raw: headers.map((_, i) => clean(row[i])) })
      continue
    }
    const record = {
      name,
      company_name: orNull(get('company_name')),
      phone,
      email: orNull(get('email')),
      requirement: reqTokens.length ? reqTokens : null,
      source: orNull(get('source')),
      sales_person_accountable: orNull(get('sales_person_accountable')),
      client_type: clientType,
      status,
    }
    if (dropdownOptions) {
      Object.entries(DROPDOWN_FIELDS).forEach(([field, type]) => {
        if (!record[field]) return
        const key = lowerKey(record[field])
        let hit = canon[type].get(key)
        if (!hit) {
          hit = { value: record[field].replace(/\s+/g, ' '), retired: false, known: false }
          canon[type].set(key, hit)
        }
        record[field] = hit.value
        if (!hit.known || hit.retired) {
          const tk = `${type}|${key}`
          const t = tally.get(tk) || { type, value: hit.value, retired: hit.retired, rowCount: 0 }
          t.rowCount++
          tally.set(tk, t)
        }
      })
    }
    if (dropdownOptions && record.requirement) {
      const seenProducts = new Set()
      record.requirement = record.requirement
        .map((token) => {
          const key = lowerKey(token)
          let hit = canon[DROPDOWN_TYPES.PRODUCT].get(key)
          if (!hit) {
            hit = { value: token, retired: false, known: false }
            canon[DROPDOWN_TYPES.PRODUCT].set(key, hit)
          }
          if (!hit.known || hit.retired) {
            const tk = `${DROPDOWN_TYPES.PRODUCT}|${key}`
            const t = tally.get(tk) || { type: DROPDOWN_TYPES.PRODUCT, value: hit.value, retired: hit.retired, rowCount: 0 }
            t.rowCount++
            tally.set(tk, t)
          }
          return hit.value
        })
        .filter((v) => !seenProducts.has(v.toLowerCase()) && seenProducts.add(v.toLowerCase()))
    }
    valid.push({ rowNumber: r + 1, record, import_flag: null, duplicateOf: [] })
  }
  if (valid.length + rejected.length > MAX_IMPORT_ROWS) {
    throw new Error(`This file has ${valid.length + rejected.length} rows — the limit is ${MAX_IMPORT_ROWS} per upload. Split it into smaller files.`)
  }

  const groups = new Map()
  valid.forEach((v) => {
    const key = phoneKey(v.record.phone)
    if (key) groups.set(key, [...(groups.get(key) || []), v])
  })
  let duplicateGroupCount = 0
  groups.forEach((members) => {
    if (members.length > 1) {
      duplicateGroupCount++
      members.forEach((m) => {
        m.import_flag = 'duplicate_phone'
        m.duplicateOf = members.filter((o) => o !== m).map((o) => o.rowNumber) // the OTHER rows sharing this phone
      })
    }
  })
  return {
    valid,
    rejected,
    headers,
    ignoredColumns,
    duplicateRowCount: valid.filter((v) => v.import_flag).length,
    duplicateGroupCount,
    unknownValues: [...tally.values()],
  }
}

// SheetJS is loaded on demand (a code-split chunk) — only an admin opening Bulk Upload pays for it.
export async function readEnquiryGrid(file) {
  const XLSX = await import('xlsx')
  let wb
  try {
    wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  } catch {
    throw new Error('Could not read that file — is it a valid .xlsx or .xls workbook?')
  }
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error('The workbook has no sheets.')
  // raw:false → cell text as displayed, so a phone typed as a number stays "9876543210".
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: true })
}

export async function parseEnquiryWorkbook(file, dropdownOptions = null) {
  return analyseEnquiryGrid(await readEnquiryGrid(file), dropdownOptions)
}

export async function downloadEnquiryTemplate() {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([EXCEL_HEADERS])
  ws['!cols'] = EXCEL_HEADERS.map((h) => ({ wch: Math.max(14, h.length + 4) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Enquiries')
  XLSX.writeFile(wb, 'Enquiry_Import_Template.xlsx')
}

// The rejected rows, exactly as the uploader typed them (original columns), plus a trailing
// "Rejection reason" column — fix the cells, delete that column (or leave it: an unknown column is
// simply ignored on upload) and re-upload just these rows.
export async function downloadRejectedRows({ headers, rejected, fileName }) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([[...headers, 'Rejection reason'], ...rejected.map((r) => [...r.raw, r.errors.join('; ')])])
  ws['!cols'] = [...headers, 'Rejection reason'].map((h) => ({ wch: Math.max(14, String(h).length + 4) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Rejected rows')
  const base = String(fileName || 'enquiries').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_')
  XLSX.writeFile(wb, `${base}_rejected.xlsx`)
}

// ── Import history ──────────────────────────────────────────────────────────
// Newest first. An admin (enquiry_view_all) sees every batch via RLS; anyone else only their own.
export async function fetchRecentImports(limit = 20) {
  const res = await fetch(`${SB}/enquiry_imports?select=id,file_name,uploaded_at,row_count,duplicate_count,rejected_count,status&order=uploaded_at.desc&limit=${limit}`, { headers: SB_HDRS() })
  if (!res.ok) throw new Error(await httpError(res, 'Could not load recent imports.'))
  return res.json()
}

// Completed batches with the same file name (case-insensitive), newest first — used to warn that
// re-importing a file creates duplicates. Only as good as the history passed in (the last 20).
export const findPriorImports = (recent, fileName) =>
  (recent || []).filter((i) => i.status === 'completed' && clean(i.file_name).toLowerCase() === clean(fileName).toLowerCase())

// One enquiry_imports row (status 'processing'), then ONE atomic bulk insert tagged with its
// import_batch_id + entry_channel='excel_upload', then the import row is finalised. If the insert
// fails nothing was inserted, and the import row is marked 'failed' (best effort).
export async function runEnquiryImport({ fileName, valid, rejectedCount }) {
  if (!valid.length) throw new Error('There are no valid rows to import.')
  const impRes = await fetch(`${SB}/enquiry_imports`, { method: 'POST', headers: SB_HDRS_REPR(), body: JSON.stringify({ file_name: fileName }) })
  if (!impRes.ok) throw new Error(await httpError(impRes, 'Could not start the import.'))
  const [imp] = await impRes.json()
  const duplicateCount = valid.filter((v) => v.import_flag).length

  const patchImport = (body) => fetch(`${SB}/enquiry_imports?id=eq.${imp.id}`, { method: 'PATCH', headers: SB_HDRS_MIN(), body: JSON.stringify(body) })

  const body = valid.map((v) => ({ ...v.record, entry_channel: 'excel_upload', import_batch_id: imp.id, import_flag: v.import_flag }))
  const insRes = await fetch(`${SB}/enquiries`, { method: 'POST', headers: SB_HDRS_MIN(), body: JSON.stringify(body) })
  if (!insRes.ok) {
    const msg = await httpError(insRes, 'Import failed.')
    await patchImport({ status: 'failed' }).catch(() => {})
    throw new Error(`${msg} No rows were imported.`)
  }
  clearColumnValuesCache() // the rows ARE in: the filter value lists must be re-read
  const finalBody = { row_count: valid.length, duplicate_count: duplicateCount, rejected_count: rejectedCount || 0, status: 'completed' }
  // Retried once: the batch row is only updatable while it is still 'processing', and a single network
  // blip here would otherwise leave it stuck in that state with zero counts.
  let finRes = await patchImport(finalBody).catch(() => null)
  if (!finRes?.ok) {
    await new Promise((r) => setTimeout(r, 400))
    finRes = await patchImport(finalBody).catch(() => null)
  }
  // The rows ARE saved at this point; only the bookkeeping update failed — say so precisely.
  if (!finRes?.ok) return { importId: imp.id, inserted: valid.length, duplicateCount, bookkeepingFailed: true }
  return { importId: imp.id, inserted: valid.length, duplicateCount, bookkeepingFailed: false }
}
