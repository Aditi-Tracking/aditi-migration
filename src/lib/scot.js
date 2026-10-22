// SCOT Calls — the cold-lead follow-up tracker (the fifth tab of Lead Capture), laid out like the real "Cold Leads" sheet. The database does the thinking; this module reads and writes.
//
// THE MODEL (sql/step19, corrected by sql/step22): scot_clients (one row per client being followed up), scot_calls (one row per call), scot_imports (one row per upload).
// A lead that is marked Lost becomes a client by itself (trigger — first call due 5 days later); clients can also be added by hand or uploaded.
//   READ   scot_list (a view: the client + call_state + days_overdue + last_outcome), scot_calls, scot_summary() — row-level security shows a user the
//          clients of the leads they entered, or everyone's with scot_view_all.
//   WRITE  functions only: add_scot_client, update_scot_client, log_scot_call, close_scot_client, reopen_scot_client, delete_scot_clients,
//          import_scot_clients, scot_find_duplicates.
// PHONE NUMBERS ARE UNIQUE among live clients (the last 10 digits decide, exactly like the Enquiry Sheet's duplicate check). The database refuses a
// duplicate; the upload previews which rows would be skipped.
// A CONTACT: contact_name (required), phone (required), opportunity (free text, 300), email, city, remark, lead_source (where the lead came from, e.g. WATI),
// sales_person, next_call_date. created_via says HOW the row got here (lost lead / by hand / Excel). The sheet's "Display Name" is not kept.
import { SUPABASE_URL, SB_HDRS, SB_HDRS_JSON, SB_HDRS_REPR } from './supabaseClient'
import { assertFilterBudget, buildFilterParams, buildOrderParam, emptyFilters } from './tableFilters'
import { clearColumnValuesCache, fetchColumnValues } from './columnValues'
import { addDays, todayIST } from './fmsFormat'

const SB = SUPABASE_URL + '/rest/v1'

// ── Words ──────────────────────────────────────────────────────────────────
export const CALL_STATE_LABELS = { overdue: 'Overdue', due_today: 'Due today', scheduled: 'Scheduled', not_scheduled: 'Not scheduled', won_back: 'Won back', dropped: 'Dropped' }
export const CALL_STATE_TONE = { overdue: 'danger', due_today: 'warning', scheduled: 'primary', not_scheduled: 'neutral', won_back: 'success', dropped: 'neutral' }
export const STATUS_LABELS = { active: 'Active', won_back: 'Won back', dropped: 'Dropped' }
export const CREATED_VIA_LABELS = { lost_lead: 'Lost lead', manual: 'Added by hand', import: 'Excel upload' }
// After these outcomes the screen OFFERS to close the follow-up as Dropped (never automatic — a deliberate click). Matched case-insensitively.
// The outcome that puts the contact back into the live pipeline (the database creates the enquiry; it cannot be renamed or retired).
export const isMeetingOutcome = (outcome) => String(outcome ?? '').trim().toLowerCase() === 'meeting scheduled'
export const SUGGEST_DROP_OUTCOMES = ['not interested', 'invalid number']
export const suggestsDrop = (outcome) => SUGGEST_DROP_OUTCOMES.includes(String(outcome ?? '').trim().toLowerCase())
export const SCOT_OUTCOME_TYPE = 'scot_outcome'

// Next-call shortcuts for the Log-a-call dialog: [label, days from the call]
export const NEXT_CALL_SHORTCUTS = [['In 3 days', 3], ['In a week', 7], ['In 2 weeks', 14], ['In a month', 30]]
export const shortcutDate = (days, from = todayIST()) => addDays(from, days)

// ── Phone key (the same rule as the database: the last 10 digits) ───────────
export function scotPhoneKey(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  return digits ? digits.slice(-10) : null
}

// ── The list ────────────────────────────────────────────────────────────────
export const SCOT_PAGE_SIZE = 50
export const SCOT_FILTER_SPEC = {
  name: { column: 'contact_name', kind: 'checklist' },
  phone: { column: 'phone', kind: 'checklist' },
  opportunity: { column: 'opportunity', kind: 'checklist' },
  city: { column: 'city', kind: 'checklist' },
  leadSource: { column: 'lead_source', kind: 'checklist' },
  salesPerson: { column: 'sales_person', kind: 'checklist' },
  state: { column: 'call_state', kind: 'checklist' },
  status: { column: 'status', kind: 'checklist' },
  calls: { column: 'call_count', kind: 'checklist' }, // only set by the "Never called" tile (calls = 0)
  createdVia: { column: 'created_via', kind: 'checklist' },
  nextCall: { column: 'next_call_date', kind: 'dateRange' },
}
export const emptyScotFilters = () => emptyFilters(SCOT_FILTER_SPEC)
const VALUE_KEYS = ['name', 'phone', 'opportunity', 'city', 'leadSource', 'salesPerson']

// Default order: what needs a call first — the longest overdue, then the soonest due; unscheduled and closed after; always ends in a unique column.
export const SCOT_DEFAULT_ORDER = 'days_overdue.desc.nullslast,next_call_date.asc.nullslast,created_at.desc,id.desc'
export const SCOT_SORT_COLUMNS = {
  name: 'contact_name', phone: 'phone', opportunity: 'opportunity', email: 'email', city: 'city', leadSource: 'lead_source', remark: 'remark', salesPerson: 'sales_person',
  lastCalled: 'last_called_at', lastOutcome: 'last_outcome', nextCall: 'next_call_date', calls: 'call_count', status: 'status', createdVia: 'created_via', state: 'call_state',
}
export const SCOT_SORT_KINDS = {
  name: 'text', phone: 'text', opportunity: 'text', email: 'text', city: 'text', leadSource: 'text', remark: 'text', salesPerson: 'text',
  lastCalled: 'date', lastOutcome: 'text', nextCall: 'date', calls: 'number', status: 'text', createdVia: 'text', state: 'text',
}

function filterParams(filters, omit) {
  const spec = omit ? Object.fromEntries(Object.entries(SCOT_FILTER_SPEC).filter(([k]) => k !== omit)) : SCOT_FILTER_SPEC
  const params = buildFilterParams(spec, filters)
  assertFilterBudget(params)
  return params
}

async function httpError(res, fallback) {
  const text = await res.text().catch(() => '')
  let msg = text
  let code = ''
  let details = ''
  try {
    const j = JSON.parse(text)
    msg = j.message || j.hint || text
    code = j.code || ''
    details = j.details || ''
  } catch {
    /* not JSON — use the raw text */
  }
  if (res.status === 401 || res.status === 403 || code === '42501' || /row-level security|42501|not authorised/i.test(msg || '')) return { code: 'denied', message: "You don't have permission to do that." }
  if (code === '40001') return { code: 'conflict', message: msg }
  if (code === 'P0002') return { code: 'gone', message: msg }
  if (code === '23505') return { code: 'duplicate', message: msg, details }
  return { code: code === '22023' || code === '22007' || code === '23514' ? 'invalid' : 'error', message: msg || fallback || 'HTTP ' + res.status, details }
}
// code: 'duplicate' (the phone is already tracked; `existingId` is the client when the caller may see it), 'conflict' (someone saved first — reload),
// 'denied', 'gone' (not in the caller's follow-ups any more), 'invalid' (a rule — the message says which), 'error'
export class ScotError extends Error {
  constructor(code, message, existingId = null) {
    super(message)
    this.code = code
    this.existingId = existingId
  }
}
const fail = async (res, fallback) => {
  const { code, message, details } = await httpError(res, fallback)
  throw new ScotError(code, message, code === 'duplicate' && /^[0-9a-f-]{36}$/.test(details || '') ? details : null)
}

export async function fetchScotList({ filters = {}, sort = null, page = 0, pageSize = SCOT_PAGE_SIZE } = {}) {
  const q = ['select=*', buildOrderParam(SCOT_SORT_COLUMNS, sort, SCOT_DEFAULT_ORDER), `limit=${pageSize}`, `offset=${page * pageSize}`, ...filterParams(filters)]
  const res = await fetch(`${SB}/scot_list?${q.join('&')}`, { headers: { ...SB_HDRS(), Prefer: 'count=exact' } })
  if (!res.ok) await fail(res, 'Could not load the follow-ups.')
  const total = parseInt((res.headers.get('content-range') || '').split('/')[1], 10)
  const rows = await res.json()
  return { rows, total: Number.isFinite(total) ? total : rows.length }
}

// ONE client's row, freshly read (null when it is gone, deleted or hidden) — after a write the list patches just that row.
export async function fetchScotRow(id) {
  const res = await fetch(`${SB}/scot_list?id=eq.${encodeURIComponent(id)}&select=*`, { headers: SB_HDRS() })
  if (!res.ok) await fail(res, 'Could not re-read the client.')
  const rows = await res.json()
  return rows[0] || null
}

export function fetchScotColumnValues(key, filters = {}) {
  if (!VALUE_KEYS.includes(key)) return Promise.reject(new Error(`No value list for "${key}".`))
  let params
  try {
    params = filterParams(filters, key)
  } catch (e) {
    return Promise.reject(e)
  }
  return fetchColumnValues({ table: 'scot_list', column: SCOT_FILTER_SPEC[key].column, params })
}

// The tiles: { active, never_called, overdue, due_today, not_scheduled, won_back, dropped, called_this_week } — for what the CALLER may see.
export async function fetchScotSummary() {
  const res = await fetch(`${SB}/rpc/scot_summary`, { method: 'POST', headers: SB_HDRS_JSON(), body: '{}' })
  if (!res.ok) await fail(res, 'Could not load the summary.')
  return res.json()
}

// A client's calls, newest first (the call log).
export async function fetchScotCalls(clientId) {
  const res = await fetch(`${SB}/scot_calls?client_id=eq.${encodeURIComponent(clientId)}&select=id,called_at,called_by,outcome,notes,next_call_date&order=called_at.desc,created_at.desc&limit=500`, { headers: SB_HDRS() })
  if (!res.ok) await fail(res, 'Could not load the calls.')
  return res.json()
}

// ── The outcomes (a managed list, like every other pick-list) ───────────────
// → [{ id, value, is_active, sort_order, default_next_call_days }]; retired values are included for whoever may manage the list (RLS). Cached for the session.
// default_next_call_days (0..365, or null = no automatic date) is what the Log-a-call dialog fills the next-call date with for that outcome; it is absent before
// the database has the column (the request is then repeated without it, so the outcomes still load).
let _outcomeCache = null
export const clearScotOutcomeCache = () => {
  _outcomeCache = null
}

// Set (or clear, days = null) an outcome's default next-call days — the same permission as managing the outcome list; the database refuses Meeting Scheduled and
// anything outside 0..365. RLS silently filters a forbidden UPDATE to zero rows, so return=representation tells "done" from "nothing happened".
export async function setScotOutcomeNextCallDays(id, days) {
  if (days !== null && (!Number.isInteger(days) || days < 0 || days > 365)) throw new Error('Enter a whole number of days from 0 to 365, or leave it empty.')
  const res = await fetch(`${SB}/enquiry_dropdown_options?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: SB_HDRS_REPR(), body: JSON.stringify({ default_next_call_days: days }) })
  if (!res.ok) await fail(res, 'Could not change the next-call days.')
  const rows = await res.json()
  if (!rows.length) throw new Error('That could not be changed — you may not have permission, or the outcome no longer exists.')
  clearScotOutcomeCache()
  return { id: rows[0].id, default_next_call_days: rows[0].default_next_call_days }
}
export async function fetchScotOutcomes({ force = false } = {}) {
  if (_outcomeCache && !force) return _outcomeCache
  const ask = (cols) => fetch(`${SB}/enquiry_dropdown_options?select=${cols}&dropdown_type=eq.${SCOT_OUTCOME_TYPE}&limit=500`, { headers: SB_HDRS() })
  let res = await ask('id,value,is_active,sort_order,default_next_call_days')
  if (!res.ok && res.status === 400) res = await ask('id,value,is_active,sort_order')
  if (!res.ok) await fail(res, 'Could not load the call outcomes.')
  const rows = await res.json()
  rows.sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity) || a.value.localeCompare(b.value))
  _outcomeCache = rows
  return rows
}
// The automatic next-call date for an outcome, or '' when there is none: the call's date (calledOn 'YYYY-MM-DD', default today, India time) + the outcome's
// days, never earlier than today — the same rule the database applies. NEVER for Meeting Scheduled, which always needs an explicit meeting date.
export function autoNextCallDate(outcomes, outcome, calledOn = null) {
  if (!outcome || isMeetingOutcome(outcome)) return ''
  const o = (outcomes || []).find((x) => x.is_active && x.value === outcome)
  if (!o || !Number.isInteger(o.default_next_call_days)) return ''
  const today = todayIST()
  const date = addDays(/^\d{4}-\d{2}-\d{2}$/.test(calledOn || '') ? calledOn : today, o.default_next_call_days)
  return date < today ? today : date
}
export const outcomeOptions = (outcomes) => (outcomes || []).filter((o) => o.is_active).map((o) => ({ value: o.value, label: o.value }))

// ── Writes ──────────────────────────────────────────────────────────────────
async function rpc(fn, body, fallback) {
  const res = await fetch(`${SB}/rpc/${fn}`, { method: 'POST', headers: SB_HDRS_JSON(), body: JSON.stringify(body) })
  if (!res.ok) await fail(res, fallback)
  clearColumnValuesCache()
  return res.json()
}

// The editable fields of a contact, as the form holds them (text) → what the functions take. Empty text is "not set".
export const SCOT_FIELDS = ['contact_name', 'phone', 'opportunity', 'email', 'city', 'remark', 'lead_source', 'sales_person', 'next_call_date']
export const SCOT_LIMITS = { contact_name: 200, opportunity: 300, email: 200, city: 100, remark: 1000, lead_source: 100, sales_person: 200 }
const LIMIT_LABELS = { contact_name: 'The contact name', opportunity: 'The opportunity', email: 'The e-mail', city: 'The city', remark: 'The remark', lead_source: 'The source', sales_person: 'The sales person' }
export const emptyScotForm = () => Object.fromEntries(SCOT_FIELDS.map((k) => [k, '']))
export const scotFormFromRow = (row) => Object.fromEntries(SCOT_FIELDS.map((k) => [k, row?.[k] === null || row?.[k] === undefined ? '' : String(row[k])]))
const clean = (v) => (v === null || v === undefined ? '' : String(v).trim())
export const scotPayload = (form) => Object.fromEntries(SCOT_FIELDS.map((k) => [k, clean(form[k]) === '' ? null : clean(form[k])]))

// Quick checks that mirror the database's rules, so a form can say what is wrong before it asks (the database still decides).
export function validateScotForm(form) {
  const errors = {}
  if (!clean(form.contact_name)) errors.contact_name = 'Enter the contact name.'
  const key = scotPhoneKey(form.phone)
  if (!clean(form.phone)) errors.phone = 'Enter the phone number.'
  else if (!key || key.length < 7) errors.phone = 'The phone number needs at least 7 digits.'
  for (const [k, max] of Object.entries(SCOT_LIMITS)) {
    if (!errors[k] && clean(form[k]).length > max) errors[k] = `${LIMIT_LABELS[k]} is too long (${max} characters at most).`
  }
  if (clean(form.next_call_date) && !/^\d{4}-\d{2}-\d{2}$/.test(clean(form.next_call_date))) errors.next_call_date = 'Choose a date.'
  return errors
}

export const addScotClient = (form) => rpc('add_scot_client', { p: scotPayload(form) }, 'Could not add the client.')
// stamp: the client's updated_at as the row carried it. patch: any of SCOT_FIELDS. → { updated_at }
export const updateScotClient = (id, stamp, patch) => rpc('update_scot_client', { p_id: id, p_stamp: stamp, p_patch: patch }, 'Could not save the client.')
// outcome: an active value of the outcomes list. nextCallDate 'YYYY-MM-DD' or null (= not scheduled). calledAt (ISO) only for an administrator.
// "Meeting Scheduled" ALSO needs salesPerson (an active name of the Sales Person list) and nextCallDate (= the meeting date): the database then creates the
// enquiry (channel scot_call, in Sales FMS, First Call done, Demo planned for that date) — or, if the contact is already in the pipeline, only records the call.
// The dialog always sends p_auto_schedule: false — what it shows is what is saved, so a date left empty on purpose stays empty (the database's automatic date is
// for other callers that give none). → { call_id, next_call_date, auto_scheduled, enquiry_id (null unless Meeting Scheduled), enquiry_created }
export const logScotCall = ({ clientId, outcome, notes = '', nextCallDate = null, calledAt = null, salesPerson = null }) =>
  rpc('log_scot_call', { p_client: clientId, p_outcome: outcome, p_notes: notes || null, p_next_call_date: nextCallDate || null, p_called_at: calledAt || null, p_sales_person: salesPerson || null, p_auto_schedule: false }, 'Could not log the call.')
export const closeScotClient = (id, status, note = '') => rpc('close_scot_client', { p_id: id, p_status: status, p_note: note || null }, 'Could not close the follow-up.')
export const reopenScotClient = (id, nextCallDate = null) => rpc('reopen_scot_client', { p_id: id, p_next_call_date: nextCallDate || null }, 'Could not reopen the follow-up.')
export const deleteScotClients = (ids) => rpc('delete_scot_clients', { p_ids: ids }, 'Could not delete.')

// Which of these phone numbers are already tracked? → [{ phone, client_id, contact_name }] (client_id / contact_name null when the caller may not see it)
export const findScotDuplicates = (phones) => rpc('scot_find_duplicates', { p_phones: phones }, 'Could not check the phone numbers.')

// ── Excel upload ────────────────────────────────────────────────────────────
// The layout of the real "Cold Leads" tab: Contact Name, Opportunity, Email, City, Phone, Display Name (not used), Remark, Source (= where the lead came from),
// then one column per day holding that day's call outcome (not imported — see below). Headers are matched case- and space-insensitively. The sheet has a
// title block above the headings (e.g. "OCTOBER'2026"): the heading row is FOUND, it need not be the first row. A row with no Contact Name uses its Opportunity as
// the contact name. A row with no phone is rejected (listed with its reason, downloadable).
export const SCOT_EXCEL_HEADERS = ['Contact Name', 'Opportunity', 'Email', 'City', 'Phone', 'Remark', 'Source', 'Sales Person', 'Next Call Date']
const HEADER_FIELD = {
  'contact name': 'contact_name', name: 'contact_name', 'client name': 'contact_name', contact: 'contact_name',
  opportunity: 'opportunity', email: 'email', 'e-mail': 'email', 'email id': 'email', city: 'city',
  phone: 'phone', 'phone number': 'phone', mobile: 'phone', 'contact number': 'phone',
  remark: 'remark', remarks: 'remark', source: 'lead_source', 'lead source': 'lead_source',
  'sales person': 'sales_person', 'next call date': 'next_call_date', 'next call': 'next_call_date',
}
const FIELD_LABELS = { contact_name: 'Contact name', phone: 'Phone', opportunity: 'Opportunity', email: 'Email', city: 'City', remark: 'Remark', lead_source: 'Source', sales_person: 'Sales person', next_call_date: 'Next call date' }
export const MAX_SCOT_IMPORT_ROWS = 5000
export const MAX_SCOT_UPLOAD_BYTES = 5 * 1024 * 1024
export const isValidScotFile = (file) => /\.xlsx?$/i.test(file?.name || '')
const normHeader = (h) => clean(h).toLowerCase().replace(/\s+/g, ' ')

// "01/11/2026", "1-11-26" or "2026-11-01" → "2026-11-01"; anything else → null (not a date)
export function parseScotDate(text) {
  const t = clean(text)
  let y, m, d
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  if (hit) [y, m, d] = [hit[1], hit[2], hit[3]]
  else if ((hit = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t))) [d, m, y] = [hit[1], hit[2], hit[3].length === 2 ? '20' + hit[3] : hit[3]]
  else return null
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const dt = new Date(iso + 'T00:00:00Z')
  return Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso ? null : iso
}

export async function readScotGrid(file) {
  const XLSX = await import('xlsx')
  let wb
  try {
    wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  } catch {
    throw new Error('Could not read that file — is it a valid .xlsx or .xls workbook?')
  }
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error('The workbook has no sheets.')
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: true })
}

// The heading row: the first of the top 15 rows that names a Phone column and at least one other known column (the real sheet has a title block above it).
// Falls back to the first row. → its index
export function findScotHeaderRow(grid) {
  for (let i = 0; i < Math.min(15, grid.length); i++) {
    const fields = (grid[i] || []).map((h) => HEADER_FIELD[normHeader(h)] || null).filter(Boolean)
    if (fields.includes('phone') && new Set(fields).size >= 2) return i
  }
  return 0
}
// A heading that is only a day / date (13, 14 … or 2026-10-13): the sheet's day-by-day call history. Not imported.
const isDayColumn = (h) => /^\d{1,2}$/.test(h) || parseScotDate(h) !== null

// grid (rows of cell text) + the sales-person list (optional: the managed list, to correct spelling/case) → what the preview shows.
//   { headers, rows: [{ line, raw, fields, errors: [] }], missing: [what the file lacks that is required], ignored: [unrecognised columns], dayColumns: n }
// `line` is the row's number in the sheet. Each row's `fields` is ready for scotPayload; `errors` is empty for a row that can be imported. Duplicates are decided
// separately (by phone).
export function analyseScotGrid(grid, salesPeople = null) {
  const headerAt = findScotHeaderRow(grid)
  const headers = (grid[headerAt] || []).map(clean)
  const colField = headers.map((h) => HEADER_FIELD[normHeader(h)] || null)
  const fieldsPresent = new Set(colField.filter(Boolean))
  const missing = []
  if (!fieldsPresent.has('phone')) missing.push('Phone')
  if (!fieldsPresent.has('contact_name') && !fieldsPresent.has('opportunity')) missing.push('Contact Name (or Opportunity)')
  const unused = headers.filter((h, i) => h && !colField[i])
  const dayColumns = unused.filter(isDayColumn).length
  const ignored = unused.filter((h) => !isDayColumn(h))
  const byLower = new Map((salesPeople || []).map((s) => [s.toLowerCase(), s]))
  const rows = []
  grid.slice(headerAt + 1).forEach((raw, idx) => {
    if (!raw.some((c) => clean(c))) return
    const f = Object.fromEntries(SCOT_FIELDS.map((k) => [k, '']))
    colField.forEach((field, i) => {
      if (field) f[field] = clean(raw[i])
    })
    if (!f.contact_name && f.opportunity) f.contact_name = f.opportunity.slice(0, SCOT_LIMITS.contact_name) // the database does the same
    const errors = []
    if (f.next_call_date) {
      const iso = parseScotDate(f.next_call_date)
      if (iso) f.next_call_date = iso
      else errors.push('The next call date is not a date (use YYYY-MM-DD or DD/MM/YYYY).')
    }
    if (f.sales_person && byLower.has(f.sales_person.toLowerCase())) f.sales_person = byLower.get(f.sales_person.toLowerCase())
    const found = validateScotForm(f)
    Object.entries(found).forEach(([k, m]) => errors.push(`${FIELD_LABELS[k] || k}: ${m}`))
    rows.push({ line: headerAt + idx + 2, raw, fields: f, errors })
  })
  return { headers, rows, missing, ignored, dayColumns }
}

export async function downloadScotTemplate() {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([SCOT_EXCEL_HEADERS])
  ws['!cols'] = SCOT_EXCEL_HEADERS.map((h) => ({ wch: Math.max(14, h.length + 4) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Cold Leads')
  XLSX.writeFile(wb, 'SCOT_Import_Template.xlsx')
}

// The rows that were not imported (rejected and duplicate), as typed, plus a "Reason" column — fix and re-upload just these.
export async function downloadScotSkipped({ headers, skipped, fileName }) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([[...headers, 'Reason'], ...skipped.map((r) => [...r.raw, r.reason])])
  ws['!cols'] = [...headers, 'Reason'].map((h) => ({ wch: Math.max(14, String(h).length + 4) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Not imported')
  const base = String(fileName || 'scot').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_')
  XLSX.writeFile(wb, `${base}_not_imported.xlsx`)
}

// ONE call: the valid rows' fields in file order. → { import_id, imported, duplicates: [{ row, phone, contact_name }], rejected: [{ row, reason }] }
// (`row` counts the rows SENT, from 1.)
export const importScotClients = (fileName, rows) => rpc('import_scot_clients', { p_file_name: fileName, p_rows: rows.map(scotPayload) }, 'Could not import the file.')
