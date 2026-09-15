import { SB_HDRS, SB_HDRS_JSON, SUPABASE_URL } from './supabaseClient'

// Ported from old-portal/js/dealPricing.js. Tables: pricing_products,
// pricing_state_costs, pricing_quotes, pricing_quote_lines,
// pricing_admin_users, pricing_quote_counters. RPCs: is_pricing_admin(),
// get_pricing_catalog(state), submit_quote(...).
//
// Reps only ever see floor_price via get_pricing_catalog() — cost_price never
// leaves pricing_products/pricing_state_costs, which RLS locks down to
// is_pricing_admin() only. No direct writes to pricing_quotes/
// pricing_quote_lines from here; quotes only ever go through submit_quote()
// (server re-validates floor + totals, never trusts the client's numbers).
// No UI anywhere reads pricing_quotes back — the quote "log" is write-only
// from the frontend's perspective; the downloaded PDF is the only artifact
// the user keeps.

// Branch states this pricing model currently understands — org branch
// metadata, not product data, same kind of small hand-maintained list as
// RU_LOCATIONS in lib/renewals.js.
export const DP_STATES = ['Maharashtra', 'Gujarat', 'Karnataka', 'Goa']

// Defaults the Calculator's state picker to the rep's own branch, reusing
// the same crm_persons.location codes lib/renewals.js already reads for its
// own location scoping.
const DP_LOCATION_TO_STATE = {
  original: 'Maharashtra', // Mumbai HO
  gujarat: 'Gujarat',
  bangalore: 'Karnataka',
  goa: 'Goa',
}

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// ── Access — two independent gates, deliberately not folded into one ──────
// Calculator tab: can_view_pricing, a plain permission flag like any other.
// Cost Master tab (lib/dealPricing.js Phase 2): is_pricing_admin() RPC only —
// an MD/designated admin must never be locked out of it based on
// can_view_pricing.
export function canAccessCalculator(permissions) {
  return (permissions?.can_view_pricing || 'false') !== 'false'
}

export async function fetchIsPricingAdmin() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_pricing_admin`, {
      method: 'POST',
      headers: SB_HDRS_JSON(),
      body: JSON.stringify({}),
    })
    return res.ok ? (await res.json()) === true : false
  } catch {
    return false
  }
}

// ── Default state — reuse the rep's own branch (crm_persons.location) ─────
export async function resolveDefaultState(currentUser) {
  if (!currentUser?.email) return DP_STATES[0]
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/crm_persons?email=ilike.${encodeURIComponent(currentUser.email)}&is_active=eq.true&select=location&limit=1`,
      { headers: SB_HDRS() }
    )
    const rows = res.ok ? await res.json() : []
    const loc = rows?.[0]?.location
    return (loc && DP_LOCATION_TO_STATE[loc]) || DP_STATES[0]
  } catch {
    return DP_STATES[0]
  }
}

// ── Calculator — catalog + totals ──────────────────────────────────────────
export async function fetchPricingCatalog(state) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_pricing_catalog`, {
    method: 'POST',
    headers: SB_HDRS_JSON(),
    body: JSON.stringify({ p_state: state }),
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
}

// Margin % mirrors submit_quote's own definition (margin over floor, not
// over cost — reps never see cost), so what's previewed client-side always
// matches what the server stores: (selling/floor - 1) * 100.
export function priceFromMargin(floorPrice, marginPct) {
  return round2(floorPrice * (1 + marginPct / 100))
}

export function marginFromPrice(floorPrice, sellingPrice) {
  return floorPrice > 0 ? round2((sellingPrice / floorPrice - 1) * 100) : 0
}

export function hasBelowFloor(lines) {
  return lines.some((l) => l.product_id && l.selling_price < l.floor_price)
}

export function computeTotals(lines, catalog) {
  let subtotal = 0
  let gst = 0
  lines.forEach((line) => {
    if (!line.product_id) return
    const item = catalog.find((p) => p.product_id === line.product_id)
    const gstPct = item ? item.gst_pct : 0
    subtotal += line.qty * line.selling_price
    gst += (line.qty * line.selling_price * gstPct) / 100
  })
  subtotal = round2(subtotal)
  gst = round2(gst)
  return { subtotal, gst, grand: round2(subtotal + gst) }
}

// The one real write in this module — server re-validates floor + totals,
// never trusts the client's numbers.
export async function submitQuote({ state, customerName, lines }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_quote`, {
    method: 'POST',
    headers: SB_HDRS_JSON(),
    body: JSON.stringify({
      p_state: state,
      p_customer_name: customerName,
      p_lines: lines.map((l) => ({ product_id: l.product_id, qty: l.qty, selling_price: l.selling_price })),
    }),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(errBody.message || 'HTTP ' + res.status)
  }
  return res.json()
}
