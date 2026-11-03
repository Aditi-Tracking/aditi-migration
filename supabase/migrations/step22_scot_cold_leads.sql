-- Step 22 — SCOT Calls corrected to the real "Cold Leads" sheet tab. Runs as claude_code_leadcapture. ONE transaction: if anything fails, nothing changes.
-- scot_clients, scot_calls and scot_imports hold 0 rows today (checked on live), so this is a pure schema correction: no data is migrated or lost.
-- Access control is NOT touched: every gate already runs on the tier model (step 21); the functions below keep exactly the same lc_has() tests.
--
-- WHAT CHANGES IN scot_clients
--   dropped   contact_person, contact_details, avg_order_size, order_frequency_days, usual_order_day, calling_day, calling_frequency
--             (columns of the wrong sheet tab; nothing else reads them)
--   renamed   client_name -> contact_name (still required);  source -> created_via (HOW the row got here: lost_lead / manual / import — renamed so it can
--             never be confused with the new lead_source)
--   added     opportunity (free text, 300 characters at most), email, city, remark, lead_source (the lead's own origin, e.g. WATI)
--   kept      phone (+ phone_key, the one-live-entry-per-phone rule), sales_person, next_call_date, status, the call counters, ownership of the creator
-- The sheet's "Display Name" column is deliberately NOT stored. An import row with no Contact Name uses its Opportunity as the contact name.
-- A row with no phone number is rejected (listed with its reason); a call tracker cannot call a blank.
-- E-mail, city and remark are stored as typed (length-limited only): a typo in an e-mail must never cost a lead.
--
-- THE FUNCTIONS re-created (same signatures, same owner, same security, same grants — only the business fields differ):
--   scot_clean, add_scot_client, update_scot_client (also FIXES an old defect: its "already tracked (name)" refusal was swallowed by its own handler, so an edit
--   onto a taken number said only "already tracked"), scot_find_duplicates, import_scot_clients, scot_summary (+ "never_called"), scot_from_lost_enquiry,
--   and the scot_list view (it must be rebuilt: it is "select c.*" over the table).
-- THE CALL OUTCOMES become the sheet's own seven: Connected, Not Answer, Busy, Invalid number, Follow-up, Meeting Scheduled, Not Interested.
--   Three existing rows are renamed in place (No answer, Wrong number, Not interested), three are added (Busy, Follow-up, Meeting Scheduled), and the two the
--   sheet does not use (Call back later, Order placed) are retired (switched off, not deleted). No call refers to any of them (0 calls exist).

begin;

-- 22a. the table ---------------------------------------------------------------------------------------------------------------------------------
drop view public.scot_list;

alter table public.scot_clients
  drop constraint scot_clients_numbers_check,
  drop constraint scot_clients_text_check,
  drop constraint scot_clients_name_check,
  drop constraint scot_clients_source_check;

alter table public.scot_clients
  drop column contact_person,
  drop column contact_details,
  drop column avg_order_size,
  drop column order_frequency_days,
  drop column usual_order_day,
  drop column calling_day,
  drop column calling_frequency;

alter table public.scot_clients rename column client_name to contact_name;
alter table public.scot_clients rename column source to created_via;

alter table public.scot_clients
  add column opportunity text,
  add column email       text,
  add column city        text,
  add column remark      text,
  add column lead_source text;

alter table public.scot_clients
  add constraint scot_clients_name_check        check (btrim(contact_name) <> '' and char_length(contact_name) <= 200),
  add constraint scot_clients_text_check        check (char_length(coalesce(opportunity, '')) <= 300 and char_length(coalesce(email, '')) <= 200
                                                       and char_length(coalesce(city, '')) <= 100 and char_length(coalesce(remark, '')) <= 1000
                                                       and char_length(coalesce(lead_source, '')) <= 100 and char_length(coalesce(sales_person, '')) <= 200
                                                       and char_length(coalesce(closed_note, '')) <= 500),
  add constraint scot_clients_created_via_check check (created_via in ('lost_lead', 'manual', 'import'));

create view public.scot_list with (security_invoker = true) as
select c.*,
       case when c.status = 'won_back' then 'won_back'
            when c.status = 'dropped'  then 'dropped'
            when c.next_call_date is null then 'not_scheduled'
            when c.next_call_date < public.scot_today() then 'overdue'
            when c.next_call_date = public.scot_today() then 'due_today'
            else 'scheduled' end as call_state,
       case when c.status = 'active' and c.next_call_date < public.scot_today() then public.scot_today() - c.next_call_date end as days_overdue,
       lc.outcome as last_outcome
  from public.scot_clients c
  left join lateral (select k.outcome from public.scot_calls k
                      where k.client_id = c.id and k.deleted_at is null
                      order by k.called_at desc, k.created_at desc limit 1) lc on true;
grant select on public.scot_list to authenticated, service_role;

-- 22b. validation shared by add / edit / import ---------------------------------------------------------------------------------------------------
-- p: an object with any of contact_name, phone, opportunity, email, city, remark, lead_source, sales_person, next_call_date. Returns the CLEANED object
-- (empty text -> null), or raises 22023 with a message a person can act on.
create or replace function public.scot_clean(p jsonb)
 returns jsonb
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
declare
  v_name  text := btrim(coalesce(p ->> 'contact_name', ''));
  v_phone text := btrim(coalesce(p ->> 'phone', ''));
  v_next  text := nullif(btrim(coalesce(p ->> 'next_call_date', '')), '');
  v_date  date;
  v_key   text;
  v_lim   integer;
begin
  if v_name = '' then raise exception 'The contact name is required' using errcode = '22023'; end if;
  if char_length(v_name) > 200 then raise exception 'The contact name is too long (200 characters at most)' using errcode = '22023'; end if;
  if v_phone = '' then raise exception 'The phone number is required' using errcode = '22023'; end if;
  if char_length(v_phone) > 40 then raise exception 'The phone number is too long' using errcode = '22023'; end if;
  if char_length(coalesce(public.scot_phone_key(v_phone), '')) < 7 then
    raise exception 'The phone number needs at least 7 digits' using errcode = '22023';
  end if;
  if v_next is not null then
    if v_next !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'The next call date must be a date (YYYY-MM-DD)' using errcode = '22023'; end if;
    begin
      v_date := v_next::date;
    exception when others then
      raise exception 'The next call date is not a real date' using errcode = '22023';
    end;
  end if;
  for v_key, v_lim in select * from (values ('opportunity', 300), ('email', 200), ('city', 100), ('remark', 1000), ('lead_source', 100), ('sales_person', 200)) t(k, l) loop
    if char_length(btrim(coalesce(p ->> v_key, ''))) > v_lim then
      raise exception '% is too long (% characters at most)', initcap(replace(v_key, '_', ' ')), v_lim using errcode = '22023';
    end if;
  end loop;
  return jsonb_build_object(
    'contact_name', v_name,
    'phone', v_phone,
    'opportunity', nullif(btrim(coalesce(p ->> 'opportunity', '')), ''),
    'email', nullif(btrim(coalesce(p ->> 'email', '')), ''),
    'city', nullif(btrim(coalesce(p ->> 'city', '')), ''),
    'remark', nullif(btrim(coalesce(p ->> 'remark', '')), ''),
    'lead_source', nullif(btrim(coalesce(p ->> 'lead_source', '')), ''),
    'sales_person', nullif(btrim(coalesce(p ->> 'sales_person', '')), ''),
    'next_call_date', v_date);
end;
$function$;

-- 22c. the writes ---------------------------------------------------------------------------------------------------------------------------------
create or replace function public.add_scot_client(p jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  c      jsonb;
  v_dup  record;
  v_id   uuid;
begin
  perform public.scot_assert('scot_create');
  c := public.scot_clean(p);
  select x.id, x.contact_name, (x.entered_by = public.lc_uid() or public.lc_has('scot_view_all')) as visible into v_dup
    from public.scot_clients x where x.phone_key = public.scot_phone_key(c ->> 'phone') and x.deleted_at is null;
  if found then
    raise exception 'This phone number is already tracked%', case when v_dup.visible then ' (' || v_dup.contact_name || ')' else ' by someone else' end
      using errcode = '23505', detail = coalesce(case when v_dup.visible then v_dup.id::text end, '');
  end if;
  begin
    insert into public.scot_clients (contact_name, phone, opportunity, email, city, remark, lead_source, sales_person, next_call_date, created_via, entered_by)
    values (c ->> 'contact_name', c ->> 'phone', c ->> 'opportunity', c ->> 'email', c ->> 'city', c ->> 'remark', c ->> 'lead_source', c ->> 'sales_person',
            (c ->> 'next_call_date')::date, 'manual', public.lc_uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'This phone number is already tracked' using errcode = '23505';
  end;
  return jsonb_build_object('id', v_id);
end;
$function$;

-- edit the entry's own fields. p_stamp = the updated_at the caller read (a stale one is 40001, "someone else changed this").
create or replace function public.update_scot_client(p_id uuid, p_stamp timestamptz, p_patch jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_row public.scot_clients%rowtype;
  v_cur jsonb;
  c     jsonb;
  v_dup record;
begin
  perform public.scot_assert('scot_update');
  if p_stamp is null or p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'The version stamp and the changes are required' using errcode = '22023';
  end if;
  if not public.scot_can_see(p_id) then raise exception 'This client is not in your follow-ups' using errcode = 'P0002'; end if;
  select * into v_row from public.scot_clients where id = p_id for update;
  if v_row.updated_at is distinct from p_stamp then
    raise exception 'Someone else changed this client — reload to see their changes' using errcode = '40001';
  end if;
  v_cur := jsonb_build_object('contact_name', v_row.contact_name, 'phone', v_row.phone, 'opportunity', v_row.opportunity, 'email', v_row.email,
             'city', v_row.city, 'remark', v_row.remark, 'lead_source', v_row.lead_source, 'sales_person', v_row.sales_person,
             'next_call_date', v_row.next_call_date);
  c := public.scot_clean(v_cur || (p_patch - 'id' - 'status' - 'created_via' - 'entered_by'));
  select x.id, x.contact_name, (x.entered_by = public.lc_uid() or public.lc_has('scot_view_all')) as visible into v_dup
    from public.scot_clients x where x.phone_key = public.scot_phone_key(c ->> 'phone') and x.deleted_at is null and x.id <> p_id;
  if found then
    raise exception 'This phone number is already tracked%', case when v_dup.visible then ' (' || v_dup.contact_name || ')' else ' by someone else' end
      using errcode = '23505';
  end if;
  update public.scot_clients
     set contact_name = c ->> 'contact_name', phone = c ->> 'phone', opportunity = c ->> 'opportunity', email = c ->> 'email', city = c ->> 'city',
         remark = c ->> 'remark', lead_source = c ->> 'lead_source', sales_person = c ->> 'sales_person', next_call_date = (c ->> 'next_call_date')::date
   where id = p_id;
  return jsonb_build_object('updated_at', (select updated_at from public.scot_clients where id = p_id));
exception when unique_violation then
  -- the named refusal above is itself a 23505, so it lands here too: let it through unchanged (it names the contact); only a race that reaches the
  -- unique index gets the generic text
  if sqlerrm like 'This phone number is already tracked%' then raise; end if;
  raise exception 'This phone number is already tracked' using errcode = '23505';
end;
$function$;

-- which of these phone numbers are already tracked? (for the upload preview and the add form). The contact is named only if the caller may see it.
create or replace function public.scot_find_duplicates(p_phones text[])
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_all boolean;
begin
  perform public.scot_assert('scot_create');
  v_all := public.lc_has('scot_view_all');
  if p_phones is not null and cardinality(p_phones) > 5000 then raise exception 'Too many phone numbers (5000 at most)' using errcode = '22023'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('phone', t.phone, 'client_id', case when v.visible then x.id end, 'contact_name', case when v.visible then x.contact_name end))
      from (select distinct p as phone from unnest(coalesce(p_phones, '{}')) p) t
      join public.scot_clients x on x.phone_key = public.scot_phone_key(t.phone) and x.deleted_at is null
      cross join lateral (select (x.entered_by = public.lc_uid() or v_all) as visible) v
  ), '[]'::jsonb);
end;
$function$;

-- the Excel import: ONE call, one batch record. A row that is invalid (no phone, a phone under 7 digits, no contact name AND no opportunity, text too long)
-- is rejected with its reason; a row whose phone is already tracked (or appeared earlier in the file) is a duplicate and is NOT imported. A row with no
-- Contact Name uses its Opportunity as the contact name. Everything else is added, owned by the uploader.
create or replace function public.import_scot_clients(p_file_name text, p_rows jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_batch    uuid;
  v_elem     jsonb;
  v_ord      integer;
  c          jsonb;
  v_id       uuid;
  v_imported integer := 0;
  v_dups     jsonb := '[]'::jsonb;
  v_rejects  jsonb := '[]'::jsonb;
begin
  perform public.scot_assert('scot_create');
  if not public.lc_has('scot_view_all') then raise exception 'Not authorised to import SCOT entries' using errcode = '42501'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'There are no rows to import' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'Too many rows (5000 at most per file)' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_file_name, '')), '') is null then raise exception 'The file name is required' using errcode = '22023'; end if;

  insert into public.scot_imports (file_name, uploaded_by, row_count) values (left(btrim(p_file_name), 255), public.lc_uid(), jsonb_array_length(p_rows)) returning id into v_batch;

  for v_elem, v_ord in select e.value, e.ordinality::integer from jsonb_array_elements(p_rows) with ordinality e loop
    begin
      v_id := null;
      if nullif(btrim(coalesce(v_elem ->> 'contact_name', '')), '') is null and nullif(btrim(coalesce(v_elem ->> 'opportunity', '')), '') is not null then
        v_elem := v_elem || jsonb_build_object('contact_name', left(btrim(v_elem ->> 'opportunity'), 200));
      end if;
      c := public.scot_clean(v_elem);
      insert into public.scot_clients (contact_name, phone, opportunity, email, city, remark, lead_source, sales_person, next_call_date, created_via, import_id, entered_by)
      values (c ->> 'contact_name', c ->> 'phone', c ->> 'opportunity', c ->> 'email', c ->> 'city', c ->> 'remark', c ->> 'lead_source', c ->> 'sales_person',
              (c ->> 'next_call_date')::date, 'import', v_batch, public.lc_uid())
      on conflict (phone_key) where deleted_at is null do nothing
      returning id into v_id;
      if v_id is null then
        v_dups := v_dups || jsonb_build_object('row', v_ord, 'phone', c ->> 'phone', 'contact_name', c ->> 'contact_name');
      else
        v_imported := v_imported + 1;
      end if;
    exception when others then
      v_rejects := v_rejects || jsonb_build_object('row', v_ord, 'reason', sqlerrm);
    end;
  end loop;

  update public.scot_imports set duplicate_count = jsonb_array_length(v_dups), rejected_count = jsonb_array_length(v_rejects), status = 'done' where id = v_batch;
  return jsonb_build_object('import_id', v_batch, 'imported', v_imported, 'duplicates', v_dups, 'rejected', v_rejects);
end;
$function$;

-- 22d. the KPI tiles: + "never_called" (active entries with no call logged yet — what a Cold Leads import would otherwise bury under "not scheduled") ------
create or replace function public.scot_summary()
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'active',        count(*) filter (where status = 'active'),
    'never_called',  count(*) filter (where status = 'active' and call_count = 0),
    'overdue',       count(*) filter (where call_state = 'overdue'),
    'due_today',     count(*) filter (where call_state = 'due_today'),
    'not_scheduled', count(*) filter (where call_state = 'not_scheduled'),
    'won_back',      count(*) filter (where status = 'won_back'),
    'dropped',       count(*) filter (where status = 'dropped'),
    'called_this_week', (select count(distinct k.client_id) from public.scot_calls k
                          where k.deleted_at is null
                            and (k.called_at at time zone 'Asia/Kolkata')::date >= date_trunc('week', public.scot_today())::date))
  from public.scot_list;
$function$;

-- 22e. a lead marked LOST becomes a follow-up: the name -> contact name; the Requirement (product list, flattened to one line) -> opportunity; e-mail and
-- Source carried across; the company, if there is one, goes into the remark (there is no company column in the Cold Leads layout). Same safety as before:
-- it can never block the lead from being marked Lost, and an existing live entry for that phone is re-opened and counted, never duplicated.
create or replace function public.scot_from_lost_enquiry()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_key text := public.scot_phone_key(new.phone);
begin
  if v_key is null or char_length(v_key) < 7 then
    return null;
  end if;
  begin
    insert into public.scot_clients (contact_name, phone, opportunity, email, remark, lead_source, sales_person, created_via, source_enquiry_id, entered_by, next_call_date, lost_count)
    values (left(coalesce(nullif(btrim(new.name), ''), nullif(btrim(new.company_name), ''), 'Unknown'), 200), left(new.phone, 40),
            left(nullif(btrim(regexp_replace(coalesce(array_to_string(new.requirement, ' | '), ''), '\s+', ' ', 'g')), ''), 300),
            left(nullif(btrim(new.email), ''), 200),
            case when nullif(btrim(new.company_name), '') is not null then left('Company: ' || btrim(new.company_name), 1000) end,
            left(nullif(btrim(new.source), ''), 100),
            left(new.sales_person_accountable, 200), 'lost_lead', new.id, new.entered_by, public.scot_today() + 5, 1)
    on conflict (phone_key) where deleted_at is null do update
       set lost_count        = public.scot_clients.lost_count + 1,
           source_enquiry_id = excluded.source_enquiry_id,
           next_call_date    = case when public.scot_clients.status = 'active' then public.scot_clients.next_call_date else excluded.next_call_date end,
           status            = 'active',
           closed_at         = null,
           closed_note       = null;
  exception when others then
    raise warning 'SCOT: no follow-up was created for the lost enquiry %: %', new.id, sqlerrm;
  end;
  return null;
end;
$function$;

-- 22f. the call outcomes: the sheet's own seven ------------------------------------------------------------------------------------------------------
update public.enquiry_dropdown_options set value = 'Not Answer',     sort_order = 2 where dropdown_type = 'scot_outcome' and value = 'No answer';
update public.enquiry_dropdown_options set value = 'Invalid number', sort_order = 4 where dropdown_type = 'scot_outcome' and value = 'Wrong number';
update public.enquiry_dropdown_options set value = 'Not Interested', sort_order = 7 where dropdown_type = 'scot_outcome' and value = 'Not interested';
update public.enquiry_dropdown_options set is_active = false, sort_order = 8 where dropdown_type = 'scot_outcome' and value = 'Call back later';
update public.enquiry_dropdown_options set is_active = false, sort_order = 9 where dropdown_type = 'scot_outcome' and value = 'Order placed';
insert into public.enquiry_dropdown_options (dropdown_type, value, is_active, sort_order, created_by)
values ('scot_outcome', 'Busy',              true, 3, null),
       ('scot_outcome', 'Follow-up',         true, 5, null),
       ('scot_outcome', 'Meeting Scheduled', true, 6, null)
on conflict (dropdown_type, lower(value)) do nothing;

commit;
