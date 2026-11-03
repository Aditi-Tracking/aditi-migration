# qa/sales-fms-close — Sales FMS "close a lead" regression

Dev-only. Nothing in `src/` imports this folder and `npm run build` does not touch it.

**The bug it guards against:** closing a lead from inside its detail window left a dead, unclickable copy of that window on screen, because the lead
window and the close dialog (siblings in `SalesFmsTable.jsx`) shared the same React key. They now use `lead-<id>` and `close-<id>`.

## Automated matrix (`matrix.mjs`)
Real Lead Capture panel + real Sales FMS components over a **fake data layer** (`fms.jsx`: five open leads, one per stage, answers every request
in the browser; nothing touches Supabase). 20 cases: Won and Lost × opened from the row button and from the detail window × first_call, demo,
quotation, negotiation, closure; 230 checks (overlay counts, X dismissing, the write carrying SO number / amount / comment, the surviving window
showing the new state, no duplicate-key warning). With the old shared keys 90 of them fail (every detail-window case).

```
cd qa/sales-fms-close
npm install            # puppeteer-core only (the app's own node_modules are used for Vite / React)
npm test               # node matrix.mjs; exit code 1 on any failure
```
Needs Google Chrome; set `CHROME_PATH` if it is not at `C:/Program Files/Google/Chrome/Application/chrome.exe`. Port 5299 must be free.

## Manual checklist
`QA_sales_fms_close.md` — the same matrix by hand, for after a deploy.

## Not covered yet
The fake data layer does not exercise the real `close_fms_lead` database function. Re-run the Won flow against a SQL-backed setup (real Supabase calls)
to confirm the closure write (SO number, amount, comment) end to end.
