// Sales Rep MeCa date filter: (A) the range maths over many dates, (B) the control wired into the real tab over a fake data layer (meca.jsx).
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const { createServer } = await import(pathToFileURL(path.join(REPO, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href)
const vite = await createServer({ root: HERE, configFile: path.join(HERE, 'vite.config.mjs') }); await vite.listen()
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, ignoreDefaultArgs: ['--hide-scrollbars'], args: ['--no-sandbox', '--disable-gpu'] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let n = 0, failed = 0
const ok = (c, m) => { n++; if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + m) }
const canon = (x) => JSON.stringify(x)
const eq = (a, b, m) => ok(canon(a) === canon(b), m + (canon(a) === canon(b) ? '' : `\n   got      ${canon(a)}\n   expected ${canon(b)}`))
const uniq = (arr) => [...new Map(arr.map((c) => [JSON.stringify(c), c])).values()]
const errors = []
const open = async (qs = '', vp = { width: 1700, height: 950 }) => {
  const page = await browser.newPage()
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 200)))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)) })
  await page.setViewport(vp); await page.goto('http://localhost:5299/meca.html' + qs, { waitUntil: 'networkidle0' }); await sleep(500)
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Sales Rep MeCa')?.click()); await sleep(900)
  return page
}
// ───────────────────────── A. the range maths ─────────────────────────
console.log('\n== A. rangeFor')
const page0 = await open()
const R = (key, today, extra = {}) => page0.evaluate((k, t, e) => { const r = window.__rangeFor({ key: k, ...e }, t); return [r.from, r.to, r.bucket, r.error] }, key, today, extra)
const rf = async (m, key, today, exp) => eq(await R(key, today), exp, m)
// a Wednesday
await rf('Wed 4 Nov 2026: This Week = Mon 2 - Sat 7 Nov', 'this_week', '2026-11-04', ['2026-11-02', '2026-11-07', 'day', ''])
await rf('... Previous Week = Mon 26 - Sat 31 Oct', 'prev_week', '2026-11-04', ['2026-10-26', '2026-10-31', 'day', ''])
await rf('... This Month = 1 Nov to today', 'this_month', '2026-11-04', ['2026-11-01', '2026-11-04', 'day', ''])
await rf('... Last Month = all of October', 'last_month', '2026-11-04', ['2026-10-01', '2026-10-31', 'mweek', ''])
await rf('... Last 3 Months = 1 Aug to 31 Oct (the 3 complete months before November; November, in progress, is not in it)', 'last_3_months', '2026-11-04', ['2026-08-01', '2026-10-31', 'month', ''])
// every weekday of one week lands in the same Mon-Sat window; Sunday goes to the week that just ended
for (const [d, label] of [['2026-11-02', 'Monday'], ['2026-11-03', 'Tuesday'], ['2026-11-05', 'Thursday'], ['2026-11-06', 'Friday'], ['2026-11-07', 'Saturday']]) await rf(`${label} ${d}: This Week is still 2 - 7 Nov`, 'this_week', d, ['2026-11-02', '2026-11-07', 'day', ''])
await rf('SUNDAY 8 Nov: This Week = the Mon-Sat that just ended (2 - 7 Nov)', 'this_week', '2026-11-08', ['2026-11-02', '2026-11-07', 'day', ''])
await rf('SUNDAY 8 Nov: Previous Week = 26 - 31 Oct', 'prev_week', '2026-11-08', ['2026-10-26', '2026-10-31', 'day', ''])
await rf('Sunday 1 Nov (first of the month): This Week = 26 - 31 Oct', 'this_week', '2026-11-01', ['2026-10-26', '2026-10-31', 'day', ''])
await rf('... and This Month is that single day', 'this_month', '2026-11-01', ['2026-11-01', '2026-11-01', 'day', ''])
await rf('Monday 2 Nov: Previous Week = 26 - 31 Oct', 'prev_week', '2026-11-02', ['2026-10-26', '2026-10-31', 'day', ''])
// year boundary, month ends, leap years
await rf('Fri 1 Jan 2027: This Week = Mon 28 Dec - Sat 2 Jan (crosses the year)', 'this_week', '2027-01-01', ['2026-12-28', '2027-01-02', 'day', ''])
await rf('... Last Month = December 2026', 'last_month', '2027-01-01', ['2026-12-01', '2026-12-31', 'mweek', ''])
await rf('... Last 3 Months = 1 Oct to 31 Dec 2026 (January, in progress, is not in it)', 'last_3_months', '2027-01-01', ['2026-10-01', '2026-12-31', 'month', ''])
// Last 3 Months is always whole months: nothing is clamped, whatever day of the month it is
await rf('Last 3 Months on 31 May 2026 = 1 Feb to 30 Apr', 'last_3_months', '2026-05-31', ['2026-02-01', '2026-04-30', 'month', ''])
await rf('... on 1 Nov and on 30 Nov the answer is the same: the current month never moves it (1 Nov)', 'last_3_months', '2026-11-01', ['2026-08-01', '2026-10-31', 'month', ''])
await rf('... (30 Nov)', 'last_3_months', '2026-11-30', ['2026-08-01', '2026-10-31', 'month', ''])
await rf('... on a Sunday (8 Nov 2026) too', 'last_3_months', '2026-11-08', ['2026-08-01', '2026-10-31', 'month', ''])
await rf('... on 31 May 2028 (leap year): 1 Feb to 30 Apr 2028, February in full', 'last_3_months', '2028-05-31', ['2028-02-01', '2028-04-30', 'month', ''])
await rf('... on 1 Mar 2028: ends on the leap day, 1 Dec 2027 to 29 Feb 2028', 'last_3_months', '2028-03-01', ['2027-12-01', '2028-02-29', 'month', ''])
await rf('... on 31 Mar 2026: 1 Dec 2025 to 28 Feb 2026 (crosses the year, a 28-day February)', 'last_3_months', '2026-03-31', ['2025-12-01', '2026-02-28', 'month', ''])
await rf('... on 15 Feb 2027: 1 Nov 2026 to 31 Jan 2027', 'last_3_months', '2027-02-15', ['2026-11-01', '2027-01-31', 'month', ''])
await rf('Last Month of 15 Mar 2028 = all of leap February (1 - 29 Feb)', 'last_month', '2028-03-15', ['2028-02-01', '2028-02-29', 'mweek', ''])
await rf('Last Month of 15 Jan 2026 = December 2025', 'last_month', '2026-01-15', ['2025-12-01', '2025-12-31', 'mweek', ''])
// every day of a year: week windows are always Mon-Sat (6 days) and never contain a Sunday
const bad = await page0.evaluate(() => { const out = []; const base = Date.UTC(2026, 0, 1); for (let i = 0; i < 730; i++) { const d = new Date(base + i * 86400000).toISOString().slice(0, 10); for (const k of ['this_week', 'prev_week']) { const r = window.__rangeFor({ key: k }, d); const a = new Date(r.from + 'T00:00:00Z'), b = new Date(r.to + 'T00:00:00Z'); if (a.getUTCDay() !== 1 || b.getUTCDay() !== 6 || (b - a) / 86400000 !== 5) out.push(d + ' ' + k + ' ' + r.from + '..' + r.to) } const t = window.__rangeFor({ key: 'this_week' }, d); const p = window.__rangeFor({ key: 'prev_week' }, d); if (t.from <= p.to || new Date(t.from + 'T00:00:00Z') - new Date(p.from + 'T00:00:00Z') !== 7 * 86400000) out.push(d + ' week order') } return out })
eq(bad, [], 'for each of 730 consecutive days: both week windows start on a Monday, end on a Saturday, span 6 days, and Previous Week is exactly 7 days before This Week')
const todayContained = await page0.evaluate(() => { const out = []; const base = Date.UTC(2026, 0, 1); for (let i = 0; i < 730; i++) { const d = new Date(base + i * 86400000); const s = d.toISOString().slice(0, 10); const r = window.__rangeFor({ key: 'this_week' }, s); const inWindow = s >= r.from && s <= r.to; if (d.getUTCDay() === 0 ? inWindow : !inWindow) out.push(s) } return out })
eq(todayContained, [], 'today is inside This Week on every day except a Sunday (a Sunday is in no window)')
const l3 = await page0.evaluate(() => { const out = []; const base = Date.UTC(2026, 0, 1); const iso = (t) => new Date(t).toISOString().slice(0, 10); for (let i = 0; i < 1096; i++) { const s = iso(base + i * 86400000); const r = window.__rangeFor({ key: 'last_3_months' }, s); const f = r.from, t = r.to; const nextDay = iso(Date.parse(t + 'T00:00:00Z') + 86400000); const months = (+t.slice(0, 4) * 12 + +t.slice(5, 7)) - (+f.slice(0, 4) * 12 + +f.slice(5, 7)); const span = (Date.parse(t) - Date.parse(f)) / 86400000 + 1; if (!(f.endsWith('-01') && nextDay.endsWith('-01') && months === 2 && span >= 89 && span <= 92 && nextDay === s.slice(0, 8) + '01' && r.bucket === 'month' && r.error === '')) out.push([s, f, t]) } return out })
eq(l3, [], 'for each of 1,096 consecutive days (2026-2028, two leap Februaries): Last 3 Months starts on a 1st, ends on a month end, is exactly 3 whole months (89-92 days) and the day after it is the 1st of the current month, so the current month is never in it')
const pr = await page0.evaluate(() => ({ ...Object.fromEntries(['this_week', 'prev_week', 'this_month', 'last_month', 'last_3_months'].map((k) => [k, window.__rangeFor({ key: k }, '2026-11-04').prorate])), custom: window.__rangeFor({ key: 'custom', from: '2026-09-15', to: '2026-12-10' }, '2026-11-04').prorate }))
eq(pr, { this_week: true, prev_week: true, this_month: false, last_month: true, last_3_months: true, custom: false }, 'the target mode of each option: This Week / Previous Week / Last Month / Last 3 Months prorate (the default call), This Month and Custom do not')
// Custom
const C = (from, to) => page0.evaluate((f, t) => { const r = window.__rangeFor({ key: 'custom', from: f, to: t }, '2026-11-04'); return [r.from, r.to, r.bucket, r.error] }, from, to)
eq((await C('', ''))[3], 'Choose a start date and an end date.', 'Custom with no dates: asks for both')
eq((await C('2026-11-01', ''))[3], 'Choose a start date and an end date.', '... or only one')
eq((await C('2026-11-05', '2026-11-01'))[3], 'The end date cannot be before the start date.', 'end before start is refused')
eq(await C('2026-11-03', '2026-11-03'), ['2026-11-03', '2026-11-03', 'day', ''], 'a single day is allowed (start = end, inclusive)')
eq((await C('2026-11-01', '2026-11-07'))[2], 'day', '7 days: one row per day'); eq((await C('2026-11-01', '2026-11-08'))[2], 'mweek', '8 days: month-week blocks')
eq((await C('2026-10-01', '2026-11-04'))[2], 'mweek', '35 days: still month-week blocks'); eq((await C('2026-10-01', '2026-11-05'))[2], 'month', '36 days: one row per month')
eq((await C('2021-11-05', '2026-11-04'))[3], '', '1,826 days (about 5 years): allowed'); eq((await C('2021-01-01', '2026-01-04'))[3], '', 'exactly 1,830 days: allowed')
eq((await C('2021-01-01', '2026-01-05'))[3], 'Choose a range of about 5 years or less.', '1,831 days: refused (the database limit is 1,830)')
const lab = await page0.evaluate(() => [window.__rangeFor({ key: 'this_week' }, '2026-11-04').label, window.__rangeFor({ key: 'last_3_months' }, '2026-11-04').label, window.__rangeFor({ key: 'this_week' }, '2027-01-01').label, window.__rangeFor({ key: 'last_month' }, '2026-11-04').label])
eq(lab, ['This Week · Mon 2 Nov – Sat 7 Nov 2026', 'Last 3 Months · 1 Aug – 31 Oct 2026', 'This Week · Mon 28 Dec 2026 – Sat 2 Jan 2027', 'Last Month · 1 Oct – 31 Oct 2026'], 'the labels spell the days out')
const bl = await page0.evaluate(async () => { const m = window.__MECA; return [m.bucketLabel('day', '2026-11-03', '2026-11-03'), m.bucketLabel('day', '2026-11-07', '2026-11-07')] })
eq(bl, ['Tue 3 Nov', 'Sat 7 Nov'], 'the day rows are labelled like "Tue 3 Nov"')
await page0.close()

// ───────────────────────── B. the control in the tab ─────────────────────────
console.log('\n== B. the control, wired into the tab')
const todayRange = (page, key) => page.evaluate((k) => { const t = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); const r = window.__rangeFor({ key: k }, t); return { from: r.from, to: r.to, bucket: r.bucket } }, key)
const page = await open()
eq(await page.evaluate(() => [...document.querySelectorAll('[data-role="range-filter"] [data-range]')].map((b) => b.innerText.trim())), ['This Week', 'Previous Week', 'This Month', 'Last Month', 'Last 3 Months', 'Custom'], 'the six options, in order')
eq(await page.evaluate(() => [...document.querySelectorAll('[data-range][aria-pressed="true"]')].map((b) => b.dataset.range)), ['this_week'], 'This Week is selected on load')
let calls = uniq(await page.evaluate(() => window.__calls))
let tw = await todayRange(page, 'this_week')
eq(calls.map((c) => c.bucket).sort(), [tw.bucket, 'none'].sort(), 'the first load asks twice (the breakdown and the totals) ...')
ok(calls.every((c) => c.from === tw.from && c.to === tw.to), `... both for the SAME range, this week's Monday-Saturday (${tw.from} to ${tw.to})`)
ok(!!(await page.$('table')) && /Ronak Shah/.test(await page.evaluate(() => document.body.innerText)), 'the report shows')
const click = async (key) => { await page.evaluate(() => { window.__calls.length = 0 }); await page.click(`[data-range="${key}"]`); await sleep(900); return uniq(await page.evaluate(() => window.__calls)) }
for (const key of ['prev_week', 'this_month', 'last_month', 'last_3_months', 'this_week']) {
  const exp = await todayRange(page, key); const c = await click(key)
  ok(c.length === 2 && c.every((x) => x.from === exp.from && x.to === exp.to) && c.some((x) => x.bucket === exp.bucket) && c.some((x) => x.bucket === 'none'), `${key}: both requests carry ${exp.from} to ${exp.to}, breakdown "${exp.bucket}"`)
  ok(await page.evaluate((k) => document.querySelector(`[data-range="${k}"]`).getAttribute('aria-pressed') === 'true' && document.querySelectorAll('[data-range][aria-pressed="true"]').length === 1, key), `${key}: exactly that option is pressed (single-select)`)
}
// the shared control feeds every number: one range text, the company row and the reps are all in one table that answered it
const labelNow = await page.$eval('[data-role="period-label"]', (e) => e.innerText)
ok(/This Week/.test(labelNow) && /Mon \d+ \w+ – Sat \d+ \w+ \d{4}/.test(labelNow), 'the range is spelled out beside the control: ' + labelNow)
const rowsText = await page.evaluate(() => [...document.querySelectorAll('tbody tr')].filter((r) => r.offsetParent).map((r) => r.innerText.replace(/\s+/g, ' ')))
ok(rowsText.length >= 3 && /Company/.test(rowsText[0]) && rowsText.some((r) => /Ronak/.test(r)) && rowsText.some((r) => /Suhas/.test(r)), 'Admin sees the Company rollup and a row per rep for the same range: ' + rowsText.length + ' rows')
// targets follow every range (step 25): a rep with a target shows a pro-rata one for a partial range, a plain one for a whole month
const ronak = (key) => page.evaluate(() => [...document.querySelectorAll('tbody tr')].filter((r) => r.offsetParent).map((r) => r.innerText.replace(/\s+/g, ' ')).find((t) => /Ronak/.test(t)))
await click('this_week'); ok(/pro-rata/.test(await ronak()), 'This Week: the target is shown, marked pro-rata: ' + (await ronak()).slice(0, 110))
await click('last_month'); ok(!/pro-rata/.test(await ronak()) && /6,00,000/.test(await ronak()), 'Last Month (whole month): the full monthly target, not marked pro-rata: ' + (await ronak()).slice(0, 110))
// layout stability: the table does not move when the choice changes
const tableTop = () => page.evaluate(() => Math.round([...document.querySelectorAll('table')].find((t) => t.offsetParent).getBoundingClientRect().top))
const filterH = () => page.evaluate(() => Math.round(document.querySelector('[data-role="range-filter"]').getBoundingClientRect().height))
const tops = []; const hs = []
for (const key of ['this_week', 'prev_week', 'this_month', 'last_month', 'last_3_months']) { await click(key); tops.push(await tableTop()); hs.push(await filterH()) }
ok(new Set(tops).size === 1 && new Set(hs).size === 1, `the filter row has one height (${hs[0]}px) and the table starts at one place (${tops[0]}px) for every option`)
// Custom
await page.evaluate(() => { window.__calls.length = 0 }); await page.click('[data-range="custom"]'); await sleep(500)
ok(!!(await page.$('[data-role="custom-dates"]')) && (await page.evaluate(() => window.__calls.length)) === 0, 'Custom shows two date boxes and asks nothing yet')
ok(/Choose a start date and an end date/.test(await page.$eval('[data-role="range-error"]', (e) => e.innerText)), 'and says what is missing')
ok(/Choose a valid date range/.test(await page.evaluate(() => document.body.innerText)), 'the table area shows a quiet message, not stale numbers or an error screen')
const setDate = async (label, v) => { await page.$eval(`input[aria-label="${label}"]`, (el, val) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) }, v); await sleep(250) }
await setDate('From date', '2026-10-05'); ok((await page.evaluate(() => window.__calls.length)) === 0, 'one date entered: still nothing asked')
await setDate('To date', '2026-10-01'); ok(/end date cannot be before/.test(await page.$eval('[data-role="range-error"]', (e) => e.innerText)) && (await page.evaluate(() => window.__calls.length)) === 0, 'an end before the start is refused in place, nothing asked')
ok(await filterH() === hs[0] + 0 || Math.abs((await filterH()) - hs[0]) <= 2, 'the error does not change the row height (' + (await filterH()) + 'px)')
await setDate('To date', '2026-10-31'); await sleep(900)
calls = uniq(await page.evaluate(() => window.__calls))
ok(calls.length === 2 && calls.every((c) => c.from === '2026-10-05' && c.to === '2026-10-31') && calls.some((c) => c.bucket === 'mweek') && calls.some((c) => c.bucket === 'none'), 'a valid range asks for exactly those dates (inclusive), month-week blocks (27 days): ' + canon(calls))
ok(!(await page.$('[data-role="range-error"]')), 'the error is gone')
await setDate('To date', '2026-10-05'); await sleep(800)
calls = uniq(await page.evaluate(() => window.__calls.slice(-4))).slice(-2)
ok(calls.length === 2 && calls.every((c) => c.from === '2026-10-05' && c.to === '2026-10-05') && calls.some((c) => c.bucket === 'day'), 'start = end is one day, one row per day')
await setDate('From date', '2020-01-01'); await setDate('To date', '2026-01-01'); await sleep(300)
ok(/5 years or less/.test(await page.$eval('[data-role="range-error"]', (e) => e.innerText)), 'a range of more than about 5 years is refused: ' + await page.$eval('[data-role="range-error"]', (e) => e.innerText))
await setDate('From date', '2026-08-04'); await setDate('To date', '2026-11-04'); await sleep(900)
// the breakdown labels of the detail
await page.evaluate(() => [...document.querySelectorAll('tbody tr')].filter((r) => r.offsetParent).find((r) => /Ronak/.test(r.innerText)).click()); await sleep(800)
const modalRows = await page.evaluate(() => [...document.querySelectorAll('.fixed.inset-0 tbody tr')].map((r) => r.children[0]?.innerText.replace(/\s+/g, ' ')).filter(Boolean))
ok(modalRows.some((t) => /^August 2026$/.test(t)) && modalRows.some((t) => /^November 2026$/.test(t)), 'a 3-month range: the rep detail has one row per month: ' + modalRows.slice(0, 5).join(' | '))
await page.evaluate(() => document.querySelector('.fixed.inset-0 [aria-label="Close"]').click()); await sleep(300)
await page.click('[data-range="this_week"]'); await sleep(900)
await page.evaluate(() => [...document.querySelectorAll('tbody tr')].filter((r) => r.offsetParent).find((r) => /Ronak/.test(r.innerText)).click()); await sleep(800)
const wk = await page.evaluate(() => [...document.querySelectorAll('.fixed.inset-0 tbody tr')].map((r) => r.children[0]?.innerText.replace(/\s+/g, ' ')).filter(Boolean))
ok(wk.filter((t) => /^(Mon|Tue|Wed|Thu|Fri|Sat) \d+ \w+$/.test(t)).length === 6 && !wk.some((t) => /^Sun /.test(t)), 'a week: the detail has six day rows, Monday to Saturday, no Sunday: ' + wk.join(' | '))
await page.close()

// ───────────────────────── B2. the target modes and the new Last 3 Months ─────────────────────────
console.log('\n== B2. target modes (whole month vs prorated) and Last 3 Months = 3 complete months')
const NOW = (d) => `?now=${d}T06:30:00Z`
const num = (s) => parseFloat(String(s).replace(/[^\d.-]/g, '')) || 0
const rowOf = (pg, name) => pg.evaluate((nm) => [...document.querySelectorAll('tbody tr')].filter((r) => r.offsetParent).map((r) => [...r.querySelectorAll('td')].map((t) => t.innerText.replace(/\s+/g, ' ').trim())).find((c) => c[0] === nm), name)
const clickOn = async (pg, key) => { await pg.evaluate(() => { window.__calls.length = 0 }); await pg.click(`[data-range="${key}"]`); await sleep(900); return uniq(await pg.evaluate(() => window.__calls)) }
const setD = (pg, label, v) => pg.$eval(`input[aria-label="${label}"]`, (el, val) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) }, v).then(() => sleep(250))
const custom = async (pg, from, to) => { await pg.click('[data-range="custom"]'); await sleep(300); await pg.evaluate(() => { window.__calls.length = 0 }); await setD(pg, 'From date', from); await setD(pg, 'To date', to); await sleep(900); return uniq(await pg.evaluate(() => window.__calls)) }
const detail = async (pg, name) => { await pg.evaluate((nm) => [...document.querySelectorAll('tbody tr')].filter((r) => r.offsetParent).find((r) => r.children[0].innerText.trim() === nm).click(), name); await sleep(800); const rows = await pg.evaluate(() => { const th = [...document.querySelectorAll('th')].find((t) => t.innerText.trim().toLowerCase() === 'period'); return [...th.closest('table').querySelectorAll('tbody tr')].map((x) => [...x.querySelectorAll('td')].map((t) => t.innerText.replace(/\s+/g, ' ').trim())) }); await pg.evaluate(() => document.querySelector('.fixed.inset-0 [aria-label="Close"]').click()); await sleep(300); return rows }
// the columns of a rep row: Rep | Meetings | Clients | Conversion | Turnover | Avg sale | Target | % of target | Gap
{
  const pg = await open(NOW('2026-11-04'))
  // --- Last 3 Months: Aug + Sep + Oct, November (in progress) excluded
  let c = await clickOn(pg, 'last_3_months')
  ok(c.length === 2 && c.every((x) => x.from === '2026-08-01' && x.to === '2026-10-31') && c.some((x) => x.bucket === 'month') && c.some((x) => x.bucket === 'none'), 'Last 3 Months on 4 Nov: both requests are 1 Aug to 31 Oct, month rows: ' + canon(c))
  ok(c.every((x) => x.prorate === undefined), 'Last 3 Months makes the call it always made: no p_prorate is sent')
  eq(await pg.$eval('[data-role="period-label"]', (e) => e.innerText), 'Last 3 Months · 1 Aug – 31 Oct 2026', 'its range text')
  let rows = await detail(pg, 'Ronak Shah')
  eq(rows.map((r) => r[0]), ['August 2026', 'September 2026', 'October 2026', 'Total'], 'the rep detail has exactly three month rows (Aug, Sep, Oct) and a Total: no November, no fourth row')
  ok(rows.slice(0, 3).every((r) => /6,00,000/.test(r[6])) && /18,00,000/.test(rows[3][6]), 'each whole month carries its full target and the Total is the plain sum of the three: ' + rows.map((r) => r[6]).join(' | '))
  let row = await rowOf(pg, 'Ronak Shah'); ok(/18,00,000/.test(row[6]) && !/pro-rata|full month/.test(row[6]), 'the target of 3 whole months is 18,00,000 with no pro-rata or full-month note: ' + row[6])
  // --- the prorated options are unchanged
  for (const key of ['this_week', 'prev_week', 'last_month']) { c = await clickOn(pg, key); ok(c.length === 2 && c.every((x) => x.prorate === undefined), `${key}: no p_prorate is sent (the default, prorated call)`) }
  await clickOn(pg, 'this_week'); row = await rowOf(pg, 'Ronak Shah'); ok(/pro-rata/.test(row[6]) && /1,20,000/.test(row[6]), 'This Week (Mon 2 - Sat 7 Nov, 6 of 30 days): still the pro-rata 1,20,000: ' + row[6])
  // --- This Month: the whole month's target, asked with p_prorate = false on both requests
  c = await clickOn(pg, 'this_month')
  ok(c.length === 2 && c.every((x) => x.prorate === false && x.from === '2026-11-01' && x.to === '2026-11-04'), 'This Month: both requests (breakdown and total) carry p_prorate = false: ' + canon(c))
  row = await rowOf(pg, 'Ronak Shah'); ok(/6,00,000/.test(row[6]) && /full month/.test(row[6]) && !/pro-rata/.test(row[6]), 'This Month (1-4 Nov): the FULL 6,00,000, marked "full month", not pro-rata: ' + row[6])
  rows = await detail(pg, 'Ronak Shah'); ok(rows.slice(0, -1).every((r) => r[6] === '—') && /6,00,000/.test(rows.at(-1)[6]), 'its day rows have no target (the Total row has the full one): ' + rows.map((r) => r[6]).join(' | '))
  await pg.close()
}
// the same full target on any day of the month, with % of target and Gap computed against it
for (const d of ['2026-11-01', '2026-11-10', '2026-11-30']) {
  const pg = await open(NOW(d)); await clickOn(pg, 'this_month'); const row = await rowOf(pg, 'Ronak Shah')
  const turnover = num(row[4]), target = num(row[6])
  ok(target === 600000, `This Month on ${d}: the target is the full 600000 whatever the date (${row[6]})`)
  ok(/full month/.test(row[6]) === (d !== '2026-11-30'), `... ${d === '2026-11-30' ? 'the whole month is covered, so no full-month note' : 'marked full month'}`)
  ok(Math.abs(num(row[7]) - turnover / 6000) <= 0.5 && num(row[8]) === 600000 - turnover, `... % of target (${row[7]}) and Gap (${row[8]}) are worked out against that full target and the turnover so far (${row[4]})`)
  await pg.close()
}
// --- Custom: every calendar month touched counts in full (partial start, partial end, both, neither)
{
  const pg = await open(NOW('2026-11-04'))
  let c = await custom(pg, '2026-09-15', '2026-12-10')
  ok(c.length === 2 && c.every((x) => x.prorate === false), 'Custom: both requests carry p_prorate = false: ' + canon(c))
  let row = await rowOf(pg, 'Ronak Shah'); ok(/24,00,000/.test(row[6]) && /full month/.test(row[6]), 'Custom 15 Sep - 10 Dec (partial start AND partial end, 4 months): 4 x 6,00,000 = 24,00,000, full month: ' + row[6])
  let rows = await detail(pg, 'Ronak Shah')
  eq(rows.map((r) => r[0]), ['September 2026', 'October 2026', 'November 2026', 'December 2026', 'Total'], 'its detail: one row per month touched')
  ok(rows.slice(0, 4).every((r) => /6,00,000/.test(r[6])) && /24,00,000/.test(rows[4][6]), 'September (from the 15th) and December (to the 10th) show their FULL target, and the four add up to the Total: ' + rows.map((r) => r[6]).join(' | '))
  c = await custom(pg, '2026-10-05', '2026-10-25'); row = await rowOf(pg, 'Ronak Shah')
  ok(/6,00,000/.test(row[6]) && /full month/.test(row[6]), 'Custom 5-25 Oct (inside one month): the full October target, 6,00,000: ' + row[6])
  rows = await detail(pg, 'Ronak Shah'); ok(rows.length >= 3 && rows.slice(0, -1).every((r) => r[6] === '—') && /6,00,000/.test(rows.at(-1)[6]), 'its month-week blocks have no target of their own (the Total has it, counted once): ' + rows.map((r) => r[6]).join(' | '))
  await custom(pg, '2026-08-20', '2026-10-31'); row = await rowOf(pg, 'Ronak Shah'); ok(/18,00,000/.test(row[6]) && /full month/.test(row[6]), 'Custom 20 Aug - 31 Oct (partial start, whole end): Aug + Sep + Oct in full = 18,00,000: ' + row[6])
  await custom(pg, '2026-08-01', '2026-10-15'); row = await rowOf(pg, 'Ronak Shah'); ok(/18,00,000/.test(row[6]) && /full month/.test(row[6]), 'Custom 1 Aug - 15 Oct (whole start, partial end): 18,00,000: ' + row[6])
  await custom(pg, '2026-08-01', '2026-10-31'); row = await rowOf(pg, 'Ronak Shah'); ok(/18,00,000/.test(row[6]) && !/pro-rata|full month/.test(row[6]), 'Custom 1 Aug - 31 Oct (exactly whole months): 18,00,000, no note (nothing is partial): ' + row[6])
  await custom(pg, '2026-11-10', '2026-11-10'); row = await rowOf(pg, 'Ronak Shah'); ok(/6,00,000/.test(row[6]) && /full month/.test(row[6]), 'Custom a single day (10 Nov): the full November target: ' + row[6])
  await pg.close()
}
// ───────────────────────── C. a Sunday, and a Sales Person ─────────────────────────
console.log('\n== C. Sunday / own numbers')
const sun = await open('?now=2026-11-08T07:00:00Z')
let sc = uniq(await sun.evaluate(() => window.__calls))
ok(sc.length === 2 && sc.every((c) => c.from === '2026-11-02' && c.to === '2026-11-07'), 'with the clock on a SUNDAY (8 Nov) the default This Week asks for Mon 2 - Sat 7 Nov: ' + canon(sc[0]))
await sun.evaluate(() => { window.__calls.length = 0 }); await sun.click('[data-range="prev_week"]'); await sleep(900); sc = uniq(await sun.evaluate(() => window.__calls))
ok(sc.every((c) => c.from === '2026-10-26' && c.to === '2026-10-31'), 'and Previous Week is 26 - 31 Oct')
await sun.close()
const me = await open('?own=1')
const mc = uniq(await me.evaluate(() => window.__calls)); const mtw = await todayRange(me, 'this_week')
ok(mc.length === 2 && mc.every((c) => c.from === mtw.from && c.to === mtw.to), 'a Sales Person asks for the same range through the same control')
const mrows = await me.evaluate(() => [...document.querySelectorAll('tbody tr')].filter((r) => r.offsetParent).map((r) => r.innerText.replace(/\s+/g, ' ')))
ok(mrows.length === 1 && /Ronak/.test(mrows[0]) && !/Company|Suhas/.test(mrows.join(' ')), 'and sees only their own row (no Company rollup): ' + mrows.join(' / ').slice(0, 100))
await me.close()
console.log('\nbrowser errors:', errors.length ? errors.slice(0, 3) : 'none'); ok(errors.length === 0, 'no console or page errors')
console.log(`\n${failed ? 'SOME FAILED' : 'ALL PASSED'} (${n} checks)`)
await browser.close(); await vite.close(); process.exit(failed ? 1 : 0)
