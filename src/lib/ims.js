// IMS (Inventory Management) Dashboard. Ported from old-portal/js/ims.js. Data source: 4
// separate Google Apps Script endpoints, one per location — each returns the FULL dataset for
// that location; all filtering (status/search/date) is client-side. 100% read-only.
export const IMS_LOCATIONS = [
  { key: 'hq', label: '🏢 Head Quarter', apiUrl: 'https://script.google.com/macros/s/AKfycbwJopykJi1HJzqsbeMaCqx0iaFQCbq-UJo0IZvqR8uDMttjYDb0enqsmNAz-2GxYsWA/exec' },
  { key: 'goa', label: '🌊 Goa', apiUrl: 'https://script.google.com/macros/s/AKfycbyJdOUvUvSDgRkFtVUlFahtABXzR-H1nrcv-Syj--wf1ehNoQIteTLuoXTZIwWBPQtByg/exec' },
  { key: 'gujarat', label: '🌾 Gujarat', apiUrl: 'https://script.google.com/macros/s/AKfycbz3m_D7OETa5BIX1JBL8wj4rZ_kVELBOzhqRpZSeSQi-gEBnCoHKCp9p4ir3TNwfFiR/exec' },
  { key: 'bangalore', label: '🏙️ Bangalore', apiUrl: 'https://script.google.com/macros/s/AKfycbz6NrjwVJxfivZfTlbeolSXy3Azsq0kdrHbMDgDT9UioBOQ4Gl-0Ypd--QtpvJjM3Sf_w/exec' },
]
export const IMS_LOCATION_LABELS = { hq: 'Head Quarter', goa: 'Goa', gujarat: 'Gujarat', bangalore: 'Bangalore' }

function apiUrlFor(location) {
  return IMS_LOCATIONS.find((l) => l.key === location)?.apiUrl || IMS_LOCATIONS[0].apiUrl
}

// ── Permission ───────────────────────────────────────────────────────────────
// Ported byte-for-byte from _canAccessIMS — a plain check, no role-string bypass (unlike
// Enterprise Lead/CRM Vehicle/HR Employee Master).
export function canAccessIMS(permissions) {
  return permissions?.can_view_ims === 'true'
}

// ── Fetch + parse ────────────────────────────────────────────────────────────
export async function fetchImsData(location) {
  const res = await fetch(apiUrlFor(location))
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'API error')
  return json
}

function s(v) {
  return v !== null && v !== undefined ? String(v) : ''
}
function n(v) {
  const num = parseFloat(v)
  return isNaN(num) ? 0 : num
}

// headers[0..4] are fixed columns (SKU Code/Item Name/Max Level/Material In Transit/Closing
// Stock); headers[5+] are one column per date.
export function parseImsRows(json) {
  const headers = json.headers || []
  const rows = json.data || []
  const dateHeaders = headers.slice(5).filter((h) => h && String(h).trim())
  const items = rows
    .filter((r) => r[headers[0]] || r[headers[1]])
    .map((r) => ({
      skuCode: s(r[headers[0]]),
      itemName: s(r[headers[1]]),
      maxLevel: n(r[headers[2]]),
      inTransit: n(r[headers[3]]),
      closing: n(r[headers[4]]),
      dates: dateHeaders.map((h) => n(r[h])),
    }))
  return { dateHeaders, items }
}

// ── Date parsing — 5 strategies, all preserved even though only 2 are live today (HQ's sheet
// uses full JS Date.toString() strings; the 3 branch sheets use dd/MM/yyyy) ──────────────────
export function parseImsDate(raw) {
  if (!raw) return null
  const str = String(raw).trim()

  // dd/MM/yyyy or d/M/yyyy — Indian format used by branch sheets
  const ddmm = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmm) {
    const d = parseInt(ddmm[1])
    const m = parseInt(ddmm[2])
    const y = parseInt(ddmm[3])
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(y, m - 1, d)
      if (!isNaN(dt.getTime())) return dt
    }
  }

  // yyyy-MM-dd (ISO)
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const dt = new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]))
    if (!isNaN(dt.getTime())) return dt
  }

  // dd-MM-yyyy
  const ddmmDash = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (ddmmDash) {
    const d = parseInt(ddmmDash[1])
    const m = parseInt(ddmmDash[2])
    const y = parseInt(ddmmDash[3])
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(y, m - 1, d)
      if (!isNaN(dt.getTime())) return dt
    }
  }

  // Excel serial number (e.g. 46747)
  if (/^\d{5}$/.test(str)) {
    const serial = parseInt(str)
    const dt = new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
    if (!isNaN(dt.getTime())) return dt
  }

  // Fallback: JS native parse (handles "May 6, 2026", RFC2822, HQ's full Date.toString(), etc.)
  const dt = new Date(str)
  return isNaN(dt.getTime()) ? null : dt
}

export function formatImsDate(raw) {
  if (!raw) return '—'
  const str = String(raw).trim()
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) return str
  const dt = new Date(str)
  if (!isNaN(dt.getTime())) {
    const dd = String(dt.getDate()).padStart(2, '0')
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    return `${dd}/${mm}/${dt.getFullYear()}`
  }
  return str
}

// Exact match for today -> closest past date -> latest available.
export function findTodayIndex(dateHeaders) {
  if (!dateHeaders.length) return -1
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const parsed = dateHeaders.map((h, i) => {
    const dt = parseImsDate(h)
    if (dt) dt.setHours(0, 0, 0, 0)
    return { i, dt }
  })
  const exact = parsed.find((p) => p.dt && p.dt.getTime() === today.getTime())
  if (exact) return exact.i
  const past = parsed.filter((p) => p.dt && p.dt <= today)
  if (past.length) return past[past.length - 1].i
  return dateHeaders.length - 1
}

// -1 or out-of-range resolves to the last (latest) column.
export function effectiveDateIndex(dateIdx, dateHeaders) {
  if (!dateHeaders.length) return null
  if (dateIdx >= 0 && dateIdx < dateHeaders.length) return dateIdx
  return dateHeaders.length - 1
}

// If the selected date's value is missing, falls back to closing stock.
export function stockForRow(row, effIdx) {
  if (effIdx === null) return row.closing
  const v = row.dates[effIdx]
  return v !== undefined && v !== null ? v : row.closing
}

// zero/low/ok — the maxLevel*10 threshold is ported verbatim from _imsSt, not adjusted.
export function statusForRow(row, effIdx) {
  const stock = stockForRow(row, effIdx)
  if (stock === 0) return 'zero'
  if (row.maxLevel > 0 && stock <= row.maxLevel * 10) return 'low'
  return 'ok'
}

export function computeMaxStock(rows, effIdx) {
  return Math.max(1, ...rows.map((r) => stockForRow(r, effIdx)))
}

// KPI values always read the full row set, never the active status filter — matches
// _imsRenderKPIs reading _imsAllRows, not a filtered subset.
export function computeImsKpis(rows, effIdx) {
  const total = rows.length
  const zero = rows.filter((r) => statusForRow(r, effIdx) === 'zero').length
  const low = rows.filter((r) => statusForRow(r, effIdx) === 'low').length
  const ok = rows.filter((r) => statusForRow(r, effIdx) === 'ok').length
  const totalStock = rows.reduce((sum, r) => sum + stockForRow(r, effIdx), 0)
  return { total, zero, low, ok, totalStock }
}

export function filterImsRows(rows, { statusFilter, search }, effIdx) {
  const q = (search || '').toLowerCase().trim()
  let out = rows
  if (statusFilter !== 'all') out = out.filter((r) => statusForRow(r, effIdx) === statusFilter)
  if (q) out = out.filter((r) => r.itemName.toLowerCase().includes(q) || r.skuCode.toLowerCase().includes(q))
  return out
}

export function topStockItems(rows, effIdx, limit = 15) {
  return [...rows].sort((a, b) => stockForRow(b, effIdx) - stockForRow(a, effIdx)).slice(0, limit)
}
