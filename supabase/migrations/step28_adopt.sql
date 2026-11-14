-- step 28: a rep may ADOPT their own Enquiry Sheet enquiry or SCOT contact into a Discovery visit (instead of the bare "already in the system" refusal).
-- "Own" = the existing rules, not a new one: an enquiry is yours when its sales_person_accountable label resolves to your login (lc_my_label_keys(): alias, exact
-- unique employee name, or your e-mail); a SCOT contact is yours when its sales_person label resolves the same way. Enquiries with no label and unassigned SCOT
-- contacts stay un-adoptable. Won/Lost enquiries, enquiries that cannot enter the pipeline (status rule 'never'), enquiries already linked to a field lead,
-- converted or inactive SCOT contacts are never adoptable. Several matches: the most recent open enquiry; an enquiry beats a SCOT contact. No second enquiry is ever
-- created for an adopted enquiry. Runs as claude_code_leadcapture; independent of step 28a.
begin;

alter table public.field_sales_leads
  add column adopted_from text,
  add column adopted_scot_id uuid references public.scot_clients (id),
  add constraint fs_leads_adopted_from_check check (adopted_from is null or adopted_from in ('enquiry', 'scot')),
  add constraint fs_leads_adopted_enquiry_check check (adopted_from is distinct from 'enquiry' or enquiry_id is not null),
  add constraint fs_leads_adopted_scot_check check ((adopted_from is not distinct from 'scot') or adopted_scot_id is null);
-- an enquiry is held by at most one LIVE lead (a deleted lead releases it)
drop index public.fs_leads_enquiry_uq;
create unique index fs_leads_enquiry_uq on public.field_sales_leads (enquiry_id) where enquiry_id is not null and deleted_at is null;

-- the one place that decides "is this phone number one of MY adoptable contacts?" (internal: no grant to clients; reached through the two definer functions)
create function public.fs_adoption_candidate(p_key text) returns jsonb
 language plpgsql stable security definer set search_path to 'public' as $function$
declare v_keys text[]; r record;
begin
  if p_key is null then return null; end if;
  v_keys := public.lc_my_label_keys();
  if cardinality(v_keys) = 0 then return null; end if;
  select e.id, e.name, e.company_name, e.city, e.status into r
    from public.enquiries e
   where public.scot_phone_key(e.phone) = p_key and e.deleted_at is null
     and public.meca_norm(e.sales_person_accountable) <> '' and public.meca_norm(e.sales_person_accountable) = any (v_keys)
     and e.status not in ('won', 'lost')
     and not exists (select 1 from public.enquiry_dropdown_options o where o.dropdown_type = 'status' and o.value = e.status and o.fms_rule = 'never')
     and public.fs_lead_outcome(e.id) = 'open'
     and not exists (select 1 from public.field_sales_leads l where l.enquiry_id = e.id and l.deleted_at is null)
   order by e.created_at desc, e.id desc limit 1;
  if found then
    return jsonb_build_object('source', 'enquiry', 'id', r.id, 'name', r.name, 'company', r.company_name, 'city', r.city, 'status', r.status);
  end if;
  select s.id, s.contact_name, s.city into r
    from public.scot_clients s
   where s.phone_key = p_key and s.deleted_at is null and s.status = 'active' and s.converted_enquiry_id is null
     and public.meca_norm(s.sales_person) <> '' and public.meca_norm(s.sales_person) = any (v_keys)
   order by s.created_at desc, s.id desc limit 1;
  if found then
    return jsonb_build_object('source', 'scot', 'id', r.id, 'name', r.contact_name, 'city', r.city);
  end if;
  return null;
end;
$function$;
revoke all on function public.fs_adoption_candidate(text) from public;

-- fs_find_by_phone: + 'adoptable' (the caller's own match; the details are their own row's). Everything else is unchanged: own_lead / taken / none.
create or replace function public.fs_find_by_phone(p_phone text) returns jsonb
 language plpgsql stable security definer set search_path to 'public' as $function$
declare k text := public.scot_phone_key(p_phone); l record; c jsonb;
begin
  if public.lc_uid() is null or not public.lc_has('field_sales_form_create') then raise exception 'Not authorised' using errcode = '42501'; end if;
  if k is null then return jsonb_build_object('match', 'none'); end if;
  select x.id, x.business_name, x.contact_person, x.city, x.created_by into l from public.field_sales_leads x where x.phone_key = k and x.deleted_at is null;
  if found then
    if l.created_by = public.lc_uid() then
      return jsonb_build_object('match', 'own_lead', 'lead_id', l.id, 'business_name', l.business_name, 'contact_person', l.contact_person, 'city', l.city);
    end if;
    return jsonb_build_object('match', 'taken');
  end if;
  c := public.fs_adoption_candidate(k);
  if c is not null then
    return jsonb_build_object('match', 'adoptable', 'source', c ->> 'source', 'name', c ->> 'name', 'company', c ->> 'company', 'city', c ->> 'city', 'status', c ->> 'status');
  end if;
  if exists (select 1 from public.enquiries e where public.scot_phone_key(e.phone) = k and e.deleted_at is null)
     or exists (select 1 from public.scot_clients s where s.phone_key = k and s.deleted_at is null) then
    return jsonb_build_object('match', 'taken');
  end if;
  return jsonb_build_object('match', 'none');
end;
$function$;

-- submit_field_sales_visit: step 27's function with these changes only: (1) Discovery on an adoptable contact asks for confirmation (23505, detail 'adoptable:<source>')
-- and, with adopt = true, creates the lead linked to the enquiry / SCOT contact; (2) "a demo is recorded" now means a COMPLETED visit exists (an adopted lead has
-- its enquiry before any visit); (3) an adopted enquiry's first demo brings it into Sales FMS and completes only the stages still open; (4) a completed visit on a
-- lead adopted from SCOT sets scot_clients.converted_enquiry_id; (5) the result carries 'adopted'.

create or replace function public.submit_field_sales_visit(p jsonb) returns jsonb
 language plpgsql security definer set search_path to 'public' as $function$
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
  v_completed boolean;  v_visit uuid;  v_enq uuid;  v_created boolean := false;  v_first timestamptz;  v_r1 text;  v_r2 text;
  v_outcome text;  v_pending integer;
  v_cand jsonb;  v_adopt boolean := coalesce(nullif(p ->> 'adopt', '')::boolean, false);  v_has_done boolean := false;  v_first_done boolean;
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
    if char_length(regexp_replace(coalesce(p ->> 'contact_number', ''), '\D', '', 'g')) < 10 then raise exception 'Enter a valid contact number (10 digits at least)' using errcode = '22023'; end if;
    v_key := public.scot_phone_key(p ->> 'contact_number');
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
      values (v_key, btrim(p ->> 'contact_number'), public.fs_clean(p, 'business_name', 200), public.fs_clean(p, 'contact_person', 200), public.fs_clean(p, 'area', 200),
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
  returning id, is_completed into v_visit, v_completed;     -- a pending visit stops here: no enquiry, no stages, no MeCa meeting

  -- ---- a COMPLETED visit: the enquiry + stages (first time), then the closure ----------------------------------------------------
  if v_completed then
    v_enq := v_lead.enquiry_id;
    v_first_done := not exists (select 1 from public.field_sales_visits y where y.lead_id = v_lead.id and y.deleted_at is null and y.is_completed and y.id <> v_visit);
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
              v_lead.source_of_lead, coalesce(nullif(v_lead.created_by_name, ''), v_lead.created_by_email), null, 'interested',
              'field_sales_form', v_lead.created_by, now(), v_lead.city)
      returning id into v_enq;
      v_created := true;
      update public.field_sales_leads set enquiry_id = v_enq where id = v_lead.id;
      if v_lead.adopted_scot_id is not null then   -- the existing 'Won closes the SCOT contact' trigger follows converted_enquiry_id
        update public.scot_clients set converted_enquiry_id = v_enq where id = v_lead.adopted_scot_id and converted_enquiry_id is null and deleted_at is null;
      end if;

      -- the SLA clock starts at the FIRST visit; first call = that visit, demo = this one
      select min(v.created_at) into v_first from public.field_sales_visits v where v.lead_id = v_lead.id and v.deleted_at is null;
      perform public.fms_create_stages(v_enq, v_first);
      select o.value into v_r1 from public.enquiry_dropdown_options o
       where o.dropdown_type = 'fms_reason_first_call' and o.is_active and o.completes_stage order by (o.value = 'Booked') desc, o.sort_order, o.value limit 1;
      select o.value into v_r2 from public.enquiry_dropdown_options o
       where o.dropdown_type = 'fms_reason_demo' and o.is_active and o.completes_stage order by (o.value = 'Done') desc, o.sort_order, o.value limit 1;
      update public.sales_fms_stages s set actual_at = v_first, reason = v_r1, reason_at = case when v_r1 is not null then now() end, updated_by = v_uid
       where s.enquiry_id = v_enq and s.stage_key = 'first_call';
      perform public.fms_plan_next(v_enq, 'first_call', v_first);
      update public.sales_fms_stages s set actual_at = now(), reason = v_r2, reason_at = case when v_r2 is not null then now() end, updated_by = v_uid
       where s.enquiry_id = v_enq and s.stage_key = 'demo';
      perform public.fms_plan_next(v_enq, 'demo', now());
      if v_demo_out = 'quotation_to_be_sent' then     -- the rep's own date replaces the default SLA plan; "Sent" is stamped later by the Sales FMS team
        update public.sales_fms_stages s
           set planned_at = case when v_qdate = v_today then now() + interval '2 hours' else (v_qdate::timestamp + interval '10 hours') at time zone 'Asia/Kolkata' end, updated_by = v_uid
         where s.enquiry_id = v_enq and s.stage_key = 'quotation' and s.actual_at is null;
      end if;
    elsif v_first_done and v_reason is distinct from 'Quotation follow-up' then
      -- an ADOPTED enquiry, its first demo: bring it into Sales FMS if it is not there yet (no second enquiry is ever created), complete only the stages still open
      perform public.fms_send_enquiries(array[v_enq]);
      if not exists (select 1 from public.enquiries e where e.id = v_enq and e.sent_to_fms_at is not null) then
        raise exception 'This enquiry cannot enter the sales pipeline' using errcode = '22023';
      end if;
      select min(v.created_at) into v_first from public.field_sales_visits v where v.lead_id = v_lead.id and v.deleted_at is null;
      perform public.fms_create_stages(v_enq, v_first);
      select o.value into v_r1 from public.enquiry_dropdown_options o
       where o.dropdown_type = 'fms_reason_first_call' and o.is_active and o.completes_stage order by (o.value = 'Booked') desc, o.sort_order, o.value limit 1;
      select o.value into v_r2 from public.enquiry_dropdown_options o
       where o.dropdown_type = 'fms_reason_demo' and o.is_active and o.completes_stage order by (o.value = 'Done') desc, o.sort_order, o.value limit 1;
      update public.sales_fms_stages s set actual_at = v_first, reason = v_r1, reason_at = case when v_r1 is not null then now() end, updated_by = v_uid
       where s.enquiry_id = v_enq and s.stage_key = 'first_call' and s.actual_at is null;
      perform public.fms_plan_next(v_enq, 'first_call', v_first);
      update public.sales_fms_stages s set actual_at = now(), reason = v_r2, reason_at = case when v_r2 is not null then now() end, updated_by = v_uid
       where s.enquiry_id = v_enq and s.stage_key = 'demo' and s.actual_at is null;
      perform public.fms_plan_next(v_enq, 'demo', now());
      if v_demo_out = 'quotation_to_be_sent' then
        update public.sales_fms_stages s
           set planned_at = case when v_qdate = v_today then now() + interval '2 hours' else (v_qdate::timestamp + interval '10 hours') at time zone 'Asia/Kolkata' end, updated_by = v_uid
         where s.enquiry_id = v_enq and s.stage_key = 'quotation' and s.actual_at is null;
      end if;
      update public.enquiries e set status = 'interested' where e.id = v_enq and e.status in ('open', 'rnr', 'future_lead');
    end if;

    v_outcome := case when v_demo_out = 'not_interested' or v_qout = 'lost' then 'lost' when v_qout = 'won' then 'won' end;
    if v_outcome is not null then   -- the closure (same effect as close_fms_lead, without its Sales FMS permission check)
      insert into public.sales_fms_closures (enquiry_id, outcome, closed_at, comment, so_number, amount, updated_by)
      values (v_enq, v_outcome, now(), v_close, v_so, v_amt, v_uid);
      update public.enquiries e set status = v_outcome where e.id = v_enq;
    end if;
  end if;

  select count(*)::int into v_pending from public.field_sales_visit_status x where x.lead_id = v_lead.id and x.visit_state = 'pending';
  return jsonb_build_object('lead_id', v_lead.id, 'visit_id', v_visit, 'completed', v_completed, 'visit_state', case when v_completed then 'completed' else 'pending' end,
                            'enquiry_id', v_enq, 'enquiry_created', v_created, 'outcome', coalesce(v_outcome, 'open'), 'open_pending', v_pending, 'adopted', v_lead.adopted_from);
end;
$function$;

-- the follow-up picker: the allowed reason follows the lead's visits, not whether it has an enquiry
create or replace function public.fs_search_leads(p_q text) returns jsonb
 language plpgsql stable security definer set search_path to 'public' as $function$
declare q text := btrim(coalesce(p_q, '')); d text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g'); v_all boolean;
begin
  if public.lc_uid() is null or not (public.lc_has('field_sales_form_create') or public.lc_has('field_sales_form_view')) then raise exception 'Not authorised' using errcode = '42501'; end if;
  if char_length(q) < 2 then return '[]'::jsonb; end if;
  v_all := public.lc_has('field_sales_form_view_all');
  return coalesce((
    select jsonb_agg(t.r order by t.r_sort desc) from (
      select jsonb_build_object('lead_id', l.id, 'business_name', l.business_name, 'contact_person', l.contact_person, 'contact_number', l.contact_number, 'city', l.city,
                                'mine', l.created_by = public.lc_uid(), 'has_enquiry', l.enquiry_id is not null,
                                'allowed_reasons', case when exists (select 1 from public.field_sales_visits x where x.lead_id = l.id and x.deleted_at is null and x.is_completed)
                                                        then jsonb_build_array('Quotation follow-up') else jsonb_build_array('Demo pending') end,
                                'created_by_name', case when v_all then l.created_by_name end) as r,
             coalesce((select max(v.created_at) from public.field_sales_visits v where v.lead_id = l.id and v.deleted_at is null), l.created_at) as r_sort
        from public.field_sales_leads l
       where l.deleted_at is null and (l.created_by = public.lc_uid() or v_all)
         and public.fs_lead_outcome(l.enquiry_id) = 'open'
         and (l.business_name ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
              or (char_length(d) >= 3 and regexp_replace(l.contact_number, '\D', '', 'g') like '%' || d || '%'))
       order by r_sort desc limit 20) t), '[]'::jsonb);
end;
$function$;

-- delete: the enquiry goes with the lead only when this flow CREATED it. A lead adopted from the Sheet leaves the original enquiry alone.
create or replace function public.delete_field_sales_leads(p_ids uuid[]) returns jsonb
 language plpgsql security definer set search_path to 'public' as $function$
declare v_requested integer; v_gone uuid[]; v_enq uuid[]; v_all boolean; v_can_sent boolean; v_visits integer; v_enqs integer := 0;
begin
  if public.lc_uid() is null or not public.lc_has('field_sales_form_delete') then raise exception 'Not authorised to delete Field Sales leads' using errcode = '42501'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'No leads selected' using errcode = '22023'; end if;
  if cardinality(p_ids) > 1000 then raise exception 'Too many leads selected (limit 1000 per delete)' using errcode = '22023'; end if;
  v_all := public.lc_has('field_sales_form_view_all');  v_can_sent := public.lc_has('enquiry_delete_sent');
  select count(distinct x) into v_requested from unnest(p_ids) x;
  select coalesce(array_agg(l.id), '{}'),
         coalesce(array_agg(l.enquiry_id) filter (where l.enquiry_id is not null and l.adopted_from is distinct from 'enquiry'), '{}') into v_gone, v_enq
    from public.field_sales_leads l
   where l.id = any (p_ids) and l.deleted_at is null and (l.created_by = public.lc_uid() or v_all)
     and (l.enquiry_id is null or l.adopted_from = 'enquiry' or v_can_sent);
  update public.field_sales_visits set deleted_at = now(), deleted_by = public.lc_uid() where lead_id = any (v_gone) and deleted_at is null;
  get diagnostics v_visits = row_count;
  update public.field_sales_leads set deleted_at = now(), deleted_by = public.lc_uid() where id = any (v_gone) and deleted_at is null;
  if cardinality(v_enq) > 0 then
    update public.enquiries set deleted_at = now(), deleted_by = public.lc_uid() where id = any (v_enq) and deleted_at is null;
    get diagnostics v_enqs = row_count;
  end if;
  return jsonb_build_object('requested', v_requested, 'deleted', cardinality(v_gone), 'skipped', v_requested - cardinality(v_gone), 'visits_deleted', v_visits, 'enquiries_deleted', v_enqs);
end;
$function$;

-- MeCa: an adopted enquiry's demo is stamped by the visit itself (same instant as the visit's created_at). That meeting is counted ONCE, as the visit:
-- the pipeline branch skips a demo whose actual time equals a completed visit's time on that enquiry's lead. A demo done earlier in Sales FMS still counts.
create or replace function public.meca_events(p_from date, p_to date)
 returns table(kind text, source text, rep_email text, rep_label text, event_date date, enquiry_id uuid, lead_name text, company text, amount numeric)
 language sql stable security definer set search_path to 'public' as $function$
  select 'meeting'::text, 'field_sales_form'::text, nullif(lower(btrim(f.entered_by_email)), ''), f.entered_by_name,
         (f.created_at at time zone 'Asia/Kolkata')::date, f.linked_enquiry_id, f.lead_name, null::text, null::numeric
    from public.field_sales_entries f                                  -- the frozen legacy form (11 rows, history)
   where (f.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
     and f.deleted_at is null
  union all
  select 'meeting', 'field_sales_form', nullif(lower(btrim(v.entered_by_email)), ''), v.entered_by_name,
         (v.created_at at time zone 'Asia/Kolkata')::date, l.enquiry_id, l.contact_person, l.business_name, null::numeric
    from public.field_sales_visits v                                   -- the new form: a visit counts only once COMPLETED (pending / superseded never)
    join public.field_sales_leads l on l.id = v.lead_id
   where v.is_completed and v.deleted_at is null and l.deleted_at is null
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
     and not exists (select 1 from public.field_sales_leads fl join public.field_sales_visits fv on fv.lead_id = fl.id
                      where fl.enquiry_id = e.id and fl.deleted_at is null and fv.deleted_at is null and fv.is_completed and fv.created_at = s.actual_at)
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
