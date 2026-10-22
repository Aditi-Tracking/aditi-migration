// Date, time and money formatting shared by Sales FMS and Sales Rep MeCa. (The first four helpers used to live in lib/salesPipeline.js, the
// old 5-stage pipeline library, which the Sales FMS redesign retired.)
//
// Dates are 'YYYY-MM-DD' strings with whole-day arithmetic; moments are ISO timestamps as the database returns them, shown in INDIA time
// (Asia/Kolkata — a fixed +05:30, no daylight saving, which is what lets the helpers below convert by plain arithmetic).
const ISO = /^\d{4}-\d{2}-\d{2}$/
const utcDay = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
export const daysBetween = (a, b) => (ISO.test(a || '') && ISO.test(b || '') ? Math.round((utcDay(a) - utcDay(b)) / 86400000) : null) // a - b
export const addDays = (iso, n) => new Date(utcDay(iso) + n * 86400000).toISOString().slice(0, 10)
// Today's calendar date in India — the day the database counts against.
export const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
export function fmtDay(iso, withYear = false) {
  if (!ISO.test(iso || '')) return '—'
  return new Date(utcDay(iso)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' })
}
export const fmtMoney = (n) => (n === null || n === undefined || n === '' || Number.isNaN(Number(n)) ? '—' : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }))

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const IST_MS = 5.5 * 3600 * 1000
const istParts = (ts) => {
  const d = new Date(new Date(ts).getTime() + IST_MS) // shifted so the UTC getters read India's wall clock
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() }
}
const pad = (n) => String(n).padStart(2, '0')

// "18 Oct, 3:45 pm" (India time); with the year when asked. '—' for nothing.
export function fmtMoment(ts, withYear = false) {
  if (!ts || Number.isNaN(new Date(ts).getTime())) return '—'
  const p = istParts(ts)
  const h12 = p.h % 12 || 12
  return `${p.d} ${MONTHS[p.mo]}${withYear ? ' ' + p.y : ''}, ${h12}:${pad(p.mi)} ${p.h < 12 ? 'am' : 'pm'}`
}
// A length of time given in hours: "<1h", "5h", "2d", "2d 4h". Signless — the caller says late / early.
// A stage's average time as a headline figure: "36h" under a day, "1.2d" from a day up (one decimal, trailing .0 dropped).
export function fmtAvgTime(h) {
  if (h === null || h === undefined || Number.isNaN(Number(h))) return '—'
  const a = Math.abs(Number(h))
  if (a < 1) return '<1h'
  if (a < 24) return `${Math.round(a)}h`
  return `${(a / 24).toFixed(1).replace(/\.0$/, '')}d`
}

export function fmtHours(h) {
  if (h === null || h === undefined || Number.isNaN(Number(h))) return '—'
  const a = Math.abs(Number(h))
  if (a < 1) return '<1h'
  const whole = Math.round(a)
  if (whole < 48) return `${whole}h`
  const d = Math.floor(whole / 24)
  const r = whole % 24
  return r ? `${d}d ${r}h` : `${d}d`
}
export const hoursBetween = (later, earlier) => (later && earlier ? (new Date(later).getTime() - new Date(earlier).getTime()) / 3600000 : null)

// <input type="datetime-local"> works in local wall-clock text. These two convert between that text read as INDIA time and the ISO timestamp the
// database stores, whatever time zone the browser is in.
export function momentToInput(ts) {
  if (!ts || Number.isNaN(new Date(ts).getTime())) return ''
  const p = istParts(ts)
  return `${p.y}-${pad(p.mo + 1)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`
}
export const inputToMoment = (text) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text || '') ? `${text}:00+05:30` : null)
