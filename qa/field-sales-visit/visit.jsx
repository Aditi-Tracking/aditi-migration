import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './app.css'
import { setAuthToken } from '../../src/lib/supabaseClient.js'
import * as lib from '../../src/lib/fieldSalesVisits.js'
import * as photoLib from '../../src/lib/visitPhoto.js'
import { LeadCaptureAccessProvider } from '../../src/context/LeadCaptureAccessContext.jsx'
import LeadCapturePanel from '../../src/components/panels/leadcapture/LeadCapturePanel.jsx'

// A FAKE backend (host rb.test) for the Field Sales Visit Form: it answers what the form asks and records what it was sent (window.__calls / __submits / __uploads).
// Options (query string): role=admin|rep (default rep), geo=deny (the position is refused), nobucket=1 (storage answers "Bucket not found"), failsubmit=1 (the first
// submit answers 500), netfail=1 (the first submit throws a network TypeError), latency=<ms>.
const q = new URLSearchParams(location.search)
const ROLE = q.get('role') || 'rep'
const ME = 'u-me'
const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '')
setAuthToken(`${b64({ alg: 'none' })}.${b64({ sub: ME, email: 'rep@rb.test' })}.sig`)

const day = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const iso = (n) => new Date(Date.now() + n * 864e5).toISOString()
const PERMS = {
  rep: ['field_sales_form_view', 'field_sales_form_create'],
  admin: ['field_sales_form_view', 'field_sales_form_create', 'field_sales_form_view_all', 'field_sales_form_manage_dropdowns', 'field_sales_form_delete', 'enquiry_delete_sent'],
  viewer: ['field_sales_form_view'],
}
const lead = (id, name, o = {}) => ({ id, business_name: name, contact_person: name.split(' ')[0] + ' P', contact_number: o.phone || '98200' + String(id.charCodeAt(1)).padStart(5, '0'), area: 'Andheri', city: 'Mumbai', fleet_size: 10, uses_gps: false, existing_gps: null,
  source_of_lead: 'Walk-in', referrer_name: null, coordinator_booked: false, pain_area: 'Fuel pilferage', enquiry_id: o.enq || null, created_by: o.by || ME, created_by_name: o.byName || 'Rep Alpha', created_at: iso(-10), adopted_from: o.adopted || null, ...o.extra })
const visit = (id, lead_id, o) => ({ id, lead_id, created_at: iso(o.at), entered_by: ME, entered_by_name: 'Rep Alpha', purpose: o.fu ? 'Follow up' : 'Discovery', follow_up_reason: o.fu || null, demo_given: o.demo ?? null, demo_outcome: o.out || null,
  quotation_due_date: o.qdate || null, no_demo_reason: o.nodemo || null, next_followup_date: o.next || null, quotation_outcome: o.qout || null, quotation_followup_reason: o.qreason || null, closing_reason: o.close || null,
  so_number: o.so || null, won_amount: o.amt || null, remarks: o.remarks || null, is_completed: o.state === 'completed', visit_state: o.state })
const DB = {
  leads: [
    lead('LA', 'Acme Transport', { enq: 'E1' }), lead('LB', 'Bright Logistics'), lead('LC', 'Cargo King', { enq: 'E3' }), lead('LD', 'Delta Fleet', { by: 'u-other', byName: 'Rep Beta' }), lead('LE', 'Echo Movers', { enq: 'E5' }),
  ],
  state: {
    LA: { lead_state: 'completed', outcome: 'open', visit_count: 2, completed_count: 1, pending_count: 0, last_visit_at: iso(-2), next_followup_date: day(4), followup_overdue: false },
    LB: { lead_state: 'pending', outcome: 'open', visit_count: 1, completed_count: 0, pending_count: 1, last_visit_at: iso(-5), next_followup_date: day(-3), followup_overdue: true },
    LC: { lead_state: 'completed', outcome: 'lost', visit_count: 1, completed_count: 1, pending_count: 0, last_visit_at: iso(-8), next_followup_date: null, followup_overdue: false },
    LD: { lead_state: 'pending', outcome: 'open', visit_count: 1, completed_count: 0, pending_count: 1, last_visit_at: iso(-1), next_followup_date: day(2), followup_overdue: false },
    LE: { lead_state: 'completed', outcome: 'won', visit_count: 1, completed_count: 1, pending_count: 0, last_visit_at: iso(-12), next_followup_date: null, followup_overdue: false },
  },
  visits: {
    LA: [visit('V1', 'LA', { at: -6, demo: false, nodemo: 'Owner out of town', next: day(-3), state: 'superseded' }), visit('V2', 'LA', { at: -2, fu: 'Demo pending', demo: true, out: 'quotation_to_be_sent', qdate: day(4), state: 'completed', remarks: 'Met the fleet manager' })],
    LB: [visit('V3', 'LB', { at: -5, demo: false, nodemo: 'Busy with a shipment', next: day(-3), state: 'pending' })],
    LC: [visit('V4', 'LC', { at: -8, demo: true, out: 'not_interested', close: 'Already has a vendor', state: 'completed' })],
    LD: [visit('V5', 'LD', { at: -1, demo: false, nodemo: 'Not available', next: day(2), state: 'pending' })],
    LE: [visit('V6', 'LE', { at: -12, fu: 'Quotation follow-up', qout: 'won', so: 'SO-100', amt: 125000, state: 'completed' })],
  },
  pain: ['Vehicle safety/theft concern', 'Fuel pilferage', 'Driver behavior monitoring', 'No real-time visibility', 'AIS-140 compliance requirement', 'Unhappy with current provider/support', 'Cost of current solution', 'Other'].map((v, i) => ({ id: 'p' + i, value: v, is_active: true, sort_order: i + 1 })),
  settings: { director_alert_email: 'support@adititracking.com' },
  legacy: [1, 2].map((i) => ({ id: 'leg' + i, created_at: iso(-30), entered_by_name: 'Rep Alpha', entered_by_email: 'rep@rb.test', lead_name: 'Legacy Lead ' + i, contact_number: '9000000' + i, city: 'Pune', state: 'Maharashtra', source_of_lead: 'Meta', visit_purpose: 'Discovery', lead_stage: 'Hot', demo_given: true, product_interested: ['SmartFleet'], fleet_size: 5, expected_revenue: 10000, expected_amount_receiving_date: day(10), sent_to_fms_at: iso(-30), email_id: null, current_gps_provider: 'X' })),
  phoneCalls: {},
  firstSubmit: true,
}
window.__db = DB
window.__calls = []
window.__submits = []
window.__uploads = []
window.__uploadBlobs = []
window.__lib = lib
window.__photoLib = photoLib

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } })
const err = (code, message, status = 400, details = null) => json({ code, message, details, hint: null }, status)
// the server's fs_phone10: non-digits dropped; 10 digits, or 11 starting 0, or 12 starting 91 -> the 10 digits; anything else is not a number ('')
const last10 = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? d : d.length === 11 && d[0] === '0' ? d.slice(1) : d.length === 12 && d.startsWith('91') ? d.slice(2) : '' }
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const realFetch = window.fetch.bind(window)

if (q.get('geo') === 'deny') {
  window.__geoDenied = true
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: (ok, bad) => (window.__geoDenied ? bad({ code: 1, message: 'denied' }) : ok({ coords: { latitude: 19.07612, longitude: 72.87771, accuracy: 12 } })) },
  })
}

// who is whose, for the phone check (last 10 digits)
const PHONES = {
  9000000001: () => ({ match: 'own_lead', lead_id: 'LB', business_name: 'Bright Logistics', contact_person: 'Bright P', city: 'Mumbai' }),
  9000000002: () => ({ match: 'adoptable', source: 'enquiry', name: 'Sheet Person', company: 'Sheet Co', city: 'Pune', status: 'open' }),
  9000000003: () => ({ match: 'adoptable', source: 'scot', name: 'Cold Contact', city: 'Nashik' }),
  9000000004: () => ({ match: 'taken' }),
  9000000005: () => {
    // a race: the first look says "none", every later one says adoptable
    DB.phoneCalls[5] = (DB.phoneCalls[5] || 0) + 1
    return DB.phoneCalls[5] === 1 ? { match: 'none' } : { match: 'adoptable', source: 'enquiry', name: 'Race Person', company: 'Race Co', city: 'Surat', status: 'open' }
  },
}
const phoneAnswer = (p) => (PHONES[last10(p)] ? PHONES[last10(p)]() : { match: 'none' })

window.fetch = async (url, init = {}) => {
  const u = new URL(String(url), location.href)
  const p = u.pathname
  if (!/rb\.test/.test(u.host)) return realFetch(url, init)
  const method = init.method || 'GET'
  let body = null
  try {
    body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null
  } catch {
    body = null
  }
  window.__calls.push({ method, path: p.replace(/^\/(rest|storage)\/v1\//, ''), query: u.search.slice(1), body })
  if (q.get('latency')) await delay(Number(q.get('latency')))

  // ── storage ──
  if (p.includes('/storage/v1/object/field-sales-visits/')) {
    if (q.get('nobucket')) return json({ statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' }, 404)
    const path = decodeURIComponent(p.split('/storage/v1/object/field-sales-visits/')[1])
    window.__uploads.push({ path, size: init.body?.size, type: init.body?.type, at: window.__calls.length })
    window.__uploadBlobs.push(init.body)
    return json({ Key: 'field-sales-visits/' + path })
  }

  // ── access ──
  if (p.endsWith('/rpc/lc_my_access')) return json({ tier: ROLE === 'admin' ? 'lc_admin' : 'lc_sales_field', permissions: Object.fromEntries((PERMS[ROLE] || PERMS.rep).map((k) => [k, 'true'])) })

  // ── phone check, lead search ──
  if (p.endsWith('/rpc/fs_find_by_phone')) return json(phoneAnswer(body.p_phone))
  if (p.endsWith('/rpc/fs_search_leads')) {
    const needle = String(body.p_q || '').toLowerCase()
    const rows = DB.leads
      .filter((l) => (ROLE === 'admin' || l.created_by === ME) && DB.state[l.id].outcome === 'open' && (l.business_name.toLowerCase().includes(needle) || l.contact_number.includes(needle)))
      .map((l) => ({ lead_id: l.id, business_name: l.business_name, contact_person: l.contact_person, contact_number: l.contact_number, city: l.city, mine: l.created_by === ME, has_enquiry: !!l.enquiry_id,
        allowed_reasons: DB.state[l.id].completed_count > 0 ? ['Quotation follow-up'] : ['Demo pending'], created_by_name: ROLE === 'admin' ? l.created_by_name : null }))
    return json(rows)
  }

  // ── submit ──
  if (p.endsWith('/rpc/submit_field_sales_visit')) {
    const P = body.p
    window.__submits.push(P)
    if (q.get('netfail') && DB.firstSubmit) {
      DB.firstSubmit = false
      throw new TypeError('Failed to fetch')
    }
    if (q.get('failsubmit') && DB.firstSubmit) {
      DB.firstSubmit = false
      return err('P0001', 'Something broke on the server', 500)
    }
    if (P.purpose === 'Discovery') {
      if (!last10(P.contact_number)) return err('22023', 'Enter a valid contact number (exactly 10 digits)', 400)
      const a = phoneAnswer(P.contact_number)
      if (a.match === 'own_lead') return err('23505', 'This phone number is already in the system', 400, a.lead_id)
      if (a.match === 'taken') return err('23505', 'This phone number is already in the system', 400, null)
      if (a.match === 'adoptable' && !P.adopt) return err('23505', 'This contact is already in your pipeline', 400, 'adoptable:' + a.source)
    } else {
      const l = DB.leads.find((x) => x.id === P.lead_id)
      if (!l || l.created_by !== ME) return err('42501', 'This lead is not assigned to you', 403)
    }
    const completed = P.demo_given === true || P.follow_up_reason === 'Quotation follow-up'
    const outcome = P.demo_outcome === 'not_interested' || P.quotation_outcome === 'lost' ? 'lost' : P.quotation_outcome === 'won' ? 'won' : 'open'
    const id = P.lead_id || 'L' + (DB.leads.length + 1)
    if (!P.lead_id) {
      DB.leads.push(lead(id, P.business_name, { phone: last10(P.contact_number) }))
      DB.state[id] = { lead_state: completed ? 'completed' : 'pending', outcome, visit_count: 1, completed_count: completed ? 1 : 0, pending_count: completed ? 0 : 1, last_visit_at: iso(0), next_followup_date: P.next_followup_date || P.quotation_due_date || null, followup_overdue: false }
    }
    const a = P.purpose === 'Discovery' ? phoneAnswer(P.contact_number) : { match: 'none' }
    return json({ lead_id: id, visit_id: 'V' + (window.__submits.length + 100), completed, visit_state: completed ? 'completed' : 'pending', enquiry_id: 'E-new', enquiry_created: P.purpose === 'Discovery' && !(a.match === 'adoptable' && a.source === 'enquiry'), in_fms: true, meeting_counted: P.purpose === 'Discovery',
      outcome, open_pending: completed ? 0 : P.purpose === 'Discovery' ? 1 : Number(q.get('pending') || 2), adopted: P.adopt ? (a.source || 'enquiry') : null })
  }

  // ── leads list / detail ──
  if (p.endsWith('/rest/v1/field_sales_lead_state')) {
    let rows = DB.leads.filter((l) => ROLE === 'admin' || l.created_by === ME).map((l) => ({ lead_id: l.id, business_name: l.business_name, contact_person: l.contact_person, contact_number: l.contact_number, area: l.area, city: l.city, created_by: l.created_by, created_by_name: l.created_by_name, enquiry_id: l.enquiry_id, lead_created_at: l.created_at, ...DB.state[l.id] }))
    const sp = u.searchParams
    if (sp.get('lead_state')) rows = rows.filter((r) => 'eq.' + r.lead_state === sp.get('lead_state'))
    if (sp.get('outcome')) rows = rows.filter((r) => 'eq.' + r.outcome === sp.get('outcome'))
    if (sp.get('followup_overdue')) rows = rows.filter((r) => String(r.followup_overdue) === sp.get('followup_overdue').replace('eq.', ''))
    return json(rows, 200, { 'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' })
  }
  if (p.endsWith('/rest/v1/field_sales_leads')) {
    const id = (u.searchParams.get('id') || '').replace('eq.', '')
    return json(DB.leads.filter((l) => l.id === id))
  }
  if (p.endsWith('/rest/v1/field_sales_visit_status')) {
    const id = (u.searchParams.get('lead_id') || '').replace('eq.', '')
    return json(DB.visits[id] || [])
  }

  // ── pain area ──
  if (p.endsWith('/rest/v1/enquiry_dropdown_options')) {
    const type = u.searchParams.get('dropdown_type') || ''
    if (method === 'GET') {
      if (type === 'eq.fs_pain_area') return json(DB.pain.filter((o) => ROLE === 'admin' || o.is_active))
      return json([])
    }
    if (method === 'POST') {
      if (DB.pain.some((o) => o.value.toLowerCase() === body.value.toLowerCase())) return err('23505', 'duplicate key', 409)
      const row = { id: 'p' + (DB.pain.length + 1), value: body.value, is_active: true, sort_order: DB.pain.length + 1 }
      DB.pain.push(row)
      return json([row], 201)
    }
    if (method === 'PATCH') {
      const id = (u.searchParams.get('id') || '').replace('eq.', '')
      const row = DB.pain.find((o) => o.id === id)
      if (!row || ROLE !== 'admin') return json([])
      row.is_active = body.is_active
      return json([row])
    }
  }
  if (p.endsWith('/rpc/rename_dropdown_option')) {
    if (ROLE !== 'admin') return err('42501', 'Not authorised to manage this list', 403)
    const row = DB.pain.find((o) => o.id === body.p_id)
    const v = String(body.p_new).trim().replace(/\s+/g, ' ')
    if (DB.pain.some((o) => o.id !== row.id && o.value.toLowerCase() === v.toLowerCase())) return err('23505', `"${v}" is already in this list (it may be retired: use Restore)`)
    const old = row.value
    row.value = v
    DB.leads.forEach((l) => l.pain_area === old && (l.pain_area = v))
    return json({ id: row.id, old, new: v, leads_updated: 1 })
  }

  // ── settings ──
  if (p.endsWith('/rpc/fs_get_settings')) return ROLE === 'admin' ? json(DB.settings) : err('42501', 'Not authorised', 403)
  if (p.endsWith('/rpc/fs_set_setting')) {
    if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(body.p_value.trim())) return err('22023', 'Enter one valid e-mail address')
    DB.settings[body.p_key] = body.p_value.trim().toLowerCase()
    return json({ key: body.p_key, value: DB.settings[body.p_key] })
  }

  // ── legacy entries (the frozen table) ──
  if (p.endsWith('/rest/v1/field_sales_entries')) {
    const sel = u.searchParams.get('select') || ''
    if (sel && sel !== '*') return json([])
    return json(DB.legacy, 200, { 'content-range': `0-${DB.legacy.length - 1}/${DB.legacy.length}` })
  }
  return json(p.includes('/rpc/') ? {} : [])
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LeadCaptureAccessProvider>
      <LeadCapturePanel />
    </LeadCaptureAccessProvider>
  </StrictMode>,
)
