// Sales Rep MeCa — a read-only report of how each sales rep is doing: meetings held, clients won, conversion, turnover and
// average sale, against a monthly turnover target. The fourth tab of Lead Capture; it reports on what the other three tabs capture.
//
// WHAT COUNTS (decided and enforced by the database — see sql/step13 / step17: meca_events, sales_meca_summary):
//   Meeting  every Field Sales Form entry (on the day it was submitted, IST), plus every other sent lead's DEMO stage in Sales FMS once its
//            reason is a completing one ("Done") — on the day that was stamped (a lead that came through the Field Sales Form is never counted twice).
//   Client   a lead with a WON closure in the period (Sales FMS Close lead) whose status is Won right now.
//   Turnover the sum of those clients' closure amounts.        Avg Rs Sale = turnover ÷ clients that HAVE an amount.
//   Conversion = clients ÷ meetings of the same period (event-based, so it can pass 100%); "—" when there were no meetings.
// Who a lead belongs to is the admin-managed link between a Sales Person label and an employee (meca_resolve_rep); a label nobody
// has linked yet is reported as its own "Unmapped: <label>" row, and a blank one as "Unassigned", so no number is ever lost.
//
// READ:  sales_meca_summary(from, to, bucket) — one row per rep × bucket (zeros included), with warnings; sales_meca_leads for the
//        lead lists behind a number. A plain rep gets only their own rows; view_all gets everyone's.
// WRITE: set_sales_rep_alias / remove_sales_rep_alias / set_sales_rep_targets, admin only (sales_meca_manage + view_all).
// Dates are IST calendar dates as YYYY-MM-DD strings; whole-day arithmetic, no time zones. The weeks of a month's breakdown are by date:
// W1 = 1–7, W2 = 8–14, W3 = 15–21, W4 = 22–end of month. Quarters and years are calendar ones (Jan–Mar …).
//
// ROLL-UP RULE: a total is the SUM of the counts and amounts underneath it and the ratios are recomputed from those sums — never an
// average of ratios. A company target is the sum of the targets of the reps who have one, and the company "% of target" only
// measures the turnover of those same reps.
import { SUPABASE_URL, SB_HDRS_JSON } from './supabaseClient'

const SB = SUPABASE_URL + '/rest/v1'

// ── Period selection ───────────────────────────────────────────────────────
export const GRANULARITIES = [
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
]

const pad = (n) => String(n).padStart(2, '0')
const mkIso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}` // m is 1-12
const ymd = (s) => [+s.slice(0, 4), +s.slice(5, 7), +s.slice(8, 10)]
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()
export const monthStart = (s) => s.slice(0, 8) + '01'
export const monthEnd = (s) => {
  const [y, m] = ymd(s)
  return mkIso(y, m, daysIn(y, m))
}
export function addMonths(s, n) {
  const [y, m] = ymd(s)
  const t = y * 12 + (m - 1) + n
  return mkIso(Math.floor(t / 12), (t % 12) + 1, 1)
}
export const quarterStart = (s) => {
  const [y, m] = ymd(s)
  return mkIso(y, Math.floor((m - 1) / 3) * 3 + 1, 1)
}
export const yearStart = (s) => s.slice(0, 4) + '-01-01'
export const weekIndex = (s) => Math.min(Math.floor((+s.slice(8, 10) - 1) / 7), 3) // 0..3 = W1..W4

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthLong = (s) => MONTHS[+s.slice(5, 7) - 1]
const monthShort = (s) => monthLong(s).slice(0, 3)

// The canonical anchor (start date) of the period that contains `iso`, for each granularity.
export function anchorFor(gran, iso) {
  if (gran === 'month') return monthStart(iso)
  if (gran === 'quarter') return quarterStart(iso)
  if (gran === 'year') return yearStart(iso)
  return iso
}

// One step back (dir -1) or forward (+1) from an anchor.
export function shiftAnchor(gran, anchor, dir) {
  if (gran === 'month') return addMonths(anchor, dir)
  if (gran === 'quarter') return addMonths(anchor, dir * 3)
  if (gran === 'year') return mkIso(+anchor.slice(0, 4) + dir, 1, 1)
  return anchor
}

// What to ask the database for, given the selection { gran, anchor }.
//   bucket        how the range is broken down (the period rows of a rep's detail): a month by week, a quarter by month, a year by quarter
//   totalsBucket  how the same range is asked for ONE row per rep, only to get the target of the whole range (always one total)
// → { from, to, bucket, totalsBucket, label, error }
export function periodFor({ gran, anchor }) {
  if (gran === 'month') return { from: anchor, to: monthEnd(anchor), bucket: 'mweek', totalsBucket: 'none', label: `${monthLong(anchor)} ${anchor.slice(0, 4)}`, error: '' }
  if (gran === 'quarter') {
    const end = addMonths(anchor, 2)
    return { from: anchor, to: monthEnd(end), bucket: 'month', totalsBucket: 'none', label: `Q${Math.floor((+anchor.slice(5, 7) - 1) / 3) + 1} ${anchor.slice(0, 4)} (${monthShort(anchor)}–${monthShort(end)})`, error: '' }
  }
  return { from: anchor, to: mkIso(+anchor.slice(0, 4), 12, 31), bucket: 'quarter', totalsBucket: 'none', label: anchor.slice(0, 4), error: '' }
}

// The row label of one bucket. `multiMonth` / `multiYear`: the range spans several months / years, so the label must say which.
export function bucketLabel(bucket, start, end, { multiMonth = false, multiYear = false } = {}) {
  const year = multiYear ? ` ${start.slice(0, 4)}` : ''
  if (bucket === 'mweek') return `${multiMonth ? monthShort(start) + year + ' ' : ''}W${weekIndex(start) + 1} · ${+start.slice(8, 10)}–${+end.slice(8, 10)}`
  if (bucket === 'month') return `${monthLong(start)} ${start.slice(0, 4)}`
  if (bucket === 'quarter') return `Q${Math.floor((+start.slice(5, 7) - 1) / 3) + 1} ${start.slice(0, 4)} · ${monthShort(start)}–${monthShort(end)}`
  if (bucket === 'year') return start.slice(0, 4)
  return ''
}

// ── Numbers ────────────────────────────────────────────────────────────────
export { fmtMoney } from './fmsFormat'
// An average sale in whole rupees — ₹1,16,667, not ₹1,16,666.67 (the stored amounts keep their paise; an average does not need them)
export const fmtAvg = (n) => (n === null || n === undefined || Number.isNaN(n) ? '—' : '₹' + Math.round(n).toLocaleString('en-IN'))
export const fmtPct = (p, digits = 0) => (p === null || p === undefined || Number.isNaN(p) ? '—' : `${(p * 100).toFixed(digits)}%`)
export const fmtCount = (n) => (n === null || n === undefined ? '—' : String(Math.round(n * 10) / 10))
export const SOURCE_LABELS = { field_sales_form: 'Field Sales Form', pipeline: 'Sales FMS' }

// ── The report model ───────────────────────────────────────────────────────
// A cell is one rep (or the company) in one bucket (or the whole range):
//   meetings, clients, turnover, amountN (clients that have an amount)
//   target      the target for it, or null if none applies
//   tTurnover   the turnover that is measured AGAINST that target (= turnover when a target exists, else 0) — what makes a company
//               "% of target" cover only the reps who have one
//   note        { partial, prorata, monthsSet, monthsTotal, reps } describing the target, or null
const emptyCell = () => ({ meetings: 0, clients: 0, turnover: 0, amountN: 0, target: null, tTurnover: 0, note: null })
function cellOf(row) {
  const t = row.target
  return {
    meetings: Number(row.meetings),
    clients: Number(row.clients),
    turnover: Number(row.turnover),
    amountN: Number(row.amount_n),
    target: t ? Number(t.amount) : null,
    tTurnover: t ? Number(row.turnover) : 0,
    note: t ? { partial: t.months_set < t.months_total, prorata: !!t.prorata, monthsSet: t.months_set, monthsTotal: t.months_total, reps: 1 } : null,
  }
}
export function addCells(a, b) {
  const target = a.target === null && b.target === null ? null : (a.target || 0) + (b.target || 0)
  const note = !a.note ? b.note : !b.note ? a.note : { partial: a.note.partial || b.note.partial, prorata: a.note.prorata || b.note.prorata, monthsSet: a.note.monthsSet, monthsTotal: a.note.monthsTotal, reps: a.note.reps + b.note.reps }
  return { meetings: a.meetings + b.meetings, clients: a.clients + b.clients, turnover: a.turnover + b.turnover, amountN: a.amountN + b.amountN, target, tTurnover: a.tTurnover + b.tTurnover, note }
}
// The derived columns of a cell. null = nothing to show ("—").
export function metrics(c) {
  return {
    conversion: c.meetings > 0 ? c.clients / c.meetings : null,
    avgSale: c.amountN > 0 ? c.turnover / c.amountN : null,
    pct: c.target ? c.tTurnover / c.target : null,
    gap: c.target !== null ? c.target - c.tTurnover : null,
  }
}
// The data-quality warnings of the selected period, as sentences. Admin-only ones (unmapped / unassigned / no closing date) are left out for a rep.
export function warningLines(w, isAll) {
  const lines = []
  const one = (v) => v === 1
  if (w.clients_without_amount > 0) lines.push(`${w.clients_without_amount} ${one(w.clients_without_amount) ? 'won client has' : 'won clients have'} no closing amount (left out of Turnover and Avg Rs Sale)`)
  if (isAll && w.unmapped_events > 0) lines.push(`${w.unmapped_events} ${one(w.unmapped_events) ? 'meeting or client belongs' : 'meetings and clients belong'} to a Sales Person name not linked to an employee`)
  if (isAll && w.unassigned_events > 0) lines.push(`${w.unassigned_events} ${one(w.unassigned_events) ? 'meeting or client has' : 'meetings and clients have'} no Sales Person at all`)
  if (isAll && w.won_without_closing_date > 0) lines.push(`${w.won_without_closing_date} ${one(w.won_without_closing_date) ? 'won lead has' : 'won leads have'} no closing date in Sales FMS (not counted anywhere)`)
  return lines
}

// ── Value bands (the cell colours) ─────────────────────────────────────────
// Turnover (and "% of target") is judged against the rep's OWN target; Avg Rs Sale and Conversion against the COMPANY figure of the same
// period. A band is decided on the unrounded ratio (59.6% shows as "60%" but is red). No ratio — no target, no sales, no meetings, no company
// figure to compare with — means no colour. Meetings, Clients, Target, Gap and the company's own row are never coloured.
export const BAND_RULES = {
  turnover: { lo: 0.6, hi: 1, against: 'own target', ranges: ['under 60%', '60–99%', '100% or more'] },
  relative: { lo: 0.7, hi: 1, against: 'the company figure', ranges: ['under 70%', '70–99%', '100% or more'] },
}
const BAND_NAMES = ['red', 'amber', 'green']
const bandOf = (ratio, { lo, hi }) => (ratio === null || !Number.isFinite(ratio) ? null : ratio < lo ? 'red' : ratio < hi ? 'amber' : 'green')
const bandTip = (ratio, rule) => {
  const band = bandOf(ratio, rule)
  return band ? `${Math.round(ratio * 100)}% of ${rule.against} — ${band} (${rule.ranges[BAND_NAMES.indexOf(band)]})` : ''
}
// → { turnover, pct, avgSale, conversion }, each { band: 'red'|'amber'|'green'|null, tip } — `company` is the company cell of the same period (null when
// the viewer cannot see the company, or for the company's own row).
export function cellBands(cell, company) {
  const m = metrics(cell)
  const cm = company ? metrics(company) : null
  const rel = (v, c) => (v === null || c === null || c === undefined || !(c > 0) ? null : v / c)
  const make = (ratio, rule) => ({ band: bandOf(ratio, rule), tip: bandTip(ratio, rule) })
  return {
    turnover: make(m.pct, BAND_RULES.turnover),
    pct: make(m.pct, BAND_RULES.turnover),
    avgSale: make(rel(m.avgSale, cm?.avgSale), BAND_RULES.relative),
    conversion: make(rel(m.conversion, cm?.conversion), BAND_RULES.relative),
  }
}

// An "average per bucket" cell (the quarter view's Avg / month row): counts and amounts divided by n; ratios stay those of the whole.
export const avgCell = (c, n) => ({ ...c, meetings: c.meetings / n, clients: c.clients / n, turnover: c.turnover / n, target: c.target === null ? null : c.target / n, tTurnover: c.tTurnover / n })

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
const repKey = (r) => r.rep_email || 'label:' + norm(r.rep_label)

// summary / totals: the two sales_meca_summary results (broken down; one row per rep). → the report the screen draws:
// { me, warnings, buckets: [{ start, end }], reps: [{ key, email, label, name, unmapped, cells[], total }], company: { cells[], total } }
// A rep's counts are summed from its bucket cells (so the rows always add up to the total shown); only its TOTAL TARGET comes from the
// second call, because that is a different rule (a whole-month target, not the sum of pro-rata weeks).
export function buildReport(summary, totals) {
  const starts = [...new Set(summary.rows.map((r) => r.bucket_start))].sort()
  const at = new Map(starts.map((s, i) => [s, i]))
  const buckets = starts.map((s) => ({ start: s, end: summary.rows.find((r) => r.bucket_start === s).bucket_end }))
  const byKey = new Map()
  for (const r of summary.rows) {
    const key = repKey(r)
    if (!byKey.has(key)) byKey.set(key, { key, email: r.rep_email, label: r.rep_label, name: r.rep_name, unmapped: !r.rep_email, cells: starts.map(emptyCell) })
    byKey.get(key).cells[at.get(r.bucket_start)] = cellOf(r)
  }
  const wholeTarget = new Map((totals?.rows || []).map((r) => [repKey(r), r.target]))
  const reps = [...byKey.values()]
  for (const rep of reps) {
    const sum = rep.cells.reduce(addCells, emptyCell())
    const t = wholeTarget.get(rep.key)
    rep.total = t ? { ...sum, target: Number(t.amount), tTurnover: sum.turnover, note: { partial: t.months_set < t.months_total, prorata: !!t.prorata, monthsSet: t.months_set, monthsTotal: t.months_total, reps: 1 } } : { ...sum, target: null, tTurnover: 0, note: null }
  }
  const company = { cells: starts.map((_, i) => reps.reduce((acc, r) => addCells(acc, r.cells[i]), emptyCell())), total: reps.reduce((acc, r) => addCells(acc, r.total), emptyCell()) }
  return { me: summary.me, warnings: summary.warnings, buckets, reps, company }
}

// Sort the rep rows. Unmapped / Unassigned rows always stay at the bottom, whatever the sort; a missing value sorts last either way.
const SORT_VALUE = {
  name: (r) => r.name.toLowerCase(),
  meetings: (r) => r.total.meetings,
  clients: (r) => r.total.clients,
  conversion: (r) => metrics(r.total).conversion,
  turnover: (r) => r.total.turnover,
  avgSale: (r) => metrics(r.total).avgSale,
  target: (r) => r.total.target,
  pct: (r) => metrics(r.total).pct,
  gap: (r) => metrics(r.total).gap,
}
export const MECA_SORT_KINDS = { name: 'text', meetings: 'number', clients: 'number', conversion: 'number', turnover: 'number', avgSale: 'number', target: 'number', pct: 'number', gap: 'number' }
export function sortReps(reps, sort) {
  const rank = (r) => (r.unmapped ? 1 : 0)
  const get = sort && SORT_VALUE[sort.key]
  const dir = sort?.dir === 'desc' ? -1 : 1
  return reps
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      if (rank(a.r) !== rank(b.r)) return rank(a.r) - rank(b.r)
      if (get) {
        const x = get(a.r)
        const y = get(b.r)
        if ((x === null) !== (y === null)) return x === null ? 1 : -1
        if (x !== y && x !== null) return (x < y ? -1 : 1) * dir
      }
      return a.i - b.i
    })
    .map((x) => x.r)
}

// ── Targets editor ─────────────────────────────────────────────────────────
export const monthsOfYear = (year) => Array.from({ length: 12 }, (_, i) => mkIso(year, i + 1, 1))

// From a year summarised by month: the reps (in the report's order) and what each has stored — { [email]: { [month]: '120000' } }.
export function targetsFromSummary(summary) {
  const reps = []
  const stored = {}
  for (const r of summary.rows) {
    if (!r.rep_email) continue
    if (!stored[r.rep_email]) {
      stored[r.rep_email] = {}
      reps.push({ email: r.rep_email, name: r.rep_name })
    }
    if (r.target) stored[r.rep_email][r.bucket_start] = String(r.target.amount)
  }
  return { reps, stored }
}

// What changed between what was loaded and what was typed ({ [email]: { [month]: text } }, '' = no target). Only changed months are
// sent. → { changes: [{ email, items: [{ month, amount }] }], error }  (amount null clears the month)
export function diffTargets(stored, form) {
  const changes = []
  for (const email of Object.keys(form)) {
    const items = []
    for (const month of Object.keys(form[email])) {
      const text = String(form[email][month] ?? '').trim()
      const was = stored[email]?.[month] ?? ''
      let amount = null
      if (text !== '') {
        amount = Number(text)
        if (!Number.isFinite(amount) || amount < 0) return { changes: [], error: `A target must be a number, 0 or more (${monthLong(month)} ${month.slice(0, 4)}: "${text}").` }
      }
      const before = was === '' ? null : Number(was)
      if (amount !== before) items.push({ month, amount })
    }
    if (items.length) changes.push({ email, items })
  }
  return { changes, error: '' }
}

// ── Database calls ─────────────────────────────────────────────────────────
// code: 'denied', 'invalid' (a rule — the message says which), 'error'
export class MecaError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}
async function rpc(fn, body, fallback) {
  const res = await fetch(`${SB}/rpc/${fn}`, { method: 'POST', headers: SB_HDRS_JSON(), body: JSON.stringify(body) })
  if (!res.ok) {
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
    if (res.status === 401 || res.status === 403 || code === '42501' || /not authorised|row-level security/i.test(msg || '')) throw new MecaError('denied', "You don't have permission to do that.")
    throw new MecaError(code === '22023' ? 'invalid' : 'error', msg || fallback || 'HTTP ' + res.status)
  }
  return res.json()
}

// → { me: { email, name, is_all, linked }, from, to, bucket, rows: [{ rep_email, rep_name, rep_label, bucket_start, bucket_end, meetings, clients,
//     turnover, amount_n, target }], warnings: { clients_without_amount, unmapped_events, unassigned_events, won_without_closing_date } }
export const fetchMecaSummary = ({ from, to, bucket }) => rpc('sales_meca_summary', { p_from: from, p_to: to, p_bucket: bucket }, 'Could not load the report.')

// The leads behind a number. kind 'meetings' | 'clients'. A rep always gets their own, whatever is asked; an admin names a rep by
// e-mail, or an unmapped label by repLabel (repEmail null). → [{ kind, source, date, name, company, amount, enquiry_id }] (at most 500)
export const MECA_LEADS_LIMIT = 500
export const fetchMecaLeads = ({ repEmail = null, repLabel = null, from, to, kind }) =>
  rpc('sales_meca_leads', { p_rep_email: repEmail, p_rep_label: repLabel, p_from: from, p_to: to, p_kind: kind }, 'Could not load the leads.')

// Admin: → { labels: [{ label, label_key, leads, rep_email, rep_name, via: 'alias'|'name'|'email'|'none', suggestions: [{ email, name, dept }] }],
//            employees: [{ email, name, dept }] } — unlinked labels first
export const fetchMecaDirectory = () => rpc('meca_directory', {}, 'Could not load the sales people.')
export const setSalesRepAlias = (label, repEmail) => rpc('set_sales_rep_alias', { p_label: label, p_rep_email: repEmail }, 'Could not save the link.')
export const removeSalesRepAlias = (label) => rpc('remove_sales_rep_alias', { p_label: label }, 'Could not remove the link.')
// items: [{ month: 'YYYY-MM-01', amount: number | null }] (null clears that month), 1–36 of them. → { set, cleared }
export const setSalesRepTargets = (repEmail, items) => rpc('set_sales_rep_targets', { p_rep_email: repEmail, p_items: items }, 'Could not save the targets.')
