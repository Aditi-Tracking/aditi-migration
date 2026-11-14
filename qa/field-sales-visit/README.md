# qa/field-sales-visit — Field Sales Visit Form

Dev-only. Nothing in `src/` imports this folder and `npm run build` does not touch it.

The Field Sales tab of Lead Capture is the leads list plus the Visit Form (`FieldSalesFormPanel.jsx`, `FieldSalesLeadsTable.jsx`, `VisitForm.jsx` and the parts beside
them; data layer `lib/fieldSalesVisits.js`, photo helpers `lib/visitPhoto.js`). These pages run the REAL panel code from `src/` in real Chrome over a **fake backend**
(`visit.jsx`, host `rb.test`): the form is exercised end to end, but nothing touches Supabase, Storage or Resend.

```
cd qa/field-sales-visit
npm install            # puppeteer-core only (the app's own node_modules are used for Vite / React)
npm test               # run.mjs; exit code 1 on any failure
```
Needs Google Chrome; set `CHROME_PATH` if it is not at `C:/Program Files/Google/Chrome/Application/chrome.exe`. Port 5311 must be free.

## What `run.mjs` checks (197 checks)
- **A. the rules** (`lib/fieldSalesVisits.js`; the contact number is exactly 10 digits once +91 / 91 / a leading 0 is dropped, never cut down: `normalizePhone10`): `visibleFields` for every branch of the design (Purpose, referral, GPS, demo Yes / No, the two outcomes, Follow-up with
  and without a lead, Demo pending, Quotation follow-up with Won / Lost / Next follow-up), the validator (hidden fields are never validated; dates, lengths, phone,
  fleet, amount), the payload (typed, trimmed, and carrying only fields that apply), the allowed follow-up reason, the stamp text.
- **B. the list**: a rep's own leads only, status / outcome / overdue badges, equal row heights, the filter buttons and the requests they make, the lead detail with
  visit states (completed / pending / superseded) and reasons, "Log a follow-up" only on an own open lead, the Legacy entries toggle (read-only, no New Entry, not
  fetched until opened), and the admin view (Rep column, every lead, Pain areas, Alert settings).
- **C. the form flow**: what is shown at each step, date `min` attributes, the "Saved as pending" note.
- **D. the lead picker**: no search under 2 characters, one debounced search, own open leads only, the allowed reason decides the reason chip, an admin sees other reps'
  leads but cannot pick them.
- **E. the phone check**: no call under 10 digits, one call for fast typing, an 11-digit number is said to be wrong and never checked as its last 10, `+91 90000-00004` and `090000-00004` are the same number, `taken` (no identifying detail, blocks submit), `none`, `own_lead` (switches to Follow-up),
  `adoptable` (named, pre-fills empty fields only).
- **F. submit** (a Discovery always counts as a meeting and is in Sales FMS; a follow-up never counts: the toasts and the form notes say so, the second no-demo visit mentions the Growth Director, a third does not): the exact payload of every branch (the number is sent as its 10 digits), the photo uploaded BEFORE the visit, the toasts, the list refetched, hidden values never sent.
- **G. failures and layout**: the empty-submit messages and focus, no field moves when messages appear, a dropped connection keeps everything typed and the retry uploads
  the photo only once, a server error is shown as is, another rep's lead is refused with the server's own message.
- **H. adoption**: the box must be ticked; the server's "already in your pipeline" refusal opens the confirmation (cancel keeps the form; confirm resubmits with `adopt`).
- **I. photo + location**: the position and stamp, Remove, a 3000x2000 image shrunk to a small JPEG with the bar and its text burned in (pixel checks), location refused
  (message, Retry still works after a blocked submit, then completes), a missing bucket says so and nothing is saved.
- **J. Pain area manager**: add / rename (cascade, duplicate refused, the chosen chip follows) / remove / restore, from the form and from the toolbar; none for a rep.
- **K. alert settings**: the current address, validation, save through `fs_set_setting` (normalised), admin only.
- **L. phone-sized screen, emoji, console**: 16px inputs, chips at least 40px, no horizontal scroll, the camera input uses the rear camera, no emoji, no console errors.

Page options (`visit.html`): `?role=admin|rep|viewer` (default rep), `?geo=deny` (the position is refused until `window.__geoDenied = false`), `?nobucket=1`
(storage answers "Bucket not found"), `?failsubmit=1` (the first submit answers 500), `?netfail=1` (the first submit throws a network error), `?pending=3` (a follow-up without the demo answers 3 open no-demo visits instead of 2), `?latency=<ms>`.
Phone numbers with special answers: `9000000001` own lead, `…02` adoptable enquiry, `…03` adoptable SCOT contact, `…04` taken, `…05` "none" first and adoptable after.

## Not covered here (needs the real thing)
The real database (RLS, the submit function, the stage and closure logic is tested separately in the SQL sandbox), Supabase Storage and its policies, a real phone camera and
GPS, iOS Safari, the Edge Function and Resend e-mail. The first real end-to-end run is the one after the `field-sales-visits` bucket and its policies exist.
