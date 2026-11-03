# qa/sales-meca-range — Sales Rep MeCa date-range filter

Dev-only. Nothing in `src/` imports this folder and `npm run build` does not touch it.

The Sales Rep MeCa tab has ONE date filter (`MecaRangeFilter.jsx`, ranges from `rangeFor` in `lib/salesMeca.js`): This Week (default), Previous Week,
This Month, Last Month, Last 3 Months, Custom. Weeks are Monday to Saturday. These pages and scripts run the REAL panel code from `src/`.

```
cd qa/sales-meca-range
npm install            # puppeteer-core only (the app's own node_modules are used for Vite / React)
npm test               # range.mjs, then race.mjs; exit code 1 on any failure
```
Needs Google Chrome; set `CHROME_PATH` if it is not at `C:/Program Files/Google/Chrome/Application/chrome.exe`. Port 5299 must be free.

## Automated (fake data layer, `meca.jsx`; nothing touches Supabase)
- `range.mjs` — 76 checks. (A) the range maths of `rangeFor` over many dates (every weekday, a Sunday, month and year boundaries, leap years, Custom
  validation); (B) the control wired into the real tab: the six options, the range text, Custom's date inputs, requests sent, no console errors.
- `race.mjs` — 52 checks. Regression for the blank page when a rep row (or the Company row) is clicked while a NEW range is still loading: the detail
  used to take the rep from the old report but the buckets from the new one. The fake layer answers slowly (`?delay=`) so the click always lands first;
  every pair of ranges with a different bucket count, both directions, clicked 100 ms and 800 ms after the switch. Fails with
  `Cannot read properties of undefined (reading 'meetings')` if `period` / `buckets` are read from the live report instead of being stored in the
  detail when the row is clicked (`openRep` / `openCompany` in `SalesMecaPanel.jsx`).

Page options (`meca.html`): `?now=<ISO time>` pretends it is that moment, `?own=1` is a rep with own scope, `?delay=<ms>` slows summary answers.

## Against live data, read-only (not part of `npm test`)
The real app logs in through Supabase; these scripts cannot. `meca_bridge.py` stands in for it: it answers `lc_my_access`, `sales_meca_summary` and
`sales_meca_leads` from the LIVE database by running the real functions in a read-only transaction (always rolled back) as the identity in `?who=`
(`ADMIN` = the Managing Director, or an e-mail). Any other function name is refused; it listens on 127.0.0.1 only. It reads
`SUPABASE_LEADCAPTURE_URL` from the repo's `.env` (never printed).

```
pip install "psycopg[binary]"
python meca_bridge.py            # port 5390; stop it when you are done
node live_modal_min.mjs          # in another terminal: opens a rep's detail on live data (Admin and Field Sales), checks rows / Total / lists
```
`live_modal_min.mjs` expects the live data it was written against (Ronak Shah with 1 meeting and 1 client in the week of 2 Nov 2026, Sultan Mulla with
none): on other data the numbers it prints will differ, and its "This Week" row counts are by construction 6 days.

## Against production with a REAL login (not part of `npm test`)
`real_login_check.mjs` closes the gap the bridge leaves: it starts the app's own dev server against the real Supabase project (from `.env`) and opens a
visible Chrome. **A person types the login** (Admin first, then a Field Sales person; each in its own private window), and the script drives Sales Rep MeCa
after that: all five presets, Custom typed into the real date inputs, and one rep detail window. For every `sales_meca_summary`, `lc_my_access` and
`sales_meca_leads` call it checks that the real PostgREST response (HTTP 200, the user's own bearer token) is identical to the bridge's answer for the same
logged-in e-mail, dates and bucket, that the table shows exactly those numbers, and that the filter bar and table top edge do not move.
It needs the bridge's `psycopg`, and it never prints or stores a token. The app itself writes its normal login activity rows on production for each login,
so run it only when that is acceptable. Result of the last run (2026-11-03): 78/78, Admin (`lc_admin`) and Sultan (`lc_field_sales`).

## After a deploy: the live site (not part of `npm test`)
`live_site_check.mjs` opens `https://learn.adititracking.com` in a visible Chrome; a person types the Admin login. It then checks that Sales Rep MeCa shows the
date filter and opens on This Week with a Company total (assert the numbers with `EXPECT_TOTAL=3,2,95000`, and the deployed bundle with
`EXPECT_BUNDLE=index-xxxx.js`), and that the Sales FMS close dialog leaves the right number of overlays behind (row route and detail-window route, dismissed
with their X buttons). **Read-only: it never submits a close**, so the close-lead submit path is not exercised on production (the `qa/sales-fms-close` matrix
covers it on the fake data layer). Like `real_login_check.mjs`, the login writes the app's normal activity rows. Last run 2026-11-03, right after the deploy:
13/13.

## Not covered
Real data is thin (all activity in one week), so the empty-range and own-scope paths are proven by structure more than by numbers.
