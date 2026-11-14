-- step 29: (1) lc_sales_person loses enquiry_view; the row policy keeps showing a sales person the leads that are IN Sales FMS (labelled to them)
--          (2) a contact number is exactly 10 digits (after dropping +91 / 91 / a leading 0), enforced by the server
--          (3) EVERY Discovery visit is a meeting and puts the lead into Sales FMS at once; a Follow-up never counts as a meeting but updates the FMS stages
-- Runs as claude_code_leadcapture. Every patch of an existing definition is an exact-text replace of the LIVE text and aborts if its anchor is missing.
-- Not touched: the is_completed column, the visit states (completed / pending / superseded), field_sales_visits_alert (still exactly 2 demo-not-given visits,
-- the Discovery counting as one), fs_search_leads, the lc_sales_field / lc_field_sales / lc_admin tiers.
begin;

-- ====================================================================================================================================
-- 1. permissions
-- ====================================================================================================================================
-- 1a. lc_sales_person: sales_fms_view + sales_meca_view only (view only; it never had a write capability)
do $do$
declare v text; v2 text;
begin
  select pg_get_functiondef('public.lc_caps(text)'::regprocedure) into v;
  v2 := replace(v, $a$when 'lc_sales_person' then array['enquiry_view', 'sales_fms_view', 'sales_meca_view']$a$,
                   $a$when 'lc_sales_person' then array['sales_fms_view', 'sales_meca_view']$a$);
  if v2 = v then raise exception 'lc_caps: anchor not found'; end if;
  execute v2;
end $do$;

-- 1b. enquiries_select, the "labelled to me" clause: enquiry_view (the Sheet) OR sales_fms_view with the enquiry already sent to Sales FMS.
-- The Sales FMS view, its stage / closure policies and every FMS read follow this policy, so a pure Sales Person (no enquiry_view) keeps their own pipeline,
-- and a pure Field Sales rep sees an ADOPTED enquiry of theirs in Sales FMS. Unsent Sheet rows stay visible only through enquiry_view.
do $do$
declare v text; v2 text;
begin
  select p.qual into v from pg_policies p where p.schemaname = 'public' and p.tablename = 'enquiries' and p.policyname = 'enquiries_select';
  v2 := replace(v, $a$( SELECT lc_has('enquiry_view'::text) AS lc_has) AND (meca_norm(sales_person_accountable)$a$,
                   $a$(( SELECT lc_has('enquiry_view'::text) AS lc_has) OR (( SELECT lc_has('sales_fms_view'::text) AS lc_has) AND (sent_to_fms_at IS NOT NULL))) AND (meca_norm(sales_person_accountable)$a$);
  if v is null or v2 = v then raise exception 'enquiries_select: anchor not found'; end if;
  execute format('alter policy enquiries_select on public.enquiries using (%s)', v2);
end $do$;

-- ====================================================================================================================================
-- 2. the contact number: exactly 10 digits
-- ====================================================================================================================================
-- Non-digits are ignored; then: 10 digits as they are, 11 digits starting 0 (trunk prefix), 12 digits starting 91 (country code). Anything else is NOT a number (null).
-- Unlike scot_phone_key (the LAST 10 digits of whatever was typed, used to compare against old data) this never cuts an over-long number down to a different one.
create or replace function public.fs_phone10(p text)
returns text language sql immutable set search_path to '' as $$
  select case
           when length(x.d) = 10 then x.d
           when length(x.d) = 11 and left(x.d, 1) = '0' then right(x.d, 10)
           when length(x.d) = 12 and left(x.d, 2) = '91' then right(x.d, 10)
         end
    from (select pg_catalog.regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;
revoke all on function public.fs_phone10(text) from public;

do $do$
declare v text; v2 text;
begin
  select pg_get_functiondef('public.fs_find_by_phone(text)'::regprocedure) into v;
  v2 := replace(v, 'declare k text := public.scot_phone_key(p_phone);', 'declare k text := public.fs_phone10(p_phone);');
  if v2 = v then raise exception 'fs_find_by_phone: anchor not found'; end if;
  execute v2;
end $do$;

-- ====================================================================================================================================
-- 3a. submit_field_sales_visit: every visit leaves the lead in Sales FMS; the visit's answers move the stages
-- ====================================================================================================================================
create or replace function public.submit_field_sales_visit(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid     uuid := public.lc_uid();
  v_email   text := lower(btrim(coalesce(public.lc_jwt() ->> 'email', '')));
  v_name    text;
  v_today   date := (now() at time zone 'Asia/Kolkata')::date;
  v_purpose text := case lower(replace(coalesce(btrim(p ->> 'purpose'), ''), '-', ' ')) when 'discovery' then 'Discovery' when 'follow up' then 'Follow up' end;
  v_reason  text := case lower(replace(coalesce(btrim(p ->> 'follow_up_reason'), ''), '-', ' ')) when 'demo pending' then 'Demo pending' when 'quotation follow up' then 'Quotation follow-up' end;
  v_lead    public.field_sales_leads%rowtype;
  v_key     text;
  v_demo    boolean;  v_demo_out text;  v_qdate date;  v_nodemo text;  v_next date;
  v_qout    text;     v_qreason text;   v_close text;   v_so text;      v_amt numeric;
  v_remarks text;     v_path text;      v_lat numeric;  v_lng numeric;  v_acc numeric;  v_cap timestamptz;
  v_src     text;     v_ref text;       v_pain text;    v_gps text;
  v_completed boolean;  v_visit uuid;  v_enq uuid;  v_created boolean := false;  v_first timestamptz;  v_r1 text;  v_r2 text;  v_r3 text;
  v_outcome text;  v_pending integer;
  v_cand jsonb;  v_adopt boolean := coalesce(nullif(p ->> 'adopt', '')::boolean, false);  v_has_done boolean := false;
  v_adopt_from text;  v_adopt_enq uuid;  v_adopt_scot uuid;
begin
  if v_uid is null or not public.lc_has('field_sales_form_create') then
    raise exception 'Not authorised to log Field Sales visits' using errcode = '42501';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Nothing to save' using errcode = '22023'; end if;
  if v_purpose is null then raise exception 'Choose the purpose of the visit' using errcode = '22023'; end if;
  select nullif(btrim(ed."Employee_name"), '') into v_name from public."Employee_details" ed where lower(btrim(ed."Email_Id")) = v_email limit 1;
  v_name := coalesce(v_name, v_email);

  -- ---- the lead --------------------------------------------------------------------------------------------------------------
  if v_purpose = 'Discovery' then
    v_reason := null;
    v_src := public.fs_clean(p, 'source_of_lead', 40);
    if v_src is null or v_src not in ('Walk-in', 'Customer referral', 'Self-generated', 'Inbound enquiry') then raise exception 'Choose the source of the lead' using errcode = '22023'; end if;
    v_ref := case when v_src = 'Customer referral' then public.fs_clean(p, 'referrer_name', 200) end;
    if v_src = 'Customer referral' and v_ref is null then raise exception 'Enter the referrer name' using errcode = '22023'; end if;
    if nullif(p ->> 'coordinator_booked', '') is null then raise exception 'Say whether the meeting was booked by the Sales Coordinator' using errcode = '22023'; end if;
    if public.fs_clean(p, 'business_name', 200) is null or public.fs_clean(p, 'contact_person', 200) is null
       or public.fs_clean(p, 'area', 200) is null or public.fs_clean(p, 'city', 100) is null then
      raise exception 'Business name, contact person, area and city are required' using errcode = '22023';
    end if;
    if nullif(p ->> 'fleet_size', '') is null or (p ->> 'fleet_size')::integer < 0 then raise exception 'Enter the fleet size (0 or more)' using errcode = '22023'; end if;
    if nullif(p ->> 'uses_gps', '') is null then raise exception 'Say whether the customer uses any GPS today' using errcode = '22023'; end if;
    v_gps := case when (p ->> 'uses_gps')::boolean then public.fs_clean(p, 'existing_gps', 200) end;
    if (p ->> 'uses_gps')::boolean and v_gps is null then raise exception 'Enter the existing GPS name or service' using errcode = '22023'; end if;
    v_pain := public.fs_clean(p, 'pain_area', 100);
    if v_pain is null or not exists (select 1 from public.enquiry_dropdown_options o where o.dropdown_type = 'fs_pain_area' and o.value = v_pain and o.is_active) then
      raise exception '"%" is not an active Pain Area option', coalesce(v_pain, '') using errcode = '22023';
    end if;
    v_key := public.fs_phone10(p ->> 'contact_number');      -- exactly 10 digits once +91 / 91 / a leading 0 is dropped
    if v_key is null then raise exception 'Enter a valid contact number (exactly 10 digits)' using errcode = '22023'; end if;
    -- one generic refusal for every kind of match: it identifies nothing; an own lead is named only in the error detail
    select x.* into v_lead from public.field_sales_leads x where x.phone_key = v_key and x.deleted_at is null;
    if found then
      raise exception 'This phone number is already in the system' using errcode = '23505', detail = case when v_lead.created_by = v_uid then v_lead.id::text else '' end;
    end if;
    v_cand := public.fs_adoption_candidate(v_key);     -- the caller's OWN enquiry (label resolves to them) or SCOT contact (sales_person resolves to them)
    if v_cand is not null then
      if not v_adopt then   -- the form asks the rep to confirm, then sends adopt = true
        raise exception 'This contact is already in your pipeline' using errcode = '23505', detail = 'adoptable:' || (v_cand ->> 'source');
      end if;
      v_adopt_from := v_cand ->> 'source';
      if v_adopt_from = 'enquiry' then v_adopt_enq := (v_cand ->> 'id')::uuid; else v_adopt_scot := (v_cand ->> 'id')::uuid; end if;
    elsif exists (select 1 from public.enquiries e where public.scot_phone_key(e.phone) = v_key and e.deleted_at is null)
       or exists (select 1 from public.scot_clients s where s.phone_key = v_key and s.deleted_at is null) then
      raise exception 'This phone number is already in the system' using errcode = '23505', detail = '';
    end if;
    begin
      insert into public.field_sales_leads (phone_key, contact_number, business_name, contact_person, area, city, fleet_size, uses_gps, existing_gps,
                                            source_of_lead, referrer_name, coordinator_booked, pain_area, created_by, created_by_name, created_by_email,
                                            enquiry_id, adopted_from, adopted_scot_id)
      values (v_key, v_key, public.fs_clean(p, 'business_name', 200), public.fs_clean(p, 'contact_person', 200), public.fs_clean(p, 'area', 200),
              public.fs_clean(p, 'city', 100), (p ->> 'fleet_size')::integer, (p ->> 'uses_gps')::boolean, v_gps, v_src, v_ref, (p ->> 'coordinator_booked')::boolean,
              v_pain, v_uid, v_name, v_email, v_adopt_enq, v_adopt_from, v_adopt_scot)
      returning * into v_lead;
    exception when unique_violation then
      raise exception 'This phone number is already in the system' using errcode = '23505', detail = '';
    end;
  else
    if nullif(p ->> 'lead_id', '') is null then raise exception 'Choose the existing lead' using errcode = '22023'; end if;
    select * into v_lead from public.field_sales_leads where id = (p ->> 'lead_id')::uuid and deleted_at is null for update;
    if not found or v_lead.created_by <> v_uid then
      raise exception 'This lead is not assigned to you' using errcode = '42501';     -- private leads: same message for "not yours" and "not found"
    end if;
    if v_reason is null then raise exception 'Choose the follow-up reason' using errcode = '22023'; end if;
    if public.fs_lead_outcome(v_lead.enquiry_id) <> 'open' then raise exception 'This lead is already closed' using errcode = '22023'; end if;
    select exists (select 1 from public.field_sales_visits x where x.lead_id = v_lead.id and x.deleted_at is null and x.is_completed) into v_has_done;
    if v_reason = 'Demo pending' and v_has_done then raise exception 'The demo is already given for this lead: choose Quotation follow-up' using errcode = '22023'; end if;
    if v_reason = 'Quotation follow-up' and not v_has_done then raise exception 'No demo is recorded for this lead yet: choose Demo pending' using errcode = '22023'; end if;
  end if;

  -- ---- the visit's own answers (only the branch that applies is read; the table CHECKs are the backstop) ----------------------
  if v_reason is distinct from 'Quotation follow-up' then
    if nullif(p ->> 'demo_given', '') is null then raise exception 'Say whether the demo was given' using errcode = '22023'; end if;
    v_demo := (p ->> 'demo_given')::boolean;
    if v_demo then
      v_demo_out := nullif(btrim(p ->> 'demo_outcome'), '');
      if v_demo_out is null or v_demo_out not in ('quotation_to_be_sent', 'not_interested') then raise exception 'Choose the demo outcome' using errcode = '22023'; end if;
      if v_demo_out = 'quotation_to_be_sent' then
        v_qdate := nullif(p ->> 'quotation_due_date', '')::date;
        if v_qdate is null or v_qdate < v_today then raise exception 'The quotation send date must be today or later' using errcode = '22023'; end if;
      else
        v_close := public.fs_clean(p, 'closing_reason');
        if v_close is null then raise exception 'Enter the reason for not interested' using errcode = '22023'; end if;
      end if;
    else
      v_nodemo := public.fs_clean(p, 'no_demo_reason');
      if v_nodemo is null then raise exception 'Enter the reason the demo was not given' using errcode = '22023'; end if;
      v_next := nullif(p ->> 'next_followup_date', '')::date;
      if v_next is null or v_next <= v_today then raise exception 'The next follow-up date must be in the future' using errcode = '22023'; end if;
    end if;
  else
    v_qout := nullif(btrim(p ->> 'quotation_outcome'), '');
    if v_qout is null or v_qout not in ('won', 'lost', 'next_followup') then raise exception 'Choose the quotation follow-up outcome' using errcode = '22023'; end if;
    if v_qout = 'won' then
      v_so := public.fs_clean(p, 'so_number', 40);
      if v_so is null then raise exception 'Enter the SO number' using errcode = '22023'; end if;
      if nullif(p ->> 'won_amount', '') is null or (p ->> 'won_amount')::numeric < 0 then raise exception 'Enter the order amount (0 or more)' using errcode = '22023'; end if;
      v_amt := round((p ->> 'won_amount')::numeric, 2);
    elsif v_qout = 'lost' then
      v_close := public.fs_clean(p, 'closing_reason');
      if v_close is null then raise exception 'Enter the reason for loss' using errcode = '22023'; end if;
    else
      v_qreason := public.fs_clean(p, 'quotation_followup_reason');
      if v_qreason is null then raise exception 'Enter the reason for the next follow-up' using errcode = '22023'; end if;
      v_next := nullif(p ->> 'next_followup_date', '')::date;
      if v_next is null or v_next <= v_today then raise exception 'The next follow-up date must be in the future' using errcode = '22023'; end if;
    end if;
  end if;

  v_remarks := public.fs_clean(p, 'remarks', 1000);
  v_path := public.fs_clean(p, 'attachment_path', 300);
  if v_path is null or v_path not like v_uid::text || '/%' then raise exception 'Attach the photo or location screenshot' using errcode = '22023'; end if;
  if nullif(p ->> 'geo_lat', '') is null or nullif(p ->> 'geo_lng', '') is null then raise exception 'The location is required' using errcode = '22023'; end if;
  v_lat := (p ->> 'geo_lat')::numeric;  v_lng := (p ->> 'geo_lng')::numeric;
  v_acc := nullif(p ->> 'geo_accuracy_m', '')::numeric;
  v_cap := nullif(p ->> 'captured_at', '')::timestamptz;

  insert into public.field_sales_visits (lead_id, entered_by, entered_by_name, entered_by_email, purpose, follow_up_reason, demo_given, demo_outcome, quotation_due_date,
                                         no_demo_reason, next_followup_date, quotation_outcome, quotation_followup_reason, closing_reason, so_number, won_amount, remarks,
                                         attachment_path, geo_lat, geo_lng, geo_accuracy_m, captured_at)
  values (v_lead.id, v_uid, v_name, v_email, v_purpose, v_reason, v_demo, v_demo_out, v_qdate, v_nodemo, v_next, v_qout, v_qreason, v_close, v_so, v_amt, v_remarks,
          v_path, v_lat, v_lng, v_acc, v_cap)
  returning id, is_completed into v_visit, v_completed;     -- is_completed = "the demo is given / a quotation follow-up": it drives the visit state and the alert, NOT the meeting count

  -- ---- the lead is in Sales FMS after EVERY visit (a Discovery is always a meeting: meca_events counts purpose = 'Discovery') -------
  select min(v.created_at) into v_first from public.field_sales_visits v where v.lead_id = v_lead.id and v.deleted_at is null;
  select o.value into v_r1 from public.enquiry_dropdown_options o
   where o.dropdown_type = 'fms_reason_first_call' and o.is_active and o.completes_stage order by (o.value = 'Booked') desc, o.sort_order, o.value limit 1;
  select o.value into v_r2 from public.enquiry_dropdown_options o
   where o.dropdown_type = 'fms_reason_demo' and o.is_active and o.completes_stage order by (o.value = 'Done') desc, o.sort_order, o.value limit 1;
  select o.value into v_r3 from public.enquiry_dropdown_options o
   where o.dropdown_type = 'fms_reason_demo' and o.is_active and not o.completes_stage and o.value = 'Pending with SR';

  v_enq := v_lead.enquiry_id;
  if v_enq is null then
    insert into public.enquiries (enquiry_date, name, company_name, phone, email, requirement, source, sales_person_accountable, client_type, status,
                                  entry_channel, entered_by, sent_to_fms_at, city)
    values (v_today, v_lead.contact_person, v_lead.business_name, v_lead.contact_number, null,
            array[concat_ws(E'\n',
              'Business: '          || v_lead.business_name,
              'Location: '          || v_lead.area || ', ' || v_lead.city,
              'Fleet size: '        || v_lead.fleet_size,
              'Using GPS: '         || case when v_lead.uses_gps then 'Yes - ' || v_lead.existing_gps else 'No' end,
              'Pain area: '         || v_lead.pain_area,
              'Source: '            || v_lead.source_of_lead || coalesce(' (referrer: ' || v_lead.referrer_name || ')', ''),
              'Booked by Sales Coordinator: ' || case when v_lead.coordinator_booked then 'Yes' else 'No' end)],
            v_lead.source_of_lead, coalesce(nullif(v_lead.created_by_name, ''), v_lead.created_by_email), null,
            case when coalesce(v_demo, false) then 'interested' else 'open' end,      -- 'open' until a demo is done; a later demo moves it to 'interested'
            'field_sales_form', v_lead.created_by, now(), v_lead.city)
    returning id into v_enq;
    v_created := true;
    update public.field_sales_leads set enquiry_id = v_enq where id = v_lead.id;
    if v_lead.adopted_scot_id is not null then   -- the existing 'Won closes the SCOT contact' trigger follows converted_enquiry_id
      update public.scot_clients set converted_enquiry_id = v_enq where id = v_lead.adopted_scot_id and converted_enquiry_id is null and deleted_at is null;
    end if;
    perform public.fms_create_stages(v_enq, v_first);          -- the SLA clock starts at the FIRST visit
  elsif not exists (select 1 from public.enquiries e where e.id = v_enq and e.sent_to_fms_at is not null) then
    -- an ADOPTED enquiry: bring it into Sales FMS now (no second enquiry is ever created); its own status is left alone
    perform public.fms_send_enquiries(array[v_enq]);
    if not exists (select 1 from public.enquiries e where e.id = v_enq and e.sent_to_fms_at is not null) then
      raise exception 'This enquiry cannot enter the sales pipeline' using errcode = '22023';
    end if;
    perform public.fms_create_stages(v_enq, v_first);
  end if;

  -- the stages move only where they are still open (a stage already stamped, by this form or by the Sales FMS team, is never overwritten)
  if v_purpose = 'Discovery' then    -- the Discovery visit IS the first call
    update public.sales_fms_stages s set actual_at = v_first, reason = v_r1, reason_at = case when v_r1 is not null then now() end, updated_by = v_uid
     where s.enquiry_id = v_enq and s.stage_key = 'first_call' and s.actual_at is null;
    perform public.fms_plan_next(v_enq, 'first_call', v_first);
  end if;
  if v_reason is distinct from 'Quotation follow-up' then      -- a Discovery or a Demo pending visit says whether the demo happened
    if v_demo then
      update public.sales_fms_stages s set actual_at = now(), reason = v_r2, reason_at = case when v_r2 is not null then now() end, updated_by = v_uid
       where s.enquiry_id = v_enq and s.stage_key = 'demo' and s.actual_at is null;
      perform public.fms_plan_next(v_enq, 'demo', now());
      if v_demo_out = 'quotation_to_be_sent' then     -- the rep's own date replaces the default SLA plan; "Sent" is stamped later by the Sales FMS team
        update public.sales_fms_stages s
           set planned_at = case when v_qdate = v_today then now() + interval '2 hours' else (v_qdate::timestamp + interval '10 hours') at time zone 'Asia/Kolkata' end, updated_by = v_uid
         where s.enquiry_id = v_enq and s.stage_key = 'quotation' and s.actual_at is null;
      end if;
      update public.enquiries e set status = 'interested' where e.id = v_enq and e.status in ('open', 'rnr', 'future_lead');
    else                                                -- demo not given: the demo is due on the rep's own follow-up date, 10:00 IST
      update public.sales_fms_stages s
         set planned_at = (v_next::timestamp + interval '10 hours') at time zone 'Asia/Kolkata', reason = v_r3, reason_at = case when v_r3 is not null then now() end, updated_by = v_uid
       where s.enquiry_id = v_enq and s.stage_key = 'demo' and s.actual_at is null;
    end if;
  end if;

  v_outcome := case when v_demo_out = 'not_interested' or v_qout = 'lost' then 'lost' when v_qout = 'won' then 'won' end;
  if v_outcome is not null then   -- the closure (same effect as close_fms_lead, without its Sales FMS permission check)
    insert into public.sales_fms_closures (enquiry_id, outcome, closed_at, comment, so_number, amount, updated_by)
    values (v_enq, v_outcome, now(), v_close, v_so, v_amt, v_uid);
    update public.enquiries e set status = v_outcome where e.id = v_enq;
  end if;

  select count(*)::int into v_pending from public.field_sales_visit_status x where x.lead_id = v_lead.id and x.visit_state = 'pending';
  return jsonb_build_object('lead_id', v_lead.id, 'visit_id', v_visit, 'completed', v_completed, 'visit_state', case when v_completed then 'completed' else 'pending' end,
                            'enquiry_id', v_enq, 'enquiry_created', v_created, 'in_fms', true, 'meeting_counted', v_purpose = 'Discovery',
                            'outcome', coalesce(v_outcome, 'open'), 'open_pending', v_pending, 'adopted', v_lead.adopted_from);
end;
$function$;

-- ====================================================================================================================================
-- 3c. meca_events: a Discovery visit is a meeting (always); a Follow-up never is. A Sales FMS demo stamp made AFTER the enquiry became a Field Sales lead is not a second
--     meeting (the form sets it itself, possibly on a later Follow-up visit); a demo stamped BEFORE (an adopted Sheet enquiry) is history and still counts as it did.
-- ====================================================================================================================================
create or replace function public.meca_events(p_from date, p_to date)
returns table(kind text, source text, rep_email text, rep_label text, event_date date, enquiry_id uuid, lead_name text, company text, amount numeric)
language sql
stable security definer
set search_path to 'public'
as $function$
  select 'meeting'::text, 'field_sales_form'::text, nullif(lower(btrim(f.entered_by_email)), ''), f.entered_by_name,
         (f.created_at at time zone 'Asia/Kolkata')::date, f.linked_enquiry_id, f.lead_name, null::text, null::numeric
    from public.field_sales_entries f                                  -- the frozen legacy form (11 rows, history)
   where (f.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
     and f.deleted_at is null
  union all
  select 'meeting', 'field_sales_form', nullif(lower(btrim(v.entered_by_email)), ''), v.entered_by_name,
         (v.created_at at time zone 'Asia/Kolkata')::date, l.enquiry_id, l.contact_person, l.business_name, null::numeric
    from public.field_sales_visits v                                   -- the new form: every DISCOVERY visit is a meeting; Follow-up visits never are
    join public.field_sales_leads l on l.id = v.lead_id
   where v.purpose = 'Discovery' and v.deleted_at is null and l.deleted_at is null
     and (v.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
  union all
  select 'meeting', 'pipeline', public.meca_resolve_rep(e.sales_person_accountable, e.id), e.sales_person_accountable,
         (s.actual_at at time zone 'Asia/Kolkata')::date, e.id, e.name, e.company_name, null::numeric
    from public.sales_fms_stages s
    join public.enquiries e on e.id = s.enquiry_id
   where s.stage_key = 'demo' and s.actual_at is not null
     and (s.actual_at at time zone 'Asia/Kolkata')::date between p_from and p_to
     and e.sent_to_fms_at is not null and e.deleted_at is null
     and e.entry_channel <> 'field_sales_form'
     and not exists (select 1 from public.field_sales_leads fl where fl.enquiry_id = e.id and fl.deleted_at is null and s.actual_at >= fl.created_at)   -- stamped after the lead existed = the form's / its visits' business; an EARLIER demo of an adopted enquiry still counts
  union all
  select 'client', 'pipeline', public.meca_resolve_rep(e.sales_person_accountable, e.id), e.sales_person_accountable,
         (c.closed_at at time zone 'Asia/Kolkata')::date, e.id, e.name, e.company_name, c.amount
    from public.sales_fms_closures c
    join public.enquiries e on e.id = c.enquiry_id
   where c.outcome = 'won'
     and (c.closed_at at time zone 'Asia/Kolkata')::date between p_from and p_to
     and e.status = 'won' and e.sent_to_fms_at is not null and e.deleted_at is null;
$function$;

commit;
