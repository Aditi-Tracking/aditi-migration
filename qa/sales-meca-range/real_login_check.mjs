// Run:  node real_login_check.mjs   (needs `pip install "psycopg[binary]"` for the bridge; not part of `npm test`: a person must type the logins)
// REAL end-to-end check of Sales Rep MeCa: the app's own dev server against production Supabase with a REAL login (typed by the person at the keyboard).
// For every sales_meca_summary / lc_my_access call the real PostgREST path answers, the response is compared with what the read-only SQL bridge returns for the
// same dates, the same p_prorate and the same logged-in e-mail. On top of that it checks, independently of the app, that Last 3 Months is the 3 COMPLETE calendar months
// before this one (numbers and target = the sum of the three whole-month answers) and that This Month and Custom carry the FULL monthly target (p_prorate = false).
// Nothing is written by this script; the app itself writes its usual login activity rows. Tokens are never printed or saved.
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { istToday, monthStart, monthEnd, monthsTouched, expectedLast3, last3Label, monthTitle } from './expected_ranges.mjs'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const OUT = path.join(HERE, 'real_login_result.json')
const { createServer } = await import(pathToFileURL(path.join(REPO, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href)
const vite = await createServer({ root: REPO, configFile: path.join(REPO, 'vite.config.js'), server: { port: 5311, strictPort: true }, logLevel: 'error' }); await vite.listen()
const bridge = spawn('python', [path.join(REPO, 'qa', 'sales-meca-range', 'meca_bridge.py'), '5390'], { env: process.env, stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await sleep(3000)
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false, defaultViewport: null, args: ['--no-sandbox', '--window-size=1500,950'] })
let n = 0, failed = 0
const ok = (c, m) => { n++; if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + m) }
const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((q) => [q, v[q]])) : v))
const bridgeCall = async (fn, body, who) => { const r = await fetch(`http://127.0.0.1:5390/rpc/${fn}?who=${encodeURIComponent(who)}`, { method: 'POST', body: JSON.stringify(body) }); return r.ok ? r.json() : { _error: r.status } }
const num = (s) => parseFloat(String(s).replace(/[^\d.-]/g, '')) || 0
const results = []
const OPTS = [['this_week', 'This Week'], ['prev_week', 'Previous Week'], ['this_month', 'This Month'], ['last_month', 'Last Month'], ['last_3_months', 'Last 3 Months']]
const TODAY = istToday()
const L3 = expectedLast3(TODAY)
const repKey = (r) => r.rep_email || 'label:' + r.rep_label
// What a rep's numbers and FULL monthly target are for one whole calendar month, worked out independently: the bridge's answer for exactly that month (a whole month
// is the same with or without proration). -> Map(repKey -> { m, c, t, target }), target null when none is set for that month
const wholeMonth = async (who, m) => { const r = await bridgeCall('sales_meca_summary', { p_from: m, p_to: monthEnd(m), p_bucket: 'none' }, who); return new Map((r.rows || []).map((x) => [repKey(x), { m: Number(x.meetings), c: Number(x.clients), t: Number(x.turnover), target: x.target ? Number(x.target.amount) : null }])) }
const sumMonths = async (who, months) => { const acc = new Map(); for (const m of months) for (const [k, v] of await wholeMonth(who, m)) { const a = acc.get(k) || { m: 0, c: 0, t: 0, target: null }; acc.set(k, { m: a.m + v.m, c: a.c + v.c, t: a.t + v.t, target: v.target === null ? a.target : (a.target || 0) + v.target }) } return acc }

async function runIdentity(name, ownRowName) {
  console.log(`\n================ ${name}\n>>> A Chrome window is open. Log in there as: ${name}. (Waiting up to 15 minutes.)`)
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  const errors = []; const calls = []; let who = null
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 160)))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|OneSignal|push/i.test(m.text())) errors.push(m.text().slice(0, 160)) })
  page.on('response', async (res) => {
    const u = res.url()
    if (!/supabase\.co/.test(u) || !/\/rest\/v1\/rpc\/(sales_meca_summary|sales_meca_leads|lc_my_access)/.test(u)) return
    const req = res.request(); if (req.method() !== 'POST') return // the CORS preflight (OPTIONS) has no body
    let body = null; try { body = await res.json() } catch { /* not json */ }
    let sent = {}; try { sent = JSON.parse(req.postData() || '{}') } catch { /* none */ }
    calls.push({ fn: u.split('/rpc/')[1].split('?')[0], status: res.status(), sent, body, bearer: /^Bearer ey/.test(req.headers().authorization || '') && req.headers().authorization.length > 200 })
  })
  await page.goto('http://localhost:5311/', { waitUntil: 'domcontentloaded' })
  const t0 = Date.now()
  for (;;) {
    await sleep(1500)
    if (Date.now() - t0 > 15 * 60 * 1000) throw new Error('login timed out')
    if (calls.some((c) => c.fn === 'lc_my_access' && c.status === 200)) break
  }
  who = await page.evaluate(() => { try { for (const k of Object.keys(localStorage)) { const v = JSON.parse(localStorage.getItem(k) || 'null'); const t = v?.access_token || v?.currentSession?.access_token; if (t) return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email } } catch { /* ignore */ } return null })
  console.log('logged in as:', who)
  ok(!!who, `${name}: a real session exists (e-mail claim read from the JWT, token not printed)`)
  const access = calls.find((c) => c.fn === 'lc_my_access' && c.status === 200)
  ok(access.bearer, `${name}: lc_my_access went through the real PostgREST path with the user's own bearer token`)
  const accB = await bridgeCall('lc_my_access', {}, who)
  ok(canon(access.body) === canon(accB), `${name}: lc_my_access (tier ${access.body.tier}) is identical to the bridge's answer for ${who}`)
  // navigate: Dashboards > Lead Capture > Sales Rep MeCa (falls back to asking the person to click)
  const clickText = (t) => page.evaluate((txt) => { const els = [...document.querySelectorAll('button,a,div,span,li')].filter((e) => e.offsetParent && e.innerText && e.innerText.trim() === txt); const el = els.sort((a, b) => a.innerText.length - b.innerText.length)[0]; if (el) el.click(); return !!el }, t)
  const have = () => page.evaluate(() => !!document.querySelector('[data-range="this_week"]'))
  for (let i = 0; i < 40 && !(await have()); i++) {
    if (i === 0 || i % 4 === 0) { if (!(await clickText('Sales Rep MeCa'))) { if (!(await clickText('Lead Capture'))) await clickText('Dashboards') } }
    if (i === 20) console.log('>>> Could not reach the tab on its own: please click Dashboards > Lead Capture > Sales Rep MeCa in the window.')
    await sleep(1500)
  }
  ok(await have(), `${name}: the Sales Rep MeCa tab with the new filter is on screen`)
  await page.waitForNetworkIdle({ idleTime: 1200, timeout: 30000 }).catch(() => {})
  const geom = () => page.evaluate(() => { const f = document.querySelector('[data-role="range-filter"]'); const r = (e) => (e ? [Math.round(e.getBoundingClientRect().top), Math.round(e.getBoundingClientRect().height)] : null); return { filter: r(f), label: r(document.querySelector('[data-role="period-label"]')), next: f.nextElementSibling ? Math.round(f.nextElementSibling.getBoundingClientRect().top) : null } })
  const tableRows = () => page.evaluate(() => { const f = document.querySelector('[data-role="range-filter"]'); return [...f.parentElement.querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].map((t) => t.innerText.trim())) })
  const label = () => page.evaluate(() => document.querySelector('[data-role="period-label"]')?.innerText.trim())
  const seen = []
  async function checkRange(key, text, since) {
    const mark = since ?? calls.length
    if (key) await page.evaluate((k) => document.querySelector(`[data-range="${k}"]`).click(), key)
    await sleep(400); await page.waitForNetworkIdle({ idleTime: 1000, timeout: 30000 }).catch(() => {})
    const mine = calls.slice(mark).filter((c) => c.fn === 'sales_meca_summary')
    const uniq = [...new Map(mine.map((c) => [canon(c.sent), c])).values()]
    ok(uniq.length >= 2 && uniq.every((c) => c.status === 200 && c.bearer), `${name} · ${text}: ${uniq.length} sales_meca_summary calls through the real path, all HTTP 200 with the user's bearer token`)
    let same = true; const diffs = []
    for (const c of uniq) { const b = await bridgeCall('sales_meca_summary', c.sent, who); if (canon(c.body) !== canon(b)) { same = false; diffs.push(c.sent) } }
    ok(same, `${name} · ${text}: every real response equals the bridge's for ${who} (same dates and bucket)${same ? '' : ' ' + JSON.stringify(diffs)}`)
    const lab = await label(); const rows = await tableRows(); const g = await geom()
    const tot = uniq.find((c) => c.sent.p_bucket === 'none')
    const me = tot.body.me
    // the table shows exactly the rows of the totals response, with the same numbers
    const want = tot.body.rows.map((r) => ({ name: r.rep_name || r.rep_label, m: Number(r.meetings), c: Number(r.clients), t: Number(r.turnover) }))
    const repRows = rows.filter((r) => r[0] !== 'Company total')
    const got = repRows.map((r) => ({ name: r[0], m: num(r[1]), c: num(r[2]), t: num(r[4]) }))
    const byName = new Map(got.map((x) => [x.name, x]))
    const tableOk = want.length === got.length && want.every((w) => { const x = byName.get(w.name); return x && x.m === w.m && x.c === w.c && x.t === w.t })
    ok(tableOk, `${name} · ${text}: the table's ${got.length} rep row(s) show exactly the numbers of the response${tableOk ? '' : ' ' + canon({ want, got })}`)
    if (me.is_all) { const co = rows.find((r) => r[0] === 'Company total'); ok(!!co && num(co[1]) === want.reduce((a, w) => a + w.m, 0) && num(co[2]) === want.reduce((a, w) => a + w.c, 0) && num(co[4]) === want.reduce((a, w) => a + w.t, 0), `${name} · ${text}: Company total = sum of the reps (${co ? co.slice(1, 5).join(' | ') : 'missing'})`) }
    else ok(!rows.some((r) => r[0] === 'Company total') && want.every((w) => w.name && true) , `${name} · ${text}: own scope, no Company row; ${want.length} row(s): ${want.map((w) => w.name).join(', ')}`)
    console.log(`   "${lab}" | rows ${repRows.length} | is_all ${me.is_all} | filter ${g.filter} label ${g.label} content-top ${g.next}`)
    seen.push({ key: key || 'custom', lab, g, rows: repRows.length, meetings: want.reduce((a, w) => a + w.m, 0), clients: want.reduce((a, w) => a + w.c, 0), turnover: want.reduce((a, w) => a + w.t, 0) })
    return { lab, g, uniq }
  }
  // the tab already loaded This Week while we navigated: load another range first so that every range checked below makes fresh calls to inspect
  await page.evaluate(() => document.querySelector('[data-range="last_month"]').click()); await sleep(400); await page.waitForNetworkIdle({ idleTime: 1000, timeout: 30000 }).catch(() => {})
  const detailRows = async (nm) => { const clicked = await page.evaluate((x) => { const r = [...document.querySelectorAll('tbody tr')].find((q) => q.children[0]?.innerText.trim() === x && q.offsetParent); r?.click(); return !!r }, nm); if (!clicked) return null; await sleep(500); await page.waitForNetworkIdle({ idleTime: 1000, timeout: 30000 }).catch(() => {}); const rows = await page.evaluate(() => { const th = [...document.querySelectorAll('th')].find((t) => t.innerText.trim().toLowerCase() === 'period'); return th ? [...th.closest('table').querySelectorAll('tbody tr')].map((x) => [...x.querySelectorAll('td')].map((t) => t.innerText.trim())) : null }); await page.evaluate(() => document.querySelector('.fixed.inset-0 [aria-label="Close"]')?.click()); await sleep(300); return rows }
  for (const [k, t] of OPTS) {
    const r = await checkRange(k, t); ok(r.lab && r.lab.startsWith(t + ' · '), `${name} · ${t}: range text reads "${r.lab}"`)
    const sent = r.uniq.map((c) => c.sent); const tot = r.uniq.find((c) => c.sent.p_bucket === 'none')
    if (k === 'last_3_months') {
      // the 3 complete calendar months before this one, whatever day of the month it is: the call is the default (prorated) call
      ok(sent.length === 2 && sent.every((s) => s.p_from === L3.from && s.p_to === L3.to && s.p_prorate === undefined) && sent.some((s) => s.p_bucket === 'month') && sent.some((s) => s.p_bucket === 'none'), `${name} · Last 3 Months: both requests are ${L3.from} to ${L3.to} (the 3 complete calendar months before ${TODAY.slice(0, 7)}), by month, no p_prorate sent`)
      ok(r.lab === last3Label(TODAY), `${name} · Last 3 Months: the range text reads "${last3Label(TODAY)}"`)
      const months = monthsTouched(L3.from, L3.to); const exp = await sumMonths(who, months)
      const bad = tot.body.rows.filter((x) => { const e = exp.get(repKey(x)) || { m: 0, c: 0, t: 0, target: null }; return Number(x.meetings) !== e.m || Number(x.clients) !== e.c || Number(x.turnover) !== e.t || (x.target ? Number(x.target.amount) : null) !== e.target })
      ok(bad.length === 0, `${name} · Last 3 Months: every rep's meetings, clients, turnover and target equal the sum of the three whole-month answers (${months.map((m) => m.slice(0, 7)).join(' + ')})${bad.length ? ' ' + canon(bad.map(repKey)) : ''}`)
      const starts = [...new Set(r.uniq.find((c) => c.sent.p_bucket === 'month').body.rows.map((x) => x.bucket_start))].sort()
      ok(canon(starts) === canon(months), `${name} · Last 3 Months: exactly 3 month rows, ${months.map(monthTitle).join(', ')} (got ${starts.join(', ')})`)
      const nm = ownRowName || (await tableRows()).map((q) => q[0]).find((x) => x === 'Ronak Shah'); const dr = nm ? await detailRows(nm) : null
      if (dr) ok(canon(dr.map((q) => q[0])) === canon([...months.map(monthTitle), 'Total']), `${name} · Last 3 Months: the detail of "${nm}" has the three month rows and a Total: ${dr.map((q) => q[0]).join(' | ')}`)
    } else if (k === 'this_month') {
      // the whole month's target, not a share by days: asked with p_prorate = false on BOTH requests
      ok(sent.length >= 2 && sent.every((s) => s.p_prorate === false), `${name} · This Month: both requests carry p_prorate = false`)
      const full = await wholeMonth(who, monthStart(TODAY))
      const bad = tot.body.rows.filter((x) => (x.target ? Number(x.target.amount) : null) !== (full.get(repKey(x))?.target ?? null))
      ok(bad.length === 0, `${name} · This Month: every rep's target is the FULL monthly target (the whole-month answer for ${TODAY.slice(0, 7)}), not a share by days${bad.length ? ' ' + canon(bad.map(repKey)) : ''}`)
      const withT = tot.body.rows.filter((x) => x.target)
      if (withT.length) { const row = (await tableRows()).find((q) => q[0] === (withT[0].rep_name || withT[0].rep_label)); const lastDay = TODAY === monthEnd(TODAY); ok(!!row && !/pro-rata/.test(row[6]) && /full month/.test(row[6]) === !lastDay, `${name} · This Month: the target cell reads "${row && row[6]}" (marked "full month"${lastDay ? ' only when the month is not yet complete: today is its last day, so no note' : ''}, never pro-rata)`) }
      else console.log(`   (${name} has no target in this month's rows: the label check is skipped)`)
    } else ok(sent.every((s) => s.p_prorate === undefined), `${name} · ${t}: no p_prorate is sent (the default, prorated call)`)
  }
  ok(new Set(seen.map((s) => canon(s.g))).size === 1, `${name}: filter bar, range-text row and content top edge are identical for all five presets (${canon(seen[0].g)})`)
  // Custom with the real date inputs
  await page.evaluate(() => document.querySelector('[data-range="custom"]').click()); await sleep(400)
  const dmy = await page.evaluate(() => { const i = document.createElement('input'); i.type = 'date'; i.id = '__p'; document.body.appendChild(i); i.focus() }).then(async () => { await page.keyboard.type('01022003'); const v = await page.$eval('#__p', (e) => e.value); await page.$eval('#__p', (e) => e.remove()); return v === '2003-02-01' })
  const fmt = (iso) => { const [y, m, d] = iso.split('-'); return dmy ? d + m + y : m + d + y }
  const typeDate = async (sel, iso) => { await page.evaluate(() => document.activeElement && document.activeElement.blur()); await page.focus(sel); await page.keyboard.type(fmt(iso)); await sleep(250) }
  const mark0 = calls.length
  await typeDate('input[aria-label="From date"]', '2026-10-05'); await typeDate('input[aria-label="To date"]', '2026-10-31')
  await sleep(300)
  const cr = await checkRange(null, "Custom 5-31 Oct", mark0)
  ok(cr.lab === 'Custom · 5 Oct – 31 Oct 2026', `${name} · Custom: range text reads "${cr.lab}"`)
  ok(cr.uniq.some((c) => c.sent.p_from === '2026-10-05' && c.sent.p_to === '2026-10-31' && c.sent.p_bucket === 'mweek'), `${name} · Custom: the typed dates reached the real database call as 2026-10-05..2026-10-31 by month-week`)
  ok(cr.uniq.every((c) => c.sent.p_prorate === false), `${name} · Custom: both requests carry p_prorate = false`)
  // Custom with a partial start AND a partial end: every calendar month touched counts at its full target
  const mark1 = calls.length
  await typeDate('input[aria-label="From date"]', '2026-09-15'); await typeDate('input[aria-label="To date"]', '2026-12-10')
  await sleep(300)
  const c2 = await checkRange(null, 'Custom 15 Sep - 10 Dec', mark1)
  const cm = monthsTouched('2026-09-15', '2026-12-10')
  ok(c2.lab === 'Custom · 15 Sep – 10 Dec 2026', `${name} · Custom 15 Sep - 10 Dec: range text reads "${c2.lab}"`)
  ok(c2.uniq.length === 2 && c2.uniq.every((c) => c.sent.p_from === '2026-09-15' && c.sent.p_to === '2026-12-10' && c.sent.p_prorate === false) && c2.uniq.some((c) => c.sent.p_bucket === 'month') && c2.uniq.some((c) => c.sent.p_bucket === 'none'), `${name} · Custom 15 Sep - 10 Dec: both requests are those dates, by month, p_prorate = false`)
  {
    const perMonth = new Map(); for (const m of cm) perMonth.set(m, await wholeMonth(who, m))
    const tot2 = c2.uniq.find((c) => c.sent.p_bucket === 'none').body, blocks = c2.uniq.find((c) => c.sent.p_bucket === 'month').body
    const expTotal = (k) => { let s = null; for (const m of cm) { const v = perMonth.get(m).get(k)?.target ?? null; if (v !== null) s = (s || 0) + v } return s }
    const badT = tot2.rows.filter((x) => (x.target ? Number(x.target.amount) : null) !== expTotal(repKey(x)))
    ok(badT.length === 0, `${name} · Custom 15 Sep - 10 Dec: every rep's target is the sum of the FULL targets of ${cm.map((m) => m.slice(0, 7)).join(', ')} (September from the 15th and December to the 10th still count in full)${badT.length ? ' ' + canon(badT.map(repKey)) : ''}`)
    const badB = blocks.rows.filter((x) => (x.target ? Number(x.target.amount) : null) !== (perMonth.get(x.bucket_start)?.get(repKey(x))?.target ?? null))
    ok(badB.length === 0, `${name} · Custom 15 Sep - 10 Dec: each month row carries that month's full target${badB.length ? ' ' + canon(badB.map((x) => [repKey(x), x.bucket_start])) : ''}`)
    const sumB = new Map(); for (const x of blocks.rows) if (x.target) sumB.set(repKey(x), (sumB.get(repKey(x)) || 0) + Number(x.target.amount))
    ok(tot2.rows.every((x) => (x.target ? Number(x.target.amount) : 0) === (sumB.get(repKey(x)) || 0)), `${name} · Custom 15 Sep - 10 Dec: the month rows add up to the range total`)
    const withT = tot2.rows.filter((x) => x.target)
    if (withT.length) { const row = (await tableRows()).find((q) => q[0] === (withT[0].rep_name || withT[0].rep_label)); ok(!!row && /full month/.test(row[6]) && !/pro-rata/.test(row[6]), `${name} · Custom 15 Sep - 10 Dec: the target cell reads "${row && row[6]}" (full month, never pro-rata)`) }
  }
  // back to This Week, open a rep detail
  await page.evaluate(() => document.querySelector('[data-range="this_week"]').click()); await sleep(400); await page.waitForNetworkIdle({ idleTime: 1000, timeout: 30000 }).catch(() => {})
  const rowName = ownRowName || (await tableRows()).map((r) => r[0]).find((x) => x === 'Ronak Shah') || (await tableRows())[1]?.[0]
  const mk = calls.length
  await page.evaluate((nm) => { const r = [...document.querySelectorAll('tbody tr')].find((x) => x.innerText.includes(nm) && x.offsetParent); r?.click() }, rowName)
  await sleep(500); await page.waitForNetworkIdle({ idleTime: 1000, timeout: 30000 }).catch(() => {})
  const modal = await page.evaluate(() => { const th = [...document.querySelectorAll('th')].find((t) => t.innerText.trim().toLowerCase() === 'period'); if (!th) return null; const tb = th.closest('table'); const dlg = tb.closest('[role="dialog"]') || tb.parentElement.parentElement; const sec = (l) => dlg.querySelector(`section[aria-label="${l}"] div`)?.innerText.trim(); return { rows: [...tb.querySelectorAll('tbody tr')].map((r) => r.querySelector('td').innerText.trim()), meetings: sec('Meetings'), clients: sec('Clients'), loading: /Loading…/.test(dlg.innerText) } })
  ok(!!modal && modal.rows.length === 7 && modal.rows.at(-1) === 'Total' && !modal.loading, `${name} · detail of "${rowName}": opens with 6 day rows + Total, lists loaded (${modal ? modal.meetings + ' / ' + modal.clients : 'none'})`)
  const leads = calls.slice(mk).filter((c) => c.fn === 'sales_meca_leads')
  let leadsSame = leads.length >= 2
  for (const c of leads) { const b = await bridgeCall('sales_meca_leads', c.sent, who); if (c.status !== 200 || canon(c.body) !== canon(b)) leadsSame = false }
  ok(leadsSame, `${name} · detail: ${leads.length} sales_meca_leads calls through the real path equal the bridge's answers`)
  await page.screenshot({ path: path.join(HERE, `real_${name.startsWith('Admin') ? 'admin' : 'sultan'}_detail.png`) })
  ok(errors.length === 0, `${name}: no console or page errors${errors.length ? ': ' + errors.slice(0, 3).join(' || ') : ''}`)
  results.push({ name, who, tier: access.body.tier, seen, modal })
  await ctx.close()
}
try {
  await runIdentity('Admin', null)
  await runIdentity('Sultan (Field Sales)', 'Sultan Mulla')
} catch (e) { console.log('STOPPED:', e.message); failed++ }
fs.writeFileSync(OUT, JSON.stringify(results, null, 1))
console.log(`\n${n - failed}/${n} passed, ${failed} failed`)
bridge.kill(); await browser.close(); await vite.close(); process.exit(failed ? 1 : 0)
