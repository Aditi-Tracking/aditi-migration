// Field Sales Visit Form — the data layer for the new leads + visits model (step 27 / 28 of the Lead Capture SQL). A module of its own: it does not share
// helpers with lib/fieldSalesForm.js (that file belongs to the frozen legacy entries table).
//
// Database side (all writes go through functions; the tables have no client INSERT / UPDATE):
//   submit_field_sales_visit(p jsonb)   the ONLY write path. One transaction: the lead (Discovery), the visit, and — once a visit is COMPLETED — the enquiry,
//                                       the Sales FMS stages and the Won / Lost closure. A pending visit (demo not given) writes only the lead and the visit.
//   fs_find_by_phone(p_phone)           → { match: 'none' | 'own_lead' | 'adoptable' | 'taken', … }. Another rep's lead / an enquiry / a SCOT contact are all the
//                                       same bare 'taken' (identifies nothing); 'own_lead' and 'adoptable' describe the caller's OWN rows only.
//   fs_search_leads(p_q)                → the caller's own open leads (view_all sees everyone's, flagged mine = false), with allowed_reasons.
//   field_sales_lead_state (view)       one row per lead: lead_state never_visited | pending | completed, outcome open | won | lost, pending_count, next follow-up.
//   field_sales_visit_status (view)     a lead's visits with visit_state completed | pending | superseded (pending = the demo was not given; one with a LATER completed visit is superseded). Every Discovery visit counts as a meeting whatever its state.
//   enquiry_dropdown_options            the one admin-managed list, type fs_pain_area (add / retire through the table's own policies, rename through
//                                       rename_dropdown_option, which cascades to the leads that hold the name).
//   fs_get_settings / fs_set_setting    the alert recipient (admin only).
// Rules the form mirrors (the server enforces every one again): a visit is COMPLETED when the demo was given or it is a quotation follow-up; Demo pending is
// offered only before a demo is recorded, Quotation follow-up only after; the three reasons are free text (<= 500); Won needs an SO number and an amount.
import { SUPABASE_ANON, SUPABASE_URL, SB_HDRS, SB_HDRS_JSON, SB_HDRS_REPR, authClient, getAuthToken } from './supabaseClient'

const SB = SUPABASE_URL + '/rest/v1'
const IST = 'Asia/Kolkata'

// ── Vocabulary ──────────────────────────────────────────────────────────────
export const PURPOSES = [
  { value: 'Discovery', label: 'Discovery' },
  { value: 'Follow-up', label: 'Follow-up' },
]
export const SOURCES = ['Walk-in', 'Customer referral', 'Self-generated', 'Inbound enquiry'].map((s) => ({ value: s, label: s }))
export const FOLLOW_UP_REASONS = [
  { value: 'Demo pending', label: 'Demo pending' },
  { value: 'Quotation follow-up', label: 'Quotation follow-up' },
]
export const DEMO_OUTCOMES = [
  { value: 'quotation_to_be_sent', label: 'Quotation to be sent' },
  { value: 'not_interested', label: 'Not interested' },
]
export const QUOTATION_OUTCOMES = [
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'next_followup', label: 'Next follow-up' },
]
export const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]
// How a lead's state / outcome (view field_sales_lead_state) is worded and toned (StatusBadge tones).
export const LEAD_STATE_LABEL = { never_visited: 'Never visited', pending: 'Demo not given', completed: 'Demo given' }
export const LEAD_STATE_TONE = { never_visited: 'neutral', pending: 'warning', completed: 'primary' }
export const OUTCOME_LABEL = { open: 'Open', won: 'Won', lost: 'Lost' }
export const OUTCOME_TONE = { open: 'neutral', won: 'success', lost: 'danger' }
export const REASON_MAX = 500
export const REMARKS_MAX = 1000
export const SO_MAX = 40
export const PAIN_AREA_LIST = 'fs_pain_area'
export const VISITS_PAGE_SIZE = 50

// ── Dates and formatting ────────────────────────────────────────────────────
// A calendar date in India (YYYY-MM-DD), `offsetDays` from today. The server compares against the same IST day.
export function istDate(offsetDays = 0, now = Date.now()) {
  return new Date(now + offsetDays * 864e5).toLocaleDateString('en-CA', { timeZone: IST })
}
export const formatDateTime = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { timeZone: IST, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—')
export const formatDay = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { timeZone: IST, day: 'numeric', month: 'short', year: 'numeric' }) : '—')
// A plain date column ('YYYY-MM-DD'): no timezone conversion.
export function formatPlain(d) {
  if (!d) return '—'
  const x = new Date(d + 'T00:00:00')
  return isNaN(x) ? String(d) : x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
export const formatMoney = (n) => (n === null || n === undefined || n === '' ? '—' : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }))

// ── The form ────────────────────────────────────────────────────────────────
export const emptyVisitForm = () => ({
  purpose: '',
  source_of_lead: '',
  referrer_name: '',
  coordinator_booked: '',
  business_name: '',
  contact_person: '',
  contact_number: '',
  area: '',
  city: '',
  fleet_size: '',
  uses_gps: '',
  existing_gps: '',
  pain_area: '',
  lead_id: '',
  follow_up_reason: '',
  demo_given: '',
  demo_outcome: '',
  quotation_due_date: '',
  closing_reason: '',
  no_demo_reason: '',
  next_followup_date: '',
  quotation_outcome: '',
  quotation_followup_reason: '',
  so_number: '',
  won_amount: '',
  remarks: '',
})

const clean = (v) => String(v ?? '').trim()
export const phoneDigits = (v) => String(v ?? '').replace(/\D/g, '')
// The contact number as the server sees it (fs_phone10): non-digits ignored, then exactly 10 digits remain -- 10 as typed, 11 starting with 0 (trunk prefix) or
// 12 starting with 91 (country code) lose that prefix; anything else is not a number ('').
export function normalizePhone10(v) {
  const d = phoneDigits(v)
  if (d.length === 10) return d
  if (d.length === 11 && d[0] === '0') return d.slice(1)
  if (d.length === 12 && d.startsWith('91')) return d.slice(2)
  return ''
}
const FLEET_RE = /^\d{1,9}$/
const MONEY_RE = /^\d{1,12}(\.\d{1,2})?$/
const moneyText = (v) => clean(v).replace(/[,\s]/g, '')

// The "shows when" rules of the design, in ONE place: the set of form keys that apply to the current answers. The form renders from it, the validator
// checks only these, and the payload carries only these (a field that stopped applying can never be submitted hidden).
export function visibleFields(f) {
  const v = new Set(['purpose', 'remarks'])
  const discovery = f.purpose === 'Discovery'
  const followUp = f.purpose === 'Follow-up'
  if (discovery) {
    ;['source_of_lead', 'coordinator_booked', 'business_name', 'contact_person', 'contact_number', 'area', 'city', 'fleet_size', 'uses_gps', 'pain_area'].forEach((k) => v.add(k))
    if (f.source_of_lead === 'Customer referral') v.add('referrer_name')
    if (f.uses_gps === 'yes') v.add('existing_gps')
  }
  if (followUp) {
    v.add('lead_id')
    if (f.lead_id) v.add('follow_up_reason')
  }
  const demoStep = discovery || (followUp && f.lead_id && f.follow_up_reason === 'Demo pending')
  if (demoStep) {
    v.add('demo_given')
    if (f.demo_given === 'yes') {
      v.add('demo_outcome')
      if (f.demo_outcome === 'quotation_to_be_sent') v.add('quotation_due_date')
      if (f.demo_outcome === 'not_interested') v.add('closing_reason')
    }
    if (f.demo_given === 'no') {
      v.add('no_demo_reason')
      v.add('next_followup_date')
    }
  }
  if (followUp && f.lead_id && f.follow_up_reason === 'Quotation follow-up') {
    v.add('quotation_outcome')
    if (f.quotation_outcome === 'won') {
      v.add('so_number')
      v.add('won_amount')
    }
    if (f.quotation_outcome === 'lost') v.add('closing_reason')
    if (f.quotation_outcome === 'next_followup') {
      v.add('quotation_followup_reason')
      v.add('next_followup_date')
    }
  }
  return v
}

// The order the fields appear in (the first problem is scrolled to and focused).
export const FIELD_ORDER = [
  'purpose', 'source_of_lead', 'referrer_name', 'coordinator_booked', 'business_name', 'contact_person', 'contact_number', 'area', 'city', 'fleet_size', 'uses_gps',
  'existing_gps', 'pain_area', 'lead_id', 'follow_up_reason', 'demo_given', 'demo_outcome', 'quotation_due_date', 'closing_reason', 'no_demo_reason', 'next_followup_date',
  'quotation_outcome', 'quotation_followup_reason', 'so_number', 'won_amount', 'remarks', 'attachment',
]

// → { field: message } for the VISIBLE fields only. `ctx.painAreas` = the active Pain Area values; `ctx.today` overrides "today" in tests.
export function validateVisitForm(f, ctx = {}) {
  const e = {}
  const v = visibleFields(f)
  const today = ctx.today || istDate(0)
  const need = (key, msg) => {
    if (v.has(key) && !clean(f[key])) e[key] = msg
  }
  if (!f.purpose) e.purpose = 'Choose the purpose of the visit.'
  if (v.has('source_of_lead')) {
    need('source_of_lead', 'Choose the source of the lead.')
    need('referrer_name', 'Enter the referrer name.')
    need('coordinator_booked', 'Say whether the meeting was booked by the Sales Coordinator.')
    need('business_name', 'Business name is required.')
    need('contact_person', 'Contact person is required.')
    need('area', 'Area is required.')
    need('city', 'City is required.')
    if (v.has('contact_number')) {
      if (!clean(f.contact_number)) e.contact_number = 'Contact number is required.'
      else if (!normalizePhone10(f.contact_number)) e.contact_number = 'Enter a valid 10-digit contact number (a +91 or a leading 0 is fine).'
    }
    if (!clean(f.fleet_size)) e.fleet_size = 'Fleet size is required.'
    else if (!FLEET_RE.test(clean(f.fleet_size))) e.fleet_size = 'Fleet size must be a whole number (0 or more).'
    need('uses_gps', 'Say whether the customer uses any GPS today.')
    need('existing_gps', 'Enter the existing GPS name or service.')
    if (!clean(f.pain_area)) e.pain_area = 'Choose the pain area.'
    else if (ctx.painAreas && !ctx.painAreas.includes(f.pain_area)) e.pain_area = `${f.pain_area} is no longer available — choose again.`
  }
  if (v.has('lead_id')) need('lead_id', 'Choose the existing lead.')
  if (v.has('follow_up_reason')) need('follow_up_reason', 'Choose the follow-up reason.')
  if (v.has('demo_given')) need('demo_given', 'Say whether the demo was given.')
  if (v.has('demo_outcome')) need('demo_outcome', 'Choose the demo outcome.')
  if (v.has('quotation_due_date')) {
    if (!clean(f.quotation_due_date)) e.quotation_due_date = 'Choose the quotation send date.'
    else if (f.quotation_due_date < today) e.quotation_due_date = 'The quotation send date must be today or later.'
  }
  if (v.has('closing_reason')) need('closing_reason', f.quotation_outcome === 'lost' ? 'Enter the reason for loss.' : 'Enter the reason for not interested.')
  if (v.has('no_demo_reason')) need('no_demo_reason', 'Enter the reason the demo was not given.')
  if (v.has('next_followup_date')) {
    if (!clean(f.next_followup_date)) e.next_followup_date = 'Choose the next follow-up date.'
    else if (f.next_followup_date <= today) e.next_followup_date = 'The next follow-up date must be in the future.'
  }
  if (v.has('quotation_outcome')) need('quotation_outcome', 'Choose the quotation follow-up outcome.')
  if (v.has('quotation_followup_reason')) need('quotation_followup_reason', 'Enter the reason for the next follow-up.')
  if (v.has('so_number')) {
    need('so_number', 'Enter the SO number.')
    if (clean(f.so_number).length > SO_MAX) e.so_number = `The SO number is too long (${SO_MAX} characters at most).`
  }
  if (v.has('won_amount')) {
    if (!moneyText(f.won_amount)) e.won_amount = 'Enter the order amount.'
    else if (!MONEY_RE.test(moneyText(f.won_amount))) e.won_amount = 'Enter a valid amount (0 or more, up to 2 decimals).'
  }
  for (const k of ['closing_reason', 'no_demo_reason', 'quotation_followup_reason']) {
    if (v.has(k) && clean(f[k]).length > REASON_MAX && !e[k]) e[k] = `Too long (${REASON_MAX} characters at most).`
  }
  if (clean(f.remarks).length > REMARKS_MAX) e.remarks = `Too long (${REMARKS_MAX} characters at most).`
  return e
}

// The submit_field_sales_visit argument: ONLY the visible fields, typed. `extra` = { adopt, attachment_path, geo_lat, geo_lng, geo_accuracy_m, captured_at }.
export function buildVisitPayload(f, extra = {}) {
  const v = visibleFields(f)
  const p = { purpose: f.purpose }
  const text = (k) => {
    if (v.has(k) && clean(f[k])) p[k] = clean(f[k])
  }
  const yn = (k) => {
    if (v.has(k) && f[k]) p[k] = f[k] === 'yes'
  }
  ;['source_of_lead', 'referrer_name', 'business_name', 'contact_person', 'contact_number', 'area', 'city', 'existing_gps', 'pain_area', 'lead_id', 'follow_up_reason', 'demo_outcome',
    'quotation_due_date', 'closing_reason', 'no_demo_reason', 'next_followup_date', 'quotation_outcome', 'quotation_followup_reason', 'so_number', 'remarks'].forEach(text)
  ;['coordinator_booked', 'uses_gps', 'demo_given'].forEach(yn)
  if (v.has('fleet_size') && clean(f.fleet_size)) p.fleet_size = parseInt(clean(f.fleet_size), 10)
  if (v.has('won_amount') && moneyText(f.won_amount)) p.won_amount = Number(moneyText(f.won_amount))
  if (v.has('contact_number') && normalizePhone10(f.contact_number)) p.contact_number = normalizePhone10(f.contact_number) // the 10 digits, as the server stores them
  if (extra.adopt) p.adopt = true
  if (extra.attachment_path) {
    p.attachment_path = extra.attachment_path
    p.geo_lat = extra.geo_lat
    p.geo_lng = extra.geo_lng
    if (extra.geo_accuracy_m != null) p.geo_accuracy_m = Math.round(extra.geo_accuracy_m * 100) / 100
    if (extra.captured_at) p.captured_at = extra.captured_at
  }
  return p
}

// The follow-up reason a lead may take, from the visits it already has (the same rule as fs_search_leads.allowed_reasons).
export const allowedReasonsFor = (completedCount) => (completedCount > 0 ? ['Quotation follow-up'] : ['Demo pending'])

// ── Errors ──────────────────────────────────────────────────────────────────
// `code` is the Postgres error code (23505 duplicate, 42501 refused, 22023 invalid …); `detail` carries what the function put in DETAIL
// ('adoptable:enquiry' | 'adoptable:scot' | the caller's own lead id | '').
export class VisitApiError extends Error {
  constructor(message, { code = '', detail = '', status = 0 } = {}) {
    super(message)
    this.name = 'VisitApiError'
    this.code = code
    this.detail = detail
    this.status = status
  }
  get adoptSource() {
    const m = /^adoptable:(enquiry|scot)$/.exec(this.detail || '')
    return m ? m[1] : null
  }
}

async function fail(res, fallback) {
  const text = await res.text().catch(() => '')
  let j = {}
  try {
    j = JSON.parse(text)
  } catch {
    /* not JSON */
  }
  let msg = j.message || j.hint || text || fallback || 'HTTP ' + res.status
  // PostgREST answers SQLSTATE 42501 with HTTP 403, and our own functions raise it WITH a readable message ("This lead is not assigned to you"): keep
  // that text. Only a bare auth failure or a raw table-privilege / RLS message becomes the generic one.
  if (res.status === 401 || /row-level security|permission denied/i.test(msg)) msg = "You don't have permission to do that."
  throw new VisitApiError(msg, { code: j.code || '', detail: j.details || '', status: res.status })
}

async function rpc(fn, body, fallback) {
  const res = await fetch(`${SB}/rpc/${fn}`, { method: 'POST', headers: SB_HDRS_JSON(), body: JSON.stringify(body) })
  if (!res.ok) await fail(res, fallback)
  return res.json()
}

// A dropped connection on a phone surfaces as a bare TypeError ("Failed to fetch") — say what it means.
export const friendlyError = (e) => (e instanceof TypeError ? "Couldn't reach the server — check your connection and try again. Nothing was saved." : e?.message || 'Something went wrong.')

// ── Calls ───────────────────────────────────────────────────────────────────
export const submitVisit = (payload) => rpc('submit_field_sales_visit', { p: payload }, 'Could not save the visit.')
export const findByPhone = (phone) => rpc('fs_find_by_phone', { p_phone: phone }, 'Could not check the number.')
export const searchLeads = (q) => rpc('fs_search_leads', { p_q: q }, 'Could not search the leads.')
export const getSettings = () => rpc('fs_get_settings', {}, 'Could not load the settings.')
export const setSetting = (key, value) => rpc('fs_set_setting', { p_key: key, p_value: value }, 'Could not save the setting.')

// ── Photo upload (private bucket field-sales-visits, folder = the user's own auth uid — the storage policy requires it) ──
export const PHOTO_BUCKET = 'field-sales-visits'

// The signed-in user's auth uid: the `sub` claim of the access token (no network); falls back to the session.
export async function currentUserId() {
  const sub = (token) => {
    try {
      const part = String(token || '').split('.')[1]
      if (!part) return ''
      return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))).sub || ''
    } catch {
      return ''
    }
  }
  const fromToken = sub(getAuthToken())
  if (fromToken) return fromToken
  const { data } = await authClient.auth.getSession()
  return data?.session?.user?.id || ''
}

// → the object path ("<uid>/<yyyymmdd>-<rand>.jpg"). A retry of the same submit reuses the path it already uploaded (the caller keeps it).
export async function uploadVisitPhoto(blob, uid) {
  if (!uid) throw new VisitApiError("Couldn't tell who you are — sign in again and retry.")
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${uid}/${istDate(0).replaceAll('-', '')}-${Math.random().toString(36).slice(2, 9)}.${ext}`
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${PHOTO_BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${getAuthToken() || SUPABASE_ANON}`, 'Content-Type': blob.type || 'image/jpeg', 'x-upsert': 'false' },
    body: blob,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (res.status === 404 || /bucket not found/i.test(text)) throw new VisitApiError('Photo storage is not set up yet — ask an administrator.', { status: res.status })
    if (res.status === 401 || res.status === 403 || /row-level security|unauthorized/i.test(text)) throw new VisitApiError("You don't have permission to upload the photo.", { status: res.status })
    if (res.status === 413) throw new VisitApiError('The photo is too large (10 MB at most).', { status: res.status })
    throw new VisitApiError('The photo could not be uploaded. Check your connection and try again.', { status: res.status })
  }
  return path
}

// ── The leads list (view field_sales_lead_state; RLS: own leads, or everyone's with view_all) ──
export const LEAD_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Demo not given' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'open', label: 'Open' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
]
const FILTER_PARAMS = {
  all: [],
  pending: ['lead_state=eq.pending'],
  overdue: ['followup_overdue=eq.true'],
  open: ['outcome=eq.open'],
  won: ['outcome=eq.won'],
  lost: ['outcome=eq.lost'],
}
// Delete leads (soft delete: the lead, its visits, the enquiry it created and, with it, its Sales FMS data and its MeCa meeting). The database refuses a lead that is not the
// caller's own (admins with view_all excepted) by skipping it. Resolves to { requested, deleted, skipped, visits_deleted, enquiries_deleted }.
export const deleteFieldSalesLeads = (ids) => rpc('delete_field_sales_leads', { p_ids: ids }, 'Could not delete the lead.')

export async function fetchLeadStates({ filter = 'all', page = 0, pageSize = VISITS_PAGE_SIZE } = {}) {
  const q = ['select=*', 'order=last_visit_at.desc.nullslast,lead_created_at.desc', `limit=${pageSize}`, `offset=${page * pageSize}`, ...(FILTER_PARAMS[filter] || [])]
  const res = await fetch(`${SB}/field_sales_lead_state?${q.join('&')}`, { headers: { ...SB_HDRS(), Prefer: 'count=exact' } })
  if (!res.ok) await fail(res, 'Could not load the leads.')
  const total = parseInt((res.headers.get('content-range') || '').split('/')[1], 10)
  const rows = await res.json()
  return { rows, total: Number.isFinite(total) ? total : rows.length }
}

// One lead's full row and its visits (with their state), for the read-only detail view.
export async function fetchLeadDetail(leadId) {
  const id = encodeURIComponent(leadId)
  const [leadRes, visitsRes] = await Promise.all([
    fetch(`${SB}/field_sales_leads?id=eq.${id}&select=*`, { headers: SB_HDRS() }),
    fetch(`${SB}/field_sales_visit_status?lead_id=eq.${id}&select=*&order=created_at.asc,id.asc`, { headers: SB_HDRS() }),
  ])
  if (!leadRes.ok) await fail(leadRes, 'Could not load the lead.')
  if (!visitsRes.ok) await fail(visitsRes, 'Could not load the visits.')
  const [lead] = await leadRes.json()
  return { lead: lead || null, visits: await visitsRes.json() }
}

// ── Pain Area (the one admin-managed list) ──────────────────────────────────
// Resolves to [{ id, value, is_active }] in the list's own order. RLS: a plain user gets ACTIVE rows only, an admin also the retired ones — so a form
// always goes through activePainAreas(). Cached for the session; cleared by every change.
let _painCache = null
export const clearPainAreaCache = () => {
  _painCache = null
}
export async function fetchPainAreas({ force = false } = {}) {
  if (_painCache && !force) return _painCache
  const res = await fetch(`${SB}/enquiry_dropdown_options?select=id,value,is_active,sort_order&dropdown_type=eq.${PAIN_AREA_LIST}&order=sort_order.asc.nullslast,value.asc&limit=500`, { headers: SB_HDRS() })
  if (!res.ok) await fail(res, 'Could not load the pain areas.')
  _painCache = (await res.json()).map((o) => ({ id: o.id, value: o.value, is_active: o.is_active }))
  return _painCache
}
export const activePainAreas = (list) => (list || []).filter((o) => o.is_active).map((o) => ({ value: o.value, label: o.value }))

export async function addPainArea(value) {
  const v = clean(value).replace(/\s+/g, ' ')
  if (!v) throw new Error('Enter a value to add.')
  const res = await fetch(`${SB}/enquiry_dropdown_options`, { method: 'POST', headers: SB_HDRS_REPR(), body: JSON.stringify({ dropdown_type: PAIN_AREA_LIST, value: v }) })
  if (res.status === 409) throw new Error(`"${v}" is already in this list (it may be retired — use Restore).`)
  if (!res.ok) await fail(res, 'Could not add the value.')
  clearPainAreaCache()
  const [saved] = await res.json()
  return saved
}
// Remove / Restore — is_active only. RLS turns a forbidden UPDATE into zero rows, so return=representation tells "done" from "nothing happened".
export async function setPainAreaActive(id, active) {
  const res = await fetch(`${SB}/enquiry_dropdown_options?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: SB_HDRS_REPR(), body: JSON.stringify({ is_active: !!active }) })
  if (!res.ok) await fail(res, active ? 'Could not restore the value.' : 'Could not remove the value.')
  const rows = await res.json()
  if (!rows.length) throw new Error('That value could not be changed — you may not have permission, or it no longer exists.')
  clearPainAreaCache()
  return rows[0]
}
// Rename cascades (in the database, one transaction) to every lead that holds the old name. → { id, old, new, leads_updated }
export async function renamePainArea(id, newName) {
  const out = await rpc('rename_dropdown_option', { p_id: id, p_new: newName }, 'Could not rename the value.')
  clearPainAreaCache()
  return out
}
