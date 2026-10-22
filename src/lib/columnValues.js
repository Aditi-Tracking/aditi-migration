import { SUPABASE_URL, SB_HDRS } from './supabaseClient'

// The distinct values of one column, for an Excel-style checklist filter on a free-text column that has no pick-list
// behind it (a name, a phone number, a city…). The REST API has no DISTINCT or GROUP BY (PostgREST aggregates are
// switched off on this project), so this reads the column in pages — sorted, 1,000 rows a page, at most MAX_SCAN_ROWS
// rows — and removes the duplicates here. At this portal's volumes (hundreds to a few thousand rows a table) that is
// one to a few small requests; past the cap the result says `truncated` and the UI says so.
//
// `params` is the OTHER columns' active filters (already URL-encoded, from buildFilterParams): the list shows only
// values that still occur given them, like Excel — and since this is an ordinary table read, RLS decides what the
// caller may see, nothing else.
//   fetchColumnValues({ table, column, params }) → { values: string[], hasBlank: boolean, truncated: boolean }
//     values   distinct non-blank values, in the database's own (ICU, case-insensitive) sort order
//     hasBlank true when at least one row has NULL there (the filter's "(Blanks)" entry)
// A text[] column (`array: true`) contributes each ELEMENT as a value (so a row holding two products adds both), and
// `maxLength` leaves out longer elements — free-text paragraphs that would make a useless checklist entry.
// Results are cached per table + column + filters for CACHE_MS, and the whole cache is dropped by
// clearColumnValuesCache() — call it after anything that changes the data (a save, an import, a push). Don't mutate a result.
const SB = SUPABASE_URL + '/rest/v1'
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/
export const PAGE_SIZE = 1000
export const MAX_SCAN_ROWS = 5000
const CACHE_MS = 30000

const cache = new Map() // key -> { at, promise }
export const clearColumnValuesCache = () => cache.clear()

async function httpError(res) {
  const text = await res.text().catch(() => '')
  let msg = text
  try {
    const j = JSON.parse(text)
    msg = j.message || j.hint || text
  } catch {
    /* not JSON — use the raw text */
  }
  if (res.status === 401 || res.status === 403 || /row-level security|42501/i.test(msg || '')) return "You don't have permission to do that."
  return msg || 'Could not load the values.'
}

async function load(table, column, params, array, maxLength) {
  const seen = new Set()
  let hasBlank = false
  let scanned = 0
  let truncated = false
  for (let offset = 0; scanned < MAX_SCAN_ROWS; offset += PAGE_SIZE) {
    const q = [`select=${column}`, `order=${column}.asc.nullslast`, `limit=${PAGE_SIZE}`, `offset=${offset}`, ...params]
    const res = await fetch(`${SB}/${table}?${q.join('&')}`, { headers: SB_HDRS() })
    if (!res.ok) throw new Error(await httpError(res))
    const rows = await res.json()
    for (const r of rows) {
      const v = r[column]
      if (v === null || v === undefined) hasBlank = true
      else if (array) {
        for (const el of v) {
          const s = String(el).trim()
          if (s && (!maxLength || s.length <= maxLength)) seen.add(s)
        }
      } else if (String(v).trim() !== '') seen.add(String(v))
    }
    scanned += rows.length
    if (rows.length < PAGE_SIZE) break
    if (scanned >= MAX_SCAN_ROWS) truncated = true // a full last page at the cap: there may be more rows we did not read
  }
  return { values: [...seen], hasBlank, truncated }
}

export function fetchColumnValues({ table, column, params = [], array = false, maxLength = 0 }) {
  if (!IDENT.test(table || '') || !IDENT.test(column || '')) return Promise.reject(new Error('Invalid table or column.'))
  const key = `${table}|${column}|${array ? `a${maxLength}` : ''}|${params.join('&')}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise
  const promise = load(table, column, params, array, maxLength)
  cache.set(key, { at: Date.now(), promise })
  promise.catch(() => cache.delete(key)) // a failure is never cached
  return promise
}
