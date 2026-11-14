// Sales FMS tile strip: the REAL Lead Capture panel + Sales FMS components over a fake data layer (strip.jsx: a known pipeline of 19 leads, a summary computed
// from them, a list that honours the Current stage / State filters). Checks the tiles (order, labels, numbers), that the stage tiles add up to In pipeline, what
// each click asks the server for (the same filters the column filters use), toggling, the unchanged average-time tiles, the old-server shape and the console.
// Run:  node run.mjs   (from this folder; exit code 1 on any failure)
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const { createServer } = await import(pathToFileURL(path.join(REPO, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href)
const vite = await createServer({ root: HERE, configFile: path.join(HERE, 'vite.config.mjs') }); await vite.listen()
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let n = 0, failed = 0
const ok = (c, m, x) => { n++; if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + m + (!c && x !== undefined ? ' ' + JSON.stringify(x) : '')) }
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m, { got: a, want: b })
const bad = []
async function open(qs = '', width = 1700) {
  const page = await browser.newPage()
  page.on('pageerror', (e) => bad.push('pageerror: ' + e.message.slice(0, 160)))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) bad.push(m.text().slice(0, 160)) })
  await page.setViewport({ width, height: 950 })
  await page.goto('http://localhost:5312/strip.html' + qs, { waitUntil: 'networkidle0' }); await sleep(400)
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Sales FMS')?.click()); await sleep(900)
  return page
}
const tiles = (page) => page.$$eval('[data-role="kpi-strip"] [data-tile]', (b) => b.map((x) => ({ key: x.dataset.tile, label: x.querySelector('span').innerText.trim(), n: x.querySelectorAll('span')[1].innerText.trim(), on: x.getAttribute('aria-pressed') === 'true', title: x.title, h: Math.round(x.getBoundingClientRect().height) })))
const lastList = async (page) => (await page.evaluate(() => window.__reqs.filter((r) => r.path.endsWith('/sales_fms') && r.search.includes('limit=')))).at(-1)
const click = async (page, key) => { await page.evaluate(() => (window.__reqs.length = 0)); await page.evaluate((k) => document.querySelector(`[data-tile="${k}"]`).click(), key); await sleep(700) }
const rowCount = (page) => page.$$eval('tbody tr', (r) => r.filter((x) => x.offsetParent).length)

console.log('== the tiles')
{
  const page = await open()
  const t = await tiles(page)
  eq(t.map((x) => x.label.toLowerCase()), ['in pipeline', 'overdue', 'demo', 'quotation', 'won', 'lost'], 'S1 the six count tiles, in the agreed order')
  const body = await page.evaluate(() => document.querySelector('[data-role="kpi-strip"]').innerText.toLowerCase())
  ok(!/on track|not scheduled|first call|negotiation|closure/.test(body.replace(/first call\s+\d+h|first call\s+[\d.]+d|first call\s+—/g, '')), 'S2 no On track, Not scheduled, First Call, Negotiation or Closure COUNT tile (and no Negotiation average tile)', body)
  eq(t.map((x) => x.n), ['16', '10', '4', '5', '2', '1'], 'S3 the numbers: 16 open, 10 overdue, Demo 4, Quotation 5, won 2, lost 1')
  ok(Number(t[0].n) === 16 && Number(t[2].n) + Number(t[3].n) === 9, 'S4 In pipeline still counts every open lead (16), including those at stages that have no tile (Demo + Quotation = 9)')
  ok(/open leads only/i.test(t[0].title) && /won or lost/i.test(t[0].title) && !/stage tiles/i.test(t[0].title), 'S5 In pipeline explains itself in its tooltip (no claim about stage tiles any more)', t[0].title)
  ok(t.every((x) => x.h === 52) && !t.some((x) => x.on), 'S6 every tile is 52px high, none selected at the start')
  const avg = await page.$$eval('[data-role="kpi-strip"] [data-stage]', (d) => d.map((x) => [x.dataset.stage, x.querySelector('span').innerText.trim().toLowerCase(), x.querySelector('[data-role="avg"]').innerText.trim(), x.className.includes('border-danger')]))
  eq(avg, [['first_call', 'first call', '5h', false], ['demo', 'demo booked', '2.1d', true], ['quotation', 'quotation', '20h', false]], 'S7 three average-time tiles: First Call, Demo Booked (red, over its limit), Quotation; no Negotiation')
  await page.close()
}

console.log('\n== one row')
for (const width of [1440, 1366, 1056]) {   // 1056 = a 1280px screen less the 224px sidebar the harness page does not have
  const page = await open('', width)
  const g = await page.evaluate(() => { const els = [...document.querySelectorAll('[data-role="kpi-strip"] > [data-tile], [data-role="kpi-strip"] > [data-stage]')]; const r = els.map((e) => e.getBoundingClientRect()); return { n: els.length, tops: [...new Set(r.map((x) => Math.round(x.top)))], heights: [...new Set(r.map((x) => Math.round(x.height)))], right: Math.max(...r.map((x) => x.right)), minW: Math.min(...r.map((x) => x.width)), maxW: Math.max(...r.map((x) => x.width)), scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth, cut: [...document.querySelectorAll('[data-role="kpi-strip"] span.truncate')].filter((s) => s.scrollWidth > s.clientWidth).length } })
  ok(g.n === 9 && g.tops.length === 1 && g.heights.length === 1 && g.heights[0] === 52, `R1 at ${width}px wide all 9 tiles sit on ONE row, all 52px high`, g)
  ok(g.right <= width && g.scroll <= 0 && g.minW >= 96 && g.maxW <= 132 && g.cut === 0, `R2 at ${width}px: nothing overflows, tiles between 96 and 132px wide, no label cut off`, g)
  await page.close()
}
{
  const page = await open('', 700)
  const g = await page.evaluate(() => ({ tops: [...new Set([...document.querySelectorAll('[data-role="kpi-strip"] > [data-tile], [data-role="kpi-strip"] > [data-stage]')].map((e) => Math.round(e.getBoundingClientRect().top)))].length, scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth }))
  ok(g.tops > 1 && g.scroll <= 0, 'R3 on a narrow screen (700px) the row wraps and the page does not scroll sideways', g)
  await page.close()
}

console.log('\n== clicking')
{
  const page = await open()
  await click(page, 'stage_demo')
  let r = await lastList(page)
  ok(/current_stage=in\.\("?demo"?\)/.test(r.search) && !/pipeline_state=/.test(r.search), 'C1 Demo asks for current_stage in (demo) and no state filter', r.search)
  eq(await rowCount(page), 4, 'C2 the table shows the 4 Demo leads')
  let t = await tiles(page)
  eq(t.filter((x) => x.on).map((x) => x.key), ['stage_demo'], 'C3 only the Demo tile is marked selected')
  await click(page, 'stage_demo')
  r = await lastList(page)
  ok(!/current_stage=/.test(r.search) && !/pipeline_state=/.test(r.search), 'C5 clicking the selected tile again clears the filter', r.search)
  eq((await tiles(page)).filter((x) => x.on).length, 0, 'C6 nothing selected again')
  await click(page, 'won')
  r = await lastList(page)
  ok(/pipeline_state=in\.\("?closed_won"?\)/.test(r.search) && !/current_stage=/.test(r.search), 'C7 Won filters by State (unchanged behaviour)', r.search)
  eq(await rowCount(page), 2, 'C8 two Won leads')
  await click(page, 'stage_quotation')
  r = await lastList(page)
  ok(/current_stage=in\.\("?quotation"?\)/.test(r.search) && !/pipeline_state=/.test(r.search), 'C9 moving from Won to Quotation clears the State filter (one selection at a time)', r.search)
  eq(await rowCount(page), 5, 'C10 five Quotation leads')
  await click(page, 'overdue')
  r = await lastList(page)
  ok(/pipeline_state=in\.\("?overdue"?\)/.test(r.search) && !/current_stage=/.test(r.search), 'C11 Overdue filters by State and clears the stage', r.search)
  eq(await rowCount(page), 10, 'C12 ten overdue leads')
  await click(page, 'open')
  r = await lastList(page)
  ok(/pipeline_state=in\.\("?overdue"?,"?not_scheduled"?,"?on_track"?\)/.test(r.search), 'C13 In pipeline asks for the three open states (no closed lead)', r.search)
  eq(await rowCount(page), 16, 'C14 sixteen open leads: the number on the tile')
  t = await tiles(page)
  eq(t.filter((x) => x.on).map((x) => x.key), ['open'], 'C15 In pipeline is marked selected')
  await page.close()
}

console.log('\n== an older server (no per-stage counts)')
{
  const page = await open('?old=1')
  const t = await tiles(page)
  eq(t.map((x) => x.n), ['–', '10', '–', '–', '2', '1'], 'O1 the stage tiles and In pipeline show a dash, the rest still work')
  await page.close()
}
ok(bad.length === 0, 'Z no console or page errors during the whole run' + (bad.length ? ': ' + bad[0] : ''))
console.log(`\nRESULT: ${n - failed} passed, ${failed} failed (${n} checks)`)
await browser.close(); await vite.close(); process.exit(failed ? 1 : 0)
