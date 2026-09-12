// Vendor Requests (Purchase Approval). Ported from old-portal/js/vendor.js — Phase 1 of the
// Vendor Requests dashboard only (the Recurring Bills sub-dashboard, recurring_payments table and
// its own 4 recurring_* permissions, is a separate future task — matching production's own
// bundling of two independent features in one file). The dead "🔁 Recurring Request" vendor-
// picker/clone feature (openRecurringPicker/vrRecurModal/vrRecurPickerModal) is NOT ported —
// confirmed via exhaustive grep that nothing anywhere ever calls openRecurringPicker().
//
// Tables: vendors (id, vendor_name, contact, notes, created_by), vendor_requests (id,
// submitted_by [email], submitted_by_emp_id [Employee_details.Emp_id, looked up once at create
// time — never re-looked-up on edit], vendor_id, vendor_name, product_name, qty, amount, location,
// invoice_number, po_number, invoice_link, status ['On Hold'/'Approved'/'Declined'],
// payment_status ['Unpaid'/'Paid'], remarks, reviewed_by/reviewed_at, utr_number,
// payment_attachment, paid_by/paid_at). A DB unique constraint blocks a duplicate invoice number
// for the same vendor.
// Storage: public 'vendor-attachments' bucket (folders invoices/payments), plain fetch() POST —
// same convention as Field Service/HR Employee Master, not XHR (no progress UI here either).
//
// Permissions — confirmed 5 real, live-checked keys, NONE with a friendly label in Access
// Control (would render as a raw key): vendor_access (Finance card + submit; role bypass
// owner/MD/mis), vendor_view_all (all requests vs. own only; role bypass owner/mis/EA — wider
// than the others), vendor_review (EA approve/decline; role bypass EA/owner/mis), vendor_pay
// (Accounts mark-paid; role bypass owner/mis ONLY, not EA), vendor_delete (a 5th, independent
// delete grant — separately, anyone can always delete their own request, and an EA can delete
// any request, regardless of this flag).
import { SUPABASE_URL, SB_HDRS, SB_HDRS_JSON, SB_HDRS_REPR, SUPABASE_ANON, getAuthToken } from './supabaseClient'

export const VENDOR_ATTACHMENTS_BUCKET = 'vendor-attachments'
export const LOCATIONS = ['Head Office', 'Bangalore', 'Goa', 'Gujarat']
export const STATUS_TAGS = ['On Hold', 'Approved', 'Declined']
export const PAY_TAGS = ['Paid', 'Unpaid']

function role(currentUser) {
  return String(currentUser?.rawRole || currentUser?.role || '').toLowerCase().trim()
}
function myEmail(currentUser) {
  return String(currentUser?.email || '').trim().toLowerCase()
}

export function canAccessVendorRequests(currentUser, permissions) {
  const r = role(currentUser)
  const isMD = r === 'mis' || r === 'managing director' || r === 'owner'
  return isMD || permissions?.vendor_access === 'true'
}
export function canViewAllVendorRequests(currentUser, permissions) {
  if (permissions?.vendor_view_all === 'true') return true
  const r = role(currentUser)
  return r === 'owner' || r === 'mis' || r === 'executive assistant' || r === 'ea'
}
export function canReviewVendorRequests(currentUser, permissions) {
  if (permissions?.vendor_review === 'true') return true
  const r = role(currentUser)
  return r === 'executive assistant' || r === 'ea' || r === 'owner' || r === 'mis'
}
export function canPayVendorRequests(currentUser, permissions) {
  if (permissions?.vendor_pay === 'true') return true
  const r = role(currentUser)
  return r === 'owner' || r === 'mis'
}
export function canDeleteVendorRequest(req, currentUser, permissions) {
  return permissions?.vendor_delete === 'true' || canReviewVendorRequests(currentUser, permissions) || String(req.submitted_by || '').toLowerCase() === myEmail(currentUser)
}
export function canEditVendorRequest(req, currentUser, permissions) {
  return req.status === 'On Hold' && (canReviewVendorRequests(currentUser, permissions) || String(req.submitted_by || '').toLowerCase() === myEmail(currentUser))
}
// A row is bulk-pay-selectable if the viewer has EA or Accounts rights and the request is
// Approved + still Unpaid — matches production's own comment: previously only ever shown for
// non-EA accounts users, which is why it never appeared for EA/owner roles.
export function canBulkPay(req, currentUser, permissions) {
  return (canPayVendorRequests(currentUser, permissions) || canReviewVendorRequests(currentUser, permissions)) && req.status === 'Approved' && req.payment_status !== 'Paid'
}

async function lookupEmpId(email) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/Employee_details?select=Emp_id&Email_Id=ilike.${encodeURIComponent(email)}&limit=1`, { headers: SB_HDRS() })
    const rows = res.ok ? await res.json() : []
    return rows?.[0]?.Emp_id ?? null
  } catch {
    return null
  }
}

// ── Fetches ──────────────────────────────────────────────────────────────────
export async function fetchAll(currentUser, permissions) {
  const empRes = await fetch(`${SUPABASE_URL}/rest/v1/Employee_details?select=Email_Id,Employee_name`, { headers: SB_HDRS() })
  const empData = empRes.ok ? await empRes.json() : []
  const nameMap = {}
  empData.forEach((e) => {
    if (e.Email_Id) nameMap[String(e.Email_Id).toLowerCase().trim()] = e.Employee_name || e.Email_Id
  })

  const vendors = await fetchVendors()

  let url = `${SUPABASE_URL}/rest/v1/vendor_requests?select=*&order=created_at.desc`
  if (!canViewAllVendorRequests(currentUser, permissions)) url += `&submitted_by=eq.${encodeURIComponent(myEmail(currentUser))}`
  const res = await fetch(url, { headers: SB_HDRS() })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const requests = await res.json()

  return { nameMap, vendors, requests }
}

export async function fetchVendors() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/vendors?select=id,vendor_name&order=vendor_name.asc`, { headers: SB_HDRS() })
  return res.ok ? res.json() : []
}

export async function createVendor({ name, contact, notes }, createdByEmail) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/vendors`, {
    method: 'POST',
    headers: SB_HDRS_REPR(),
    body: JSON.stringify({ vendor_name: name, contact: contact || null, notes: notes || null, created_by: createdByEmail }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t.toLowerCase().includes('unique') ? 'A vendor with this name already exists.' : t)
  }
  const [saved] = await res.json()
  return saved
}

// ── Upload — plain fetch(), no progress UI (matches production; public bucket, same convention
// as Field Service/HR Employee Master) ──
export async function uploadVendorFile(file, folder) {
  const ext = file.name.split('.').pop().toLowerCase()
  const safeName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${VENDOR_ATTACHMENTS_BUCKET}/${safeName}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${getAuthToken()}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: file,
  })
  if (!res.ok) throw new Error('Upload failed: ' + (await res.text()))
  return `${SUPABASE_URL}/storage/v1/object/public/${VENDOR_ATTACHMENTS_BUCKET}/${safeName}`
}

function mapSubmitError(e) {
  const msg = e.message || ''
  if (msg.includes('23505') || msg.includes('unique_vendor_invoice')) {
    return new Error('This invoice number is already submitted for this vendor. Please check for duplicates.')
  }
  return e
}

// ── Create ───────────────────────────────────────────────────────────────────
// Invoice upload is best-effort — a failure logs a warning and the request is still submitted
// without an attachment, matching production exactly (never blocks the submit).
export async function createVendorRequest({ vendorId, vendorName, product, qty, amount, location, invoiceNumber, poNumber, invoiceFile }, currentUser) {
  let invoiceUrl = null
  if (invoiceFile) {
    try {
      invoiceUrl = await uploadVendorFile(invoiceFile, 'invoices')
    } catch (e) {
      console.warn('Invoice upload failed, proceeding without it:', e.message)
    }
  }
  const empId = await lookupEmpId(myEmail(currentUser))
  const payload = {
    submitted_by: myEmail(currentUser),
    submitted_by_emp_id: empId,
    vendor_id: parseInt(vendorId),
    vendor_name: vendorName,
    product_name: product,
    qty: qty ? parseInt(qty) : null,
    amount: parseFloat(amount),
    location,
    invoice_number: invoiceNumber || null,
    po_number: poNumber || null,
    invoice_link: invoiceUrl,
    status: 'On Hold',
    payment_status: 'Unpaid',
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/vendor_requests`, { method: 'POST', headers: { ...SB_HDRS_JSON(), Prefer: 'return=minimal' }, body: JSON.stringify(payload) })
  if (!res.ok) throw mapSubmitError(new Error(await res.text()))
}

// ── Edit (On-Hold only) ───────────────────────────────────────────────────────
// A new invoice file, if chosen, is best-effort too — but unlike create, a failed upload here
// falls back to keeping the EXISTING invoice_link rather than clearing it, matching production's
// `let invoiceUrl = existingLink; if (file) { try { invoiceUrl = await upload() } catch {} }`.
export async function updateVendorRequest(id, { vendorId, vendorName, product, qty, amount, location, invoiceNumber, poNumber, invoiceFile, existingInvoiceLink }) {
  let invoiceUrl = existingInvoiceLink || null
  if (invoiceFile) {
    try {
      invoiceUrl = await uploadVendorFile(invoiceFile, 'invoices')
    } catch (e) {
      console.warn('Invoice upload failed:', e.message)
    }
  }
  const payload = {
    vendor_id: parseInt(vendorId) || null,
    vendor_name: vendorName,
    product_name: product,
    qty: qty ? parseInt(qty) : null,
    amount: parseFloat(amount),
    location,
    invoice_number: invoiceNumber || null,
    po_number: poNumber || null,
    invoice_link: invoiceUrl,
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/vendor_requests?id=eq.${id}`, { method: 'PATCH', headers: { ...SB_HDRS_JSON(), Prefer: 'return=minimal' }, body: JSON.stringify(payload) })
  if (!res.ok) throw mapSubmitError(new Error(await res.text()))
  return payload
}

// ── EA decision ────────────────────────────────────────────────────────────
export async function saveDecision(id, { status, remarks }, reviewerEmail) {
  const payload = { status, remarks: remarks || null, reviewed_by: reviewerEmail, reviewed_at: new Date().toISOString() }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/vendor_requests?id=eq.${id}`, { method: 'PATCH', headers: { ...SB_HDRS_JSON(), Prefer: 'return=minimal' }, body: JSON.stringify(payload) })
  if (!res.ok) throw new Error(await res.text())
  return payload
}

// ── Accounts: mark paid ───────────────────────────────────────────────────
export async function markPaid(id, { utr, proofFile }, payerEmail) {
  let attachUrl = null
  if (proofFile) {
    try {
      attachUrl = await uploadVendorFile(proofFile, 'payments')
    } catch (e) {
      console.warn('Attachment upload failed, proceeding without it:', e.message)
    }
  }
  const payload = { payment_status: 'Paid', utr_number: utr || null, payment_attachment: attachUrl, paid_by: payerEmail, paid_at: new Date().toISOString() }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/vendor_requests?id=eq.${id}`, { method: 'PATCH', headers: { ...SB_HDRS_JSON(), Prefer: 'return=minimal' }, body: JSON.stringify(payload) })
  if (!res.ok) throw new Error(await res.text())
  return payload
}

// Bulk pay blanks utr_number rather than leaving it untouched — matches production exactly.
export async function bulkMarkPaid(ids, payerEmail) {
  const payload = { payment_status: 'Paid', utr_number: '', paid_by: payerEmail, paid_at: new Date().toISOString() }
  let ok = 0
  let fail = 0
  for (const id of ids) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/vendor_requests?id=eq.${id}`, { method: 'PATCH', headers: { ...SB_HDRS_JSON(), Prefer: 'return=minimal' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      ok++
    } catch {
      fail++
    }
  }
  return { ok, fail, payload }
}

// ── Delete — no storage cleanup, matching production exactly: only the DB row is removed, any
// uploaded invoice file is left orphaned in the bucket. ──
export async function deleteVendorRequest(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/vendor_requests?id=eq.${id}`, { method: 'DELETE', headers: SB_HDRS() })
  if (!res.ok) throw new Error(await res.text())
}

// ── Filtering / KPIs ─────────────────────────────────────────────────────────
export function filterVendorRequests(all, { search, statusModes, payModes, vendor, requester, nameMap }) {
  const q = (search || '').toLowerCase().trim()
  const activeStatus = [...statusModes].filter((m) => STATUS_TAGS.includes(m))
  const activePay = [...payModes].filter((m) => PAY_TAGS.includes(m))
  return all.filter((r) => {
    if (activeStatus.length && !activeStatus.includes(r.status || 'On Hold')) return false
    if (activePay.length) {
      const isPaid = r.payment_status === 'Paid'
      if (!activePay.some((p) => (p === 'Paid' ? isPaid : !isPaid))) return false
    }
    if (vendor && r.vendor_name !== vendor) return false
    if (requester && String(r.submitted_by || '').toLowerCase().trim() !== requester) return false
    if (q) {
      const name = nameMap[String(r.submitted_by || '').toLowerCase()] || r.submitted_by || ''
      const hay = [r.vendor_name, r.product_name, r.location, r.submitted_by, name, String(r.amount || '')].join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export function computeCountKpis(rows) {
  return {
    total: rows.length,
    onHold: rows.filter((r) => r.status === 'On Hold').length,
    approved: rows.filter((r) => r.status === 'Approved').length,
    paid: rows.filter((r) => r.payment_status === 'Paid').length,
  }
}
export function computeAmountKpis(rows) {
  const sum = (list) => list.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const total = sum(rows)
  const approved = sum(rows.filter((r) => r.status === 'Approved'))
  const paid = sum(rows.filter((r) => r.payment_status === 'Paid'))
  return { total, approved, paid, unpaid: total - paid }
}

export function buildVendorFilterOptions(all) {
  return [...new Set(all.map((r) => r.vendor_name).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}
export function buildRequesterFilterOptions(all, nameMap) {
  const map = {}
  all.forEach((r) => {
    const email = String(r.submitted_by || '').toLowerCase().trim()
    if (!email || map[email]) return
    map[email] = { email, name: nameMap[email] || r.submitted_by }
  })
  return Object.values(map).sort((a, b) => String(a.name).localeCompare(String(b.name)))
}

// ₹ with plain thousands separators — matches production's KPI formatting exactly (NOT the
// K/L/Cr-compact style FMS's formatFmsAmount uses).
export function formatINR(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

export const STATUS_BADGE_STYLE = {
  Approved: { bg: 'bg-primary-tint', text: 'text-primary' },
  Declined: { bg: 'bg-danger-tint', text: 'text-danger' },
  'On Hold': { bg: 'bg-[#f0a500]/15', text: 'text-[#f0a500]' },
}
