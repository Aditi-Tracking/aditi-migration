import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './app.css'
import { LeadCaptureAccessProvider } from '../../src/context/LeadCaptureAccessContext.jsx'
import LeadCapturePanel from '../../src/components/panels/leadcapture/LeadCapturePanel.jsx'
import * as MECA from '../../src/lib/salesMeca.js'

// The real project files over a fake data layer (no network). ?now=<ISO> pretends it is that moment, ?own=1 is a rep with own scope, ?delay=<ms> slows every summary answer.
window.__MECA = MECA
window.__rangeFor = MECA.rangeFor
window.__calls = []
const q = new URLSearchParams(location.search)
const FIXED = q.get('now') // e.g. 2026-11-08T06:30:00Z : pretend it is this moment
if (FIXED) {
  const t = new Date(FIXED).getTime()
  const Real = Date
  window.Date = class extends Real { constructor(...a) { if (a.length === 0) super(t); else super(...a) } static now() { return t } }
}
const own = q.get('own') === '1'
const iso = (ms) => new Date(ms).toISOString().slice(0, 10)
const DAY = 86400000
const parse = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()
// per day: meetings, clients, turnover (deterministic)
const dayVals = (s) => { const d = +s.slice(8, 10); const clients = d % 5 === 0 ? 1 : 0; return { meetings: (d % 3) + 1, clients, turnover: clients * 50000 } }
function bucketStart(d, bucket) {
  if (bucket === 'none') return null
  if (bucket === 'day') return d
  if (bucket === 'month') return d.slice(0, 8) + '01'
  const day = +d.slice(8, 10); return d.slice(0, 8) + String(1 + Math.min(Math.floor((day - 1) / 7), 3) * 7).padStart(2, '0') // mweek
}
function bucketEnd(start, bucket) {
  if (bucket === 'day') return start
  const y = +start.slice(0, 4), m = +start.slice(5, 7)
  if (bucket === 'month') return iso(Date.UTC(y, m - 1, dim(y, m)))
  const d = +start.slice(8, 10); return iso(Date.UTC(y, m - 1, d === 22 ? dim(y, m) : d + 6))
}
const MONTHLY = 600000 // rep 1's monthly target
function targetOf(s, e) { // prorated by calendar days, like step 25
  let sum = 0, partial = false, touched = 0
  for (let t = parse(s.slice(0, 8) + '01'); t <= parse(e); ) {
    const y = new Date(t).getUTCFullYear(), m = new Date(t).getUTCMonth() + 1, n = dim(y, m)
    const a = Math.max(t, parse(s)), b = Math.min(t + (n - 1) * DAY, parse(e))
    const days = (b - a) / DAY + 1; sum += MONTHLY * days / n; if (days < n) partial = true; touched++
    t = Date.UTC(y, m, 1)
  }
  return { amount: Math.round(sum * 100) / 100, months_set: touched, months_total: touched, prorata: partial }
}
// step 26: without proration every month the range touches counts at its WHOLE target (rep 1 has a target set for every month); a block smaller than a month has no
// target of its own (the total row has it); the day rows never have one. With proration: the share by calendar days, as before.
function targetFor(bucket, s, e, prorate) {
  if (bucket === 'day' || (!prorate && bucket === 'mweek')) return null
  if (prorate) return targetOf(s, e)
  let touched = 0, partial = false
  for (let t = parse(s.slice(0, 8) + '01'); t <= parse(e); ) {
    const y = new Date(t).getUTCFullYear(), m = new Date(t).getUTCMonth() + 1, n = dim(y, m)
    if (parse(s) > t || parse(e) < t + (n - 1) * DAY) partial = true
    touched++; t = Date.UTC(y, m, 1)
  }
  return { amount: MONTHLY * touched, months_set: touched, months_total: touched, prorata: false, ...(partial ? { full_month: true } : {}) }
}
function summary(from, to, bucket, prorate = true) {
  const buckets = new Map()
  for (let t = parse(from); t <= parse(to); t += DAY) {
    const d = iso(t); const bs = bucketStart(d, bucket); const key = String(bs)
    if (!buckets.has(key)) buckets.set(key, { start: bs, days: [] })
    buckets.get(key).days.push(d)
  }
  const reps = own ? [['ronak@adititracking.com', 'Ronak Shah']] : [['ronak@adititracking.com', 'Ronak Shah'], ['suhas@adititracking.com', 'Suhas Arthikaje']]
  const rows = []
  for (const [email, name] of reps) {
    for (const { start, days } of buckets.values()) {
      const agg = days.reduce((a, d) => { const v = dayVals(d); return { meetings: a.meetings + v.meetings, clients: a.clients + v.clients, turnover: a.turnover + v.turnover } }, { meetings: 0, clients: 0, turnover: 0 })
      const s = bucket === 'none' ? from : start; const e = bucket === 'none' ? to : bucketEnd(start, bucket)
      rows.push({ rep_email: email, rep_name: name, rep_label: null, bucket_start: start, bucket_end: start === null ? null : bucketEnd(start, bucket), ...agg, amount_n: agg.clients, target: email.startsWith('ronak') ? targetFor(bucket, bucket === 'none' ? from : s > from ? s : from, bucket === 'none' ? to : e < to ? e : to, prorate) : null })
    }
  }
  return { me: { email: 'admin@rb.test', name: 'Admin', is_all: !own, linked: true }, from, to, bucket, rows, warnings: { clients_without_amount: 0, unmapped_events: 0, unassigned_events: 0, won_without_closing_date: 0 } }
}
const json = (body, extra = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...extra } })
const realFetch = window.fetch.bind(window)
window.fetch = async (url, init = {}) => {
  const u = new URL(String(url), location.href)
  const p = u.pathname
  if (!/rb\.test/.test(u.host)) return realFetch(url, init)
  if (p.endsWith('/rpc/lc_my_access')) {
    const keys = own ? ['sales_meca_view'] : ['sales_meca_view', 'sales_meca_view_all', 'sales_meca_manage']
    return json({ tier: own ? 'lc_sales_person' : 'lc_admin', permissions: Object.fromEntries(keys.map((k) => [k, 'true'])) })
  }
  if (p.endsWith('/rpc/sales_meca_summary')) {
    const b = JSON.parse(init.body); window.__calls.push({ from: b.p_from, to: b.p_to, bucket: b.p_bucket, prorate: b.p_prorate })
    if (+q.get('delay')) await new Promise((r) => setTimeout(r, +q.get('delay'))) // ?delay=ms: a slow answer, so a click can land while it is still on its way
    return json(summary(b.p_from, b.p_to, b.p_bucket, b.p_prorate !== false))
  }
  if (p.endsWith('/rpc/sales_meca_leads')) return json([])
  return json(p.includes('/rpc/') ? {} : [])
}
createRoot(document.getElementById('root')).render(<StrictMode><LeadCaptureAccessProvider><LeadCapturePanel /></LeadCaptureAccessProvider></StrictMode>)
