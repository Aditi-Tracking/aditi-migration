import { SB_HDRS, SB_HDRS_JSON, SB_HDRS_MIN, SB_HDRS_REPR, SUPABASE_URL } from './supabaseClient'

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

// ── Cost Master — MD-office only (is_pricing_admin() RPC, independent of
// can_view_pricing). Reads/writes pricing_products and pricing_state_costs
// directly (no RPC) — RLS on both tables already restricts this to
// is_pricing_admin() users. ───────────────────────────────────────────────
export const DP_PRODUCT_CATEGORIES = ['Hardware', 'Sensors', 'Subscription', 'Services']

export function productFloor(product) {
  return round2(product.cost_price * (1 + product.default_margin_pct / 100))
}

// Uses the PRODUCT's own default margin, not a per-override one — matches
// production exactly.
export function overrideFloor(costPrice, product) {
  return round2(costPrice * (1 + product.default_margin_pct / 100))
}

export async function fetchCostMasterData() {
  const [prodRes, overridesRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/pricing_products?select=*&order=category.asc,name.asc`, { headers: SB_HDRS() }),
    fetch(`${SUPABASE_URL}/rest/v1/pricing_state_costs?select=*`, { headers: SB_HDRS() }),
  ])
  if (!prodRes.ok) throw new Error('HTTP ' + prodRes.status)
  const products = await prodRes.json()
  const overrides = overridesRes.ok ? await overridesRes.json() : []
  const overridesByProduct = {}
  overrides.forEach((o) => {
    ;(overridesByProduct[o.product_id] = overridesByProduct[o.product_id] || []).push(o)
  })
  return { products, overridesByProduct }
}

// Soft-delete only, never a hard DELETE — old quotes' floor_price snapshots
// stay meaningful for audit even after a product is retired.
export async function toggleProductActive(productId, newActive) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/pricing_products?id=eq.${productId}`, {
    method: 'PATCH',
    headers: SB_HDRS_MIN(),
    body: JSON.stringify({ is_active: newActive, updated_at: new Date().toISOString() }),
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
}

// Returns the created row on insert (needed to switch the modal into edit
// mode immediately), nothing meaningful on update.
export async function saveProduct(productId, payload) {
  if (productId) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/pricing_products?id=eq.${productId}`, {
      method: 'PATCH',
      headers: SB_HDRS_MIN(),
      body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() }),
    })
    if (!res.ok) throw new Error(await res.text())
    return null
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/pricing_products`, {
    method: 'POST',
    headers: SB_HDRS_REPR(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  const [created] = await res.json()
  return created
}

// ── State overrides — each row commits to pricing_state_costs immediately,
// independent of the base product's own Save button. ─────────────────────
export async function addOverride(productId, state, costPrice) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/pricing_state_costs`, {
    method: 'POST',
    headers: SB_HDRS_REPR(),
    body: JSON.stringify({ product_id: productId, state, cost_price: costPrice }),
  })
  if (!res.ok) throw new Error(await res.text())
  const [created] = await res.json()
  return created
}

export async function updateOverride(overrideId, costPrice) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/pricing_state_costs?id=eq.${overrideId}`, {
    method: 'PATCH',
    headers: SB_HDRS_MIN(),
    body: JSON.stringify({ cost_price: costPrice }),
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
}

export async function deleteOverride(overrideId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/pricing_state_costs?id=eq.${overrideId}`, {
    method: 'DELETE',
    headers: SB_HDRS(),
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
}
