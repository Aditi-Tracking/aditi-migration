// Column-filter VALUE MODEL + PostgREST query builder, shared by every module that uses ColumnFilter
// (Enquiry Capture Sheet, Field Sales Form, later Sales FMS / MeCa / Cold Leads).
//
// A module declares a SPEC once — which columns are filterable and how:
//
//   const SPEC = {
//     status:  { column: 'status',       kind: 'checklist' },
//     source:  { column: 'source',       kind: 'checklist' },                     // nullable → ColumnFilter includeBlanks
//     name:    { column: 'name',         kind: 'text' },
//     date:    { column: 'enquiry_date', kind: 'dateRange' },                     // a date column
//     created: { column: 'created_at',   kind: 'dateRange', timestamp: true },    // a timestamptz column
//   }
//
// keeps its filter state as { [key]: value } (start from emptyFilters(SPEC)), and appends
// buildFilterParams(SPEC, filters) to its query string. The values are:
//   checklist  string[]      the INCLUDED values. The BLANK token in the array means "rows where the
//                            column IS NULL" (Excel's "(Blanks)"). An empty array = no filter.
//                            On a text[] column (spec `array: true`) a row matches when its array holds ANY of the
//                            included values (Postgres overlap, PostgREST `ov`); blank = NULL.
//   text       string        case-insensitive "contains". '' = no filter.
//   dateRange  { from, to }  'YYYY-MM-DD' each, inclusive, either may be '' (open-ended).
//
// The same file also builds the ORDER BY (buildOrderParam — Excel-style column sort) and enforces the request-size
// rules (MAX_FILTER_VALUES / assertFilterBudget — see below).
//
// Everything user-typed is escaped for BOTH layers: PostgREST's own syntax (quotes, commas, parentheses
// in an in.(...) list; LIKE wildcards in a "contains") and URL encoding. Columns must be plain
// identifiers — a developer-supplied name, never user input — and anything else throws.
export const BLANK = '__blank__'
// Dates the user picks are India dates; a timestamptz column is compared against IST day boundaries, not UTC's.
export const IST_OFFSET = '+05:30'

const COLUMN_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const KINDS = ['checklist', 'text', 'dateRange']
const MAX_TEXT = 200

export const emptyFilterValue = (kind) => (kind === 'checklist' ? [] : kind === 'dateRange' ? { from: '', to: '' } : '')
export const emptyFilters = (spec) => Object.fromEntries(Object.entries(spec).map(([key, s]) => [key, emptyFilterValue(s.kind)]))

export function isFilterActive(kind, value) {
  if (kind === 'checklist') return Array.isArray(value) && value.length > 0
  if (kind === 'text') return typeof value === 'string' && value.trim() !== ''
  if (kind === 'dateRange') return !!value && (ISO_DATE.test(value.from || '') || ISO_DATE.test(value.to || ''))
  return false
}
export const countActiveFilters = (spec, filters) => Object.entries(spec).filter(([key, s]) => isFilterActive(s.kind, filters?.[key])).length

// A short human summary for the trigger's tooltip / an "active filters" line. labelOf maps a stored
// value to its display label (e.g. 'rnr' → 'RNR').
export function describeFilter(kind, value, labelOf = (v) => v) {
  if (kind === 'checklist') return (value || []).map((v) => (v === BLANK ? '(Blanks)' : labelOf(v))).join(', ')
  if (kind === 'text') return `contains “${String(value || '').trim()}”`
  if (kind === 'dateRange') return `${ISO_DATE.test(value?.from || '') ? value.from : '…'} to ${ISO_DATE.test(value?.to || '') ? value.to : '…'}`
  return ''
}

// "a,b" must survive PostgREST's list syntax: double-quote each item, escaping \ and ".
const quote = (v) => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
// In a LIKE pattern \ % _ are special; PostgREST also turns * into %, which can't be escaped — so a
// literal * simply can't be searched for and is dropped.
const likeEscape = (s) => s.replace(/[\\%_]/g, '\\$&').replace(/\*/g, '')
const enc = encodeURIComponent

function nextDay(iso) {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// → an array of ready-to-join "key=value" query-string fragments (already URL-encoded).
export function buildFilterParams(spec, filters) {
  const params = []
  const orGroups = []
  for (const [key, s] of Object.entries(spec)) {
    if (!COLUMN_RE.test(s.column || '')) throw new Error(`Filter "${key}": invalid column name "${s.column}"`)
    if (!KINDS.includes(s.kind)) throw new Error(`Filter "${key}": unknown kind "${s.kind}"`)
    const value = filters?.[key]
    if (!isFilterActive(s.kind, value)) continue
    const col = s.column

    if (s.kind === 'checklist') {
      const wantBlank = value.includes(BLANK)
      const items = value.filter((v) => v !== BLANK).map(quote).join(',')
      if (s.array) {
        // text[] column: overlap with {"a","b"}. Inside an or(...) group the braces and commas must be one quoted value.
        const lit = `{${items}}`
        if (wantBlank && items) orGroups.push(`or(${col}.ov."${lit.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}",${col}.is.null)`)
        else if (wantBlank) params.push(`${col}=is.null`)
        else params.push(`${col}=${enc(`ov.${lit}`)}`)
      } else if (wantBlank && items) orGroups.push(`or(${col}.in.(${items}),${col}.is.null)`)
      else if (wantBlank) params.push(`${col}=is.null`)
      else params.push(`${col}=${enc(`in.(${items})`)}`)
    } else if (s.kind === 'text') {
      const needle = likeEscape(value.trim().slice(0, MAX_TEXT))
      if (needle) params.push(`${col}=${enc(`ilike.*${needle}*`)}`)
    } else {
      const from = ISO_DATE.test(value.from || '') ? value.from : null
      const to = ISO_DATE.test(value.to || '') ? value.to : null
      if (s.timestamp) {
        if (from) params.push(`${col}=${enc(`gte.${from}T00:00:00${IST_OFFSET}`)}`)
        if (to) params.push(`${col}=${enc(`lt.${nextDay(to)}T00:00:00${IST_OFFSET}`)}`) // up to the end of `to`, exclusive of the next IST midnight
      } else {
        if (from) params.push(`${col}=gte.${from}`)
        if (to) params.push(`${col}=lte.${to}`)
      }
    }
  }
  // Several "values OR blank" filters must be combined under ONE and=(…): a query string may carry only one or=.
  if (orGroups.length) params.push(`and=${enc(`(${orGroups.join(',')})`)}`)
  return params
}

// ── Sorting ─────────────────────────────────────────────────────────────────
export const SORT_DIRS = ['asc', 'desc']

// The PostgREST `order=` for a table. `sortColumns` maps a column KEY to its database column (a developer-owned
// whitelist, like the filter spec); `sort` is { key, dir } or null; `defaultOrder` is the table's normal order
// ('enquiry_date.desc,created_at.desc,id.desc'), which ALWAYS ends in a unique column so paging by limit/offset is
// stable: it is the whole order when nothing is sorted, and the tiebreaker after the sorted column when something is.
// Blanks sort last in BOTH directions (Excel's behaviour; Postgres alone would put them first when descending).
// The database's ICU collation already orders text case-insensitively, so no expression ordering is needed.
export function buildOrderParam(sortColumns, sort, defaultOrder) {
  if (!sort || !sort.key) return `order=${defaultOrder}`
  const column = sortColumns[sort.key]
  if (!column || !COLUMN_RE.test(column)) throw new Error(`Sort: unknown column "${sort.key}"`)
  if (!SORT_DIRS.includes(sort.dir)) throw new Error(`Sort: invalid direction "${sort.dir}"`)
  const rest = defaultOrder.split(',').filter((term) => term.split('.')[0] !== column)
  return `order=${[`${column}.${sort.dir}.nullslast`, ...rest].join(',')}`
}

// ── Request size ────────────────────────────────────────────────────────────
// A checklist filter travels as in.("a","b",…) in the URL. Measured against the live API: 400 values (13 KB) work,
// 800 (28 KB) are refused. A column is therefore limited to MAX_FILTER_VALUES picked values, and the whole filter
// part of a request to FILTER_URL_BUDGET characters (already URL-encoded), so the worst case sits far below the limit.
export const MAX_FILTER_VALUES = 150
export const FILTER_URL_BUDGET = 12000
export function assertFilterBudget(params) {
  if (params.join('&').length > FILTER_URL_BUDGET) throw new Error('Too many filter values are selected across the columns — remove some and try again.')
}
