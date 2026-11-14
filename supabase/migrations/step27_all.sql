-- step 27: Field Sales Visit Form rebuild (field_sales_leads + field_sales_visits). Runs as claude_code_leadcapture (owner of the Lead Capture objects).
-- Definer functions use public.lc_uid()/lc_jwt() only (never auth.*). No FK to auth.users (this role has no USAGE on schema auth).
begin;

-- ============================================================ 1. tables
create table public.field_sales_leads (
  id                 uuid primary key default gen_random_uuid(),
  phone_key          text not null,                      -- last 10 digits (scot_phone_key)
  contact_number     text not null,
  business_name      text not null,
  contact_person     text not null,
  area               text not null,
  city               text not null,
  fleet_size         integer not null,
  uses_gps           boolean not null,
  existing_gps       text,
  source_of_lead     text not null,
  referrer_name      text,
  coordinator_booked boolean not null,
  pain_area          text not null,                      -- an active fs_pain_area option at submit time
  enquiry_id         uuid references public.enquiries (id),   -- set when the first visit COMPLETES
  created_by         uuid not null,
  created_by_name    text,
  created_by_email   text,
  created_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  deleted_by         uuid,
  constraint fs_leads_text_check check (btrim(contact_number) <> '' and btrim(business_name) <> '' and btrim(contact_person) <> '' and btrim(area) <> '' and btrim(city) <> ''
                                        and btrim(pain_area) <> '' and char_length(business_name) <= 200 and char_length(contact_person) <= 200
                                        and char_length(area) <= 200 and char_length(city) <= 100 and char_length(contact_number) <= 30),
  constraint fs_leads_fleet_check  check (fleet_size >= 0),
  constraint fs_leads_source_check check (source_of_lead in ('Walk-in', 'Customer referral', 'Self-generated', 'Inbound enquiry')),
  constraint fs_leads_referrer_check check ((source_of_lead = 'Customer referral') = (referrer_name is not null and btrim(referrer_name) <> '' and char_length(referrer_name) <= 200)),
  constraint fs_leads_gps_check check (uses_gps = (existing_gps is not null and btrim(existing_gps) <> '' and char_length(existing_gps) <= 200))
);
create unique index fs_leads_phone_uq   on public.field_sales_leads (phone_key) where deleted_at is null;
create unique index fs_leads_enquiry_uq on public.field_sales_leads (enquiry_id) where enquiry_id is not null;
create index fs_leads_created_by_idx    on public.field_sales_leads (created_by) where deleted_at is null;

create table public.field_sales_visits (
  id                        uuid primary key default gen_random_uuid(),
  lead_id                   uuid not null references public.field_sales_leads (id),
  created_at                timestamptz not null default now(),       -- the visit time (server clock)
  entered_by                uuid not null,
  entered_by_name           text,
  entered_by_email          text,
  purpose                   text not null,
  follow_up_reason          text,
  demo_given                boolean,
  demo_outcome              text,
  quotation_due_date        date,
  no_demo_reason            text,                                      -- FREE TEXT
  next_followup_date        date,
  quotation_outcome         text,
  quotation_followup_reason text,                                      -- FREE TEXT
  closing_reason            text,                                      -- FREE TEXT (not interested / lost)
  so_number                 text,
  won_amount                numeric(14,2),
  remarks                   text,
  attachment_path           text not null,
  geo_lat                   numeric(9,6) not null,
  geo_lng                   numeric(9,6) not null,
  geo_accuracy_m            numeric(10,2),
  captured_at               timestamptz,                               -- device-reported, informational
  stamped_at                timestamptz not null default now(),        -- server stamp
  is_completed              boolean generated always as (coalesce(demo_given, false) or follow_up_reason is not distinct from 'Quotation follow-up') stored,
  deleted_at                timestamptz,
  deleted_by                uuid,
  constraint fs_visits_purpose_check   check (purpose in ('Discovery', 'Follow up')),
  constraint fs_visits_reason_check    check (follow_up_reason is null or follow_up_reason in ('Demo pending', 'Quotation follow-up')),
  constraint fs_visits_reason_req      check ((purpose = 'Follow up') = (follow_up_reason is not null)),
  constraint fs_visits_demo_req        check ((follow_up_reason is not distinct from 'Quotation follow-up') = (demo_given is null)),
  constraint fs_visits_demo_out_check  check (demo_outcome is null or demo_outcome in ('quotation_to_be_sent', 'not_interested')),
  constraint fs_visits_demo_out_req    check ((demo_given is true) = (demo_outcome is not null)),
  constraint fs_visits_qdate_req       check ((demo_outcome is not distinct from 'quotation_to_be_sent') = (quotation_due_date is not null)),
  constraint fs_visits_nodemo_req      check ((demo_given is false) = (no_demo_reason is not null)),
  constraint fs_visits_qout_check      check (quotation_outcome is null or quotation_outcome in ('won', 'lost', 'next_followup')),
  constraint fs_visits_qout_req        check ((follow_up_reason is not distinct from 'Quotation follow-up') = (quotation_outcome is not null)),
  constraint fs_visits_qreason_req     check ((quotation_outcome is not distinct from 'next_followup') = (quotation_followup_reason is not null)),
  constraint fs_visits_closing_req     check (((demo_outcome is not distinct from 'not_interested') or (quotation_outcome is not distinct from 'lost')) = (closing_reason is not null)),
  constraint fs_visits_next_req        check (((demo_given is false) or (quotation_outcome is not distinct from 'next_followup')) = (next_followup_date is not null)),
  constraint fs_visits_won_req         check ((quotation_outcome is not distinct from 'won') = (so_number is not null) and (quotation_outcome is not distinct from 'won') = (won_amount is not null)),
  constraint fs_visits_so_check        check (so_number is null or (so_number = btrim(so_number) and so_number <> '' and char_length(so_number) <= 40)),
  constraint fs_visits_amount_check    check (won_amount is null or won_amount >= 0),
  constraint fs_visits_text_check      check ((no_demo_reason is null or (btrim(no_demo_reason) <> '' and char_length(no_demo_reason) <= 500))
                                          and (quotation_followup_reason is null or (btrim(quotation_followup_reason) <> '' and char_length(quotation_followup_reason) <= 500))
                                          and (closing_reason is null or (btrim(closing_reason) <> '' and char_length(closing_reason) <= 500))
                                          and (remarks is null or char_length(remarks) <= 1000)),
  constraint fs_visits_attach_check    check (btrim(attachment_path) <> '' and char_length(attachment_path) <= 300),
  constraint fs_visits_geo_check       check (geo_lat between -90 and 90 and geo_lng between -180 and 180 and (geo_accuracy_m is null or geo_accuracy_m >= 0))
);
create index fs_visits_lead_idx       on public.field_sales_visits (lead_id, created_at, id) where deleted_at is null;
create index fs_visits_entered_by_idx on public.field_sales_visits (entered_by) where deleted_at is null;
create index fs_visits_completed_idx  on public.field_sales_visits (created_at) where is_completed and deleted_at is null;

-- phone lookups against the Enquiry Sheet
create index if not exists enquiries_phone_key_idx on public.enquiries (public.scot_phone_key(phone)) where deleted_at is null;

-- alerts outbox + settings (no client access at all)
create table public.field_sales_alerts (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.field_sales_leads (id),
  visit_id        uuid not null unique references public.field_sales_visits (id),   -- the visit that made the 2nd pending one
  created_at      timestamptz not null default now(),
  attempts        integer not null default 0,
  last_attempt_at timestamptz,
  sent_at         timestamptz,
  last_error      text
);
create index fs_alerts_unsent_idx on public.field_sales_alerts (created_at) where sent_at is null;

create table public.field_sales_settings (
  key        text primary key check (key in ('director_alert_email')),
  value      text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.field_sales_settings (key, value) values ('director_alert_email', 'support@adititracking.com');

-- ============================================================ 2. access: RLS (own rows, or view_all), writes only through the functions below
alter table public.field_sales_leads    enable row level security;
alter table public.field_sales_visits   enable row level security;
alter table public.field_sales_alerts   enable row level security;
alter table public.field_sales_settings enable row level security;
revoke all on public.field_sales_leads, public.field_sales_visits, public.field_sales_alerts, public.field_sales_settings from public, anon, authenticated;
grant select on public.field_sales_leads, public.field_sales_visits to authenticated;

create policy field_sales_leads_select on public.field_sales_leads for select to authenticated
  using (deleted_at is null and (((select public.lc_uid()) = created_by and (select public.lc_has('field_sales_form_view'))) or (select public.lc_has('field_sales_form_view_all'))));
create policy field_sales_visits_select on public.field_sales_visits for select to authenticated
  using (deleted_at is null and (((select public.lc_uid()) = entered_by and (select public.lc_has('field_sales_form_view'))) or (select public.lc_has('field_sales_form_view_all'))));

-- ============================================================ 3. views (security invoker: the caller's RLS applies)
-- visit state: completed | superseded (pending, and a LATER completed visit exists on the lead) | pending. Nothing is ever updated.
create view public.field_sales_visit_status with (security_invoker = true) as
select v.*,
       case when v.is_completed then 'completed'
            when exists (select 1 from public.field_sales_visits c
                          where c.lead_id = v.lead_id and c.deleted_at is null and c.is_completed and (c.created_at, c.id) > (v.created_at, v.id)) then 'superseded'
            else 'pending' end as visit_state
  from public.field_sales_visits v
 where v.deleted_at is null;

-- helper for the lead-state view / checks: open | won | lost  (a lead with no enquiry yet is open)
create function public.fs_lead_outcome(p_enquiry uuid) returns text
 language sql stable security definer set search_path to 'public' as $function$
  select coalesce((select c.outcome from public.sales_fms_closures c where c.enquiry_id = p_enquiry), 'open')
$function$;

create view public.field_sales_lead_state with (security_invoker = true) as
select l.id as lead_id, l.business_name, l.contact_person, l.contact_number, l.area, l.city, l.created_by, l.created_by_name, l.enquiry_id, l.created_at as lead_created_at,
       s.visit_count, s.completed_count, s.pending_count, s.last_visit_at,
       case when s.visit_count = 0 then 'never_visited' when s.completed_count > 0 then 'completed' else 'pending' end as lead_state,
       o.outcome,
       lv.next_date as next_followup_date,
       (lv.next_date is not null and o.outcome = 'open' and lv.next_date < (now() at time zone 'Asia/Kolkata')::date) as followup_overdue
  from public.field_sales_leads l
  cross join lateral (select public.fs_lead_outcome(l.enquiry_id) as outcome) o
  cross join lateral (select count(*)::int as visit_count,
                             (count(*) filter (where x.is_completed))::int as completed_count,
                             (count(*) filter (where x.visit_state = 'pending'))::int as pending_count,
                             max(x.created_at) as last_visit_at
                        from public.field_sales_visit_status x where x.lead_id = l.id) s
  left join lateral (select coalesce(v.next_followup_date, v.quotation_due_date) as next_date
                       from public.field_sales_visits v where v.lead_id = l.id and v.deleted_at is null
                      order by v.created_at desc, v.id desc limit 1) lv on true
 where l.deleted_at is null;
grant select on public.field_sales_visit_status, public.field_sales_lead_state to authenticated;
revoke all on function public.fs_lead_outcome(uuid) from public;
grant execute on function public.fs_lead_outcome(uuid) to authenticated;

-- ============================================================ 4. the 2-pending alert (outbox row; delivery is the Edge Function)
create function public.field_sales_visits_alert() returns trigger
 language plpgsql security definer set search_path to 'public' as $function$
declare v_pending integer;
begin
  select count(*) into v_pending
    from public.field_sales_visits v
   where v.lead_id = new.lead_id and v.deleted_at is null and not v.is_completed
     and not exists (select 1 from public.field_sales_visits c
                      where c.lead_id = v.lead_id and c.deleted_at is null and c.is_completed and (c.created_at, c.id) > (v.created_at, v.id));
  if v_pending = 2 then   -- exactly 2: a 3rd pending visit does not mail again
    insert into public.field_sales_alerts (lead_id, visit_id) values (new.lead_id, new.id) on conflict do nothing;
  end if;
  return null;
end;
$function$;
create trigger trg_field_sales_visits_alert after insert on public.field_sales_visits
  for each row when (not new.is_completed) execute function public.field_sales_visits_alert();
revoke all on function public.field_sales_visits_alert() from public;

-- the Edge Function (service_role) claims unsent alerts and reports back
create function public.fs_alerts_claim(p_limit integer default 10) returns jsonb
 language plpgsql security definer set search_path to 'public' as $function$
declare v_to text; v_out jsonb;
begin
  select value into v_to from public.field_sales_settings where key = 'director_alert_email';
  with c as (select a.id from public.field_sales_alerts a
              where a.sent_at is null and a.attempts < 5 and (a.last_attempt_at is null or a.last_attempt_at < now() - interval '10 minutes')
              order by a.created_at limit greatest(1, least(coalesce(p_limit, 10), 50)) for update skip locked),
       u as (update public.field_sales_alerts a set attempts = a.attempts + 1, last_attempt_at = now() from c where a.id = c.id returning a.*)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id, 'to', v_to,
           'lead', (select jsonb_build_object('business_name', l.business_name, 'contact_person', l.contact_person, 'contact_number', l.contact_number,
                                              'area', l.area, 'city', l.city, 'rep_name', l.created_by_name, 'rep_email', l.created_by_email)
                      from public.field_sales_leads l where l.id = u.lead_id),
           'visits', (select coalesce(jsonb_agg(jsonb_build_object('at', v.created_at, 'reason', v.no_demo_reason, 'next_followup_date', v.next_followup_date) order by v.created_at), '[]'::jsonb)
                        from public.field_sales_visits v
                       where v.lead_id = u.lead_id and v.deleted_at is null and not v.is_completed
                         and not exists (select 1 from public.field_sales_visits c where c.lead_id = v.lead_id and c.deleted_at is null and c.is_completed and (c.created_at, c.id) > (v.created_at, v.id)))
         ) order by u.created_at), '[]'::jsonb)
    into v_out from u;
  return v_out;
end;
$function$;
create function public.fs_alert_done(p_id uuid, p_error text default null) returns void
 language sql security definer set search_path to 'public' as $function$
  update public.field_sales_alerts
     set sent_at = case when p_error is null then now() end, last_error = left(p_error, 500)
   where id = p_id and sent_at is null
$function$;
revoke all on function public.fs_alerts_claim(integer), public.fs_alert_done(uuid, text) from public;
grant execute on function public.fs_alerts_claim(integer), public.fs_alert_done(uuid, text) to service_role;

-- settings (administrators only)
create function public.fs_get_settings() returns jsonb
 language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if public.lc_uid() is null or not public.lc_has('field_sales_form_manage_dropdowns') then raise exception 'Not authorised' using errcode = '42501'; end if;
  return coalesce((select jsonb_object_agg(key, value) from public.field_sales_settings), '{}'::jsonb);
end;
$function$;
create function public.fs_set_setting(p_key text, p_value text) returns jsonb
 language plpgsql security definer set search_path to 'public' as $function$
declare v text := lower(btrim(coalesce(p_value, '')));
begin
  if public.lc_uid() is null or not public.lc_has('field_sales_form_manage_dropdowns') then raise exception 'Not authorised' using errcode = '42501'; end if;
  if p_key is distinct from 'director_alert_email' then raise exception 'Unknown setting' using errcode = '22023'; end if;
  if v !~ '^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$' or char_length(v) > 200 then raise exception 'Enter one valid e-mail address' using errcode = '22023'; end if;
  insert into public.field_sales_settings (key, value, updated_by) values (p_key, v, public.lc_uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  return jsonb_build_object('key', p_key, 'value', v);
end;
$function$;
revoke all on function public.fs_get_settings(), public.fs_set_setting(text, text) from public;
grant execute on function public.fs_get_settings(), public.fs_set_setting(text, text) to authenticated;

-- ============================================================ 5. phone check + lead search (leads are PRIVATE to their creator)
-- fs_find_by_phone: { match: 'none' | 'own_lead' | 'taken' }. 'own_lead' (the caller's own lead) carries the lead so the form can switch to Follow-up;
-- 'taken' is the ONE generic signal for anything else (someone else's field lead, an enquiry, a SCOT contact) and identifies nothing.
create function public.fs_find_by_phone(p_phone text) returns jsonb
 language plpgsql stable security definer set search_path to 'public' as $function$
declare k text := public.scot_phone_key(p_phone); l record;
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
  if exists (select 1 from public.enquiries e where public.scot_phone_key(e.phone) = k and e.deleted_at is null)
     or exists (select 1 from public.scot_clients s where s.phone_key = k and s.deleted_at is null) then
    return jsonb_build_object('match', 'taken');
  end if;
  return jsonb_build_object('match', 'none');
end;
$function$;

-- fs_search_leads: the caller's OWN open leads (field_sales_form_view_all sees everyone's, flagged mine=false: view only, visits stay creator-only)
create function public.fs_search_leads(p_q text) returns jsonb
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
                                'allowed_reasons', case when l.enquiry_id is null then jsonb_build_array('Demo pending') else jsonb_build_array('Quotation follow-up') end,
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
revoke all on function public.fs_find_by_phone(text), public.fs_search_leads(text) from public;
grant execute on function public.fs_find_by_phone(text), public.fs_search_leads(text) to authenticated;

-- ============================================================ 6. submit_field_sales_visit: the ONLY write path (one transaction)
create function public.fs_clean(p jsonb, k text, p_max integer default 500) returns text
 language plpgsql stable set search_path to '' as $function$
declare v text := nullif(btrim(coalesce(p ->> k, '')), '');
begin
  if v is not null and char_length(v) > p_max then
    raise exception '% is too long (% characters at most)', k, p_max using errcode = '22023';
  end if;
  return v;
end;
$function$;
revoke all on function public.fs_clean(jsonb, text, integer) from public;

create function public.submit_field_sales_visit(p jsonb) returns jsonb
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
    if exists (select 1 from public.enquiries e where public.scot_phone_key(e.phone) = v_key and e.deleted_at is null)
       or exists (select 1 from public.scot_clients s where s.phone_key = v_key and s.deleted_at is null) then
      raise exception 'This phone number is already in the system' using errcode = '23505', detail = '';
    end if;
    begin
      insert into public.field_sales_leads (phone_key, contact_number, business_name, contact_person, area, city, fleet_size, uses_gps, existing_gps,
                                            source_of_lead, referrer_name, coordinator_booked, pain_area, created_by, created_by_name, created_by_email)
      values (v_key, btrim(p ->> 'contact_number'), public.fs_clean(p, 'business_name', 200), public.fs_clean(p, 'contact_person', 200), public.fs_clean(p, 'area', 200),
              public.fs_clean(p, 'city', 100), (p ->> 'fleet_size')::integer, (p ->> 'uses_gps')::boolean, v_gps, v_src, v_ref, (p ->> 'coordinator_booked')::boolean,
              v_pain, v_uid, v_name, v_email)
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
    if v_reason = 'Demo pending' and v_lead.enquiry_id is not null then raise exception 'The demo is already given for this lead: choose Quotation follow-up' using errcode = '22023'; end if;
    if v_reason = 'Quotation follow-up' and v_lead.enquiry_id is null then raise exception 'No demo is recorded for this lead yet: choose Demo pending' using errcode = '22023'; end if;
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
                            'enquiry_id', v_enq, 'enquiry_created', v_created, 'outcome', coalesce(v_outcome, 'open'), 'open_pending', v_pending);
end;
$function$;
revoke all on function public.submit_field_sales_visit(jsonb) from public;
grant execute on function public.submit_field_sales_visit(jsonb) to authenticated;

-- ============================================================ 7. delete (soft): leads + their visits (+ the enquiry, only with enquiry_delete_sent)
create function public.delete_field_sales_leads(p_ids uuid[]) returns jsonb
 language plpgsql security definer set search_path to 'public' as $function$
declare v_requested integer; v_gone uuid[]; v_enq uuid[]; v_all boolean; v_can_sent boolean; v_visits integer; v_enqs integer := 0;
begin
  if public.lc_uid() is null or not public.lc_has('field_sales_form_delete') then raise exception 'Not authorised to delete Field Sales leads' using errcode = '42501'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'No leads selected' using errcode = '22023'; end if;
  if cardinality(p_ids) > 1000 then raise exception 'Too many leads selected (limit 1000 per delete)' using errcode = '22023'; end if;
  v_all := public.lc_has('field_sales_form_view_all');  v_can_sent := public.lc_has('enquiry_delete_sent');
  select count(distinct x) into v_requested from unnest(p_ids) x;
  select coalesce(array_agg(l.id), '{}'), coalesce(array_agg(l.enquiry_id) filter (where l.enquiry_id is not null), '{}') into v_gone, v_enq
    from public.field_sales_leads l
   where l.id = any (p_ids) and l.deleted_at is null and (l.created_by = public.lc_uid() or v_all) and (l.enquiry_id is null or v_can_sent);
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
revoke all on function public.delete_field_sales_leads(uuid[]) from public;
grant execute on function public.delete_field_sales_leads(uuid[]) to authenticated;

-- an enquiry deleted anywhere (the Sheet's delete_enquiries, Sales FMS) takes its Field Sales lead and visits with it, so MeCa stops counting them
create function public.enquiries_cascade_fs_leads() returns trigger
 language plpgsql security definer set search_path to 'public' as $function$
begin
  update public.field_sales_visits v set deleted_at = now(), deleted_by = new.deleted_by
   where v.deleted_at is null and v.lead_id in (select l.id from public.field_sales_leads l where l.enquiry_id = new.id);
  update public.field_sales_leads l set deleted_at = now(), deleted_by = new.deleted_by where l.enquiry_id = new.id and l.deleted_at is null;
  return null;
end;
$function$;
create trigger trg_enquiries_cascade_fs_leads after update of deleted_at on public.enquiries
  for each row when (old.deleted_at is null and new.deleted_at is not null) execute function public.enquiries_cascade_fs_leads();
revoke all on function public.enquiries_cascade_fs_leads() from public;

-- ============================================================ 8. the ONE admin-managed list: Pain Area (type fs_pain_area)
do $do$
declare v text; v2 text;
begin
  select pg_get_functiondef('public.enquiry_dropdown_can(text,text,boolean)'::regprocedure) into v;
  v2 := replace(v, 'when p_type = ''scot_outcome''', 'when p_type = ''fs_pain_area''                        then array[''field_sales_form'']' || E'\n' || '                     when p_type = ''scot_outcome''');
  if v2 = v then raise exception 'enquiry_dropdown_can: expected text not found'; end if;
  execute v2;
end
$do$;

insert into public.enquiry_dropdown_options (dropdown_type, value, sort_order, created_by) values
  ('fs_pain_area', 'Vehicle safety/theft concern', 1, null),
  ('fs_pain_area', 'Fuel pilferage', 2, null),
  ('fs_pain_area', 'Driver behavior monitoring', 3, null),
  ('fs_pain_area', 'No real-time visibility', 4, null),
  ('fs_pain_area', 'AIS-140 compliance requirement', 5, null),
  ('fs_pain_area', 'Unhappy with current provider/support', 6, null),
  ('fs_pain_area', 'Cost of current solution', 7, null),
  ('fs_pain_area', 'Other', 8, null);

-- Add / Retire / Restore already work through the existing Manage popover (insert + is_active policies). RENAME cascades to the leads that hold the value.
create function public.rename_dropdown_option(p_id uuid, p_new text) returns jsonb
 language plpgsql security definer set search_path to 'public' as $function$
declare o record; v text := btrim(regexp_replace(coalesce(p_new, ''), '\s+', ' ', 'g')); v_n integer := 0;
begin
  if public.lc_uid() is null or not public.lc_has('field_sales_form_manage_dropdowns') then raise exception 'Not authorised to manage this list' using errcode = '42501'; end if;
  select * into o from public.enquiry_dropdown_options where id = p_id for update;
  if not found or o.dropdown_type <> 'fs_pain_area' then raise exception 'This value cannot be renamed here' using errcode = '22023'; end if;
  if v = '' or char_length(v) > 100 or v ~ '[[:cntrl:]]' then raise exception 'Enter a name (1 to 100 characters)' using errcode = '22023'; end if;
  if v = o.value then return jsonb_build_object('id', p_id, 'old', o.value, 'new', v, 'leads_updated', 0); end if;
  if exists (select 1 from public.enquiry_dropdown_options x where x.dropdown_type = o.dropdown_type and lower(x.value) = lower(v) and x.id <> p_id) then
    raise exception '"%" is already in this list (it may be retired: use Restore)', v using errcode = '23505';
  end if;
  update public.enquiry_dropdown_options set value = v where id = p_id;
  update public.field_sales_leads set pain_area = v where pain_area = o.value;
  get diagnostics v_n = row_count;
  return jsonb_build_object('id', p_id, 'old', o.value, 'new', v, 'leads_updated', v_n);
end;
$function$;
revoke all on function public.rename_dropdown_option(uuid, text) from public;
grant execute on function public.rename_dropdown_option(uuid, text) to authenticated;

-- ============================================================ 9. MeCa: count COMPLETED visits only; see the new leads as Field Sales reps
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
  union all
  select 'client', 'pipeline', public.meca_resolve_rep(e.sales_person_accountable, e.id), e.sales_person_accountable,
         (c.closed_at at time zone 'Asia/Kolkata')::date, e.id, e.name, e.company_name, c.amount
    from public.sales_fms_closures c
    join public.enquiries e on e.id = c.enquiry_id
   where c.outcome = 'won'
     and (c.closed_at at time zone 'Asia/Kolkata')::date between p_from and p_to
     and e.status = 'won' and e.sent_to_fms_at is not null and e.deleted_at is null;
$function$;

create or replace function public.meca_resolve_rep(p_label text, p_enquiry uuid default null::uuid)
 returns text language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v text;
  k text := public.meca_norm(p_label);
begin
  if k <> '' then
    select a.rep_email into v from public.sales_rep_aliases a where a.label_key = k;
    if v is not null then return v; end if;
  end if;
  if p_enquiry is not null then
    select lower(btrim(f.entered_by_email)) into v from public.field_sales_entries f where f.linked_enquiry_id = p_enquiry and f.deleted_at is null limit 1;
    if v is not null and v <> '' then return v; end if;
    select lower(btrim(l.created_by_email)) into v from public.field_sales_leads l where l.enquiry_id = p_enquiry and l.deleted_at is null limit 1;
    if v is not null and v <> '' then return v; end if;
  end if;
  if k = '' then return null; end if;
  v := public.meca_employee_email(p_label);
  if v is not null then return v; end if;
  if position('@' in k) > 1 and exists (select 1 from public."Employee_details" ed where lower(btrim(ed."Email_Id")) = k) then
    return k;
  end if;
  return null;
end;
$function$;

-- sales_meca_summary: two one-line additions (the rep directory and the "is this login a Field Sales rep" test). Done by exact-text replacement on the LIVE
-- definition (keeps owner, grants and everything else byte-for-byte); the block aborts if either anchor text is missing.
do $do$
declare v text; v2 text;
begin
  select pg_get_functiondef(p.oid) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'sales_meca_summary';
  v2 := replace(v,
    'union select nullif(lower(btrim(f.entered_by_email)), '''') from public.field_sales_entries f where f.deleted_at is null',
    'union select nullif(lower(btrim(f.entered_by_email)), '''') from public.field_sales_entries f where f.deleted_at is null' || E'\n' ||
    '            union select nullif(lower(btrim(l.created_by_email)), '''') from public.field_sales_leads l where l.deleted_at is null');
  if v2 = v then raise exception 'sales_meca_summary: directory anchor not found'; end if;
  v := v2;
  v2 := replace(v,
    'or exists (select 1 from public.field_sales_entries f where lower(btrim(f.entered_by_email)) = v_me and f.deleted_at is null);',
    'or exists (select 1 from public.field_sales_entries f where lower(btrim(f.entered_by_email)) = v_me and f.deleted_at is null)' || E'\n' ||
    '           or exists (select 1 from public.field_sales_leads l where lower(btrim(l.created_by_email)) = v_me and l.deleted_at is null);');
  if v2 = v then raise exception 'sales_meca_summary: linked anchor not found'; end if;
  execute v2;
end
$do$;

commit;
