import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './app.css'
import { LeadCaptureAccessProvider } from '../../src/context/LeadCaptureAccessContext.jsx'
import LeadCapturePanel from '../../src/components/panels/leadcapture/LeadCapturePanel.jsx'

const q = new URLSearchParams(location.search)
const H = 3600 * 1000
const iso = (ms) => new Date(Date.now() + ms).toISOString()
// a known pipeline: [current stage (null = closed), pipeline state, outcome]
const SPEC = [
  ...Array(3).fill(['first_call', 'overdue', null]),
  ...Array(2).fill(['demo', 'overdue', null]), ...Array(2).fill(['demo', 'on_track', null]),
  ...Array(3).fill(['quotation', 'overdue', null]), ...Array(2).fill(['quotation', 'not_scheduled', null]),
  ...Array(2).fill(['negotiation', 'overdue', null]),
  ...Array(2).fill(['closure', 'on_track', null]),
  ...Array(2).fill([null, 'closed_won', 'won']), [null, 'closed_lost', 'lost'],
]
const ORDER = ['first_call', 'demo', 'quotation', 'negotiation', 'closure']
function mkRow([stage, pstate, outcome], i) {
  const at = stage ? ORDER.indexOf(stage) : 4
  const done = (n) => at >= n
  return {
    enquiry_id: `e-${i}`, enquiry_date: '2026-11-03', name: `Lead ${stage || outcome} ${i}`, company_name: `Co ${i}`, phone: `90000${String(i).padStart(5, '0')}`, email: null, requirement: ['AIS 140'], source: 'Meta',
    sales_person_accountable: 'Ronak', client_type: null, status: outcome || 'interested', entry_channel: 'portal_form', sent_to_fms_at: iso(-50 * H), created_at: iso(-50 * H),
    fc_planned: iso(-50 * H), fc_actual: done(1) ? iso(-48 * H) : null, fc_reason: done(1) ? 'Booked' : null, fc_stamp: iso(-48 * H),
    dm_planned: iso(-10 * H), dm_actual: done(2) ? iso(-30 * H) : null, dm_reason: done(2) ? 'Done' : null, dm_stamp: iso(-30 * H),
    qt_planned: iso(-5 * H), qt_actual: done(3) ? iso(-20 * H) : null, qt_reason: done(3) ? 'Sent' : null, qt_stamp: iso(-20 * H),
    ng_planned: iso(-2 * H), ng_actual: done(4) && stage === 'closure' ? iso(-10 * H) : null, ng_stamp: iso(-10 * H),
    outcome, closed_at: outcome ? iso(-1 * H) : null, closure_comment: null, so_number: null, closed_amount: null, closure_stamp: null,
    current_stage: stage, current_planned_at: iso(-3 * H), pipeline_state: pstate, hours_overdue: pstate === 'overdue' ? 3 : null, last_actual_at: null, age_hours: 50, stages_updated_at: iso(-1 * H),
  }
}
const ROWS = SPEC.map(mkRow)
window.__rows = ROWS
window.__log = []
window.__reqs = []
const REASONS = [['fms_reason_first_call', 'Booked', true], ['fms_reason_first_call', 'RNR', false], ['fms_reason_demo', 'Done', true], ['fms_reason_quotation', 'Sent', true]]
const json = (body, extra = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...extra } })
const realFetch = window.fetch.bind(window)
window.fetch = async (url, init = {}) => {
  const u = new URL(String(url), location.href)
  const p = u.pathname
  window.__reqs.push({ path: p, search: decodeURIComponent(u.search) })
  window.__log.push((init.method || 'GET') + ' ' + p.split('/rest/v1/')[1] + u.search.slice(0, 60))
  if (!/rb\.test/.test(u.host)) return realFetch(url, init)
  if (p.endsWith('/rpc/lc_my_access')) return json({ tier: 'lc_admin', permissions: Object.fromEntries(['enquiry_view', 'enquiry_create', 'enquiry_view_all', 'enquiry_assign_fms', 'enquiry_manage_dropdowns', 'enquiry_delete', 'enquiry_delete_sent', 'field_sales_form_view', 'field_sales_form_create', 'field_sales_form_view_all', 'field_sales_form_delete', 'field_sales_form_manage_dropdowns', 'sales_fms_view', 'sales_fms_update', 'sales_fms_edit', 'sales_meca_view', 'sales_meca_view_all', 'sales_meca_manage', 'scot_view', 'scot_create', 'scot_update', 'scot_view_all', 'scot_manage_dropdowns'].map((k) => [k, 'true'])) })
  if (p.endsWith('/rpc/sales_fms_summary')) {
    const open = ROWS.filter((r) => !r.outcome), cnt = (f) => ROWS.filter(f).length
    const counts = { total: ROWS.length, overdue: cnt((r) => r.pipeline_state === 'overdue'), not_scheduled: cnt((r) => r.pipeline_state === 'not_scheduled'), on_track: cnt((r) => r.pipeline_state === 'on_track'),
      won: cnt((r) => r.outcome === 'won'), lost: cnt((r) => r.outcome === 'lost') }
    if (!q.get('old')) Object.assign(counts, { open: open.length, ...Object.fromEntries(ORDER.map((k) => ['stage_' + k, open.filter((r) => r.current_stage === k).length])) })
    const stages = [5, 50.4, 20, 74].map((h, i) => ({ stage: ['first_call', 'demo', 'quotation', 'negotiation'][i], avg_delay_h: 1, delay_n: 3, avg_cycle_h: h, cycle_n: 3 }))
    return json({ counts, stages })
  }
  if (p.endsWith('/rpc/close_fms_lead')) {
    const b = JSON.parse(init.body); window.__closeBody = b; const r = ROWS.find((x) => x.enquiry_id === b.p_enquiry)
    if (q.get('failclose')) return new Response(JSON.stringify({ code: '22023', message: 'boom' }), { status: 400, headers: { 'content-type': 'application/json' } })
    Object.assign(r, { outcome: b.p_outcome, closed_at: new Date().toISOString(), closure_comment: b.p_comment, so_number: b.p_so_number, closed_amount: b.p_amount, closure_stamp: new Date().toISOString(), current_stage: null, pipeline_state: b.p_outcome === 'won' ? 'closed_won' : 'closed_lost', status: b.p_outcome, hours_overdue: null, current_planned_at: null })
    await new Promise((res) => setTimeout(res, Number(q.get('latency') || 150)))
    return json({ outcome: b.p_outcome, closed_at: r.closed_at })
  }
  if (p.endsWith('/sales_fms')) {
    const id = u.searchParams.get('enquiry_id')
    if (id) return json(ROWS.filter((r) => 'eq.' + r.enquiry_id === id))
    const inList = (name) => { const m = (u.searchParams.get(name) || '').match(/^in\.\((.*)\)$/); return m ? m[1].split(',').map((x) => x.replace(/^"|"$/g, '')) : null }
    const cs = inList('current_stage'), ps = inList('pipeline_state')
    const out = ROWS.filter((r) => (!cs || cs.includes(r.current_stage)) && (!ps || ps.includes(r.pipeline_state)))
    return json(out, { 'content-range': `0-${Math.max(out.length - 1, 0)}/${out.length}` })
  }
  if (p.endsWith('/enquiry_dropdown_options')) {
    const t = (u.searchParams.get('dropdown_type') || '').replace('eq.', '')
    return json(REASONS.filter(([ty]) => !t || t === ty || /in\./.test(u.searchParams.get('dropdown_type') || '')).map(([dropdown_type, value, completes_stage], i) => ({ id: 'o' + i, dropdown_type, value, is_active: true, sort_order: i, completes_stage })))
  }
  return json(p.includes('/rpc/') ? {} : [])
}
createRoot(document.getElementById('root')).render(<StrictMode><LeadCaptureAccessProvider><LeadCapturePanel /></LeadCaptureAccessProvider></StrictMode>)
