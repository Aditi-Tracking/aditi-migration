// Run:  node live_site_check.mjs   (optional: EXPECT_BUNDLE=index-xxxx.js EXPECT_TOTAL=3,2,95000; a person types the Admin login; not part of `npm test`)
// Post-deploy sanity check of https://learn.adititracking.com as a real Admin (typed by the person at the keyboard). READ-ONLY: it never submits a close,
// never writes anything. 1) Sales Rep MeCa: This Week loads with the expected Company total. 2) Sales FMS: opening a lead's detail window and its close dialog,
// then dismissing them, leaves exactly the right number of overlays (the stale-overlay fix). Tokens are never printed.
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false, defaultViewport: null, args: ['--no-sandbox', '--window-size=1500,950'] })
let n = 0, failed = 0
const ok = (c, m) => { n++; if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + m) }
const ctx = await browser.createBrowserContext(); const page = await ctx.newPage()
const errors = []; let access = null; const sums = []
page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 160)))
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|OneSignal|push/i.test(m.text())) errors.push(m.text().slice(0, 160)) })
page.on('response', async (res) => {
  const u = res.url(); if (!/supabase\.co\/rest\/v1\/rpc\/(lc_my_access|sales_meca_summary)/.test(u) || res.request().method() !== 'POST') return
  let b = null; try { b = await res.json() } catch { /* none */ }
  if (/lc_my_access/.test(u) && res.status() === 200) access = b
  if (/sales_meca_summary/.test(u)) sums.push({ status: res.status(), sent: JSON.parse(res.request().postData() || '{}'), body: b })
})
console.log('>>> A Chrome window is open on https://learn.adititracking.com . Log in there as the ADMIN. (Waiting up to 15 minutes.)')
await page.goto('https://learn.adititracking.com/', { waitUntil: 'domcontentloaded' })
const t0 = Date.now()
while (!access) { await sleep(1500); if (Date.now() - t0 > 15 * 60 * 1000) { console.log('login timed out'); process.exit(1) } }
console.log('logged in; Lead Capture tier:', access.tier)
ok(access.tier === 'lc_admin', 'the logged-in user is a Lead Capture Admin')
const bundle = await page.evaluate(() => [...document.scripts].map((s) => s.src).filter((s) => /assets\/index-/.test(s)).map((s) => s.split('/').pop()))
if (process.env.EXPECT_BUNDLE) ok(bundle.includes(process.env.EXPECT_BUNDLE), `the live page runs the expected bundle (${bundle.join(', ')})`)
else console.log('   bundle:', bundle.join(', '), '(set EXPECT_BUNDLE=index-xxxx.js to assert it)')
const clickText = (t) => page.evaluate((txt) => { const els = [...document.querySelectorAll('button,a,div,span,li')].filter((e) => e.offsetParent && e.innerText && e.innerText.trim() === txt); const el = els.sort((a, b) => a.innerText.length - b.innerText.length)[0]; if (el) el.click(); return !!el }, t)
const have = (sel) => page.evaluate((s) => !!document.querySelector(s), sel)
for (let i = 0; i < 40 && !(await have('[data-range="this_week"]')); i++) {
  if (i === 0 || i % 4 === 0) { if (!(await clickText('Sales Rep MeCa'))) { if (!(await clickText('Lead Capture'))) await clickText('Dashboards') } }
  if (i === 20) console.log('>>> Could not reach the tab on its own: please click Dashboards > Lead Capture > Sales Rep MeCa in the window.')
  await sleep(1500)
}
ok(await have('[data-range="this_week"]'), 'Sales Rep MeCa shows the new date filter')
await page.waitForNetworkIdle({ idleTime: 1500, timeout: 30000 }).catch(() => {})
const sel = await page.evaluate(() => document.querySelector('[data-range][aria-pressed="true"]')?.dataset.range)
const lab = await page.evaluate(() => document.querySelector('[data-role="period-label"]')?.innerText.trim())
ok(sel === 'this_week', 'it opens on This Week')
console.log('   range text:', lab)
const rows = await page.evaluate(() => { const f = document.querySelector('[data-role="range-filter"]'); return [...f.parentElement.querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].map((t) => t.innerText.trim())) })
const co = rows.find((r) => r[0] === 'Company total')
console.log('   Company total row:', co && co.slice(0, 5).join(' | '), '| rep rows:', rows.length - 1)
if (process.env.EXPECT_TOTAL) { const [m, c, t] = process.env.EXPECT_TOTAL.split(','); ok(!!co && co[1] === m && co[2] === c && co[4].replace(/[^0-9]/g, '') === t, `This Week Company total is ${m} meetings, ${c} clients, Rs ${t}`) }
else ok(!!co, 'This Week shows a Company total row (set EXPECT_TOTAL=meetings,clients,turnover, e.g. 3,2,95000, to assert the numbers)')
const first = sums.find((s) => s.sent.p_bucket === 'day')
ok(!!first && first.status === 200 && first.body.me.is_all === true, 'the summary call is HTTP 200 and the user is shown everyone (is_all)')
// ---- Sales FMS: the stale-overlay fix, without writing anything
await clickText('Sales FMS'); await sleep(1500); await page.waitForNetworkIdle({ idleTime: 1200, timeout: 30000 }).catch(() => {})
// only real dialogs: full-screen overlays that carry a Close button (the live page has other fixed full-screen elements)
const count = () => page.evaluate(() => [...document.querySelectorAll('.fixed.inset-0')].filter((o) => o.querySelector('[aria-label="Close"]')).length)
const base = await count()
console.log('   overlays before:', base)
// route A: the row's own close button -> dialog -> its X
const rowBtn = await page.evaluate(() => { const b = [...document.querySelectorAll('[aria-label^="Close "]')].find((x) => x.offsetParent && x.getAttribute('aria-label') !== 'Close'); if (!b) return null; const nm = b.getAttribute('aria-label'); b.click(); return nm })
if (rowBtn) {
  await sleep(500)
  ok((await count()) === base + 1, `row route (${rowBtn}): 1 overlay while the close dialog is open`)
  await page.evaluate(() => { const ov = [...document.querySelectorAll('.fixed.inset-0')].filter((o) => o.querySelector('[aria-label="Close"]')).pop(); ov.querySelector('[aria-label="Close"]').click() }); await sleep(400)
  ok((await count()) === base, 'row route: the dialog X leaves no overlay behind')
} else console.log('   (no open lead with a row close button was found: row route skipped)')
// route B: open the lead's detail window, then its close dialog on top, then dismiss both
const lead = await page.evaluate(() => { const b = [...document.querySelectorAll('[aria-label^="Pipeline for "]')].find((x) => x.offsetParent); if (!b) return null; const nm = b.getAttribute('aria-label'); b.click(); return nm })
if (lead) {
  await sleep(600)
  ok((await count()) === base + 1, `detail route (${lead}): the detail window opens (1 overlay)`)
  const hasClose = await page.evaluate(() => { const b = document.querySelector('.fixed.inset-0 [data-role="closure"] [data-role="close-lead"]'); if (b) b.click(); return !!b })
  if (hasClose) {
    await sleep(500)
    ok((await count()) === base + 2, 'detail route: the close dialog sits on top of the detail window (2 overlays)')
    await page.evaluate(() => { const ov = [...document.querySelectorAll('.fixed.inset-0')].filter((o) => o.querySelector('[aria-label="Close"]')).pop(); ov.querySelector('[aria-label="Close"]').click() }); await sleep(400)
    ok((await count()) === base + 1, 'detail route: the dialog X closes only the dialog; the detail window is still there and alive (1 overlay)')
  } else console.log('   (this lead is already closed, so it has no close button: dialog step skipped)')
  await page.evaluate(() => document.querySelector('.fixed.inset-0 [aria-label="Close"]').click()); await sleep(400)
  ok((await count()) === base, 'detail route: the detail X leaves nothing behind (0 extra overlays)')
} else console.log('   (no leads visible in Sales FMS: detail route skipped)')
ok(errors.length === 0, 'no console or page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' || ') : ''))
console.log(`\n${n - failed}/${n} passed, ${failed} failed`)
await ctx.close(); await browser.close(); process.exit(failed ? 1 : 0)
