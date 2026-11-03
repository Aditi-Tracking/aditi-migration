// Regression: a rep row (or the Company row) clicked while a NEW range is still loading must open a detail that is consistent with the report that was on
// screen, never a mix of the old report's rep with the new report's buckets (which blanked the whole page when the new range had more buckets).
// Runs over the fake data layer (meca.jsx) with a slow answer (?delay=), so the click always lands before the new answer arrives.
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const { createServer } = await import(pathToFileURL(path.join(REPO, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href)
const vite = await createServer({ root: HERE, configFile: path.join(HERE, 'vite.config.mjs'), logLevel: 'silent' }); await vite.listen()
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, ignoreDefaultArgs: ['--hide-scrollbars'], args: ['--no-sandbox', '--disable-gpu'] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let n = 0, failed = 0
const ok = (c, m) => { n++; if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + m) }
const DELAY = 1500
// buckets of each preset on the pretend date used by the page (the real clock: this_month has 1..31 day rows, so it is left out of the pairs; the other four are fixed)
const COUNT = { this_week: 6, prev_week: 6, last_month: null, last_3_months: null } // last_month / last_3_months counted from the first screen below
const modalRows = (page) => page.evaluate(() => {
  const th = [...document.querySelectorAll('th')].find((t) => t.innerText.trim().toLowerCase() === 'period'); if (!th) return null
  return [...th.closest('table').querySelectorAll('tbody tr')].map((r) => r.querySelector('td').innerText.trim())
})
const bodyLen = (page) => page.evaluate(() => document.body.innerText.length)
async function scenario(label, from, to, row, afterMs) {
  const page = await browser.newPage(); const errs = []
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 120)) })
  await page.setViewport({ width: 1500, height: 900 })
  await page.goto(`http://localhost:5299/meca.html?delay=${DELAY}`, { waitUntil: 'networkidle0' }); await sleep(300)
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Sales Rep MeCa')?.click())
  const settle = () => page.waitForNetworkIdle({ idleTime: DELAY + 500, timeout: 20000 }).catch(() => {})
  await settle()
  if (from !== 'this_week') { await page.evaluate((k) => document.querySelector(`[data-range="${k}"]`).click(), from); await sleep(200); await settle() }
  const before = (await page.evaluate(() => document.querySelector('[data-role="period-label"]').innerText)).trim()
  // open the OLD report's detail once to learn how many period rows it has (and close it)
  const pick = async () => page.evaluate((nm) => { const r = [...document.querySelectorAll('tbody tr')].find((x) => x.innerText.includes(nm) && x.offsetParent); r?.click(); return !!r }, row)
  await pick(); await sleep(400); const oldRows = await modalRows(page); await page.evaluate(() => document.querySelector('button[aria-label="Close"]')?.click()); await sleep(300)
  // the race: choose the other range, and click the row BEFORE its answer arrives
  await page.evaluate((k) => document.querySelector(`[data-range="${k}"]`).click(), to)
  await sleep(afterMs)
  const stillOld = (await page.evaluate(() => document.querySelector('[data-role="period-label"]').innerText)).trim() // the label already names the new range...
  const clicked = await pick()
  await sleep(300)
  const during = await modalRows(page); const alive = (await bodyLen(page)) > 0
  ok(clicked && alive && errs.length === 0, `${label}: clicking "${row}" ${afterMs} ms after choosing the new range (answer not back yet) does not break the page${errs.length ? ' — ' + errs[0] : ''}`)
  ok(!!during && during.length === oldRows.length, `${label}: the detail is the old report's, complete and consistent (${during ? during.length - 1 : 'none'} period rows + Total, as before the switch: ${oldRows.length - 1})`)
  await settle()                                                  // the new answer arrives while the detail is open
  const after = await modalRows(page)
  ok((await bodyLen(page)) > 0 && errs.length === 0 && !!after && after.length === oldRows.length, `${label}: the new answer arriving while the detail is open leaves it as it was${errs.length ? ' — ' + errs[0] : ''}`)
  await page.evaluate(() => document.querySelector('button[aria-label="Close"]')?.click()); await sleep(300)
  const lab = (await page.evaluate(() => document.querySelector('[data-role="period-label"]').innerText)).trim()
  const newRows = await (async () => { await pick(); await sleep(500); const r = await modalRows(page); await page.evaluate(() => document.querySelector('button[aria-label="Close"]')?.click()); await sleep(200); return r })()
  ok(!!newRows && newRows.length !== undefined && errs.length === 0, `${label}: after closing, the detail of the NEW range opens normally (${newRows ? newRows.length - 1 : 'none'} period rows; screen now reads "${lab}")`)
  await page.close()
}
// every pair of presets with a DIFFERENT bucket count, in both directions: 6 days <-> 4 week-blocks <-> 4 months <-> 1-31 days (this_month)
const PAIRS = [['last_month', 'this_week'], ['last_3_months', 'this_week'], ['this_week', 'last_month'], ['this_week', 'last_3_months'], ['last_month', 'last_3_months'], ['this_month', 'last_month']]
for (const [from, to] of PAIRS) for (const ms of [100, 800]) await scenario(`${from} -> ${to}`, from, to, 'Ronak Shah', ms)
await scenario('last_month -> this_week (Company row)', 'last_month', 'this_week', 'Company total', 100)
await browser.close(); await vite.close()
console.log(`\n${n - failed}/${n} passed, ${failed} failed`); process.exit(failed ? 1 : 0)
