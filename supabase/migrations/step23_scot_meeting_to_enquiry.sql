-- Step 23 — SCOT Calls: logging a call with the outcome "Meeting Scheduled" puts the contact back into the live pipeline. Runs as claude_code_leadcapture.
-- ONE transaction: if anything fails, nothing changes. Access control is not touched (the same lc_has gates; the new step also needs enquiry_create, which only
-- the Admin tier holds — and only an Admin can log a SCOT call at all).
--
-- WHAT HAPPENS when an Admin logs "Meeting Scheduled" on a contact (inside the one transaction that records the call, under the contact's row lock):
--   1. a NEW enquiry is created, channel "scot_call" (shown as "SCOT Calls" in the Sheet), status interested, already sent to Sales FMS (its 4 stages exist):
--        name <- contact name · phone · e-mail · source <- the contact's Source · Sales Person <- the one chosen in the dialog (REQUIRED, pre-filled from the
--        contact; must be an active entry of the managed Sales Person list; it is also saved back on the contact)
--        Requirement <- ONE line: Opportunity · City: … · Remark: …   (only the parts that exist; "From SCOT Calls" if there are none)
--        entered_by <- the Admin who logged the call · enquiry date <- the call's date (India time)
--   2. its pipeline mirrors reality: the First Call stage is marked DONE at the call time with the reason "Booked" (the call WAS the first call), and the Demo
--      stage is planned for the MEETING DATE (the call's next-call date, which is therefore REQUIRED for this outcome): 10:00 India time that day, or two hours
--      after the call when the meeting is today. Quotation and Negotiation are planned later, as always, when the stage before them is completed.
--   3. the contact keeps its follow-up (still active, next call = the meeting date) and is LINKED to the new enquiry (scot_clients.converted_enquiry_id); the call
--      row records which enquiry it created (scot_calls.enquiry_id).
-- NO DUPLICATES: if the contact's linked enquiry is still live (not deleted) and neither Lost nor Won, a second "Meeting Scheduled" only records the call —
-- no second enquiry; the answer says "already in the pipeline". If that enquiry was Lost, Won or deleted, a fresh one is created and the link moves to it.
-- A LATER LOST on the new enquiry needs nothing new: the existing trigger finds the contact by its unique phone, counts the loss and re-opens it — never a
-- second follow-up. A LATER WON closes the contact as "Won back" by itself (new trigger below).
-- "Meeting Scheduled" can no longer be renamed, retired or deleted in the outcomes list (the conversion depends on the name), like the built-in statuses.
-- log_scot_call gets ONE new optional argument (p_sales_person); the old 5-argument version is dropped and the new one carries the same grants.

begin;

-- 23a. the new channel and the links ---------------------------------------------------------------------------------------------------------------
alter table public.enquiries drop constraint enquiries_entry_channel_check;
alter table public.enquiries add  constraint enquiries_entry_channel_check
  check (entry_channel in ('portal_form', 'field_sales', 'excel_upload', 'field_sales_form', 'scot_call'));

create or replace function public.enquiries_set_entry_channel()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.entry_channel = 'excel_upload' then
    null;
  elsif new.entry_channel in ('field_sales_form', 'scot_call') and current_user not in ('anon', 'authenticated') then
    null; -- only the database's own functions (the Field Sales push, the SCOT conversion) may set these two; a person's own insert falls through to portal_form
  else
    new.entry_channel := 'portal_form';
  end if;
  return new;
end;
$function$;

-- a hand-keyed Sheet row can never claim either system channel (belt and braces: the trigger above already resets it)
drop policy if exists enquiries_insert on public.enquiries;
create policy enquiries_insert on public.enquiries for insert to authenticated
  with check (entered_by = (select public.lc_uid()) and (select public.lc_has('enquiry_create'))
              and sent_to_fms_at is null and deleted_at is null and deleted_by is null
              and entry_channel not in ('field_sales_form', 'scot_call')
              and (entry_channel <> 'excel_upload' or (select public.lc_has('enquiry_view_all'))));

alter table public.scot_clients add column converted_enquiry_id uuid references public.enquiries (id);
alter table public.scot_calls   add column enquiry_id           uuid references public.enquiries (id);
create index scot_clients_converted_idx on public.scot_clients (converted_enquiry_id) where converted_enquiry_id is not null;

-- the list the screen reads: + converted_enquiry_id and the STATUS of that enquiry while it is live (null once it is deleted)
drop view public.scot_list;
create view public.scot_list with (security_invoker = true) as
select c.*,
       case when c.status = 'won_back' then 'won_back'
            when c.status = 'dropped'  then 'dropped'
            when c.next_call_date is null then 'not_scheduled'
            when c.next_call_date < public.scot_today() then 'overdue'
            when c.next_call_date = public.scot_today() then 'due_today'
            else 'scheduled' end as call_state,
       case when c.status = 'active' and c.next_call_date < public.scot_today() then public.scot_today() - c.next_call_date end as days_overdue,
       lc.outcome as last_outcome,
       pe.status as pipeline_status
  from public.scot_clients c
  left join lateral (select k.outcome from public.scot_calls k
                      where k.client_id = c.id and k.deleted_at is null
                      order by k.called_at desc, k.created_at desc limit 1) lc on true
  left join lateral (select x.status from public.enquiries x where x.id = c.converted_enquiry_id and x.deleted_at is null) pe on true;
grant select on public.scot_list to authenticated, service_role;

-- 23b. "Meeting Scheduled" is protected like the built-in statuses ---------------------------------------------------------------------------------
create or replace function public.enquiry_dropdown_guard_builtin()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if old.dropdown_type = 'status'
     and old.value in ('open', 'interested', 'rnr', 'future_lead', 'lost', 'won') then
    if tg_op = 'DELETE' then
      raise exception 'The built-in status "%" cannot be deleted', old.value using errcode = '23514';
    elsif new.is_active is not true
          or new.value is distinct from old.value
          or new.dropdown_type is distinct from old.dropdown_type then
      raise exception 'The built-in status "%" cannot be retired or renamed', old.value using errcode = '23514';
    end if;
  end if;
  if old.dropdown_type = 'scot_outcome' and old.value = 'Meeting Scheduled' then
    if tg_op = 'DELETE' then
      raise exception 'The call outcome "Meeting Scheduled" cannot be deleted: it puts the contact back into the pipeline' using errcode = '23514';
    elsif new.is_active is not true
          or new.value is distinct from old.value
          or new.dropdown_type is distinct from old.dropdown_type then
      raise exception 'The call outcome "Meeting Scheduled" cannot be retired or renamed: it puts the contact back into the pipeline' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

-- 23c. log a call (+ the conversion) ----------------------------------------------------------------------------------------------------------------
drop function public.log_scot_call(uuid, text, text, date, timestamptz);
create or replace function public.log_scot_call(p_client uuid, p_outcome text, p_notes text, p_next_call_date date, p_called_at timestamptz default null, p_sales_person text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_at      timestamptz := coalesce(p_called_at, now());
  v_notes   text := nullif(btrim(coalesce(p_notes, '')), '');
  v_id      uuid;
  v_cl      public.scot_clients%rowtype;
  v_meeting boolean := lower(btrim(coalesce(p_outcome, ''))) = 'meeting scheduled';
  v_sp      text;
  v_enq     uuid;
  v_created boolean := false;
  v_meet    timestamptz;
  v_reason  text;
begin
  perform public.scot_assert('scot_update');
  if not public.scot_can_see(p_client) then raise exception 'This client is not in your follow-ups' using errcode = 'P0002'; end if;
  select * into v_cl from public.scot_clients where id = p_client for update;
  if v_cl.status <> 'active' then raise exception 'This follow-up is closed — reopen it first' using errcode = '22023'; end if;
  if p_called_at is not null and not public.lc_has('scot_view_all') then
    raise exception 'Only an administrator can enter an earlier call time' using errcode = '42501';
  end if;
  if v_at > now() + interval '5 minutes' then raise exception 'The call time cannot be in the future' using errcode = '22023'; end if;
  if p_outcome is null or not exists (select 1 from public.enquiry_dropdown_options o where o.dropdown_type = 'scot_outcome' and o.value = p_outcome and o.is_active) then
    raise exception '"%" is not an active call outcome', coalesce(p_outcome, '') using errcode = '22023';
  end if;
  if v_notes is not null and char_length(v_notes) > 1000 then raise exception 'The notes are too long (1000 characters at most)' using errcode = '22023'; end if;
  if p_next_call_date is not null and p_next_call_date < (v_at at time zone 'Asia/Kolkata')::date then
    raise exception 'The next call date cannot be before the call itself' using errcode = '22023';
  end if;

  if v_meeting then
    if not public.lc_has('enquiry_create') then raise exception 'Not authorised to add to the sales pipeline' using errcode = '42501'; end if;
    if p_next_call_date is null then raise exception 'Choose the meeting date' using errcode = '22023'; end if;
    v_sp := coalesce(nullif(btrim(coalesce(p_sales_person, '')), ''), nullif(btrim(coalesce(v_cl.sales_person, '')), ''));
    if v_sp is null then raise exception 'Choose the Sales Person for this meeting' using errcode = '22023'; end if;
    select o.value into v_sp from public.enquiry_dropdown_options o
     where o.dropdown_type = 'sales_person' and o.is_active and lower(o.value) = lower(v_sp) limit 1;
    if v_sp is null then raise exception 'The Sales Person must be one of the active names in the Sales Person list' using errcode = '22023'; end if;
  end if;

  insert into public.scot_calls (client_id, called_at, called_by, outcome, notes, next_call_date)
  values (p_client, v_at, public.lc_uid(), p_outcome, v_notes, p_next_call_date) returning id into v_id;

  if v_meeting then
    -- already in the pipeline? (a live enquiry that is neither Lost nor Won)
    select e.id into v_enq from public.enquiries e
     where e.id = v_cl.converted_enquiry_id and e.deleted_at is null and e.status not in ('lost', 'won');
    if v_enq is null then
      insert into public.enquiries (enquiry_date, name, company_name, phone, email, requirement, source, sales_person_accountable, client_type, status,
                                    entry_channel, entered_by, sent_to_fms_at)
      values ((v_at at time zone 'Asia/Kolkata')::date, v_cl.contact_name, null, v_cl.phone, v_cl.email,
              array[coalesce(nullif(concat_ws(' · ', v_cl.opportunity,
                                              case when v_cl.city   is not null then 'City: '   || v_cl.city   end,
                                              case when v_cl.remark is not null then 'Remark: ' || v_cl.remark end), ''), 'From SCOT Calls')],
              v_cl.lead_source, v_sp, null, 'interested', 'scot_call', public.lc_uid(), now())
      returning id into v_enq;
      v_created := true;
      perform public.fms_create_stages(v_enq, v_at);
      -- the call WAS the first call: mark it done (reason Booked, or the first active reason that completes the stage), then plan the next stage as usual ...
      select o.value into v_reason from public.enquiry_dropdown_options o
       where o.dropdown_type = 'fms_reason_first_call' and o.is_active and o.completes_stage
       order by (o.value = 'Booked') desc, o.sort_order, o.value limit 1;
      update public.sales_fms_stages s
         set actual_at = v_at, reason = v_reason, reason_at = case when v_reason is not null then now() end, updated_by = public.lc_uid()
       where s.enquiry_id = v_enq and s.stage_key = 'first_call';
      perform public.fms_plan_next(v_enq, 'first_call', v_at);
      -- ... then put the Demo on the meeting date
      v_meet := case when p_next_call_date = (v_at at time zone 'Asia/Kolkata')::date then v_at + interval '2 hours'
                     else (p_next_call_date::timestamp + interval '10 hours') at time zone 'Asia/Kolkata' end;
      update public.sales_fms_stages s set planned_at = v_meet, updated_by = public.lc_uid()
       where s.enquiry_id = v_enq and s.stage_key = 'demo' and s.actual_at is null;
    end if;
    update public.scot_calls set enquiry_id = v_enq where id = v_id;
  end if;

  update public.scot_clients
     set last_called_at = greatest(coalesce(last_called_at, v_at), v_at), call_count = call_count + 1, next_call_date = p_next_call_date,
         converted_enquiry_id = case when v_meeting then v_enq else converted_enquiry_id end,
         sales_person = case when v_meeting then v_sp else sales_person end
   where id = p_client;
  return jsonb_build_object('call_id', v_id, 'next_call_date', p_next_call_date, 'enquiry_id', v_enq, 'enquiry_created', v_created);
end;
$function$;
revoke all on function public.log_scot_call(uuid, text, text, date, timestamptz, text) from public, anon;
grant execute on function public.log_scot_call(uuid, text, text, date, timestamptz, text) to authenticated;

-- 23d. a lead that is WON in the pipeline closes its SCOT contact as Won back ----------------------------------------------------------------------
create or replace function public.scot_close_on_enquiry_won()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  begin
    update public.scot_clients
       set status = 'won_back', closed_at = now(), closed_note = 'Won in the sales pipeline', next_call_date = null
     where converted_enquiry_id = new.id and status = 'active' and deleted_at is null;
  exception when others then
    raise warning 'SCOT: the contact of the won enquiry % could not be closed: %', new.id, sqlerrm;
  end;
  return null;
end;
$function$;
revoke all on function public.scot_close_on_enquiry_won() from public, anon, authenticated;

create trigger trg_enquiries_scot_won
  after update of status on public.enquiries
  for each row
  when (new.status = 'won' and old.status is distinct from 'won')
  execute function public.scot_close_on_enquiry_won();

commit;
