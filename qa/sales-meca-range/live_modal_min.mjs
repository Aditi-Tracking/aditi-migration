// Normal (non-race) open of the rep detail against LIVE data: 3 cases. Checks the period rows, the Total, the header, and that the lists behind the numbers loaded.
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const { createServer } = await import(pathToFileURL(path.join(REPO, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href)
const vite = await createServer({ root: HERE, configFile: path.join(HERE, 'vite.config.mjs'), logLevel: 'silent' }); await vite.listen()
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--disable-gpu'] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let n = 0, failed = 0
const ok = (c, m) => { n++; if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + m) }
const errors = []
const CASES = [['ADMIN', 'Ronak Shah', 'this_week', 6, 'This Week'], ['ADMIN', 'Ronak Shah', 'last_3_months', 4, 'Last 3 Months'], ['sultan@adititracking.com', 'Sultan Mulla', 'this_week', 6, 'This Week']]
for (const [who, rep, key, rows, name] of CASES) {
  const page = await browser.newPage()
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 150)))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 150)) })
  await page.setViewport({ width: 1500, height: 900 })
  await page.goto('http://localhost:5299/mecalive.html?who=' + encodeURIComponent(who), { waitUntil: 'networkidle0' }); await sleep(600)
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Sales Rep MeCa')?.click()); await page.waitForNetworkIdle({ idleTime: 800 })
  await page.evaluate((k) => document.querySelector(`[data-range="${k}"]`).click(), key); await page.waitForNetworkIdle({ idleTime: 800 })
  // the row's own numbers on the table (meetings, clients, turnover cells)
  const rowCells = await page.evaluate((nm) => { const r = [...document.querySelectorAll('tbody tr')].find((x) => x.innerText.includes(nm) && x.offsetParent); r.click(); return [...r.querySelectorAll('td')].map((t) => t.innerText.trim()) }, rep)
  await page.waitForNetworkIdle({ idleTime: 800 }); await sleep(300)
  const m = await page.evaluate(() => {
    const th = [...document.querySelectorAll('th')].find((t) => t.innerText.trim().toLowerCase() === 'period'); if (!th) return null
    const tb = th.closest('table'); const trs = [...tb.querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].map((t) => t.innerText.trim()))
    const dlg = tb.closest('[role="dialog"]') || tb.parentElement.parentElement
    const head = [...dlg.querySelectorAll('div')].filter((d) => /^\S/.test(d.innerText) && d.children.length === 0).slice(0, 2).map((d) => d.innerText.trim())
    const sec = (l) => { const s = dlg.querySelector(`section[aria-label="${l}"]`); return s ? { title: s.querySelector('div').innerText.trim(), items: s.querySelectorAll('tbody tr').length, text: s.innerText.slice(0, 60).replace(/\n/g, ' / ') } : null }
    return { trs, head, meetings: sec('Meetings'), clients: sec('Clients') }
  })
  console.log(`\n== ${who === 'ADMIN' ? 'Admin' : 'Field Sales'} · ${rep} · ${name}\n   table row: ${rowCells.join(' | ')}`)
  ok(!!m, 'the detail opened')
  if (!m) { await page.close(); continue }
  const body = m.trs.slice(0, -1), total = m.trs.at(-1)
  console.log('   header:', m.head.join(' || ')); console.log('   periods:', body.map((r) => r[0]).join(' | ')); console.log('   Total:', total.join(' | '))
  ok(body.length === rows, `${rows} period rows (got ${body.length})`)
  ok(m.head[1].includes(name + ' · '), `subtitle names the range the report answered ("${m.head[1]}")`)
  const sum = (i) => body.reduce((a, r) => a + (parseFloat(String(r[i]).replace(/[^\d.-]/g, '')) || 0), 0)
  ok(sum(1) === parseFloat(total[1]) && sum(2) === parseFloat(total[2]), `period rows add up to the Total (meetings ${sum(1)}/${total[1]}, clients ${sum(2)}/${total[2]})`)
  ok(rowCells.some((c) => c === total[1]) && rowCells.some((c) => c === total[2]), `the Total row matches the table row the click came from (meetings ${total[1]}, clients ${total[2]})`)
  console.log('   meetings list:', JSON.stringify(m.meetings), '\n   clients list:', JSON.stringify(m.clients))
  ok(m.meetings && !/Loading/.test(m.meetings.text) && m.clients && !/Loading/.test(m.clients.text), 'the leads lists finished loading (no error, no spinner)')
  ok(m.meetings.title.includes(`(${total[1]})`) && m.clients.title.includes(`(${total[2]})`), `list counts equal the Total (${m.meetings.title} / ${m.clients.title})`)
  await page.screenshot({ path: path.join(HERE, `live_min_${who === 'ADMIN' ? 'admin' : 'own'}_${key}.png`) })
  await page.close()
}
const log = await (await fetch('http://127.0.0.1:5390/log')).json(); const bad = log.log.filter((l) => !l.ok)
ok(bad.length === 0, `bridge: ${log.log.length} live calls, ${bad.length} errors`)
ok(errors.length === 0, 'no console or page errors' + (errors[0] ? ': ' + errors[0] : ''))
console.log(`\n${n - failed}/${n} passed, ${failed} failed`)
await browser.close(); await vite.close(); process.exit(failed ? 1 : 0)
