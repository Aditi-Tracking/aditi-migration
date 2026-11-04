// Independent date maths for the production checks (real_login_check.mjs, live_site_check.mjs): what the page SHOULD ask for, worked out here and not by the
// app's own rangeFor, so a bug in the app cannot make its own expectation pass. All dates are India calendar dates, YYYY-MM-DD.
export const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const pad = (n) => String(n).padStart(2, '0')
const ymd = (s) => [+s.slice(0, 4), +s.slice(5, 7), +s.slice(8, 10)]
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SHORT = LONG.map((m) => m.slice(0, 3))
export const monthStart = (s) => s.slice(0, 8) + '01'
export const monthEnd = (s) => { const [y, m] = ymd(s); return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}` }
export const addMonths = (s, n) => { const [y, m] = ymd(s); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}-01` }
// Last 3 Months = the 3 COMPLETE calendar months before the current one (the month in progress is never in it)
export const expectedLast3 = (today) => ({ from: addMonths(monthStart(today), -3), to: monthEnd(addMonths(monthStart(today), -1)) })
// the first day of every calendar month the range touches
export const monthsTouched = (from, to) => { const out = []; for (let m = monthStart(from); m <= to; m = addMonths(m, 1)) out.push(m) ; return out }
export const monthTitle = (s) => `${LONG[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}`   // "August 2026": the label of a month row in the rep detail
const day = (s) => `${+s.slice(8, 10)} ${SHORT[+s.slice(5, 7) - 1]}`
export const rangeText = (a, b) => (a.slice(0, 4) === b.slice(0, 4) ? `${day(a)} – ${day(b)} ${b.slice(0, 4)}` : `${day(a)} ${a.slice(0, 4)} – ${day(b)} ${b.slice(0, 4)}`)   // a range longer than a week
export const last3Label = (today) => { const r = expectedLast3(today); return `Last 3 Months · ${rangeText(r.from, r.to)}` }
