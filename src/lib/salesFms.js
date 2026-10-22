// Sales FMS — the pipeline of every enquiry that has been sent to FMS: four timed stages (First Call, Demo Booked, Quotation, Negotiation) and a
// closure, each stage with a planned time, an actual time and — except Negotiation — a reason. The step after Enquiry Capture / Field Sales Form
// (they create the stage rows when a lead is sent); not to be confused with the FMS O2D order module (fms_* tables, lib/fms.js).
//
// THE RULES (enforced by the database — sql/step17; this file only restates them to draw the screen):
//   planned   First Call = the moment the lead was ENTERED (a Field Sales push uses the entry's time). Every later stage = the previous stage's
//             actual + its SLA (Demo 48 h, Quotation 48 h, Negotiation 72 h, calendar hours), written once, when the previous stage completes.
//   actual    stamped when a COMPLETING reason is picked (Booked / Done / Sent — a flag on the reason, managed in the Manage popover); any other
//             reason (RNR, No Show, Price Too high …) is a logged explanation and leaves the stage open. Negotiation's actual is entered by hand.
//   closure   Won or Lost, with a comment; a Won lead may carry an SO number and an amount (MeCa turnover reads the amount). Closing also sets
//             enquiries.status. A closed lead takes no more stage changes until an administrator reopens it.
//   who       sales_fms_view reads; sales_fms_update picks reasons, enters the negotiation time and closes — on leads the caller can already see
//             (their own, or any with enquiry_view_all); sales_fms_edit + enquiry_view_all corrects any stage and reopens.
//
// READ:  the `sales_fms` view — one flat row per sent enquiry: for each stage (fc_ / dm_ / qt_ / ng_) planned, actual, reason (not ng_) and a
//        version stamp; the closure (outcome, closed_at, closure_comment, so_number, closed_amount); and derived current_stage, current_planned_at,
//        pipeline_state, hours_overdue, age_hours. It is security_invoker, so the caller's enquiries row-level security decides which leads appear.
// WRITE: only through the security-definer functions below. Every stage write takes the stage's version stamp as the caller read it (passed back
//        UNTOUCHED — never parsed into a Date, that would lose the microseconds); a stale one is 'conflict'.
import { SUPABASE_URL, SB_HDRS, SB_HDRS_JSON, SB_HDRS_REPR } from './supabaseClient'
import { assertFilterBudget, buildFilterParams, buildOrderParam, emptyFilters } from './tableFilters'
import { clearColumnValuesCache, fetchColumnValues } from './columnValues'
import { hoursBetween } from './fmsFormat'

const SB = SUPABASE_URL + '/rest/v1'

// ── The four stages, in order, then the closure ─────────────────────────────
export const STAGES = [
  { key: 'first_call', short: 'fc', label: 'First Call', reasonType: 'fms_reason_first_call', hasReason: true, slaHours: null },
  { key: 'demo', short: 'dm', label: 'Demo Booked', reasonType: 'fms_reason_demo', hasReason: true, slaHours: 48 },
  { key: 'quotation', short: 'qt', label: 'Quotation', reasonType: 'fms_reason_quotation', hasReason: true, slaHours: 48 },
  { key: 'negotiation', short: 'ng', label: 'Negotiation', reasonType: null, hasReason: false, slaHours: 72 },
]
export const stageLabel = (key) => (key === 'closure' ? 'Closure' : STAGES.find((s) => s.key === key)?.label || key || '')
export const PIPELINE_STATE_LABELS = { overdue: 'Overdue', not_scheduled: 'Not scheduled', on_track: 'On track', closed_won: 'Won', closed_lost: 'Lost' }
export const PIPELINE_STATE_TONE = { overdue: 'danger', not_scheduled: 'warning', on_track: 'primary', closed_won: 'success', closed_lost: 'neutral' }

// ── Per-stage facts for ONE view row ───────────────────────────────────────
// state  done | current | skipped | upcoming | after-close (never reached on a closed lead)
// delayH actual − planned in hours (+ = late); cycleH actual − the previous actual (the first call's "previous" is the moment it was entered)
export function stageFacts(row, i) {
  const s = STAGES[i].short
  const planned = row[`${s}_planned`] || null
  const actual = row[`${s}_actual`] || null
  const prev = i === 0 ? row.fc_planned || null : row[`${STAGES[i - 1].short}_actual`] || null
  const laterDone = STAGES.slice(i + 1).some((x) => row[`${x.short}_actual`])
  let state = 'upcoming'
  if (actual) state = 'done'
  else if (row.current_stage === STAGES[i].key) state = 'current'
  else if (!row.current_stage) state = 'after-close'
  else if (laterDone) state = 'skipped'
  return {
    key: STAGES[i].key,
    label: STAGES[i].label,
    planned,
    actual,
    reason: STAGES[i].hasReason ? row[`${s}_reason`] || null : null,
    stamp: row[`${s}_stamp`] || null,
    delayH: actual && planned ? hoursBetween(actual, planned) : null,
    cycleH: actual && prev ? hoursBetween(actual, prev) : null,
    overdueH: state === 'current' && planned && row.hours_overdue > 0 ? row.hours_overdue : 0,
    state,
  }
}
export const isClosed = (row) => row.pipeline_state === 'closed_won' || row.pipeline_state === 'closed_lost'

// ── The list (the view) ────────────────────────────────────────────────────
export const FMS_PAGE_SIZE = 50
export const FMS_FILTER_SPEC = {
  name: { column: 'name', kind: 'checklist' },
  company: { column: 'company_name', kind: 'checklist' },
  phone: { column: 'phone', kind: 'checklist' },
  salesPerson: { column: 'sales_person_accountable', kind: 'checklist' },
  entered: { column: 'fc_planned', kind: 'dateRange', timestamp: true },
  currentStage: { column: 'current_stage', kind: 'checklist' },
  state: { column: 'pipeline_state', kind: 'checklist' },
}
export const emptyFmsFilters = () => emptyFilters(FMS_FILTER_SPEC)

// Default order: the most overdue first (what needs chasing), then the newest entered; always ends in a unique column so paging is stable.
export const FMS_DEFAULT_ORDER = 'hours_overdue.desc.nullslast,fc_planned.desc,enquiry_id.desc'
export const FMS_SORT_COLUMNS = {
  name: 'name', company: 'company_name', phone: 'phone', salesPerson: 'sales_person_accountable', entered: 'fc_planned',
  fc: 'fc_planned', dm: 'dm_planned', qt: 'qt_planned', ng: 'ng_planned',
  fcReason: 'fc_reason', dmReason: 'dm_reason', qtReason: 'qt_reason',
  closure: 'closed_at', currentStage: 'current_stage', state: 'pipeline_state', overdue: 'hours_overdue', age: 'age_hours',
}
export const FMS_SORT_KINDS = {
  name: 'text', company: 'text', phone: 'text', salesPerson: 'text', entered: 'date', fc: 'date', dm: 'date', qt: 'date', ng: 'date',
  fcReason: 'text', dmReason: 'text', qtReason: 'text', closure: 'date', currentStage: 'text', state: 'text', overdue: 'number', age: 'number',
}
const VALUE_KEYS = ['name', 'company', 'phone', 'salesPerson']

function filterParams(filters, omit) {
  const spec = omit ? Object.fromEntries(Object.entries(FMS_FILTER_SPEC).filter(([k]) => k !== omit)) : FMS_FILTER_SPEC
  const params = buildFilterParams(spec, filters)
  assertFilterBudget(params)
  return params
}

async function httpError(res, fallback) {
  const text = await res.text().catch(() => '')
  let msg = text
  let code = ''
  try {
    const j = JSON.parse(text)
    msg = j.message || j.hint || text
    code = j.code || ''
  } catch {
    /* not JSON — use the raw text */
  }
  if (res.status === 401 || res.status === 403 || code === '42501' || /row-level security|42501|not authorised/i.test(msg || '')) return { code: 'denied', message: "You don't have permission to do that." }
  if (code === '40001') return { code: 'conflict', message: msg }
  if (code === 'P0002') return { code: 'gone', message: msg }
  return { code: code === '22023' || code === '22007' || code === '23514' ? 'invalid' : 'error', message: msg || fallback || 'HTTP ' + res.status }
}
// code: 'conflict' (someone saved first — reload), 'denied', 'gone' (no longer in the pipeline), 'invalid' (a rule — the message says which), 'error'
export class FmsError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}
const fail = async (res, fallback) => {
  const { code, message } = await httpError(res, fallback)
  throw new FmsError(code, message)
}

export async function fetchSalesFms({ filters = {}, sort = null, page = 0, pageSize = FMS_PAGE_SIZE } = {}) {
  const q = ['select=*', buildOrderParam(FMS_SORT_COLUMNS, sort, FMS_DEFAULT_ORDER), `limit=${pageSize}`, `offset=${page * pageSize}`, ...filterParams(filters)]
  const res = await fetch(`${SB}/sales_fms?${q.join('&')}`, { headers: { ...SB_HDRS(), Prefer: 'count=exact' } })
  if (!res.ok) await fail(res, 'Could not load the pipeline.')
  const total = parseInt((res.headers.get('content-range') || '').split('/')[1], 10)
  const rows = await res.json()
  return { rows, total: Number.isFinite(total) ? total : rows.length }
}

// ONE lead's row, freshly read (null when it is gone, deleted or hidden) — after a write the list patches just that row.
export async function fetchSalesFmsRow(enquiryId) {
  const res = await fetch(`${SB}/sales_fms?enquiry_id=eq.${encodeURIComponent(enquiryId)}&select=*`, { headers: SB_HDRS() })
  if (!res.ok) await fail(res, 'Could not re-read the lead.')
  const rows = await res.json()
  return rows[0] || null
}

// The distinct values of a text column for its filter checklist, given the OTHER columns' filters (see lib/columnValues.js).
export function fetchSalesFmsColumnValues(key, filters = {}) {
  if (!VALUE_KEYS.includes(key)) return Promise.reject(new Error(`No value list for "${key}".`))
  let params
  try {
    params = filterParams(filters, key)
  } catch (e) {
    return Promise.reject(e)
  }
  return fetchColumnValues({ table: 'sales_fms', column: FMS_FILTER_SPEC[key].column, params })
}

// The strip: { counts: { total, overdue, not_scheduled, on_track, won, lost }, stages: [{ stage, avg_delay_h, delay_n, avg_cycle_h, cycle_n } × 4] }
// — counted for what the CALLER may see. Averages are null where nothing qualifies.
export async function fetchSalesFmsSummary() {
  const res = await fetch(`${SB}/rpc/sales_fms_summary`, { method: 'POST', headers: SB_HDRS_JSON(), body: '{}' })
  if (!res.ok) await fail(res, 'Could not load the summary.')
  return res.json()
}

// ── The reason lists (managed values, one list per stage) ──────────────────
// → { first_call: [{ id, value, is_active, sort_order, completes_stage }], demo: [...], quotation: [...] }. Retired values are included for whoever
// may manage the lists (RLS). Cached for the session; cleared by every change made from the Manage popover.
let _reasonCache = null
export const clearFmsReasonCache = () => {
  _reasonCache = null
}
export async function fetchFmsReasons({ force = false } = {}) {
  if (_reasonCache && !force) return _reasonCache
  const types = STAGES.filter((s) => s.reasonType).map((s) => s.reasonType)
  const res = await fetch(`${SB}/enquiry_dropdown_options?select=id,dropdown_type,value,is_active,sort_order,completes_stage&dropdown_type=in.(${types.join(',')})&limit=1000`, { headers: SB_HDRS() })
  if (!res.ok) await fail(res, 'Could not load the reasons.')
  const rows = await res.json()
  const grouped = Object.fromEntries(STAGES.filter((s) => s.reasonType).map((s) => [s.key, []]))
  rows.forEach((r) => {
    const stage = STAGES.find((s) => s.reasonType === r.dropdown_type)
    if (stage) grouped[stage.key].push({ id: r.id, value: r.value, is_active: r.is_active, sort_order: r.sort_order, completes_stage: !!r.completes_stage })
  })
  Object.values(grouped).forEach((list) => list.sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity) || a.value.localeCompare(b.value)))
  _reasonCache = grouped
  return grouped
}
// The choices of a stage's reason cell: ACTIVE values in list order; a reason the row holds that has since been retired stays selectable-as-shown.
export const reasonOptions = (reasons, stageKey) => (reasons?.[stageKey] || []).filter((o) => o.is_active).map((o) => ({ value: o.value, label: o.value }))
export const completesStage = (reasons, stageKey, value) => !!(reasons?.[stageKey] || []).find((o) => o.value === value)?.completes_stage

// "Moves the stage on" (true) or "Note only" (false) for one reason — the same permission as retiring / restoring it. RLS silently filters a
// forbidden UPDATE to zero rows, so return=representation tells "done" from "nothing happened".
export async function setReasonCompletes(id, completes) {
  const res = await fetch(`${SB}/enquiry_dropdown_options?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: SB_HDRS_REPR(), body: JSON.stringify({ completes_stage: !!completes }) })
  if (!res.ok) await fail(res, 'Could not change the reason.')
  const rows = await res.json()
  if (!rows.length) throw new FmsError('denied', 'That reason could not be changed — you may not have permission, or it no longer exists.')
  clearFmsReasonCache()
  return { id: rows[0].id, completes_stage: rows[0].completes_stage }
}

// ── Writes ─────────────────────────────────────────────────────────────────
async function rpc(fn, body, fallback) {
  const res = await fetch(`${SB}/rpc/${fn}`, { method: 'POST', headers: SB_HDRS_JSON(), body: JSON.stringify(body) })
  if (!res.ok) await fail(res, fallback)
  clearColumnValuesCache() // a lead's stage / state may have changed what the filter lists should offer
  return res.json()
}

// reason: a value of that stage's list, or ''/null to clear it. A COMPLETING reason also stamps the stage's actual (once) and plans the next stage.
// stamp: the stage's version stamp as the list row carried it (fc_stamp / dm_stamp / qt_stamp). → { stamp, actual_at }
export const setStageReason = (enquiryId, stage, reason, stamp) =>
  rpc('set_fms_stage_reason', { p_enquiry: enquiryId, p_stage: stage, p_reason: reason || null, p_stamp: stamp }, 'Could not save the reason.')

// The negotiation time, entered by hand: an ISO timestamp (see fmsFormat.inputToMoment). → { stamp, actual_at }
export const setNegotiationActual = (enquiryId, actualIso, stamp) =>
  rpc('set_fms_negotiation_actual', { p_enquiry: enquiryId, p_actual: actualIso, p_stamp: stamp }, 'Could not save the negotiation time.')

// outcome 'won' | 'lost'. soNumber and amount only for a Won lead. closedAt (ISO) only for an administrator's correction; otherwise the database uses now.
export const closeLead = ({ enquiryId, outcome, comment = '', soNumber = '', amount = null, closedAt = null }) =>
  rpc('close_fms_lead', { p_enquiry: enquiryId, p_outcome: outcome, p_comment: comment || null, p_so_number: soNumber || null, p_amount: amount === '' ? null : amount, p_closed_at: closedAt || null }, 'Could not close the lead.')

// Administrator: removes the closure and sets the status back to Interested.
export const reopenLead = (enquiryId) => rpc('reopen_fms_lead', { p_enquiry: enquiryId }, 'Could not reopen the lead.')

// Administrator: correct one stage. patch: { planned_at?, actual_at?, reason? } — ISO timestamps / a reason value; null clears. An actual where
// there was none plans the next stage. → { stamp }
export const saveStage = (enquiryId, stage, patch, stamp) => rpc('save_fms_stage', { p_enquiry: enquiryId, p_stage: stage, p_patch: patch, p_stamp: stamp }, 'Could not save the stage.')
