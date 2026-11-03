// Regression matrix for "closing a lead in Sales FMS" (real Lead Capture panel + real Sales FMS components over a fake data layer, see fms.jsx):
// Won and Lost x opened from the ROW button and from the DETAIL modal x the five stages. Each case asserts the overlay count while the dialog is open,
// that the dialog's X dismisses just the dialog, that after submitting exactly the right overlays remain (none for the row route, the one live detail modal
// for the detail route), that the surviving modal shows the NEW state (never a stale copy), that its X dismisses it, that the write carried SO / amount /
// comment, and that no duplicate-key warning or page error was logged.  Run:  node matrix.mjs   (from this folder; exit code 1 on any failure)
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const { createServer } = await import(pathToFileURL(path.join(REPO, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href)
const vite = await createServer({ root: HERE, configFile: path.join(HERE, 'vite.config.mjs') }); await vite.listen()
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, ignoreDefaultArgs: ['--hide-scrollbars'], args: ['--no-sandbox', '--disable-gpu'] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const STAGES = ['first_call', 'demo', 'quotation', 'negotiation', 'closure']
let n = 0, failed = 0
const ok = (c, m) => { n++; if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + m) }
for (const outcome of ['won', 'lost']) for (const via of ['row', 'detail']) for (let i = 0; i < 5; i++) {
  const tag = `${outcome.toUpperCase().padEnd(4)} from ${via.padEnd(6)} at ${STAGES[i]}`
  const page = await browser.newPage(); const bad = []
  page.on('pageerror', (e) => bad.push('pageerror: ' + e.message.slice(0, 160)))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) bad.push(m.text().slice(0, 160)) })
  page.on('dialog', (d) => d.accept())
  await page.setViewport({ width: 1700, height: 950 }); await page.goto('http://localhost:5299/fms.html', { waitUntil: 'networkidle0' }); await sleep(500)
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Sales FMS')?.click()); await sleep(800)
  const name = `Lead ${STAGES[i]}`
  const count = () => page.evaluate(() => document.querySelectorAll('.fixed.inset-0').length)
  const open = async () => {
    if (via === 'detail') {
      if ((await count()) === 0) { await page.evaluate((nm) => document.querySelector(`[aria-label="Pipeline for ${nm}"]`).click(), name); await sleep(400) }
      await page.evaluate(() => document.querySelector('.fixed.inset-0 [data-role="closure"] [data-role="close-lead"]').click())
    } else await page.evaluate((nm) => document.querySelector(`[aria-label="Close ${nm}"]`).click(), name)
    await sleep(400)
  }
  // 1. open: the right number of overlays; the dialog's own X closes only the dialog
  await open()
  const want = via === 'detail' ? 2 : 1
  ok((await count()) === want, `${tag}: ${want} overlay(s) while the close dialog is open`)
  await page.evaluate(() => { const ov = [...document.querySelectorAll('.fixed.inset-0')].pop(); ov.querySelector('[aria-label="Close"]').click() }); await sleep(300)
  ok((await count()) === want - 1, `${tag}: the dialog's X closes just the dialog (${want - 1} left)`)
  // 2. open again and close the lead
  await open()
  await page.evaluate((o) => { const ov = [...document.querySelectorAll('.fixed.inset-0')].pop(); ov.querySelector(`[data-outcome="${o}"]`).click() }, outcome); await sleep(150)
  const fill = (label, v) => page.evaluate((l, val) => { const ov = [...document.querySelectorAll('.fixed.inset-0')].pop(); const el = ov.querySelector(`[aria-label="${l}"]`); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })) }, label, v)
  if (outcome === 'won') { await fill('SO number', 'S00123'); await fill('Order amount', '150000'); await fill('Comment', 'PO received') } else await fill('Comment', 'too costly')
  await page.evaluate(() => [...document.querySelectorAll('.fixed.inset-0')].pop().querySelector('[data-role="close-lead"]').click()); await sleep(1200)
  const body = await page.evaluate(() => window.__closeBody)
  ok(!!body && body.p_outcome === outcome && body.p_enquiry === `e-${i}`, `${tag}: the close call was sent for this lead with outcome ${outcome}`)
  if (outcome === 'won') ok(body.p_so_number === 'S00123' && body.p_amount === 150000 && body.p_comment === 'PO received', `${tag}: SO number, amount and comment were sent`)
  else ok(body.p_comment === 'too costly' && !body.p_so_number && body.p_amount === null, `${tag}: the reason was sent, no SO number or amount`)
  const left = await page.evaluate(() => [...document.querySelectorAll('.fixed.inset-0')].map((o) => o.innerText.replace(/\s+/g, ' ')))
  const wantLeft = via === 'detail' ? 1 : 0
  ok(left.length === wantLeft, `${tag}: exactly ${wantLeft} overlay(s) mounted after closing (found ${left.length})`)
  if (via === 'detail' && left.length) {
    const word = outcome === 'won' ? 'Won' : 'Lost'
    ok(new RegExp(`Lead ${STAGES[i]} ${word}\\b`).test(left[0]) && !/Overdue/.test(left[0]), `${tag}: the surviving modal shows the NEW state (${word}), not a stale copy`)
    ok(/Closure\s+(Won|Lost)/.test(left[0]), `${tag}: it shows the closure section`)
    await page.evaluate(() => document.querySelector('.fixed.inset-0 [aria-label="Close"]').click()); await sleep(400)
    ok((await count()) === 0, `${tag}: its X dismisses it`)
  }
  // the page is interactive again: the row shows the closed state and the lead can be opened and dismissed
  const rowText = await page.evaluate((nm) => [...document.querySelectorAll('tbody tr')].filter((r) => r.offsetParent).map((r) => r.innerText.replace(/\s+/g, ' ')).find((t) => t.includes(nm)) || '', name)
  ok(new RegExp(outcome === 'won' ? 'Won' : 'Lost').test(rowText), `${tag}: the list row shows ${outcome === 'won' ? 'Won' : 'Lost'}`)
  await page.evaluate((nm) => document.querySelector(`[aria-label="Pipeline for ${nm}"]`).click(), name); await sleep(400)
  ok((await count()) === 1, `${tag}: the closed lead can be opened again (1 overlay)`)
  await page.evaluate(() => document.querySelector('.fixed.inset-0 [aria-label="Close"]').click()); await sleep(300)
  ok((await count()) === 0, `${tag}: and dismissed`)
  ok(!bad.some((b) => /same key|Encountered two children/i.test(b)), `${tag}: no duplicate-key warning`)
  ok(bad.length === 0, `${tag}: no console error or page error` + (bad.length ? ': ' + bad[0] : ''))
  await page.close()
}
console.log(`\n${failed ? 'SOME FAILED' : 'ALL PASSED'} (${n} checks)`)
await browser.close(); await vite.close(); process.exit(failed ? 1 : 0)
