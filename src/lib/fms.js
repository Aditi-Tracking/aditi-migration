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
