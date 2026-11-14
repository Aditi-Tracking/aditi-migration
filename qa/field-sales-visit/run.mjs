// Real-Chrome tests of the Field Sales Visit Form over a fake backend (visit.jsx). Run: npm install (puppeteer-core only), then npm test.
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const { createServer } = await import(pathToFileURL(path.join(REPO, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href)
const vite = await createServer({ root: HERE, configFile: path.join(HERE, 'vite.config.mjs'), logLevel: 'error' })
await vite.listen()
const ORIGIN = 'http://localhost:5311'
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, ignoreDefaultArgs: ['--hide-scrollbars'], args: ['--no-sandbox', '--disable-gpu'] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let n = 0, failed = 0
const ok = (c, m, extra) => { n++; if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + m + (!c && extra !== undefined ? '\n   ' + JSON.stringify(extra) : '')) }
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m, { got: a, want: b })
const errors = []

async function open(qs = '', vp = { width: 1500, height: 1000 }) {
  const ctx = await browser.createBrowserContext()
  await ctx.overridePermissions(ORIGIN, ['geolocation'])
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 200)))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)) })
  await page.setViewport(vp)
  await page.setGeolocation({ latitude: 19.07612, longitude: 72.87771, accuracy: 12 })
  await page.goto(`${ORIGIN}/visit.html${qs}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-role="new-visit"],table', { timeout: 8000 }).catch(() => {})
  await sleep(300)
  return page
}
const text = (page) => page.evaluate(() => document.body.innerText)
const waitFor = async (page, fn, arg, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg)) return true; await sleep(60) } return false }
const clickBtn = (page, label, scope = 'body') => page.evaluate((l, s) => { const b = [...document.querySelector(s).querySelectorAll('button')].find((x) => x.innerText.trim() === l && !x.disabled); if (!b) return false; b.click(); return true }, label, scope)
const fill = (page, id, value) => page.evaluate((i, v) => {
  const el = document.getElementById(i); if (!el) return false
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true })); return true
}, id, value)
const chip = (page, key, label) => page.evaluate((k, l) => { const g = document.getElementById('fv-' + k); const b = g && [...g.querySelectorAll('button')].find((x) => x.innerText.trim() === l); if (!b) return false; b.click(); return true }, key, label)
const FIELDS = ['purpose', 'source_of_lead', 'referrer_name', 'coordinator_booked', 'business_name', 'contact_person', 'contact_number', 'area', 'city', 'fleet_size', 'uses_gps', 'existing_gps', 'pain_area', 'lead_id', 'follow_up_reason', 'demo_given', 'demo_outcome', 'quotation_due_date', 'closing_reason', 'no_demo_reason', 'next_followup_date', 'quotation_outcome', 'quotation_followup_reason', 'so_number', 'won_amount', 'remarks', 'attachment']
const present = (page) => page.evaluate((ks) => ks.filter((k) => document.getElementById('fv-' + k)), FIELDS)
const toast = (page) => page.evaluate(() => document.querySelector('div.fixed.top-3')?.innerText.trim() || '')
const calls = (page) => page.evaluate(() => window.__calls)
const submits = (page) => page.evaluate(() => window.__submits)
const modal = (page) => page.evaluate(() => !!document.querySelector('.fixed.inset-0.z-\\[100\\]'))
async function png(page, w = 640, h = 480, name = 'photo.png') {
  const data = await page.evaluate((W, H) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H); return c.toDataURL('image/png').split(',')[1] }, w, h)
  const f = path.join(os.tmpdir(), `${Date.now()}-${name}`); fs.writeFileSync(f, Buffer.from(data, 'base64')); return f
}
const attach = async (page, w, h) => { const f = await png(page, w, h); const inp = await page.$('[data-role="camera-input"]'); await inp.uploadFile(f); return waitFor(page, () => !!document.querySelector('[data-role="geo-ok"]') || !!document.querySelector('[data-role="retry-geo"]'), null, 8000) }
const futureDate = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const openForm = async (page) => { await page.evaluate(() => document.querySelector('[data-role="new-visit"]').click()); await page.waitForSelector('#fv-purpose', { timeout: 4000 }); await sleep(150) }
const discoveryBase = async (page, over = {}) => {
  await chip(page, 'purpose', 'Discovery'); await sleep(80)
  await chip(page, 'source_of_lead', over.source || 'Walk-in'); await chip(page, 'coordinator_booked', 'No')
  if (over.referrer) await fill(page, 'fv-referrer_name', over.referrer)
  await fill(page, 'fv-business_name', over.business || 'Zenith Cabs'); await fill(page, 'fv-contact_person', 'Zed Person'); await fill(page, 'fv-contact_number', over.phone || '9111111111')
  await fill(page, 'fv-area', 'Bandra'); await fill(page, 'fv-city', 'Mumbai'); await fill(page, 'fv-fleet_size', '25')
  await chip(page, 'uses_gps', over.gps ? 'Yes' : 'No'); if (over.gps) await fill(page, 'fv-existing_gps', over.gps)
  await chip(page, 'pain_area', over.pain || 'Fuel pilferage')
}
const lastSubmit = async (page) => (await submits(page)).at(-1)

// ───────────────────────── A. the pure rules (lib) ─────────────────────────
console.log('\n== A. rules in lib/fieldSalesVisits.js')
{
  const page = await open()
  const r = (fn, ...a) => page.evaluate((f, args) => { const L = window.__lib; return L[f](...args) }, fn, a)
  const vis = async (f) => (await page.evaluate((x) => [...window.__lib.visibleFields({ ...window.__lib.emptyVisitForm(), ...x })].sort(), f))
  eq(await vis({}), ['purpose', 'remarks'], 'A1 nothing chosen: only Purpose (+ Remarks)')
  eq((await vis({ purpose: 'Discovery' })).filter((k) => !['purpose', 'remarks'].includes(k)), ['area', 'business_name', 'city', 'contact_number', 'contact_person', 'coordinator_booked', 'demo_given', 'fleet_size', 'pain_area', 'source_of_lead', 'uses_gps'], 'A2 Discovery: source, coordinator, business, contact, area, city, fleet, GPS, pain area, then the demo question')
  ok((await vis({ purpose: 'Discovery', source_of_lead: 'Customer referral' })).includes('referrer_name'), 'A3 referrer name only for Customer referral')
  ok(!(await vis({ purpose: 'Discovery', source_of_lead: 'Walk-in' })).includes('referrer_name'), 'A3b ... not for Walk-in')
  ok((await vis({ purpose: 'Discovery', uses_gps: 'yes' })).includes('existing_gps'), 'A4 existing GPS only when Using GPS = Yes')
  eq((await vis({ purpose: 'Follow-up' })).filter((k) => k !== 'remarks' && k !== 'purpose'), ['lead_id'], 'A5 Follow-up with no lead yet: just the lead picker')
  eq((await vis({ purpose: 'Follow-up', lead_id: 'x' })).filter((k) => k !== 'remarks' && k !== 'purpose'), ['follow_up_reason', 'lead_id'], 'A6 lead chosen: + follow-up reason')
  ok((await vis({ purpose: 'Follow-up', lead_id: 'x', follow_up_reason: 'Demo pending' })).includes('demo_given'), 'A7 Demo pending lands on the demo question')
  const qf = await vis({ purpose: 'Follow-up', lead_id: 'x', follow_up_reason: 'Quotation follow-up' })
  ok(!qf.includes('demo_given') && qf.includes('quotation_outcome'), 'A8 Quotation follow-up skips the demo question, asks the outcome')
  eq((await vis({ purpose: 'Discovery', demo_given: 'yes', demo_outcome: 'quotation_to_be_sent' })).filter((k) => ['demo_outcome', 'quotation_due_date', 'closing_reason', 'no_demo_reason', 'next_followup_date'].includes(k)), ['demo_outcome', 'quotation_due_date'], 'A9 demo Yes + quotation: outcome + send date')
  eq((await vis({ purpose: 'Discovery', demo_given: 'yes', demo_outcome: 'not_interested' })).filter((k) => ['quotation_due_date', 'closing_reason'].includes(k)), ['closing_reason'], 'A10 demo Yes + not interested: the reason')
  eq((await vis({ purpose: 'Discovery', demo_given: 'no' })).filter((k) => ['demo_outcome', 'no_demo_reason', 'next_followup_date'].includes(k)), ['next_followup_date', 'no_demo_reason'], 'A11 demo No: reason + next follow-up date')
  const qw = await vis({ purpose: 'Follow-up', lead_id: 'x', follow_up_reason: 'Quotation follow-up', quotation_outcome: 'won' })
  ok(qw.includes('so_number') && qw.includes('won_amount') && !qw.includes('closing_reason'), 'A12 Won: SO number + amount')
  ok((await vis({ purpose: 'Follow-up', lead_id: 'x', follow_up_reason: 'Quotation follow-up', quotation_outcome: 'lost' })).includes('closing_reason'), 'A13 Lost: the reason')
  const qn = await vis({ purpose: 'Follow-up', lead_id: 'x', follow_up_reason: 'Quotation follow-up', quotation_outcome: 'next_followup' })
  ok(qn.includes('quotation_followup_reason') && qn.includes('next_followup_date'), 'A14 Next follow-up: reason + a date')
  const today = await page.evaluate(() => window.__lib.istDate(0))
  const E = (f) => page.evaluate((x, t) => window.__lib.validateVisitForm({ ...window.__lib.emptyVisitForm(), ...x }, { today: t }), f, today)
  const e1 = await E({})
  eq(Object.keys(e1), ['purpose'], 'A15 empty form: only Purpose is complained about (hidden fields are not validated)')
  const e2 = await E({ purpose: 'Discovery', contact_number: '12345', fleet_size: '-3', source_of_lead: 'Walk-in' })
  ok(/10-digit/.test(e2.contact_number) && /whole number/.test(e2.fleet_size) && e2.business_name && e2.pain_area && e2.demo_given, 'A16 Discovery: short phone, bad fleet, missing business / pain area / demo answer')
  const phoneErr = async (n) => (await E({ purpose: 'Discovery', contact_number: n })).contact_number || ''
  const okNums = ['9876543210', '98765 43210', '+91 98765-43210', '919876543210', '09876543210', '098765 43210', '(98765) 43210', '9187654321']
  const badNums = ['987654321', '98765432101', '129876543210', '0919876543210', '+91 0 9876543210', '9876543210123', 'abcdefghij']
  eq((await Promise.all(okNums.map(phoneErr))).filter(Boolean), [], 'A16b a number is accepted when exactly 10 digits remain (spaces, dashes, brackets, +91 / 91, a leading 0)')
  eq((await Promise.all(badNums.map(phoneErr))).filter((m) => /10-digit/.test(m)).length, badNums.length, 'A16c 9, 11, 12 (not 91), 13 and 14-digit numbers and letters are refused: never cut down to 10')
  eq(await page.evaluate((l) => l.map((n) => window.__lib.normalizePhone10(n)), [...okNums, ...badNums]), ['9876543210', '9876543210', '9876543210', '9876543210', '9876543210', '9876543210', '9876543210', '9187654321', '', '', '', '', '', '', ''], 'A16d normalizePhone10 gives the 10 digits the server will store (or nothing)')
  const e3 = await E({ purpose: 'Discovery', demo_given: 'yes', demo_outcome: 'quotation_to_be_sent', quotation_due_date: futureDate(-1) })
  ok(/today or later/.test(e3.quotation_due_date), 'A17 quotation date in the past refused')
  const e4 = await E({ purpose: 'Discovery', demo_given: 'no', no_demo_reason: 'x', next_followup_date: today })
  ok(/future/.test(e4.next_followup_date), 'A18 next follow-up today refused (must be in the future)')
  const e5 = await E({ purpose: 'Follow-up', lead_id: 'x', follow_up_reason: 'Quotation follow-up', quotation_outcome: 'won', so_number: 'S'.repeat(41), won_amount: '-1' })
  ok(/too long/.test(e5.so_number) && e5.won_amount, 'A19 SO number > 40 and a bad amount refused')
  const e6 = await E({ purpose: 'Discovery', demo_given: 'no', no_demo_reason: 'x'.repeat(501), next_followup_date: futureDate(2) })
  ok(/Too long/.test(e6.no_demo_reason), 'A20 a reason over 500 characters refused')
  const pl = await page.evaluate((d) => window.__lib.buildVisitPayload({ ...window.__lib.emptyVisitForm(), purpose: 'Discovery', source_of_lead: 'Walk-in', referrer_name: 'STALE', coordinator_booked: 'yes', business_name: ' Acme ', contact_person: 'P', contact_number: '98 765 43210', area: 'A', city: 'C', fleet_size: '12', uses_gps: 'no', existing_gps: 'STALE', pain_area: 'Other', demo_given: 'no', no_demo_reason: 'busy', next_followup_date: d, demo_outcome: 'not_interested', closing_reason: 'STALE' }, { attachment_path: 'u/x.jpg', geo_lat: 1, geo_lng: 2, geo_accuracy_m: 3.456, captured_at: 't' }), futureDate(3))
  ok(!('referrer_name' in pl) && !('existing_gps' in pl) && !('demo_outcome' in pl) && !('closing_reason' in pl), 'A21 payload carries no field that does not apply (stale typed values are dropped)', pl)
  ok(pl.business_name === 'Acme' && pl.fleet_size === 12 && pl.coordinator_booked === true && pl.uses_gps === false && pl.demo_given === false && pl.geo_accuracy_m === 3.46, 'A22 payload is typed: trimmed text, integer fleet, booleans, rounded accuracy', pl)
  ok(pl.contact_number === '9876543210', 'A22b the payload sends the 10 digits, not the typed spaces', pl.contact_number)
  eq(await r('allowedReasonsFor', 0), ['Demo pending'], 'A23 a lead with no completed visit may take Demo pending')
  eq(await r('allowedReasonsFor', 2), ['Quotation follow-up'], 'A24 ... with a completed visit, Quotation follow-up')
  const stamp = await page.evaluate(() => window.__photoLib.stampText('2026-11-14T10:12:00Z', { lat: 19.07612, lng: 72.87771, accuracy: 11.6 }))
  ok(/14 Nov 2026/.test(stamp) && /IST/.test(stamp) && /19\.07612, 72\.87771/.test(stamp) && /±12 m/.test(stamp), 'A25 the stamp text has the date, IST and the coordinates', stamp)
  await page.close()
}

// ───────────────────────── B. the list, filters, detail, legacy ─────────────────────────
console.log('\n== B. leads list (rep)')
{
  const page = await open()
  const t = await text(page)
  ok(/My Leads/.test(t) && /New Visit/.test(t), 'B1 a rep lands on "My Leads" with New Visit')
  ok(!/Pain areas|Alert settings/.test(t), 'B2 no admin tools for a rep')
  const rows = await page.$$eval('tbody tr', (r) => r.map((x) => x.innerText.replace(/\s+/g, ' ').trim()))
  eq(rows.length, 4, 'B3 own leads only (Delta Fleet belongs to another rep)')
  ok(!rows.join('|').includes('Delta'), 'B3b ...')
  ok(/Acme Transport.*Demo given.*Open/.test(rows.join('|')) && /Bright Logistics.*Demo not given.*Open.*Overdue/.test(rows.join('|')) && /Cargo King.*Lost/.test(rows.join('|')) && /Echo Movers.*Won/.test(rows.join('|')), 'B4 status, outcome and overdue badges', rows)
  const heights = await page.$$eval('tbody tr', (r) => r.map((x) => Math.round(x.getBoundingClientRect().height)))
  ok(new Set(heights).size === 1, 'B5 every row has the same height (fixed row height)', heights)
  ok(!(await page.evaluate(() => /Rep\b/.test([...document.querySelectorAll('th')].map((x) => x.innerText).join(' ')))), 'B6 no Rep column for a rep')
  for (const [label, qs] of [['Demo not given', 'lead_state=eq.pending'], ['Overdue', 'followup_overdue=eq.true'], ['Won', 'outcome=eq.won'], ['Lost', 'outcome=eq.lost'], ['Open', 'outcome=eq.open']]) {
    await page.evaluate(() => (window.__calls.length = 0)); await clickBtn(page, label); await sleep(500)
    ok((await calls(page)).some((c) => c.path.includes('field_sales_lead_state') && c.query.includes(qs)), `B7 filter ${label} -> ${qs}`)
  }
  await clickBtn(page, 'Overdue'); await sleep(400)
  eq(await page.$$eval('tbody tr', (r) => r.length), 1, 'B8 Overdue shows only the overdue lead')
  await clickBtn(page, 'All'); await sleep(400)
  // detail
  await page.evaluate(() => [...document.querySelectorAll('tbody tr')].find((r) => r.innerText.includes('Acme Transport')).click()); await sleep(600)
  const d = await text(page)
  ok(/Acme Transport/.test(d) && /visits \(2\)/i.test(d), 'B9 detail opens with the lead and its 2 visits')
  const states = await page.$$eval('[data-role="visits"] li', (l) => l.map((x) => x.dataset.visitState))
  eq(states, ['superseded', 'completed'], 'B10 visit states: superseded, completed')
  ok(/Owner out of town/.test(d) && /Quotation to be sent on/.test(d) && /Met the fleet manager/.test(d), 'B11 reasons, outcome and remarks shown')
  ok(/still counts as a meeting/.test(await page.$eval('[data-visit-state="superseded"] span[title*="later visit"]', (e) => e.title)), 'B12 the superseded badge explains itself (a Discovery still counts)')
  const badges = await page.$$eval('[data-role="visits"] li', (l) => l.map((x) => [/Purpose\s*Discovery/.test(x.innerText), /\bMeeting\b/.test(x.innerText)]))
  ok(badges.length >= 2 && badges.every(([d, m]) => d === m) && badges.some(([d]) => d) && badges.some(([d]) => !d), 'B12b every Discovery visit carries the Meeting badge, a follow-up never does', badges)
  ok(!!(await page.$('[data-role="log-followup"]')), 'B13 own open lead: "Log a follow-up" offered')
  await clickBtn(page, 'Log a follow-up'); await sleep(500)
  eq(await present(page), ['purpose', 'lead_id', 'follow_up_reason', 'quotation_outcome', 'remarks', 'attachment'].filter((k) => ['purpose', 'lead_id', 'follow_up_reason', 'quotation_outcome', 'remarks', 'attachment'].includes(k)), 'B14 the form opens as a follow-up on that lead, Quotation follow-up preselected')
  ok(/Quotation follow-up/.test(await page.$eval('#fv-follow_up_reason', (e) => e.querySelector('[aria-checked="true"]')?.innerText || '')), 'B14b the reason chip is preselected')
  await page.close()
  // closed leads offer no follow-up
  const p2 = await open()
  await p2.evaluate(() => [...document.querySelectorAll('tbody tr')].find((r) => r.innerText.includes('Echo Movers')).click()); await sleep(500)
  ok(!(await p2.$('[data-role="log-followup"]')), 'B15 a Won lead offers no follow-up')
  await p2.close()
  // legacy
  const p3 = await open()
  ok(!(await p3.evaluate(() => /Legacy Lead/.test(document.body.innerText))), 'B16 legacy entries are not even fetched until opened')
  await p3.evaluate(() => document.querySelector('[data-view="legacy"]').click()); await sleep(900)
  const lt = await p3.evaluate(() => document.querySelector('div[hidden]') ? '' : document.body.innerText)
  ok(/Legacy Lead 1/.test(await text(p3)) && /read-only/.test(await text(p3)), 'B17 Legacy entries shows the 11-row-style history, read-only')
  ok(!(await p3.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'New Entry' && b.offsetParent))), 'B18 no New Entry button on the legacy view')
  await p3.evaluate(() => document.querySelector('[data-view="leads"]').click()); await sleep(200)
  ok(/Acme Transport/.test(await text(p3)), 'B19 back to Leads')
  void lt
  await p3.close()
}
console.log('\n== B2. leads list (admin)')
{
  const page = await open('?role=admin')
  const t = await text(page)
  ok(/All Leads/.test(t) && /Pain areas/.test(t) && /Alert settings/.test(t), 'B20 admin: All Leads, Pain areas, Alert settings')
  eq(await page.$$eval('tbody tr', (r) => r.length), 5, 'B21 sees every rep\'s leads')
  ok(await page.evaluate(() => /Rep\b/.test([...document.querySelectorAll('th')].map((x) => x.innerText).join(' '))), 'B22 Rep column')
  await page.evaluate(() => [...document.querySelectorAll('tbody tr')].find((r) => r.innerText.includes('Delta Fleet')).click()); await sleep(600)
  ok(!(await page.$('[data-role="log-followup"]')), 'B23 admin cannot log a follow-up on another rep\'s lead (no button)')
  ok(/Rep Beta/.test(await text(page)), 'B24 the detail names the rep for an admin')
  await page.close()
}

// ───────────────────────── C. the conditional flow in the form ─────────────────────────
console.log('\n== C. form flow')
{
  const page = await open()
  await openForm(page)
  eq(await present(page), ['purpose'], 'C1 a new form shows only Purpose (no photo section, no submit yet)')
  ok(!(await page.$('[data-role="submit"]')), 'C1b no Submit button before a purpose is chosen')
  await chip(page, 'purpose', 'Discovery'); await sleep(100)
  eq(await present(page), ['purpose', 'source_of_lead', 'coordinator_booked', 'business_name', 'contact_person', 'contact_number', 'area', 'city', 'fleet_size', 'uses_gps', 'pain_area', 'demo_given', 'remarks', 'attachment'], 'C2 Discovery: all its fields, the demo question, remarks and the photo')
  await chip(page, 'source_of_lead', 'Customer referral'); await sleep(80)
  ok((await present(page)).includes('referrer_name'), 'C3 Customer referral shows Referrer name')
  await chip(page, 'source_of_lead', 'Walk-in'); await sleep(80)
  ok(!(await present(page)).includes('referrer_name'), 'C3b ... and Walk-in hides it')
  await chip(page, 'uses_gps', 'Yes'); await sleep(80)
  ok((await present(page)).includes('existing_gps'), 'C4 Using GPS = Yes shows the existing GPS field')
  await chip(page, 'demo_given', 'Yes'); await sleep(80)
  ok((await present(page)).includes('demo_outcome'), 'C5 demo Yes shows the outcome')
  await chip(page, 'demo_outcome', 'Quotation to be sent'); await sleep(80)
  ok((await present(page)).includes('quotation_due_date') && !(await present(page)).includes('closing_reason'), 'C6 quotation outcome shows the send date')
  eq(await page.$eval('#fv-quotation_due_date', (e) => e.min), futureDate(0), 'C6b the send date cannot be before today (min = today)')
  await chip(page, 'demo_outcome', 'Not interested'); await sleep(80)
  ok((await present(page)).includes('closing_reason') && !(await present(page)).includes('quotation_due_date'), 'C7 not interested shows the reason')
  await chip(page, 'demo_given', 'No'); await sleep(80)
  const p = await present(page)
  ok(p.includes('no_demo_reason') && p.includes('next_followup_date') && !p.includes('demo_outcome'), 'C8 demo No shows the reason and the next follow-up date')
  eq(await page.$eval('#fv-next_followup_date', (e) => e.min), futureDate(1), 'C8b the follow-up date must be in the future (min = tomorrow)')
  ok(/Demo not given\./.test(await text(page)) && /still counts as a meeting/.test(await text(page)) && /Sales FMS now/.test(await text(page)) && !/Saved as pending/.test(await text(page)), 'C9 a Discovery without the demo says, before saving, that it counts and goes to Sales FMS now')
  await chip(page, 'purpose', 'Follow-up'); await sleep(100)
  eq(await present(page), ['purpose', 'lead_id', 'remarks', 'attachment'], 'C10 Follow-up: just the lead picker (+ remarks, photo) until a lead is chosen')
  await page.close()
}

// ───────────────────────── D. the lead picker ─────────────────────────
console.log('\n== D. follow-up picker')
{
  const page = await open()
  await openForm(page)
  await chip(page, 'purpose', 'Follow-up'); await sleep(100)
  await page.evaluate(() => (window.__calls.length = 0))
  await page.type('#fv-lead_id', 'a'); await sleep(500)
  ok(!(await calls(page)).some((c) => c.path.includes('fs_search_leads')), 'D1 one character does not search')
  await page.type('#fv-lead_id', 'c'); await sleep(900)
  eq((await calls(page)).filter((c) => c.path.includes('fs_search_leads')).length, 1, 'D2 typing is debounced into ONE search')
  let opts = await page.$$eval('[role="option"]', (o) => o.map((x) => x.innerText.replace(/\s+/g, ' ').trim()))
  ok(opts.length === 1 && /Acme Transport/.test(opts[0]), 'D3 results are the rep\'s own open leads ("ac" -> Acme)', opts)
  await page.$eval('#fv-lead_id', (e) => { e.value = '' })
  for (const [needle, who] of [['ar', 'Cargo King (Lost)'], ['ec', 'Echo Movers (Won)'], ['el', 'Delta Fleet (another rep)']]) {
    await fill(page, 'fv-lead_id', needle); await sleep(900)
    opts = await page.$$eval('[role="option"]', (o) => o.map((x) => x.innerText.replace(/\s+/g, ' ').trim()))
    ok(opts.length === 0 && /No open lead of yours matches/.test(await page.$eval('[role="listbox"]', (e) => e.innerText)), `D4 "${needle}" does not offer ${who}`, opts)
  }
  await fill(page, 'fv-lead_id', 'Bright'); await sleep(900)
  await page.evaluate(() => document.querySelector('[role="option"]').click()); await sleep(200)
  ok(/Bright Logistics/.test(await page.$eval('#fv-lead_id', (e) => e.innerText)), 'D5 the chosen lead shows as a card')
  const chips = await page.$$eval('#fv-follow_up_reason button', (b) => b.map((x) => x.innerText.trim()))
  eq(chips, ['Demo pending'], 'D6 a lead with no completed visit offers ONLY Demo pending')
  ok((await present(page)).includes('demo_given'), 'D7 Demo pending goes on to the demo question')
  await clickBtn(page, 'Change'); await sleep(200)
  ok(!(await present(page)).includes('follow_up_reason') && (await page.$eval('#fv-lead_id', (e) => e.tagName)) === 'INPUT', 'D8 Change goes back to the search box and hides the reason until a lead is chosen')
  await fill(page, 'fv-lead_id', 'Acme'); await sleep(900)
  await page.evaluate(() => document.querySelector('[role="option"]').click()); await sleep(200)
  eq(await page.$$eval('#fv-follow_up_reason button', (b) => b.map((x) => x.innerText.trim())), ['Quotation follow-up'], 'D9 a lead with a completed visit offers ONLY Quotation follow-up')
  const pres = await present(page)
  ok(!pres.includes('demo_given') && pres.includes('quotation_outcome'), 'D10 Quotation follow-up skips the demo question')
  await page.close()
  // an admin sees others' leads, but cannot pick them
  const pa = await open('?role=admin')
  await openForm(pa); await chip(pa, 'purpose', 'Follow-up'); await sleep(100)
  await fill(pa, 'fv-lead_id', 'Delta'); await sleep(900)
  const dis = await pa.$$eval('[role="option"]', (o) => o.map((x) => [x.disabled, x.innerText.replace(/\s+/g, ' ')]))
  ok(dis.length === 1 && dis[0][0] === true && /not your lead \(Rep Beta\)/.test(dis[0][1]), 'D11 admin: another rep\'s lead is listed but disabled, with its rep named', dis)
  await pa.close()
}

// ───────────────────────── E. the phone check ─────────────────────────
console.log('\n== E. phone check')
{
  const page = await open()
  await openForm(page); await chip(page, 'purpose', 'Discovery'); await sleep(100)
  await page.evaluate(() => (window.__calls.length = 0))
  await page.type('#fv-contact_number', '9000', { delay: 20 }); await sleep(700)
  ok(!(await calls(page)).some((c) => c.path.includes('fs_find_by_phone')), 'E1 fewer than 10 digits: no check')
  await page.type('#fv-contact_number', '000004', { delay: 20 }); await sleep(250)
  ok(/Checking the number/.test(await text(page)), 'E2 "Checking the number…" while the pause runs')
  await sleep(1200)
  eq((await calls(page)).filter((c) => c.path.includes('fs_find_by_phone')).length, 1, 'E3 typing 10 digits fast = ONE call (debounced)')
  await fill(page, 'fv-contact_number', ''); await sleep(100); await page.evaluate(() => (window.__calls.length = 0))
  await page.type('#fv-contact_number', '90000000045', { delay: 15 }); await sleep(900)
  ok(/exactly 10 digits/.test(await text(page)) && !(await calls(page)).some((c) => c.path.includes('fs_find_by_phone')), 'E3b an 11-digit number: "exactly 10 digits" while typing, and it is NOT checked as its last 10')
  await fill(page, 'fv-contact_number', ''); await sleep(100)
  await page.type('#fv-contact_number', '+91 90000-00004', { delay: 15 }); await sleep(1200)
  ok(!/exactly 10 digits/.test(await text(page)) && /already in the system/.test(await text(page)), 'E3c "+91 90000-00004" is recognised as the same number (taken)')
  await fill(page, 'fv-contact_number', ''); await sleep(100)
  await page.type('#fv-contact_number', '090000-00004', { delay: 15 }); await sleep(1200)
  ok(/already in the system/.test(await text(page)), 'E3d "090000-00004" (leading 0) is recognised as the same number')
  await fill(page, 'fv-contact_number', ''); await sleep(100); await page.type('#fv-contact_number', '9000000004', { delay: 15 }); await sleep(1200)
  const t = await text(page)
  ok(/already in the system/.test(t) && !/Acme|Bright|Rep Alpha|Beta|Sheet/.test(t.split('already in the system')[1]?.slice(0, 200) || ''), 'E4 taken: "already in the system" with no identifying detail')
  // taken blocks submit
  await page.evaluate(() => document.querySelector('[data-role="submit"]').click()); await sleep(300)
  ok(/already in the system/.test(await page.$eval('#fv-contact_number', (e) => e.closest('div.mb-1').innerText)), 'E5 taken blocks the submit with a message on the field')
  ok(!(await submits(page)).length, 'E5b nothing was sent')
  // new number
  await fill(page, 'fv-contact_number', ''); await fill(page, 'fv-contact_number', '9222222222'); await sleep(1200)
  ok(/New number/.test(await text(page)), 'E6 an unknown number: "New number"')
  // own lead
  await fill(page, 'fv-contact_number', '9000000001'); await sleep(1200)
  ok(/already your lead/.test(await text(page)) && /Bright Logistics/.test(await text(page)), 'E7 own lead: named, with "Log a follow-up on it instead"')
  await page.evaluate(() => document.querySelector('[data-role="to-followup"]').click()); await sleep(900)
  ok(/Bright Logistics/.test(await page.$eval('#fv-lead_id', (e) => e.innerText)) && (await present(page)).includes('follow_up_reason'), 'E8 the button switches to Follow-up on that lead')
  eq(await page.$$eval('#fv-follow_up_reason button', (b) => b.map((x) => x.innerText.trim())), ['Demo pending'], 'E8b ... with the right reason')
  // adoptable
  await chip(page, 'purpose', 'Discovery'); await sleep(100)
  await fill(page, 'fv-contact_number', '9000000002'); await sleep(1300)
  const t2 = await text(page)
  ok(/already your enquiry in the Enquiry Capture Sheet/.test(t2) && /Sheet Person/.test(t2) && /Sheet Co/.test(t2), 'E9 adoptable: names it (your enquiry in the Sheet)')
  eq(await page.evaluate(() => [document.getElementById('fv-business_name').value, document.getElementById('fv-contact_person').value, document.getElementById('fv-city').value]), ['Sheet Co', 'Sheet Person', 'Pune'], 'E10 empty business fields are pre-filled from it')
  await fill(page, 'fv-contact_number', '9000000003'); await sleep(1300)
  ok(/already your contact in SCOT Calls/.test(await text(page)), 'E11 a SCOT contact is described as such')
  ok(await page.evaluate(() => document.getElementById('fv-business_name').value === 'Sheet Co'), 'E11b already-filled fields are not overwritten')
  await page.close()
}

// ───────────────────────── F. submitting every branch ─────────────────────────
console.log('\n== F. submit — payloads per branch')
const finishAndSubmit = async (page, expectClose = true) => {
  ok(await attach(page, 640, 480), 'photo + location ready')
  await page.evaluate(() => document.querySelector('[data-role="submit"]').click())
  if (expectClose) await waitFor(page, () => !document.querySelector('#fv-purpose'), null, 6000)
  await sleep(300)
}
{
  const page = await open()
  await openForm(page)
  await discoveryBase(page, { source: 'Customer referral', referrer: 'Mr Shah', gps: 'Trackwell' })
  await chip(page, 'demo_given', 'Yes'); await chip(page, 'demo_outcome', 'Quotation to be sent'); await fill(page, 'fv-quotation_due_date', futureDate(3))
  await fill(page, 'fv-remarks', 'Pain area Other = tracker theft')
  await sleep(1300)
  await page.evaluate(() => (window.__calls.length = 0))
  await finishAndSubmit(page)
  const s = await lastSubmit(page)
  eq(s, { purpose: 'Discovery', source_of_lead: 'Customer referral', referrer_name: 'Mr Shah', business_name: 'Zenith Cabs', contact_person: 'Zed Person', contact_number: '9111111111', area: 'Bandra', city: 'Mumbai', existing_gps: 'Trackwell', pain_area: 'Fuel pilferage', demo_outcome: 'quotation_to_be_sent', quotation_due_date: futureDate(3), remarks: 'Pain area Other = tracker theft', coordinator_booked: false, uses_gps: true, demo_given: true, fleet_size: 25, attachment_path: s?.attachment_path, geo_lat: s?.geo_lat, geo_lng: s?.geo_lng, geo_accuracy_m: s?.geo_accuracy_m, captured_at: s?.captured_at }, 'F1 Discovery + referral + GPS + demo Yes + quotation: exact payload')
  ok(/^u-me\/\d{8}-[a-z0-9]+\.jpg$/.test(s.attachment_path), 'F2 the photo path is <the user\'s own uid>/<date>-<rand>.jpg', s.attachment_path)
  ok(Math.abs(s.geo_lat - 19.07612) < 1e-4 && Math.abs(s.geo_lng - 72.87771) < 1e-4 && s.geo_accuracy_m === 12 && !isNaN(Date.parse(s.captured_at)), 'F3 the device position and capture time travel with the visit', s)
  const cs = await calls(page)
  const upIdx = cs.findIndex((c) => c.path.startsWith('object/field-sales-visits/')), subIdx = cs.findIndex((c) => c.path.endsWith('rpc/submit_field_sales_visit'))
  ok(upIdx >= 0 && subIdx > upIdx, 'F4 the photo is uploaded BEFORE the visit is saved')
  ok(!(await modal(page)), 'F5 the modal closed on success')
  ok(/Visit saved/.test(await toast(page)) && /counts as a meeting/.test(await toast(page)) && /Sales FMS/.test(await toast(page)), 'F6 toast: saved, counts as a meeting, in Sales FMS', await toast(page))
  ok(cs.some((c) => c.path.includes('field_sales_lead_state') && c.method === 'GET'), 'F7 the list is refetched')
  ok(await page.evaluate(() => /Zenith Cabs/.test(document.body.innerText)), 'F8 the new lead is in the list')
  await page.close()
}
{ // payload: hidden fields are dropped
  const page = await open(); await openForm(page)
  await discoveryBase(page, { source: 'Customer referral', referrer: 'STALE REFERRER', gps: 'STALE GPS' })
  await chip(page, 'source_of_lead', 'Walk-in'); await chip(page, 'uses_gps', 'No')
  await chip(page, 'demo_given', 'Yes'); await chip(page, 'demo_outcome', 'Not interested'); await fill(page, 'fv-closing_reason', 'Has a vendor')
  await chip(page, 'demo_given', 'No'); await fill(page, 'fv-no_demo_reason', 'Owner away'); await fill(page, 'fv-next_followup_date', futureDate(2))
  await sleep(1300); await finishAndSubmit(page)
  const s = await lastSubmit(page)
  ok(s && s.demo_given === false && s.no_demo_reason === 'Owner away' && s.next_followup_date === futureDate(2), 'F9 Discovery + demo No: reason + next date')
  ok(s && !('referrer_name' in s) && !('existing_gps' in s) && !('closing_reason' in s) && !('demo_outcome' in s), 'F10 stale typed values of fields that no longer apply are NOT sent', s)
  ok(/demo was not given yet/.test(await toast(page)) && /counts as a meeting and the lead is in Sales FMS/.test(await toast(page)) && !/not an extra meeting|pending/i.test(await toast(page)) && !/Growth Director/.test(await toast(page)), 'F11 a Discovery without the demo: saved, counts as a meeting, in Sales FMS, no alert yet', await toast(page))
  await page.close()
}
{ // not interested
  const page = await open(); await openForm(page)
  await discoveryBase(page, { phone: '9333333333', business: 'Nova Cabs' })
  await chip(page, 'demo_given', 'Yes'); await chip(page, 'demo_outcome', 'Not interested'); await fill(page, 'fv-closing_reason', 'Has a vendor')
  await sleep(1300); await finishAndSubmit(page)
  const s = await lastSubmit(page)
  ok(s && s.demo_outcome === 'not_interested' && s.closing_reason === 'Has a vendor' && !('quotation_due_date' in s), 'F12 Discovery + Not interested: the reason, no quotation date', s)
  ok(/Lost/.test(await toast(page)), 'F13 the toast says the lead is closed as Lost', await toast(page))
  await page.close()
}
{ // a number typed with +91 and a dash is sent as its 10 digits
  const page = await open(); await openForm(page)
  await discoveryBase(page, { phone: '+91 91111-11112', business: 'Format Cabs' })
  await chip(page, 'demo_given', 'No'); await fill(page, 'fv-no_demo_reason', 'Owner away'); await fill(page, 'fv-next_followup_date', futureDate(2))
  await sleep(1300); await finishAndSubmit(page)
  const s = await lastSubmit(page)
  eq(s && s.contact_number, '9111111112', 'F12c "+91 91111-11112" is submitted as 9111111112')
  await page.close()
}
for (const [qs, expectAlert, name] of [['', true, 'F15b a 2nd visit without the demo: not an extra meeting, the Growth Director is notified'], ['?pending=3', false, 'F15c a 3rd visit without the demo: no new notification is claimed']]) {
  const page = await open(qs); await openForm(page)
  await chip(page, 'purpose', 'Follow-up'); await fill(page, 'fv-lead_id', 'Bright'); await sleep(900)
  await page.evaluate(() => document.querySelector('[role="option"]').click()); await sleep(200)
  await chip(page, 'demo_given', 'No'); await fill(page, 'fv-no_demo_reason', 'Still away'); await fill(page, 'fv-next_followup_date', futureDate(3))
  ok(/Demo still not given/.test(await text(page)) && /not an extra meeting/.test(await text(page)), name.slice(0, 4) + ' (note) the form says a follow-up without the demo is not an extra meeting')
  await finishAndSubmit(page)
  const tt = await toast(page)
  ok(/demo was not given yet/.test(tt) && /not an extra meeting/.test(tt) && /Growth Director/.test(tt) === expectAlert && !/counts as a meeting/.test(tt), name, tt)
  await page.close()
}
{ // follow-up: demo pending + yes; quotation follow-up x3
  const page = await open(); await openForm(page)
  await chip(page, 'purpose', 'Follow-up'); await fill(page, 'fv-lead_id', 'Bright'); await sleep(900)
  await page.evaluate(() => document.querySelector('[role="option"]').click()); await sleep(200)
  await chip(page, 'demo_given', 'Yes'); await chip(page, 'demo_outcome', 'Quotation to be sent'); await fill(page, 'fv-quotation_due_date', futureDate(1))
  await finishAndSubmit(page)
  const s = await lastSubmit(page)
  eq([s.purpose, s.lead_id, s.follow_up_reason, s.demo_given, s.demo_outcome], ['Follow-up', 'LB', 'Demo pending', true, 'quotation_to_be_sent'], 'F14 Follow-up / Demo pending / demo Yes / quotation')
  ok(/not an extra meeting/.test(await toast(page)) && /Sales FMS is updated/.test(await toast(page)) && !/counts as a meeting/.test(await toast(page)), 'F14b a follow-up that gives the demo: Sales FMS updated, NOT an extra meeting', await toast(page))
  ok(!('business_name' in s) && !('source_of_lead' in s), 'F15 a follow-up carries no business details')
  await page.close()
  for (const [outcome, fields, expect, name] of [
    ['Won', { 'fv-so_number': 'SO-777', 'fv-won_amount': '1,50,000.50' }, { quotation_outcome: 'won', so_number: 'SO-777', won_amount: 150000.5 }, 'F16 Quotation follow-up Won: SO number + amount (Indian grouping accepted)'],
    ['Lost', { 'fv-closing_reason': 'Competitor cheaper' }, { quotation_outcome: 'lost', closing_reason: 'Competitor cheaper' }, 'F17 Quotation follow-up Lost: the reason'],
    ['Next follow-up', { 'fv-quotation_followup_reason': 'Waiting for GD', 'fv-next_followup_date': futureDate(6) }, { quotation_outcome: 'next_followup', quotation_followup_reason: 'Waiting for GD', next_followup_date: futureDate(6) }, 'F18 Quotation follow-up Next follow-up: reason + a future date'],
  ]) {
    const pg = await open(); await openForm(pg)
    await chip(pg, 'purpose', 'Follow-up'); await fill(pg, 'fv-lead_id', 'Acme'); await sleep(900)
    await pg.evaluate(() => document.querySelector('[role="option"]').click()); await sleep(200)
    await chip(pg, 'quotation_outcome', outcome); await sleep(100)
    for (const [id, v] of Object.entries(fields)) await fill(pg, id, v)
    await finishAndSubmit(pg)
    const x = await lastSubmit(pg)
    ok(x && Object.entries(expect).every(([k, v]) => x[k] === v) && !('demo_given' in x), name, x)
    await pg.close()
  }
}

// ───────────────────────── G. validation and failure handling ─────────────────────────
console.log('\n== G. validation, failures, layout')
{
  const page = await open()
  await openForm(page); await chip(page, 'purpose', 'Discovery'); await sleep(100)
  const before = await page.evaluate((ks) => Object.fromEntries(ks.map((k) => [k, document.getElementById('fv-' + k)?.getBoundingClientRect().top]).filter(([, y]) => y !== undefined)), FIELDS)
  const ytop = await page.evaluate(() => document.querySelector('.fixed.inset-0 > div').scrollTop)
  await page.evaluate(() => document.querySelector('[data-role="submit"]').click()); await sleep(500)
  const tt = await toast(page)
  ok(/Please fix the \d+ highlighted fields/.test(tt), 'G1 an empty submit toasts how many fields need fixing', tt)
  ok(!(await submits(page)).length, 'G2 nothing was sent')
  const msgs = await page.evaluate(() => [...document.querySelectorAll('[aria-live="polite"]')].map((e) => e.innerText.trim()).filter(Boolean))
  ok(msgs.some((m) => /Choose the source/.test(m)) && msgs.some((m) => /Business name is required/.test(m)) && msgs.some((m) => /Choose the pain area/.test(m)) && msgs.some((m) => /Say whether the demo was given/.test(m)) && msgs.some((m) => /required/.test(m) && /photo|image/i.test(m)), 'G3 each missing field has its message under it (incl. the photo)', msgs)
  const after = await page.evaluate((ks) => Object.fromEntries(ks.map((k) => [k, document.getElementById('fv-' + k)?.getBoundingClientRect().top]).filter(([, y]) => y !== undefined)), FIELDS)
  const scrolled = (await page.evaluate(() => document.querySelector('.fixed.inset-0 > div').scrollTop)) - ytop
  const moved = Object.keys(before).filter((k) => Math.abs(after[k] - before[k] + scrolled) > 1.5)
  ok(moved.length === 0, 'G4 validation messages appear without moving any field (reserved lines)', { moved, scrolled })
  ok(await page.evaluate(() => document.activeElement?.closest('#fv-source_of_lead, #fv-source_of_lead *') !== null), 'G5 focus goes to the first problem (Source of lead)')
  await page.close()
}
{ // network failure then retry: typed values kept, photo uploaded once
  const page = await open('?netfail=1')
  await openForm(page)
  await discoveryBase(page, { phone: '9444444444', business: 'Retry Co' })
  await chip(page, 'demo_given', 'Yes'); await chip(page, 'demo_outcome', 'Quotation to be sent'); await fill(page, 'fv-quotation_due_date', futureDate(2))
  await sleep(1300); await attach(page, 640, 480)
  await page.evaluate(() => document.querySelector('[data-role="submit"]').click()); await sleep(900)
  ok(/Couldn't reach the server/.test(await toast(page)) && /Nothing was saved/.test(await toast(page)), 'G6 a network drop says so (and that nothing was saved)', await toast(page))
  ok((await page.evaluate(() => document.getElementById('fv-business_name').value)) === 'Retry Co' && (await modal(page)), 'G7 the modal stays open with everything typed')
  await page.evaluate(() => document.querySelector('[data-role="submit"]').click())
  await waitFor(page, () => !document.querySelector('#fv-purpose'), null, 6000)
  eq((await page.evaluate(() => window.__uploads.length)), 1, 'G8 the retry reused the uploaded photo (ONE upload for two submit attempts)')
  eq((await submits(page)).length, 2, 'G8b two submit attempts, the second succeeded')
  await page.close()
}
{ // a server error is shown as is
  const page = await open('?failsubmit=1'); await openForm(page)
  await discoveryBase(page, { phone: '9555555555' }); await chip(page, 'demo_given', 'No'); await fill(page, 'fv-no_demo_reason', 'x'); await fill(page, 'fv-next_followup_date', futureDate(2))
  await sleep(1300); await attach(page, 640, 480)
  await page.evaluate(() => document.querySelector('[data-role="submit"]').click()); await sleep(900)
  ok(/Something broke on the server/.test(await toast(page)), 'G9 a server refusal is shown as its own message', await toast(page))
  await page.close()
}
{ // another rep's lead: refused with the server's message
  const page = await open('?role=admin'); await openForm(page)
  await chip(page, 'purpose', 'Follow-up'); await page.evaluate(() => { })
  await page.evaluate(() => { window.__db.leads.find((l) => l.id === 'LA').created_by = 'u-other' }) // ownership changes under the rep
  await fill(page, 'fv-lead_id', 'Bright'); await sleep(900)
  await page.evaluate(() => document.querySelector('[role="option"]').click()); await sleep(200)
  await page.evaluate(() => { window.__db.leads.find((l) => l.id === 'LB').created_by = 'u-other' })
  await chip(page, 'demo_given', 'No'); await fill(page, 'fv-no_demo_reason', 'x'); await fill(page, 'fv-next_followup_date', futureDate(2))
  await attach(page, 640, 480)
  await page.evaluate(() => document.querySelector('[data-role="submit"]').click()); await sleep(900)
  ok(/This lead is not assigned to you/.test(await toast(page)), 'G10 a follow-up on a lead that is not yours: the server\'s own message (not a generic one)', await toast(page))
  await page.close()
}

// ───────────────────────── H. adoption ─────────────────────────
console.log('\n== H. adopt')
{
  const page = await open(); await openForm(page)
  await discoveryBase(page, { phone: '9000000002', business: 'Sheet Co' })
  await chip(page, 'demo_given', 'Yes'); await chip(page, 'demo_outcome', 'Quotation to be sent'); await fill(page, 'fv-quotation_due_date', futureDate(2))
  await sleep(1400); await attach(page, 640, 480)
  await page.evaluate(() => document.querySelector('[data-role="submit"]').click()); await sleep(500)
  ok(/tick the box/.test(await page.$eval('#fv-contact_number', (e) => e.closest('div.mb-1').innerText)), 'H1 an adoptable number cannot be submitted until the box is ticked')
  ok(!(await submits(page)).length, 'H1b nothing sent')
  await page.evaluate(() => document.querySelector('[data-role="adopt-check"]').click()); await sleep(100)
  await page.evaluate(() => document.querySelector('[data-role="submit"]').click())
  await waitFor(page, () => !document.querySelector('#fv-purpose'), null, 6000)
  const s = await lastSubmit(page)
  ok(s && s.adopt === true, 'H2 with the box ticked the visit is sent with adopt = true', s)
  ok(/against your existing lead/.test(await toast(page)), 'H3 the toast says it was logged against the existing lead', await toast(page))
  await page.close()
}
{ // the server's refusal path (the phone check said "none", the server knows better)
  const page = await open(); await openForm(page)
  await discoveryBase(page, { phone: '9000000005', business: 'Race Co' })
  await chip(page, 'demo_given', 'Yes'); await chip(page, 'demo_outcome', 'Quotation to be sent'); await fill(page, 'fv-quotation_due_date', futureDate(2))
  await sleep(1400); await attach(page, 640, 480)
  ok(/New number/.test(await text(page)), 'H4 (the first look said "New number")')
  await page.evaluate(() => document.querySelector('[data-role="submit"]').click()); await sleep(1200)
  const dlg = await page.evaluate(() => document.querySelector('[data-role="adopt-info"]')?.innerText || '')
  ok(/Race Person/.test(dlg) && /Race Co/.test(dlg) && /Surat/.test(dlg), 'H5 the server\'s "already in your pipeline" refusal opens a confirmation naming what would be adopted', dlg)
  eq((await submits(page)).length, 1, 'H6 the first attempt went out without adopt')
  await page.evaluate(() => document.querySelector('[data-role="adopt-cancel"]').click()); await sleep(200)
  ok(await modal(page) && (await page.evaluate(() => !document.querySelector('[data-role="adopt-info"]'))), 'H7 Cancel closes only the confirmation; the form is still there')
  await page.evaluate(() => document.querySelector('[data-role="submit"]').click()); await sleep(900)
  await page.evaluate(() => document.querySelector('[data-role="adopt-confirm"]').click())
  await waitFor(page, () => !document.querySelector('#fv-purpose'), null, 6000)
  const s = await lastSubmit(page)
  ok(s && s.adopt === true && (await submits(page)).length === 3, 'H8 confirming resubmits with adopt = true', { n: (await submits(page)).length, s })
  await page.close()
}

// ───────────────────────── I. photo and location ─────────────────────────
console.log('\n== I. photo + location')
{
  const page = await open(); await openForm(page); await chip(page, 'purpose', 'Discovery'); await sleep(100)
  ok(/stamped on it automatically/.test(await page.$eval('#fv-attachment-status', (e) => e.innerText)), 'I1 the status line explains the stamp before a photo is chosen')
  ok(await attach(page, 640, 480), 'I2 choosing a photo reads the position')
  const st = await page.$eval('#fv-attachment-status', (e) => e.innerText)
  ok(/19\.07612, 72\.87771/.test(st) && /stamped/.test(st), 'I3 the status shows the coordinates and that the photo is stamped', st)
  ok(!!(await page.$('[data-role="preview"]')), 'I4 a preview is shown')
  await clickBtn(page, 'Remove'); await sleep(200)
  ok(!(await page.$('[data-role="preview"]')) && /No photo yet/.test(await text(page)), 'I5 Remove clears it')
  // a 3000x2000 white image: re-encoded as JPEG, <= 1600 on the long side, with a dark stamp bar at the bottom
  await attach(page, 3000, 2000)
  await discoveryBase(page, { phone: '9666666666' }); await chip(page, 'demo_given', 'No'); await fill(page, 'fv-no_demo_reason', 'x'); await fill(page, 'fv-next_followup_date', futureDate(2))
  await sleep(1400)
  await page.evaluate(() => document.querySelector('[data-role="submit"]').click()); await waitFor(page, () => !document.querySelector('#fv-purpose'), null, 6000)
  const info = await page.evaluate(async () => {
    const b = window.__uploadBlobs.at(-1); const bm = await createImageBitmap(b)
    const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const x = c.getContext('2d'); x.drawImage(bm, 0, 0)
    const px = (X, Y) => { const d = x.getImageData(X, Y, 1, 1).data; return (d[0] + d[1] + d[2]) / 3 }
    let textPx = 0
    for (let Y = bm.height - 70; Y < bm.height - 24; Y += 2) for (let X = 20; X < 900; X += 2) textPx = Math.max(textPx, px(X, Y))
    return { type: b.type, w: bm.width, h: bm.height, topPx: px(5, 5), barPx: px(4, bm.height - 4), textPx, size: b.size }
  })
  ok(info.type === 'image/jpeg' && Math.max(info.w, info.h) <= 1600 && info.w / info.h > 1.4, 'I6 the upload is a JPEG, shrunk to 1600 px on the long side, proportions kept', info)
  ok(info.topPx > 230 && info.barPx > 90 && info.barPx < 115 && info.textPx > 200, 'I7 the time + location bar is burned into the bottom of the image (white photo, 60%-black bar, white text inside it)', info)
  ok(info.size < 300000, 'I8 a 3000x2000 photo uploads as a small file', info.size)
  await page.close()
}
{ // location denied -> message + Retry
  const page = await open('?geo=deny'); await openForm(page); await chip(page, 'purpose', 'Discovery'); await sleep(100)
  await attach(page, 640, 480)
  const st = await page.$eval('#fv-attachment-status', (e) => e.innerText)
  ok(/Location is switched off/.test(st) && /Retry/.test(st), 'I9 location refused: a clear message with Retry', st)
  await page.evaluate(() => document.querySelector('[data-role="submit"]').click()); await sleep(400)
  ok(/Location is switched off/.test(await page.$eval('#fv-attachment-status', (e) => e.innerText)) && !(await submits(page)).length, 'I10 submit is blocked while the location is missing')
  await page.evaluate(() => { window.__geoDenied = false }); await page.evaluate(() => document.querySelector('[data-role="retry-geo"]').click())
  ok(await waitFor(page, () => !!document.querySelector('[data-role="geo-ok"]'), null, 5000), 'I11 after allowing location, Retry completes it without choosing the photo again')
  await page.close()
}
{ // storage not set up
  const page = await open('?nobucket=1'); await openForm(page)
  await discoveryBase(page, { phone: '9777777777' }); await chip(page, 'demo_given', 'No'); await fill(page, 'fv-no_demo_reason', 'x'); await fill(page, 'fv-next_followup_date', futureDate(2))
  await sleep(1300); await attach(page, 640, 480)
  await page.evaluate(() => document.querySelector('[data-role="submit"]').click()); await sleep(900)
  ok(/Photo storage is not set up yet/.test(await toast(page)), 'I12 a missing bucket says so plainly', await toast(page))
  ok(!(await submits(page)).length, 'I13 and the visit is NOT saved without its photo')
  await page.close()
}

// ───────────────────────── J. Pain area admin ─────────────────────────
console.log('\n== J. Pain area manager')
{
  const page = await open('?role=admin')
  const rep = await open()
  await openForm(rep); await chip(rep, 'purpose', 'Discovery'); await sleep(100)
  ok(!(await rep.evaluate(() => !!document.querySelector('[aria-label="Manage Pain area"]'))), 'J1 a rep has no Manage link on the form')
  await rep.close()
  await openForm(page); await chip(page, 'purpose', 'Discovery'); await sleep(100)
  await chip(page, 'pain_area', 'Fuel pilferage')
  await page.$eval('[aria-label="Manage Pain area"]', (e) => e.scrollIntoView({ block: 'center' })); await sleep(700) // the popover closes on any scroll: let it settle first
  await page.click('[aria-label="Manage Pain area"]'); await sleep(400)
  const items = () => page.$$eval('[data-row]', (r) => r.map((x) => x.dataset.row))
  eq((await items()).length, 8, 'J2 the manager lists the 8 seeded values')
  // rename (cascade): the picked chip follows
  await page.evaluate(() => document.querySelector('[data-row="Fuel pilferage"] [data-role="rename"]').click()); await sleep(100)
  await page.evaluate(() => { const i = document.querySelector('[data-role="rename-input"]'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(i, '  Fuel   theft '); i.dispatchEvent(new Event('input', { bubbles: true })) })
  await page.keyboard.press('Enter'); await sleep(500)
  ok((await items()).includes('Fuel theft') && !(await items()).includes('Fuel pilferage'), 'J3 Rename (Enter) changes the name; extra spaces are tidied', await items())
  ok(/Fuel theft/.test(await page.$eval('#fv-pain_area', (e) => e.querySelector('[aria-checked="true"]')?.innerText || '')), 'J4 the pain area chosen on the form follows the rename')
  ok((await calls(page)).some((c) => c.path.endsWith('rpc/rename_dropdown_option') && c.body.p_new === 'Fuel theft'), 'J5 rename goes through rename_dropdown_option (cascade in the database)')
  // duplicate
  await page.evaluate(() => document.querySelector('[data-row="Other"] [data-role="rename"]').click()); await sleep(100)
  await page.evaluate(() => { const i = document.querySelector('[data-role="rename-input"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'fuel THEFT'); i.dispatchEvent(new Event('input', { bubbles: true })) })
  await page.keyboard.press('Enter'); await sleep(300)
  ok(/already in this list/.test(await page.$eval('[data-role="error"]', (e) => e.innerText)), 'J6 renaming onto an existing name (any case) is refused in place')
  await page.keyboard.press('Escape'); await sleep(200)
  // add
  await page.type('[data-role="add-input"]', 'Tracker tampering'); await page.keyboard.press('Enter'); await sleep(500)
  ok((await items()).includes('Tracker tampering'), 'J7 Add appends a value')
  // remove -> chip disappears, selected value cleared if it was the removed one
  await page.evaluate(() => document.querySelector('[data-row="Fuel theft"] [data-role="remove"]').click()); await sleep(100)
  await page.evaluate(() => document.querySelector('[data-role="confirm-yes"]').click()); await sleep(500)
  ok(!(await page.evaluate(() => [...document.querySelectorAll('#fv-pain_area [role="radio"]')].some((b) => /Fuel theft/.test(b.innerText)))), 'J8 a removed value stops being offered on the form')
  ok(!(await page.evaluate(() => !!document.querySelector('#fv-pain_area [aria-checked="true"]'))), 'J9 and it is un-picked if it was the chosen one')
  await page.evaluate(() => document.querySelector('[data-row="Fuel theft"] [data-role="restore"]').click()); await sleep(500)
  ok(await page.evaluate(() => [...document.querySelectorAll('#fv-pain_area [role="radio"]')].some((b) => /Fuel theft/.test(b.innerText))), 'J10 Restore brings it back')
  await page.close()
}
{ // from the toolbar
  const page = await open('?role=admin')
  await page.evaluate(() => document.querySelector('[data-role="pain-areas"]').click()); await sleep(400)
  ok((await page.$$eval('[data-row]', (r) => r.length)) >= 8, 'J11 the toolbar opens the same manager (no form needed)')
  ok(await page.evaluate(() => !!document.querySelector('[data-role="rename"]')), 'J12 with Rename')
  await page.close()
}

// ───────────────────────── K. alert settings ─────────────────────────
console.log('\n== K. alert settings')
{
  const page = await open('?role=admin')
  await page.evaluate(() => document.querySelector('[data-role="alert-settings"]').click()); await sleep(500)
  eq(await page.$eval('#fv-alert-email', (e) => e.value), 'support@adititracking.com', 'K1 shows the current alert address')
  ok(await page.$eval('[data-role="settings-save"]', (b) => b.disabled), 'K2 Save is off until something changes')
  await fill(page, 'fv-alert-email', 'not-an-email'); await page.evaluate(() => document.querySelector('[data-role="settings-save"]').click()); await sleep(200)
  ok(/valid e-mail/.test(await page.$eval('[data-role="settings-message"]', (e) => e.innerText)), 'K3 a bad address is refused in place')
  await page.evaluate(() => (window.__calls.length = 0))
  await fill(page, 'fv-alert-email', '  Saajan@AditiTracking.com '); await page.evaluate(() => document.querySelector('[data-role="settings-save"]').click()); await sleep(500)
  const c = (await calls(page)).find((x) => x.path.endsWith('rpc/fs_set_setting'))
  eq(c?.body, { p_key: 'director_alert_email', p_value: 'saajan@adititracking.com' }, 'K4 saved through fs_set_setting, normalised')
  ok(/Saved/.test(await page.$eval('[data-role="settings-message"]', (e) => e.innerText)) && /Alert e-mail saved/.test(await toast(page)), 'K5 confirmation (in the dialog and as a toast)')
  eq(await page.$eval('#fv-alert-email', (e) => e.value), 'saajan@adititracking.com', 'K6 the box shows the saved, normalised address')
  await page.close()
  const rep = await open()
  ok(!(await text(rep)).includes('Alert settings'), 'K7 a rep has no Alert settings button')
  await rep.close()
}

// ───────────────────────── L. phone-sized screen, emoji, errors ─────────────────────────
console.log('\n== L. mobile, emoji, console')
{
  const page = await open('', { width: 390, height: 800 })
  await openForm(page); await chip(page, 'purpose', 'Discovery'); await sleep(150)
  const fs = await page.evaluate(() => [...document.querySelectorAll('.fixed.inset-0 input[type="text"], .fixed.inset-0 input[type="tel"], .fixed.inset-0 textarea')].map((e) => getComputedStyle(e).fontSize))
  ok(fs.length > 5 && fs.every((x) => x === '16px'), 'L1 every input is 16px on a phone (no iOS zoom)', [...new Set(fs)])
  const ch = await page.evaluate(() => [...document.querySelectorAll('.fixed.inset-0 [role="radio"]')].map((e) => e.getBoundingClientRect().height))
  ok(ch.length > 8 && ch.every((h) => h >= 39.5), 'L2 every chip is at least 40 px tall', Math.min(...ch))
  const sc = await page.evaluate(() => { const m = document.querySelector('.fixed.inset-0 > div'); return [m.scrollWidth, m.clientWidth] })
  ok(sc[0] <= sc[1] + 1, 'L3 no horizontal scrolling in the modal at 390 px', sc)
  const hasCapture = await page.$eval('[data-role="camera-input"]', (e) => e.getAttribute('capture'))
  eq(hasCapture, 'environment', 'L4 the camera button opens the rear camera')
  const em = await page.evaluate(() => document.body.innerText.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/gu) || [])
  eq(em, [], 'L5 no emoji anywhere in the form')
  await page.close()
}
ok(errors.length === 0, 'L6 no page errors or console errors during the whole run', errors.slice(0, 5))
console.log(`\nRESULT: ${n - failed} passed, ${failed} failed (${n} checks)`)
await browser.close(); await vite.close()
process.exit(failed ? 1 : 0)
