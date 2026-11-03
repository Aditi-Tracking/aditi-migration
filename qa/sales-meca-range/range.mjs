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
await rf('... Last 3 Months = 4 Aug to 4 Nov (rolling)', 'last_3_months', '2026-11-04', ['2026-08-04', '2026-11-04', 'month', ''])
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
await rf('... Last 3 Months = 1 Oct 2026 to 1 Jan 2027', 'last_3_months', '2027-01-01', ['2026-10-01', '2027-01-01', 'month', ''])
await rf('Last 3 Months from 31 May 2026 clamps to 28 Feb (not 31 Feb)', 'last_3_months', '2026-05-31', ['2026-02-28', '2026-05-31', 'month', ''])
await rf('... from 31 May 2028 (leap year) clamps to 29 Feb', 'last_3_months', '2028-05-31', ['2028-02-29', '2028-05-31', 'month', ''])
await rf('... from 31 Mar 2026 = 31 Dec 2025', 'last_3_months', '2026-03-31', ['2025-12-31', '2026-03-31', 'month', ''])
await rf('... from 30 Nov = 30 Aug', 'last_3_months', '2026-11-30', ['2026-08-30', '2026-11-30', 'month', ''])
await rf('Last Month of 15 Mar 2028 = all of leap February (1 - 29 Feb)', 'last_month', '2028-03-15', ['2028-02-01', '2028-02-29', 'mweek', ''])
await rf('Last Month of 15 Jan 2026 = December 2025', 'last_month', '2026-01-15', ['2025-12-01', '2025-12-31', 'mweek', ''])
// every day of a year: week windows are always Mon-Sat (6 days) and never contain a Sunday
const bad = await page0.evaluate(() => { const out = []; const base = Date.UTC(2026, 0, 1); for (let i = 0; i < 730; i++) { const d = new Date(base + i * 86400000).toISOString().slice(0, 10); for (const k of ['this_week', 'prev_week']) { const r = window.__rangeFor({ key: k }, d); const a = new Date(r.from + 'T00:00:00Z'), b = new Date(r.to + 'T00:00:00Z'); if (a.getUTCDay() !== 1 || b.getUTCDay() !== 6 || (b - a) / 86400000 !== 5) out.push(d + ' ' + k + ' ' + r.from + '..' + r.to) } const t = window.__rangeFor({ key: 'this_week' }, d); const p = window.__rangeFor({ key: 'prev_week' }, d); if (t.from <= p.to || new Date(t.from + 'T00:00:00Z') - new Date(p.from + 'T00:00:00Z') !== 7 * 86400000) out.push(d + ' week order') } return out })
eq(bad, [], 'for each of 730 consecutive days: both week windows start on a Monday, end on a Saturday, span 6 days, and Previous Week is exactly 7 days before This Week')
const todayContained = await page0.evaluate(() => { const out = []; const base = Date.UTC(2026, 0, 1); for (let i = 0; i < 730; i++) { const d = new Date(base + i * 86400000); const s = d.toISOString().slice(0, 10); const r = window.__rangeFor({ key: 'this_week' }, s); const inWindow = s >= r.from && s <= r.to; if (d.getUTCDay() === 0 ? inWindow : !inWindow) out.push(s) } return out })
eq(todayContained, [], 'today is inside This Week on every day except a Sunday (a Sunday is in no window)')
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
eq(lab, ['This Week · Mon 2 Nov – Sat 7 Nov 2026', 'Last 3 Months · 4 Aug – 4 Nov 2026', 'This Week · Mon 28 Dec 2026 – Sat 2 Jan 2027', 'Last Month · 1 Oct – 31 Oct 2026'], 'the labels spell the days out')
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
