# supabase/migrations — Lead Capture SQL (steps 20–31)

The SQL of the Lead Capture permission rebuild and everything after it, kept in git. **These files are a record of what was run, not something to
re-run:** every one of them has already been applied to the live database (by hand, through a hash-checked runner; this repo has no migration tool).
They are not run by any build or deploy step. Steps 1–19 predate this folder and are not tracked here.

**The hash** is the first 12 characters of SHA-256 over the file's text with line endings normalised to LF. It is what the runner required before
executing a file, so a file here whose hash equals the one below is byte-for-byte the text that ran. Check one with:
`python -c "import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],'rb').read().replace(b'\r\n',b'\n')).hexdigest()[:12])" <file>`

## What is here (each verified against its live hash)

| File | Hash | What it did |
|---|---|---|
| `step20_lc_roles_phase1.sql` | `d3b1a128a330` | Permission rebuild, phase 1: `lead_capture_roles` (lc_field_sales / lc_sales_person / lc_admin), `lc_caps`, `lc_tier`, `lc_has`, `lc_my_access`, the role list / set / history functions |
| `step22_scot_cold_leads.sql` | `4a202399e57d` (`183810e67b48` with CRLF) | SCOT Cold Leads schema correction (`scot_clients` / `scot_calls` columns, `enquiry_id`, `lead_source`, `created_via`, outcomes) |
| `step23_scot_meeting_to_enquiry.sql` | `a5cea160a790` | "Meeting Scheduled" on a SCOT call converts the contact into an enquiry (`scot_call` channel, `converted_enquiry_id`, won-back trigger) |
| `step25_meca_target_prorata.sql` | `1099ed3f6e8a` | Sales Rep MeCa targets prorated by calendar days for a partial month (needed by the date-range filter) |
| `step25_rollback.sql` | `858ecbd19212` | Undoes step 25 (restores the whole-month target) |
| `step26_meca_target_noprorata.sql` | `ec82c5424e44` | Sales Rep MeCa: a "no proration" mode for the target. `meca_target` and `sales_meca_summary` each gain a trailing `p_prorate boolean default true`; with `false` every touched month counts at its whole target (This Month, Custom) and blocks smaller than a month carry no target. Default behaviour byte-identical (66/66 calls before/after). Old overloads dropped in the same transaction |
| `step26_rollback.sql` | `8cdea5834d92` | Undoes step 26 (restores the step 25 pair). Never run. Roll the web app back first: an app that sends `p_prorate` would get "function not found" |
| `step26a_service_role_grants.sql` | `92990682fbe5` | Grant-only follow-up to step 26: the two new functions did not carry the `service_role` execute grant the old pair had (a freshly created function does not get it through default privileges). Restores it; ACLs then equal the pre-step-26 pair exactly |
| `step27_all.sql` | `910e7d612529` | The Field Sales Visit Form backend: `field_sales_leads` (private to the creating rep, one per phone) + `field_sales_visits` (append-only; `submit_field_sales_visit`, `fs_find_by_phone`, `fs_search_leads`, the visit-state and lead-state views), the Growth Director alert outbox + trigger + `fs_alerts_claim` / `fs_alert_done`, `fs_get_settings` / `fs_set_setting`, the `fs_pain_area` list (the only admin-managed list; `rename_dropdown_option` cascades), MeCa counting the new visits. No rollback written |
| `step28a_sales_field_tier.sql` | `45971d4db91c` | The `lc_sales_field` tier ("Sales Person + Field Sales": the Sales Person caps + `field_sales_form_view` / `_create`) and its first holders (Ronak, Vishwas, Suhas). No rollback written |
| `step28_adopt.sql` | `051e58bc4c5d` | Adoption: a rep's OWN Enquiry Sheet enquiry or SCOT contact (resolved by `lc_my_label_keys`) can be adopted into a Discovery visit (`fs_adoption_candidate`, `adopt`, `adopted_from` / `adopted_scot_id`); `fs_find_by_phone` answers `adoptable`. No rollback written |
| `step27b_user_run_delivery_and_storage.sql` | `9271cea2250d` | **NOT RUN YET (a person runs it in the SQL editor).** The vault secret + the pg_cron job that calls the alert Edge Function every 5 minutes, the private `field-sales-visits` storage bucket and its two policies (`fs_visits_upload`, `fs_visits_read`), and an optional freeze of the legacy form. Placeholders only: the real secret is typed at run time |
| `step29_discovery_counts.sql` | `fc0573d15ec8` | Every Discovery visit is a meeting and puts the lead into Sales FMS at once (a Follow-up never counts; it moves the FMS stages: demo stamp, quotation plan, status `open` -> `interested`); the contact number is exactly 10 digits (`fs_phone10`: +91 / 91 / a leading 0 dropped, never cut down); `lc_sales_person` loses `enquiry_view` and `enquiries_select` shows it the leads in Sales FMS labelled to it (`sales_fms_view`); `meca_events` counts `purpose = 'Discovery'`. No rollback written |
| `step29b_delete_test_lead.sql` | `c75363eedf39` | Soft-deletes one named end-to-end test lead (guarded: no enquiry, one visit). Data fix, not schema |
| `step30_fms_stage_counts.sql` | `f94835f929e6` | `sales_fms_summary` gains `open` and `stage_first_call` / `stage_demo` / `stage_quotation` / `stage_negotiation` / `stage_closure` (open leads by the view's `current_stage`); every existing key unchanged. No rollback written |
| `step31_lead_delete_cap.sql` | `0681da93ae33` | A Field Sales rep can delete a lead THEY created, at any time, even once it is in Sales FMS: the narrow capability `field_sales_lead_delete` (Field Sales and Sales Person + Field Sales tiers; admins keep `field_sales_form_delete` + `enquiry_delete_sent`), accepted by `delete_field_sales_leads` (own leads only, unless `field_sales_form_view_all`); deleting a lead whose enquiry the form created also releases an adopted SCOT contact (`converted_enquiry_id` cleared) so it can be adopted again. Deliberately NOT a grant of `field_sales_form_delete` / `enquiry_delete_sent`, which also gate the legacy entries delete and the Sheet's delete of sent rows. No rollback written |


## What is NOT here (applied live, text not recoverable)

These ran on the live database, but their files were generated by scripts that depended on a throw-away test database, and the working folder that held
them was lost. They could not be rebuilt byte-for-byte, and a reconstruction that does not match the hash is not committed here.

| Step | Live hash | What it did | Rollback hash |
|---|---|---|---|
| 21 `step21_lc_gates_phase3.sql` | `c7ef6fd41891` | Permission rebuild, phase 3: every Lead Capture function and policy now decides by the caller's tier (`lc_has`), the retired `enquiry_field_sales` channel flag, tiered dropdown reads / writes | `62d62b85e56e` (`step21_rollback.sql`) |
| 24 `step24_scot_next_call_offsets.sql` | `13ad02a45dcf` | SCOT per-outcome next-call offsets (`default_next_call_days`, `log_scot_call` change) | `fee5aa0c11d6` (`step24_rollback.sql`) |
| 22 rollback `step22_rollback.sql` | — | Not run; tested in a sandbox only | `f5155099e7ec` |
| 23 rollback `step23_rollback.sql` | — | Not run; tested in a sandbox only | `75a107394960` |

The alert e-mail is sent by an Edge Function whose source is in `supabase/functions/send-pending-followup-alert/index.ts` (**not deployed yet**; it needs the `FS_ALERT_SECRET` and `RESEND_API_KEY` function secrets, and step 27b's cron job to call it).

**[`step21_24_live_snapshot.md`](step21_24_live_snapshot.md)** is a snapshot of the CURRENT live definitions of the objects steps 21 and 24 left behind
(functions, policies, index, grants, the step 24 column and constraints), pulled read-only on 2026-11-03. **It is not the original migration text and not a
migration record**: it shows the state today, which later steps (22, 23, 24, 25) also changed, in the form PostgreSQL stores it. Do not run it as SQL.
The live database remains the source of truth (`pg_get_functiondef`, `pg_policies`).
## Flag for the future: steps 17 and 19 do not reproduce from the session record

While trying to rebuild steps 21 and 24, the text of the earlier steps was replayed from the record of the working session and compared with the hash
each one was executed with. Step 16 (`f93d07a98d6a`) and step 18 (`067561f70595`) reproduced exactly. **Step 19** (`step19_scot_calls.sql`, live hash
`ca484dc460e2`) did not: the text rebuilt from the record hashes to `56c83dddf1f4`, so some of its edits were made in a way the record does not capture.
**Step 17** (`step17_sales_fms_redesign.sql`, live hash `0feb7364c353`) was a generated file whose generator could not be replayed, so it could not be
rebuilt at all. This says nothing about the live database (it ran with the correct hash at the time); it means the original text of steps 17 and 19
cannot be verified from this repo or the session record. No action needed on them now.

The lost rollbacks were also guarded: rollback 22 refused to run once SCOT rows exist and rollback 23 once conversions exist (both are true on live now),
and rollback 24 refused once the offsets had been reconfigured. Do not count on any of them as an available undo.
