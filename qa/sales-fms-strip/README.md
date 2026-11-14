# qa/sales-fms-strip - Sales FMS tile strip

Dev-only. Nothing in `src/` imports this folder and `npm run build` does not touch it.

The strip above the Sales FMS list (`FmsKpiStrip.jsx`, wired in `SalesFmsTable.jsx`): six count tiles - In pipeline (open leads only), Overdue, Demo, Quotation, Won, Lost -
then three average-time tiles (First Call, Demo Booked, Quotation), all nine on one row at a normal desktop width. These pages run the REAL Lead Capture panel and Sales FMS
components in real Chrome over a **fake data layer** (`strip.jsx`: a known pipeline of 19 leads, a summary computed from them, a list that honours the
Current stage and State filters); nothing touches Supabase.

```
cd qa/sales-fms-strip
npm install            # puppeteer-core only (the app's own node_modules are used for Vite / React)
npm test               # node run.mjs; exit code 1 on any failure
```
Needs Google Chrome; set `CHROME_PATH` if it is not at `C:/Program Files/Google/Chrome/Application/chrome.exe`. Port 5312 must be free.

## What `run.mjs` checks (30 checks)
- **the tiles**: the six count tiles in order (In pipeline, Overdue, Demo, Quotation, Won, Lost), no On track / Not scheduled / First Call / Negotiation / Closure
  count tile, the numbers (16 open, 10 overdue, Demo 4, Quotation 5, won 2, lost 1), In pipeline still counting every open lead, its tooltip, equal tile heights, the
  three average-time tiles (First Call, Demo Booked, Quotation; no Negotiation).
- **one row**: at 1440, 1366 and 1056px (= a 1280px screen less the app's 224px sidebar) all nine tiles sit on one row, 52px high, nothing overflows, no label is cut
  off; at 700px the row wraps and the page does not scroll sideways.
- **clicking**: Demo / Quotation ask for `current_stage in (...)` and no state filter; Overdue / Won / Lost / In pipeline ask for `pipeline_state in (...)` (In pipeline =
  the three open states) and clear the stage; one selection at a time; clicking the selected tile again clears it; the rows shown match the tile.
- **an older server** (`?old=1`, no per-stage counts): the stage tiles show a dash, nothing breaks.
- **the console**: no page or console errors.

## Not covered here
The real `sales_fms_summary` function and the real view (tested in the SQL sandbox: counts equal the rows the Current stage filter returns, per caller).