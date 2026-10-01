import { SB_HDRS, SB_HDRS_JSON, SB_HDRS_MIN, SB_HDRS_REPR, SUPABASE_URL } from './supabaseClient'

// Ported from old-portal/js/dealPricing.js, since redesigned around GST-inclusive
// prices. Tables: pricing_products, pricing_quotes, pricing_quote_lines,
// pricing_admin_users, pricing_quote_counters. RPCs: is_pricing_admin(),
// get_pricing_catalog(state), submit_quote(...).
//
// pricing_products rows are either a 'product' (optionally scoped to one
// state; state = null means universal) or an 'accessory' (always universal).
// Admins edit price_incl_gst / renewal_price_incl_gst; floor_price /
// renewal_floor_price are generated columns (ex-GST, price_incl_gst / 1.18)
// and are never sent in an insert/update payload.
//
// Reps only ever see floor prices via get_pricing_catalog() — RLS locks
// pricing_products down to is_pricing_admin() only. No direct writes to
// pricing_quotes/pricing_quote_lines from here; quotes only ever go through
// submit_quote() (server re-validates floor + totals, never trusts the
// client's numbers). No UI anywhere reads pricing_quotes back — the quote
// "log" is write-only from the frontend's perspective; the on-screen preview
// shown after submitting is the only record the user sees.

// Branch states this pricing model currently understands — org branch
// metadata, not product data, same kind of small hand-maintained list as
// RU_LOCATIONS in lib/renewals.js.
export const DP_STATES = ['Maharashtra', 'Gujarat', 'Karnataka', 'Goa', 'Madhya Pradesh', 'Tamil Nadu']

// Defaults the Calculator's state picker to the rep's own branch, reusing
// the same crm_persons.location codes lib/renewals.js already reads for its
// own location scoping.
// TODO: add the crm_persons.location codes for Madhya Pradesh and Tamil Nadu
// once known — until then reps in those branches default to Maharashtra.
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
async function fetchPricingCatalogRaw(state) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_pricing_catalog`, {
    method: 'POST',
    headers: SB_HDRS_JSON(),
    body: JSON.stringify({ p_state: state }),
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
}

// Per-state catalog cache. Stores the promise, so concurrent callers share one
// request. Failures are evicted (never cached). 5-minute TTL so a long-lived
// Calculator can't serve stale prices all session; submit_quote re-validates anyway.
const CATALOG_TTL_MS = 5 * 60 * 1000
const catalogCache = new Map() // state -> { at, promise }

export function fetchPricingCatalog(state) {
  const hit = catalogCache.get(state)
  if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.promise
  const promise = fetchPricingCatalogRaw(state)
  catalogCache.set(state, { at: Date.now(), promise })
  promise.catch(() => {
    if (catalogCache.get(state)?.promise === promise) catalogCache.delete(state)
  })
  return promise
}

export function buildCatalogMap(catalog) {
  return new Map(catalog.map((p) => [p.product_id, p]))
}

// Which floor applies to a catalog item for a given line type — null when
// that price hasn't been set yet. Accessories have no renewal, always 'new'.
export function floorFor(item, lineType) {
  if (!item) return null
  const floor = item.product_type !== 'accessory' && lineType === 'renewal' ? item.renewal_floor_price : item.floor_price
  return floor ?? null
}

// Margin % mirrors submit_quote's own definition (margin over the applicable
// floor), so what's previewed client-side always matches what the server
// stores: (selling/floor - 1) * 100.
export function priceFromMargin(floorPrice, marginPct) {
  return round2(floorPrice * (1 + marginPct / 100))
}

export function marginFromPrice(floorPrice, sellingPrice) {
  return floorPrice > 0 ? round2((sellingPrice / floorPrice - 1) * 100) : 0
}

// A line's own state, against the currently loaded catalog:
//   'unavailable' — its product isn't in the catalog (e.g. state-specific
//                   product after a state change)
//   'no_price'    — product exists but the applicable floor isn't set yet
//   'ok'          — priceable
export function lineStatus(line, catalogMap) {
  const item = catalogMap.get(line.product_id)
  if (!item) return 'unavailable'
  return floorFor(item, line.line_type) == null ? 'no_price' : 'ok'
}

// `floor_price` on a line is already the applicable floor (New or Renewal),
// or null when the line isn't priceable.
export function hasBelowFloor(lines) {
  return lines.some((l) => l.product_id && l.floor_price != null && l.selling_price < l.floor_price)
}

export function hasBlockedLines(lines, catalogMap) {
  return lines.some((l) => l.product_id && lineStatus(l, catalogMap) !== 'ok')
}

export function computeTotals(lines, catalogMap) {
  let subtotal = 0
  let gst = 0
  lines.forEach((line) => {
    if (!line.product_id) return
    const item = catalogMap.get(line.product_id)
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
      p_lines: lines.map((l) => ({ product_id: l.product_id, line_type: l.line_type, qty: l.qty, selling_price: l.selling_price })),
    }),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(errBody.message || 'HTTP ' + res.status)
  }
  return res.json()
}

// ── My Quotes — a rep's own submitted quotes ──────────────────────────────
export const MQ_PAGE_SIZE = 20

// One request via the quote_id FK embed. RLS scopes both tables; the explicit
// rep_email filter is there because is_pricing_admin() users would otherwise
// see every rep's quotes under "My Quotes". It's a convenience filter, not the
// security boundary. repEmail is lowercased to match the JWT-sourced rep_email.
export async function fetchMyQuotes({ repEmail, offset = 0, limit = MQ_PAGE_SIZE }) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/pricing_quotes?select=*,pricing_quote_lines(*)` +
      `&rep_email=eq.${encodeURIComponent((repEmail || '').toLowerCase())}` +
      `&order=created_at.desc&limit=${limit}&offset=${offset}`,
    { headers: { ...SB_HDRS(), Prefer: 'count=exact' } }
  )
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const rows = await res.json()
  const total = parseInt((res.headers.get('Content-Range') || '').split('/')[1], 10)
  return { rows, total: Number.isNaN(total) ? rows.length : total }
}

// Shapes a stored quote into what QuotePreviewModal expects.
export function quoteToPreview(q, repName) {
  return {
    result: { quote_ref: q.quote_ref, subtotal: q.subtotal, gst_amount: q.gst_amount, grand_total: q.grand_total },
    customerName: q.customer_name,
    state: q.state,
    repName,
    date: q.created_at,
    lines: (q.pricing_quote_lines || []).map((l) => ({
      name: l.product_name || 'Unknown product',
      line_type: l.line_type,
      qty: l.qty,
      selling_price: l.selling_price,
      gst_pct: l.gst_pct,
    })),
  }
}

// ── Cost Master — MD-office only (is_pricing_admin() RPC, independent of
// can_view_pricing). Reads/writes pricing_products directly (no RPC) — RLS
// already restricts this to is_pricing_admin() users. ──────────────────────
export const DP_PRODUCT_TYPES = ['product', 'accessory']

export async function fetchCostMasterProducts() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/pricing_products?select=*&order=product_type.asc,name.asc`, { headers: SB_HDRS() })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
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

// Returns the saved row in both cases — floor_price/renewal_floor_price are
// generated columns, so the row the server sends back is the only source of
// their new values. The payload must never include them.
export async function saveProduct(productId, payload) {
  const res = productId
    ? await fetch(`${SUPABASE_URL}/rest/v1/pricing_products?id=eq.${productId}`, {
        method: 'PATCH',
        headers: SB_HDRS_REPR(),
        body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() }),
      })
    : await fetch(`${SUPABASE_URL}/rest/v1/pricing_products`, {
        method: 'POST',
        headers: SB_HDRS_REPR(),
        body: JSON.stringify(payload),
      })
  if (!res.ok) throw new Error(await res.text())
  const [saved] = await res.json()
  if (!saved) throw new Error('Save was not applied (no row returned).')
  return saved
}
