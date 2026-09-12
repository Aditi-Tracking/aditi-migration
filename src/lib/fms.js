import { SB_HDRS, SB_HDRS_JSON, SUPABASE_ANON, SUPABASE_URL, getAuthToken } from './supabaseClient'

// Ported from old-portal/js/fms.js — FMS O2D (order-to-dispatch) Installation
// Tracker. Tables: fms_orders, fms_assignments, fms_configuration,
// fms_installation, fms_certification, fms_order_notes, plus read-only
// reference tables fms_products/fms_locations. NOT a live Odoo sync —
// customer_odoo_aliases is just a name-lookup table, and even that lookup
// path is dead in production (see NewOrderModal — no client-search dropdown
// exists in index.html, client name is plain free text).
//
// Phase 1 (this file, as first built): dashboard, New Order, Timeline/Notes,
// Edit/Delete/Update-Payment. Phase 2 adds the pipeline action overlays
// (Support/Reassign/Config/Engineer/Install/Certification) and will extend
// this file with their write functions — the read/CRUD functions here are
// shared by both phases.

// Config persons — Anish (Mumbai), Kush (Goa), Kinchit + Bhumit (Gujarat),
// Ankush (Bangalore) — all do device configuration.
export const FMS_ANISH_EMAIL = 'support_1@adititracking.com'
export const FMS_KUSH_EMAIL = 'supportgoa1@adititracking.com'
export const FMS_KINCHIT_EMAIL = 'supportahd1@adititracking.com'
export const FMS_BHUMIT_EMAIL = 'supportahd2@adititracking.com'
export const FMS_ANKUSH_EMAIL = 'support.south@adititracking.com'
export const FMS_CONFIG_EMAILS = [FMS_ANISH_EMAIL, FMS_KUSH_EMAIL, FMS_KINCHIT_EMAIL, FMS_BHUMIT_EMAIL, FMS_ANKUSH_EMAIL]
export const FMS_VINAYAK_EMAIL = 'support_2@adititracking.com'

// Certification products — Esim / E-Sim and Vltd Certificate (Anish-only workflow).
export const FMS_CERT_PRODUCT_NAMES = ['E-Sim and Vltd Certificate', 'Esim']

// Eligible to be assigned as the support person on a cert-only order — a
// 6-person list, distinct from FMS_CONFIG_EMAILS (adds Sakshi, who does
// certification support but not device configuration).
export const FMS_CERT_ELIGIBLE_EMAILS = [
  FMS_ANISH_EMAIL,
  FMS_KUSH_EMAIL,
  'techsupport@adititracking.com', // Sakshi
  FMS_KINCHIT_EMAIL,
  FMS_BHUMIT_EMAIL,
  FMS_ANKUSH_EMAIL,
]

// Static labels, matching index.html's #fmsSupportConfigPerson options
// exactly (not derived from Employee_details names).
export const FMS_CONFIG_PERSON_OPTIONS = [
  { email: FMS_ANISH_EMAIL, label: '⚙️ Anish' },
  { email: FMS_KUSH_EMAIL, label: '⚙️ Kush (Goa)' },
  { email: FMS_KINCHIT_EMAIL, label: '⚙️ Kinchit (Gujarat)' },
  { email: FMS_BHUMIT_EMAIL, label: '⚙️ Bhumit (Gujarat)' },
  { email: FMS_ANKUSH_EMAIL, label: '⚙️ Ankush (Bangalore)' },
]

export const FMS_STEPS = [
  { key: 'order', icon: '🗒️', label: 'Order Created', color: '#6c63ff' },
  { key: 'support', icon: '🔧', label: 'Support Assign', color: '#7c3aed' },
  { key: 'config', icon: '💾', label: 'Configuration', color: '#2563eb' },
  { key: 'engineer', icon: '🔩', label: 'Installation', color: '#7c3aed' },
  { key: 'done', icon: '🏁', label: 'Completed', color: '#6b7280' },
]

// ── Permissions ──────────────────────────────────────────────────────────
// NOTE: production checks `CURRENT_USER?.rawRole === 'managing director'` —
// our AuthContext already remaps that rawRole to 'owner' at login, so every
// one of these checks 'owner' instead. Not a behavior change, just matching
// what our own auth layer already normalizes to.
export function canCreateOrder(currentUser, permissions) {
  return permissions?.fms_create === 'true' || currentUser?.rawRole === 'mis' || currentUser?.rawRole === 'owner'
}

export function canViewAllOrders(currentUser, permissions) {
  return permissions?.fms_view_all === 'true' || currentUser?.rawRole === 'mis' || currentUser?.rawRole === 'owner'
}

export function canOverride(currentUser, permissions) {
  return permissions?.fms_override === 'true' || currentUser?.rawRole === 'mis' || currentUser?.rawRole === 'owner'
}

export function isFmsConfigEmail(email) {
  return FMS_CONFIG_EMAILS.includes(email)
}

// MIS/PC are always notes-admins (can add/delete any note).
export function notesIsAdmin(currentUser) {
  return currentUser?.rawRole === 'mis' || currentUser?.rawRole === 'pc'
}

// Shared by Support-Assign/Certify (pending_support), Engineer Assign
// (pending_engineer), and Install Update (installing): fms_support PLUS
// being the order's current assigned_to_support, or override.
export function canActOnAssignedStage(currentUser, permissions, order) {
  const isSupport = permissions?.fms_support === 'true'
  const myEmail = (currentUser?.email || '').toLowerCase().trim()
  const assignedToMe = myEmail === (order.assigned_to_support || '').toLowerCase().trim()
  return (isSupport && assignedToMe) || canOverride(currentUser, permissions)
}

// Ported EXACTLY as production has it — a known, deliberately-preserved
// access-boundary quirk, not a display bug: `isConfig && isFmsConfigEmail`
// where `isConfig = fms_config==='true' || isFmsConfigEmail`. By boolean
// algebra, (A || B) && B always equals B — so the fms_config PERMISSION
// FLAG currently has NO effect on this gate unless the grantee is already
// one of the 5 hardcoded config emails. See MIGRATION-NOTES.md's "Known
// confusing-but-intentional-looking access boundaries" — deliberately not
// fixed here; changing it would silently expand who can act on Config-stage
// orders, which is a business/Access-Control decision, not ours to make.
export function canActOnConfigStage(currentUser, permissions) {
  const myEmail = (currentUser?.email || '').toLowerCase().trim()
  const isConfig = permissions?.fms_config === 'true' || isFmsConfigEmail(myEmail)
  return (isConfig && isFmsConfigEmail(myEmail)) || canOverride(currentUser, permissions)
}

// Reassign's own gate — NOT the same as canActOnAssignedStage: being the
// assigned support person is sufficient on its own here, with no fms_support
// permission required (matches fmsOpenTimeline's _isAssignedToMe check
// exactly). Callers must separately check order.status === 'pending_support'
// — production ANDs that in at the call site, not inside this OR-group.
export function canReassign(currentUser, permissions, order) {
  const myEmail = (currentUser?.email || '').toLowerCase().trim()
  const assignedToMe = myEmail === (order.assigned_to_support || '').toLowerCase().trim()
  return assignedToMe || canOverride(currentUser, permissions) || currentUser?.rawRole === 'pc'
}

// ── Fetches ──────────────────────────────────────────────────────────────
export async function fetchFmsProducts() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/fms_products?is_active=eq.true&order=product_name`, { headers: SB_HDRS() })
  const rows = await res.json()
  return Array.isArray(rows) ? rows : []
}

export async function fetchFmsLocations() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/fms_locations?is_active=eq.true&order=location_name`, { headers: SB_HDRS() })
  const rows = await res.json()
  return Array.isArray(rows) ? rows : []
}

// email (lowercased) -> display name. Seeded with the two non-employee
// install options so fmsEmpName-equivalent lookups never show a raw key.
export async function fetchEmployeeNameMap() {
  const map = { outsource: 'Outsource', self_installed: 'Self Installed by Client' }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/Employee_details?select=Employee_name,Email_Id`, { headers: SB_HDRS() })
    const rows = await res.json()
    ;(Array.isArray(rows) ? rows : []).forEach((r) => {
      if (r.Email_Id) map[(r.Email_Id || '').toLowerCase().trim()] = r.Employee_name || r.Email_Id
    })
  } catch {
    /* best-effort — empName falls back to the raw email */
  }
  return map
}

export function empName(map, email) {
  if (!email) return '—'
  return map[(email || '').toLowerCase().trim()] || email
}

export async function fetchSupportPersons() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/Employee_details?Employee_Dept=eq.Support&select=Employee_name,Email_Id&order=Employee_name`,
    { headers: SB_HDRS() }
  )
  const rows = await res.json()
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r.Email_Id)
    .map((r) => ({ email: (r.Email_Id || '').toLowerCase().trim(), name: r.Employee_name || r.Email_Id }))
}

// Service Engineer dept + Vinayak (Support dept, does engineer work too —
// added manually without touching his department record) + the two
// non-employee options. Reuses the already-loaded employee name map for
// Vinayak's display name instead of production's separate fallback fetch
// (only needed there because that module's own emp-name cache might not
// yet be populated when this runs — ours always is, fetched once at panel
// load before any overlay can open).
export async function fetchEngineers(empMap) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/Employee_details?Employee_Dept=eq.Service%20Engineer&select=Employee_name,Email_Id&order=Employee_name`,
    { headers: SB_HDRS() }
  )
  const rows = await res.json()
  const list = (Array.isArray(rows) ? rows : [])
    .filter((r) => r.Email_Id)
    .map((r) => ({ email: (r.Email_Id || '').toLowerCase().trim(), name: r.Employee_name || r.Email_Id }))

  if (!list.some((e) => e.email === FMS_VINAYAK_EMAIL)) {
    list.push({ email: FMS_VINAYAK_EMAIL, name: empName(empMap, FMS_VINAYAK_EMAIL) })
  }
  list.push({ email: 'outsource', name: 'Outsource' })
  list.push({ email: 'self_installed', name: 'Self Installed by Client' })
  return list
}

// Scoping matches loadOrders() exactly: fms_view_all (or mis/owner) sees
// everything; otherwise scoped to orders you created or are assigned to,
// PLUS an extra carve-out for the 5 config-team emails, who also see
// everything already past the support-assign stage (they need visibility
// into orders routed to them for configuration even though assigned_to_support
// still names the support person, not them).
export async function fetchFmsOrders({ currentUser, permissions }) {
  const isViewAll = canViewAllOrders(currentUser, permissions)
  const myEmail = currentUser?.email || ''

  let url = `${SUPABASE_URL}/rest/v1/fms_orders?order=created_at.desc`
  if (!isViewAll) {
    if (isFmsConfigEmail(myEmail)) {
      url += `&or=(created_by.eq.${encodeURIComponent(myEmail)},assigned_to_support.eq.${encodeURIComponent(myEmail)},status.eq.pending_config,status.eq.configuring,status.eq.pending_engineer,status.eq.installing,status.eq.completed)`
    } else {
      url += `&or=(created_by.eq.${encodeURIComponent(myEmail)},assigned_to_support.eq.${encodeURIComponent(myEmail)})`
    }
  }

  const res = await fetch(url, { headers: SB_HDRS() })
  const rows = await res.json()
  return Array.isArray(rows) ? rows : []
}

export async function fetchAssignments(orderId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/fms_assignments?order_id=eq.${orderId}&order=assigned_at`, { headers: SB_HDRS() })
  const rows = await res.json()
  return Array.isArray(rows) ? rows : []
}

export async function fetchLatestConfig(orderId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/fms_configuration?order_id=eq.${orderId}&order=configured_at.desc&limit=1`, {
    headers: SB_HDRS(),
  })
  const rows = await res.json()
  return (Array.isArray(rows) && rows[0]) || null
}

export async function fetchLatestInstallation(orderId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/fms_installation?order_id=eq.${orderId}&order=created_at.desc&limit=1`, {
    headers: SB_HDRS(),
  })
  const rows = await res.json()
  return (Array.isArray(rows) && rows[0]) || null
}

export async function fetchCertifications(orderId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/fms_certification?order_id=eq.${orderId}&order=certified_at.desc`, {
    headers: SB_HDRS(),
  })
  const rows = await res.json()
  return Array.isArray(rows) ? rows : []
}

// Cumulative certified_qty across ALL fms_certification rows for this order
// (certification is additive/audit-trail — never overwritten, only inserted).
export async function fetchCertifiedSoFar(orderId) {
  try {
    const rows = await fetchCertifications(orderId)
    return rows.reduce((s, r) => s + (parseInt(r.certified_qty) || 0), 0)
  } catch {
    return 0
  }
}

export async function fetchOrderNotes(orderId) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/fms_order_notes?order_id=eq.${orderId}&order=created_at.asc`, { headers: SB_HDRS() })
    if (!res.ok) return []
    const rows = await res.json()
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

// ── Pure helpers ─────────────────────────────────────────────────────────
export function calcPendingAmount(order) {
  return (parseFloat(order.order_amount) || 0) - ((parseFloat(order.amount_received) || 0) + (parseFloat(order.tds_amount) || 0))
}

// Ported from fmsUpdateKPIs — counts + amounts over the currently FILTERED
// order list (not the full unfiltered set).
export function computeFmsKpiSummary(orders) {
  const counts = { total: 0, pending_support: 0, pending_config: 0, pending_engineer: 0, installing: 0, completed: 0 }
  let totalPendingAmt = 0
  let pendingAmtOrders = 0
  orders.forEach((o) => {
    counts.total++
    if (counts[o.status] !== undefined) counts[o.status]++
    const pending = calcPendingAmount(o)
    if (pending > 0) {
      totalPendingAmt += pending
      pendingAmtOrders++
    }
  })
  const totalAmt = orders.reduce((s, o) => s + (parseFloat(o.order_amount) || 0), 0)
  return { ...counts, totalPendingAmt, pendingAmtOrders, totalAmt }
}

// ₹ with K/L/Cr suffix, matching fmsUpdateKPIs' fmt().
export function formatFmsAmount(n) {
  if (n >= 10000000) return '₹' + (n / 10000000).toFixed(1) + 'Cr'
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L'
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'K'
  return '₹' + n.toLocaleString('en-IN')
}

function parseProductItems(order) {
  try {
    return JSON.parse(order.product_items || '[]')
  } catch {
    return []
  }
}

export function isCertOrder(order) {
  const items = parseProductItems(order)
  if (!items.length) return false
  return items.every((i) => FMS_CERT_PRODUCT_NAMES.includes(i.product_name))
}

// Sum of quantities for products NOT in the certification list — the real
// install/config target. For orders with no items or no cert products this
// equals order.quantity exactly, since every product row is non-cert.
export function nonCertQuantity(order) {
  const items = parseProductItems(order)
  if (!items.length) return parseInt(order.quantity) || 0
  return items.filter((i) => !FMS_CERT_PRODUCT_NAMES.includes(i.product_name)).reduce((s, i) => s + (i.quantity || 0), 0)
}

// Sum of quantities for cert-only products — the certification target.
export function certQuantity(order) {
  const items = parseProductItems(order)
  if (!items.length) return 0
  return items.filter((i) => FMS_CERT_PRODUCT_NAMES.includes(i.product_name)).reduce((s, i) => s + (i.quantity || 0), 0)
}

export function productNames(ids, itemsJson, products) {
  if (itemsJson) {
    try {
      const items = typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson
      if (items && items.length) {
        return items.map((i) => `${i.product_name || products.find((p) => p.id === i.product_id)?.product_name || i.product_id} ×${i.quantity}`).join(', ')
      }
    } catch {
      /* fall through to ids-based lookup */
    }
  }
  if (!ids || !ids.length) return '—'
  return ids.map((id) => products.find((p) => p.id === id)?.product_name || id).join(', ')
}

export function formatTat(from, to) {
  if (!from || !to) return ''
  const diff = new Date(to) - new Date(from)
  const hrs = Math.floor(diff / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  if (hrs >= 24) return `${Math.floor(hrs / 24)}d ${hrs % 24}h`
  if (hrs > 0) return `${hrs}h ${mins}m`
  return `${mins}m`
}

const STATUS_LABELS = {
  pending_support: { icon: '🟡', label: 'Awaiting Support' },
  pending_config: { icon: '🟠', label: 'Awaiting Config' },
  configuring: { icon: '🔵', label: 'Configuring' },
  pending_engineer: { icon: '🟣', label: 'Awaiting Engineer' },
  installing: { icon: '🔵', label: 'Installing' },
  completed: { icon: '🟢', label: 'Completed' },
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || { icon: '⚪', label: 'Unknown' }
}

// Returns array of 'done'|'active'|'pending' for each of the 5 FMS_STEPS.
export function stepStateMap(status) {
  const map = {
    pending_support: ['active', 'pending', 'pending', 'pending', 'pending'],
    pending_config: ['done', 'active', 'pending', 'pending', 'pending'],
    configuring: ['done', 'done', 'active', 'pending', 'pending'],
    pending_engineer: ['done', 'done', 'done', 'active', 'pending'],
    installing: ['done', 'done', 'done', 'active', 'pending'],
    completed: ['done', 'done', 'done', 'done', 'done'],
  }
  return map[status] || ['active', 'pending', 'pending', 'pending', 'pending']
}

export function parseProofUrls(raw) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return [raw]
  }
}

// Involvement = creator, currently-assigned support person, anyone who ever
// appeared as an assignment's from/to, or the installing engineer. MIS/PC
// are always treated as involved via notesIsAdmin, checked separately by
// callers — this only covers the "specifically tied to this order" half.
export function isInvolvedInOrder(order, assignments, installation, myEmailLower) {
  const involved = new Set()
  const add = (e) => {
    if (e) involved.add(String(e).toLowerCase().trim())
  }
  add(order.created_by)
  add(order.assigned_to_support)
  ;(assignments || []).forEach((a) => {
    add(a.assigned_from)
    add(a.assigned_to)
  })
  if (installation) add(installation.engineer_email)
  return involved.has(myEmailLower)
}

// ── Writes ───────────────────────────────────────────────────────────────
export async function createOrder(payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/fms_orders`, {
    method: 'POST',
    headers: { ...SB_HDRS_JSON(), Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  const rows = await res.json()
  const order = rows[0]
  if (order?.id) {
    await fetch(`${SUPABASE_URL}/rest/v1/fms_assignments`, {
      method: 'POST',
      headers: SB_HDRS_JSON(),
      body: JSON.stringify({
        order_id: order.id,
        step: 1,
        assigned_from: payload.created_by,
        assigned_to: payload.assigned_to_support,
        assigned_at: payload.step2_started_at,
      }),
    })
  }
  return order
}

export async function updateOrder(orderId, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/fms_orders?id=eq.${orderId}`, {
    method: 'PATCH',
    headers: SB_HDRS_JSON(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
}

// Cascading delete — related records first (defensive; CASCADE should
// handle it, matches production's own defensive ordering), then the order.
export async function deleteOrder(orderId) {
  await fetch(`${SUPABASE_URL}/rest/v1/fms_assignments?order_id=eq.${orderId}`, { method: 'DELETE', headers: SB_HDRS() })
  await fetch(`${SUPABASE_URL}/rest/v1/fms_configuration?order_id=eq.${orderId}`, { method: 'DELETE', headers: SB_HDRS() })
  await fetch(`${SUPABASE_URL}/rest/v1/fms_installation?order_id=eq.${orderId}`, { method: 'DELETE', headers: SB_HDRS() })
  await fetch(`${SUPABASE_URL}/rest/v1/fms_order_notes?order_id=eq.${orderId}`, { method: 'DELETE', headers: SB_HDRS() })
  const res = await fetch(`${SUPABASE_URL}/rest/v1/fms_orders?id=eq.${orderId}`, { method: 'DELETE', headers: SB_HDRS() })
  if (!res.ok) throw new Error(await res.text())
}

export async function updatePayment(orderId, { amountReceived, tdsAmount, tentativeDate, paymentProofUrl }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/fms_orders?id=eq.${orderId}`, {
    method: 'PATCH',
    headers: SB_HDRS_JSON(),
    body: JSON.stringify({
      amount_received: amountReceived,
      tds_amount: tdsAmount,
      tentative_date: tentativeDate,
      payment_proof_url: paymentProofUrl,
    }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function addOrderNote(orderId, noteText, createdBy) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/fms_order_notes`, {
    method: 'POST',
    headers: SB_HDRS_JSON(),
    body: JSON.stringify({ order_id: orderId, note_text: noteText, created_by: createdBy, created_at: new Date().toISOString() }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function deleteOrderNote(noteId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/fms_order_notes?id=eq.${noteId}`, { method: 'DELETE', headers: SB_HDRS() })
  if (!res.ok) throw new Error(await res.text())
}

// Uploads to the same fms-documents/fms-proofs/ path production uses.
export async function uploadFmsProof(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  const safeName = Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '.' + ext
  const path = `fms-proofs/${safeName}`
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/fms-documents/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getAuthToken() || SUPABASE_ANON}`,
      'Content-Type': file.type,
      'x-upsert': 'true',
    },
    body: file,
  })
  if (!res.ok) return null
  return `${SUPABASE_URL}/storage/v1/object/public/fms-documents/${path}`
}

export async function uploadAllFmsProofs(files) {
  const urls = []
  for (const file of files) {
    const url = await uploadFmsProof(file)
    if (url) urls.push(url)
  }
  return urls
}

// ── Pipeline action writes (Phase 2) ──────────────────────────────────────
// Ported from fmsSupportSubmit/fmsSubmitReassign/fmsSubmitConfig/
// fmsSubmitEngineerAssign/fmsSubmitInstallUpdate/fmsSubmitCertification.
// Callers own the pure-cert-to-Anish bypass check themselves (mirrors
// fmsSupportSubmit's early return) — when configPersonEmail===FMS_ANISH_EMAIL
// and isCertOrder(order), open the Certification overlay directly instead
// of calling submitSupportToConfig; nothing here needs to run for that case.

export async function submitSupportToConfig({ orderId, configPersonEmail, notes, assignedFrom }) {
  const now = new Date().toISOString()
  await updateOrder(orderId, { status: 'pending_config', current_step: 2, step2_completed_at: now, step3_started_at: now })
  await fetch(`${SUPABASE_URL}/rest/v1/fms_assignments`, {
    method: 'POST',
    headers: SB_HDRS_JSON(),
    body: JSON.stringify({ order_id: orderId, step: 2, assigned_from: assignedFrom, assigned_to: configPersonEmail, notes, assigned_at: now }),
  })
}

// Direct-to-engineer — skips pending_config/pending_engineer entirely.
// Uses nonCertQuantity consistently (production's own direct-to-engineer
// completion check used raw order.quantity instead — functionally
// identical for every order that can reach this branch, since cert orders
// are barred from it, but nonCertQuantity is used everywhere else so this
// keeps the port internally consistent rather than replicating the
// harmless inconsistency).
export async function submitSupportDirectToEngineer({ order, engineerEmail, installed, pending, assignedFrom }) {
  const now = new Date().toISOString()
  const isCompleted = installed >= nonCertQuantity(order) && installed > 0
  await updateOrder(order.id, { status: 'installing', current_step: 4, step2_completed_at: now, step4_completed_at: now, step5_started_at: now })
  await fetch(`${SUPABASE_URL}/rest/v1/fms_installation`, {
    method: 'POST',
    headers: SB_HDRS_JSON(),
    body: JSON.stringify({
      order_id: order.id,
      engineer_email: engineerEmail,
      devices_installed: installed,
      devices_pending: pending,
      is_completed: isCompleted,
      completed_at: isCompleted ? now : null,
      updated_by: assignedFrom,
      assigned_at: now,
    }),
  })
  // Note: production reads the Support overlay's notes textarea here but
  // never actually uses it — the assignment always gets this fixed string
  // instead. Faithfully preserved; not something with an obvious "correct"
  // fix, so the caller doesn't even need to pass notes through.
  await fetch(`${SUPABASE_URL}/rest/v1/fms_assignments`, {
    method: 'POST',
    headers: SB_HDRS_JSON(),
    body: JSON.stringify({
      order_id: order.id,
      step: 2,
      assigned_from: assignedFrom,
      assigned_to: engineerEmail,
      notes: 'Direct assignment (no config required)',
      assigned_at: now,
    }),
  })
  return isCompleted
}

export async function submitReassign({ order, newAssignee, notes, myEmail, myName }) {
  const now = new Date().toISOString()
  await updateOrder(order.id, { assigned_to_support: newAssignee })
  await fetch(`${SUPABASE_URL}/rest/v1/fms_assignments`, {
    method: 'POST',
    headers: SB_HDRS_JSON(),
    body: JSON.stringify({
      order_id: order.id,
      step: order.current_step || 1,
      assigned_from: myEmail,
      assigned_to: newAssignee,
      notes: notes ? `Reassigned by ${myName}: ${notes}` : `Reassigned by ${myName}`,
      assigned_at: now,
    }),
  })
}

// Config is one-shot — submitting always advances the order to
// pending_engineer, whether 0 devices (skipped) or the full quantity was
// configured. No re-validation against the total beyond what the input's
// own clamped max already enforces client-side, matching production
// ("Anish can configure any number freely").
export async function submitConfig({ order, configuredQty, notConfiguredQty, notes, skipReason, configuredBy }) {
  const now = new Date().toISOString()
  const isSkipped = configuredQty === 0
  await fetch(`${SUPABASE_URL}/rest/v1/fms_configuration`, {
    method: 'POST',
    headers: SB_HDRS_JSON(),
    body: JSON.stringify({
      order_id: order.id,
      configured_qty: configuredQty,
      not_configured_qty: notConfiguredQty,
      config_notes: notes || null,
      is_skipped: isSkipped,
      skip_reason: skipReason || null,
      configured_by: configuredBy,
      received_at: order.step3_started_at || now,
      configured_at: now,
    }),
  })
  await updateOrder(order.id, { status: 'pending_engineer', current_step: 3, step3_completed_at: now, step4_started_at: now })
  await fetch(`${SUPABASE_URL}/rest/v1/fms_assignments`, {
    method: 'POST',
    headers: SB_HDRS_JSON(),
    body: JSON.stringify({
      order_id: order.id,
      step: 3,
      assigned_from: configuredBy,
      assigned_to: order.assigned_to_support || '',
      notes: isSkipped ? `Skipped: ${skipReason}` : notes,
      assigned_at: now,
    }),
  })
}

export async function submitEngineerAssign({ order, engineerEmail, installed, notes, myEmail }) {
  const now = new Date().toISOString()
  const totalQty = nonCertQuantity(order)
  const pending = totalQty - installed
  const isCompleted = installed >= totalQty && installed > 0
  await fetch(`${SUPABASE_URL}/rest/v1/fms_installation`, {
    method: 'POST',
    headers: SB_HDRS_JSON(),
    body: JSON.stringify({
      order_id: order.id,
      engineer_email: engineerEmail,
      devices_installed: installed,
      devices_pending: pending,
      installation_notes: notes || null,
      is_completed: isCompleted,
      completed_at: isCompleted ? now : null,
      updated_by: myEmail,
      assigned_at: now,
    }),
  })
  await updateOrder(order.id, {
    status: isCompleted ? 'completed' : 'installing',
    current_step: 4,
    step4_completed_at: now,
    step5_started_at: now,
    ...(isCompleted ? { step5_completed_at: now } : {}),
  })
  // No `notes` mirrored into the assignment row — matches production exactly.
  await fetch(`${SUPABASE_URL}/rest/v1/fms_assignments`, {
    method: 'POST',
    headers: SB_HDRS_JSON(),
    body: JSON.stringify({ order_id: order.id, step: 4, assigned_from: myEmail, assigned_to: engineerEmail, assigned_at: now }),
  })
  return isCompleted
}

// Updates the SAME installation row created by Engineer Assign (found by
// most-recent order_id match) — never creates a new one, never touches
// engineer_email. No fms_assignments write at all (this is a progress
// update, not a reassignment). fms_orders is only PATCHed when completing —
// an in-progress update leaves status/current_step untouched entirely.
export async function submitInstallUpdate({ order, installed, notes, myEmail }) {
  const now = new Date().toISOString()
  const totalQty = nonCertQuantity(order)
  const pending = totalQty - installed
  const isCompleted = installed >= totalQty && installed > 0

  const latest = await fetchLatestInstallation(order.id)
  if (latest) {
    await fetch(`${SUPABASE_URL}/rest/v1/fms_installation?id=eq.${latest.id}`, {
      method: 'PATCH',
      headers: SB_HDRS_JSON(),
      body: JSON.stringify({
        devices_installed: installed,
        devices_pending: pending,
        installation_notes: notes || null,
        is_completed: isCompleted,
        completed_at: isCompleted ? now : null,
        updated_by: myEmail,
      }),
    })
  }
  if (isCompleted) {
    await updateOrder(order.id, { status: 'completed', current_step: 5, step5_completed_at: now })
  }
  return isCompleted
}

// Additive/audit-trail — always inserts a new fms_certification row, never
// overwrites. Only the submission that crosses the target gets an
// fms_assignments row (a synthetic self-assignment) and flips the order to
// completed; partial submissions leave the order at pending_support with
// no audit-trail entry at all, matching production exactly.
export async function submitCertification({ order, certifiedQty, notes, myEmail }) {
  const now = new Date().toISOString()
  await fetch(`${SUPABASE_URL}/rest/v1/fms_certification`, {
    method: 'POST',
    headers: SB_HDRS_JSON(),
    body: JSON.stringify({ order_id: order.id, certified_qty: certifiedQty, certified_by: myEmail, notes: notes || null, certified_at: now }),
  })
  const target = certQuantity(order)
  const certifiedSoFar = await fetchCertifiedSoFar(order.id)
  const isComplete = certifiedSoFar >= target
  if (isComplete) {
    await updateOrder(order.id, { status: 'completed', current_step: 5, step5_completed_at: now })
    await fetch(`${SUPABASE_URL}/rest/v1/fms_assignments`, {
      method: 'POST',
      headers: SB_HDRS_JSON(),
      body: JSON.stringify({
        order_id: order.id,
        step: 2,
        assigned_from: myEmail,
        assigned_to: myEmail,
        notes: 'Certification only — completed directly',
        assigned_at: now,
      }),
    })
  }
  return { certifiedSoFar, target, isComplete }
}
