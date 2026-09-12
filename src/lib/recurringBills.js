// Recurring Bills — Vendor Requests Phase 2. Ported from old-portal/js/vendor.js's second,
// independent feature (lines ~897-1419). Reuses Phase 1's lib/vendorRequests.js for
// `lookupEmpId`, `uploadVendorFile` (folder 'recurring'), `LOCATIONS`, and `formatINR` rather than
// duplicating any of them.
// Table: recurring_payments (id, vendor_name, product_name, location, due_date [day-of-month
// int], amount, status, payment_status, submitted_by/reviewed_by/paid_by [Emp_id INTEGERS, not
// emails — a real, confirmed inconsistency with vendor_requests], submitted_at/reviewed_at/
// paid_at, invoice_link, last_submitted_month [text 'YYYY-MM' cycle key]). ONE table, no history
// table — a cycle rollover INSERTs a fresh row instead, so past cycles' Approved/Paid state
// survives for the Month/Year filter.
//
// Confirmed during investigation: there is no "add a new recurring bill" UI anywhere — the only
// INSERT (the cycle-rollover branch of saveBill) always derives vendor_name/due_date from an
// EXISTING row. This module manages and resubmits a fixed, pre-seeded list of vendor+due-day
// pairs, not full CRUD. No delete exists for this table at all. submitted_by/reviewed_by/paid_by
// are never actually displayed by name anywhere in the UI, so unlike vendor_requests' email->name
// map, only the CURRENT user's own Emp_id is ever needed (for writes).
//
// Permissions — 4 dedicated keys, independent of vendor_access/vendor_review/vendor_pay
// (someone can have vendor rights with zero recurring rights or vice versa), all bypassed by
// owner/mis ONLY — no EA/executive-assistant shortcut, unlike vendor_view_all/vendor_review.
import { SUPABASE_URL, SB_HDRS, SB_HDRS_JSON } from './supabaseClient'
import { STATUS_TAGS, PAY_TAGS, uploadVendorFile } from './vendorRequests'

function role(currentUser) {
  return String(currentUser?.rawRole || currentUser?.role || '').toLowerCase().trim()
}
function isOwnerOrMis(currentUser) {
  const r = role(currentUser)
  return r === 'owner' || r === 'mis'
}

export function canAccessRecurringBills(currentUser, permissions) {
  return permissions?.recurring_access === 'true' || isOwnerOrMis(currentUser)
}
export function canEditRecurringBills(currentUser, permissions) {
  return permissions?.recurring_edit === 'true' || isOwnerOrMis(currentUser)
}
export function canReviewRecurringBills(currentUser, permissions) {
  return permissions?.recurring_review === 'true' || isOwnerOrMis(currentUser)
}
export function canPayRecurringBills(currentUser, permissions) {
  return permissions?.recurring_pay === 'true' || isOwnerOrMis(currentUser)
}

// ── Ordinal / cycle helpers ──────────────────────────────────────────────────
export function ordinal(n) {
  n = Number(n)
  if (!n && n !== 0) return '—'
  const v = n % 100
  const s = ['th', 'st', 'nd', 'rd']
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// A bill's "cycle" runs from its due_date to the day before next month's due_date — e.g.
// due_date=22 covers Aug 22 -> Sep 21, only flipping to the Sep cycle ON Sep 22. This is why a
// row keeps showing last cycle's Approved/Paid state right up to the due date instead of
// resetting on the 1st of the calendar month.
export function cycleKey(dueDay, ref) {
  ref = ref || new Date()
  let y = ref.getFullYear()
  let m = ref.getMonth()
  const d = Number(dueDay) || 1
  if (ref.getDate() < d) {
    m -= 1
    if (m < 0) {
      m = 11
      y -= 1
    }
  }
  return y + '-' + String(m + 1).padStart(2, '0')
}
export function submittedThisCycle(r) {
  return r.last_submitted_month === cycleKey(r.due_date)
}
// True if this bill still needs SOMEONE to act on it this cycle — not yet submitted, awaiting
// approval (On Hold), or approved but still unpaid. False only once fully settled
// (Approved+Paid) or Declined.
export function needsAction(r) {
  if (!submittedThisCycle(r)) return true
  if (r.status === 'On Hold') return true
  if (r.status === 'Approved' && r.payment_status !== 'Paid') return true
  return false
}
// Days between today and this bill's due day IN THE CURRENT MONTH (negative = overdue, 0 = due
// today, positive = days left) — not cycle-aware, just calendar-month due-day distance.
export function dueDistance(r) {
  if (r.due_date == null) return Infinity
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(today.getFullYear(), today.getMonth(), Number(r.due_date))
  return Math.round((due - today) / 86400000)
}
// Same vendor can have multiple rows over time (one per cycle once it rolls over) — the live
// dashboard only ever shows the newest row per vendor_name.
export function latestPerVendor(rows) {
  const map = {}
  rows.forEach((r) => {
    const key = r.vendor_name || '#' + r.id
    const cur = map[key]
    if (!cur) {
      map[key] = r
      return
    }
    const a = cur.last_submitted_month || ''
    const b = r.last_submitted_month || ''
    if (b > a || (b === a && r.id > cur.id)) map[key] = r
  })
  return Object.values(map)
}
export function totalVendorCount(all) {
  return new Set(all.map((r) => r.vendor_name)).size
}
// Calendar month/year the bill was actually SUBMITTED in — what the Month/Year history filter
// matches against, deliberately NOT last_submitted_month (the due-date cycle key, which can lag
// a calendar month behind the real submit date whenever the due date hasn't arrived yet this
// month).
export function submitYM(r) {
  return r.submitted_at ? r.submitted_at.slice(0, 7) : null
}
export function populateHistYearOptions(all) {
  const years = new Set([String(new Date().getFullYear())])
  all.forEach((r) => {
    const ym = submitYM(r)
    if (ym) years.add(ym.slice(0, 4))
  })
  return [...years].sort((a, b) => b - a)
}

// ── Fetch ────────────────────────────────────────────────────────────────────
export async function fetchAll() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/recurring_payments?select=*&order=vendor_name.asc`, { headers: SB_HDRS() })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
}

// Live view = latest row per vendor. History view (Month+Year picked) = every row actually
// SUBMITTED in that calendar month, across all vendors — including Paid ones.
export function baseRows(all, { histMonth, histYear }) {
  if (histMonth && histYear) {
    const key = histYear + '-' + histMonth
    return all.filter((r) => submitYM(r) === key)
  }
  return latestPerVendor(all)
}

// Ported from _rpApplyFilter. Status/pay chips only ever match a row that actually has a record
// for this cycle — a "Not submitted" row has no real status/payment to filter on; free-text
// search applies regardless of submitted state.
export function filterAndSortBills(base, { search, statusModes, payModes, histActive, recentIds }) {
  const q = (search || '').toLowerCase().trim()
  const activeStatus = [...statusModes].filter((m) => STATUS_TAGS.includes(m))
  const activePay = [...payModes].filter((m) => PAY_TAGS.includes(m))
  let rows = base.filter((r) => {
    if (q) {
      const hay = [r.vendor_name, r.product_name, r.location].join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (activeStatus.length || activePay.length) {
      const submitted = histActive ? true : submittedThisCycle(r)
      if (!submitted) return false
      if (activeStatus.length && !activeStatus.includes(r.status || 'On Hold')) return false
      if (activePay.length) {
        const isPaid = r.payment_status === 'Paid'
        if (!activePay.some((p) => (p === 'Paid' ? isPaid : !isPaid))) return false
      }
    }
    return true
  })
  // Bills that need SOMEONE to act — not yet submitted, On Hold, or Approved+unpaid — bubble to
  // the top, nearest due date first. Only fully settled (Approved+Paid) or Declined sink to the
  // bottom. Anything just submitted THIS session pins above even that.
  rows = [...rows].sort((a, b) => {
    if (!histActive) {
      const aRecent = recentIds.has(a.id)
      const bRecent = recentIds.has(b.id)
      if (aRecent !== bRecent) return aRecent ? -1 : 1
      const aNeed = needsAction(a)
      const bNeed = needsAction(b)
      if (aNeed !== bNeed) return aNeed ? -1 : 1
    }
    return dueDistance(a) - dueDistance(b)
  })
  return rows
}

// KPIs are computed from `base` (the Month/Year-scoped or live-latest-per-vendor set) — NOT the
// search/status/pay-filtered rows, unlike Vendor Requests' KPIs. Two genuinely different tile
// sets depending on whether history mode is active.
export function computeKpis(base, all, histActive) {
  const totalBills = totalVendorCount(all)
  if (histActive) {
    return {
      totalBills,
      submitted: base.length,
      pending: base.filter((r) => r.status === 'On Hold').length,
      approved: base.filter((r) => r.status === 'Approved').length,
      paid: base.filter((r) => r.payment_status === 'Paid').length,
    }
  }
  return {
    totalBills,
    dueNotSubmitted: base.filter((r) => !submittedThisCycle(r)).length,
    pending: base.filter((r) => submittedThisCycle(r) && r.status === 'On Hold').length,
    approved: base.filter((r) => submittedThisCycle(r) && r.status === 'Approved').length,
    paid: base.filter((r) => submittedThisCycle(r) && r.payment_status === 'Paid').length,
  }
}

// ── Save bill (resubmit this month) ───────────────────────────────────────────
// The PATCH-vs-INSERT decision: if this bill already has a record for an OLDER cycle, insert a
// fresh row so that old cycle's Approved/Paid state survives for history; otherwise (first-ever
// submission, or correcting the same cycle before its due date) patch the existing row in place.
// Attachment carryover is asymmetric, matching production exactly: a PATCH without a new file
// leaves the existing invoice_link untouched (the key is simply omitted from the payload); a
// fresh INSERT with no new file leaves it null rather than carrying the old cycle's file forward.
export async function saveBill(bill, { product, location, amount, invoiceFile }, empId) {
  let invoiceUrl = null
  if (invoiceFile) {
    try {
      invoiceUrl = await uploadVendorFile(invoiceFile, 'recurring')
    } catch (e) {
      console.warn('Attachment upload failed, proceeding without it:', e.message)
    }
  }
  const key = cycleKey(bill.due_date)
  const payload = {
    product_name: product,
    location,
    amount: parseFloat(amount),
    status: 'On Hold',
    payment_status: 'Unpaid',
    reviewed_by: null,
    reviewed_at: null,
    paid_by: null,
    paid_at: null,
    submitted_by: empId,
    submitted_at: new Date().toISOString(),
    last_submitted_month: key,
  }
  if (invoiceUrl) payload.invoice_link = invoiceUrl

  const isNewCycle = bill.last_submitted_month && bill.last_submitted_month !== key
  if (isNewCycle) {
    const insertPayload = { vendor_name: bill.vendor_name, due_date: bill.due_date, ...payload }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/recurring_payments`, { method: 'POST', headers: { ...SB_HDRS_JSON(), Prefer: 'return=representation' }, body: JSON.stringify(insertPayload) })
    if (!res.ok) throw new Error(await res.text())
    const [saved] = await res.json()
    return { row: saved, isNewCycle: true }
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/recurring_payments?id=eq.${bill.id}`, { method: 'PATCH', headers: { ...SB_HDRS_JSON(), Prefer: 'return=minimal' }, body: JSON.stringify(payload) })
  if (!res.ok) throw new Error(await res.text())
  return { row: { ...bill, ...payload }, isNewCycle: false }
}

// ── EA / Accounts actions ────────────────────────────────────────────────────
export async function saveDecision(id, status, empId) {
  const payload = { status, reviewed_by: empId, reviewed_at: new Date().toISOString() }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/recurring_payments?id=eq.${id}`, { method: 'PATCH', headers: { ...SB_HDRS_JSON(), Prefer: 'return=minimal' }, body: JSON.stringify(payload) })
  if (!res.ok) throw new Error(await res.text())
  return payload
}
export async function markPaid(id, empId) {
  const payload = { payment_status: 'Paid', paid_by: empId, paid_at: new Date().toISOString() }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/recurring_payments?id=eq.${id}`, { method: 'PATCH', headers: { ...SB_HDRS_JSON(), Prefer: 'return=minimal' }, body: JSON.stringify(payload) })
  if (!res.ok) throw new Error(await res.text())
  return payload
}

// empId is resolved ONCE by the caller and reused across every row — matches production exactly.
async function bulkPatch(ids, payload) {
  let ok = 0
  let fail = 0
  for (const id of ids) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/recurring_payments?id=eq.${id}`, { method: 'PATCH', headers: { ...SB_HDRS_JSON(), Prefer: 'return=minimal' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      ok++
    } catch {
      fail++
    }
  }
  return { ok, fail, payload }
}
export function bulkApprove(ids, empId) {
  return bulkPatch(ids, { status: 'Approved', reviewed_by: empId, reviewed_at: new Date().toISOString() })
}
export function bulkPay(ids, empId) {
  return bulkPatch(ids, { payment_status: 'Paid', paid_by: empId, paid_at: new Date().toISOString() })
}
