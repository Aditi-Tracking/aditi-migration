# Sales FMS: closing a lead — manual QA after deploy

Bug this guards against: closing a lead from inside its detail window left a dead, unclickable copy of that window on screen (duplicate React key in
`SalesFmsTable.jsx`). Fixed by giving the detail window and the close dialog different keys.

You need: an Admin login (Sales FMS update permission) and five **open** leads in Sales FMS, one at each stage:
**First Call, Demo, Quotation, Negotiation, and "Closure"** (all four stages done, not yet closed). Use test leads.

## Run this for each of the 5 leads, twice (Won, then Lost) — 20 checks in all
Do **Route A (row button)** on some leads and **Route B (detail window)** on others, but make sure every stage gets BOTH routes over the two outcomes
(for example: Won/Route A and Lost/Route B on the first pass; Won/Route B and Lost/Route A on a second set of leads).

**Route A — the "Close lead" button in the list row**
1. Click **Close lead** on the row. One dialog opens ("Close <name>").
2. Click its **X**. The dialog closes; the list is untouched.
3. Open it again, choose **Won** (type an SO number, an amount, a comment) or **Lost** (type why), press **Close as Won / Close as Lost**.
4. A green "was marked Won/Lost" message appears. **Nothing else is left on screen**, and the row now reads Won / Lost.
5. Click the row: the lead's window opens, shows **Won/Lost** with the SO number, amount and comment (Won) — click its **X**: it closes.

**Route B — "Close this lead" inside the lead's window**
1. Click the row to open the lead's window, then **Close this lead**. Two windows are open (the lead, with the dialog on top).
2. Click the dialog's **X**: only the dialog closes; the lead's window stays and still works.
3. Open **Close this lead** again, choose Won/Lost, fill in, submit.
4. The dialog disappears and **exactly one window is left: the lead's window, now showing Won/Lost** (not "Overdue"/"On track") with the closure line.
5. Click that window's **X**: it closes. Click anywhere on the page: it responds. Click the row again: it opens normally.

## Pass / fail
- **Fail** if, after submitting, you can still see a second window or a greyed overlay, if any X or click does nothing, if the window still says
  Overdue/On track after a successful close, or if you must refresh the page to continue.
- **Also check** (browser DevTools console, F12): no red "Encountered two children with the same key" message at any point.
- Write down for each of the 20 combinations: lead stage, Won/Lost, Route A/B, pass or fail.

## After a Won close, also confirm (data)
Open the lead again: SO number, amount and comment are exactly what you typed. (A Lost close stores only the reason.)
