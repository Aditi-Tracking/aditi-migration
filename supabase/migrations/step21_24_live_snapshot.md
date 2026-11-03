# Step 21 and step 24: a snapshot of the CURRENT live definitions, as of 2026-11-03

> **This is a snapshot of the current live definitions as of 2026-11-03. It is NOT the original migration text of step 21 or step 24, and it must not be
> read as a migration record or run as one.** The original files for steps 21 and 24 (live hashes `c7ef6fd41891` and `13ad02a45dcf`) could not be recovered
> byte-for-byte. This file only shows what those steps left behind in the live database today, pulled read-only from the catalog.

Read these caveats before relying on it:

- **It is the state NOW, not the state right after the step.** Several objects below were changed again by later steps: `add_scot_client`, `update_scot_client`,
  `scot_find_duplicates`, `import_scot_clients`, `scot_clients_select` and `log_scot_call` by step 22 (SCOT Cold Leads), `log_scot_call` also by step 23
  (Meeting Scheduled) and step 24 itself, `meca_scope` and friends possibly by earlier or later work. What you read is the live result of all steps so far.
- **Policy and function text is what PostgreSQL stores,** reformatted by `pg_get_functiondef` / `pg_policies`, so it will not match the author's layout or comments.
- **Owner, grants and security mode are shown as comments** above each function; the `create` statements alone do not recreate them.
- It lists only the objects the two steps are known to have touched (from the step 21 generator and the step 24 design): 1 index, 1 helper function (`lc_my_label_keys`),
  17 re-created functions, 9 policies and 1 grant on `meca_norm` (step 21); 1 column, 3 constraints, 1 column grant, the seeded offsets and the 7-argument `log_scot_call` (step 24).
  Objects they dropped (the 6-argument `log_scot_call`, the old policy texts) no longer exist and are not shown.
- Pulled with read-only queries (catalog reads on the read-only role; the offsets table, which sits behind row-level security, was read as the owner role inside a
  read-only transaction). Nothing was written to the database.

## Step 21: index, helper function, 17 functions, 9 policies

### Index

```sql
CREATE INDEX field_sales_entries_linked_enquiry_idx ON public.field_sales_entries USING btree (linked_enquiry_id) WHERE ((linked_enquiry_id IS NOT NULL) AND (deleted_at IS NULL));
```

### Functions (18: `lc_my_label_keys` is new in step 21; `log_scot_call` is also step 24)

#### lc_my_label_keys()

<!-- owner claude_code_leadcapture; security definer; volatility s; acl {claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture} -->

Owner `claude_code_leadcapture`, security **definer**, volatility `s`, privileges `{claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture}`

```sql
CREATE OR REPLACE FUNCTION public.lc_my_label_keys()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- the Sales Person labels (normalised) that resolve to the caller's login by the rule Sales Rep MeCa uses (meca_resolve_rep, minus the Field Sales
  -- shortcut, which is already covered by "entered by me"): 1) a link in sales_rep_aliases, 3) an exact unique employee name, 4) the login's own e-mail.
  -- An alias always wins over 3) and 4). Computed ONCE per statement (the policy calls it as an InitPlan), so the Sheet filter is a plain array test per row.
  with me as (select lower(btrim(coalesce(public.lc_jwt() ->> 'email', ''))) as e)
  select coalesce(array_agg(distinct k), '{}'::text[])
    from (select a.label_key as k
            from public.sales_rep_aliases a, me
           where me.e <> '' and a.rep_email = me.e
          union
          select public.meca_norm(ed."Employee_name")
            from public."Employee_details" ed, me
           where me.e <> '' and lower(btrim(ed."Email_Id")) = me.e
             and public.meca_employee_email(ed."Employee_name") = me.e
             and not exists (select 1 from public.sales_rep_aliases a where a.label_key = public.meca_norm(ed."Employee_name"))
          union
          select me.e
            from me
           where position('@' in me.e) > 1
             and exists (select 1 from public."Employee_details" ed where lower(btrim(ed."Email_Id")) = me.e)
             and not exists (select 1 from public.sales_rep_aliases a where a.label_key = me.e)) x
   where k <> '';
$function$;
```

#### add_scot_client(p jsonb)

<!-- owner claude_code_leadcapture; security definer; volatility v; acl {claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture} -->

Owner `claude_code_leadcapture`, security **definer**, volatility `v`, privileges `{claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture}`

```sql
CREATE OR REPLACE FUNCTION public.add_scot_client(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
```

#### close_fms_lead(p_enquiry uuid, p_outcome text, p_comment text, p_so_number text, p_amount numeric, p_closed_at timestamp with time zone)

<!-- owner claude_code_leadcapture; security definer; volatility v; acl {claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture} -->

Owner `claude_code_leadcapture`, security **definer**, volatility `v`, privileges `{claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture}`

```sql
CREATE OR REPLACE FUNCTION public.close_fms_lead(p_enquiry uuid, p_outcome text, p_comment text, p_so_number text, p_amount numeric, p_closed_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_at      timestamptz := coalesce(p_closed_at, now());
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_so      text := nullif(btrim(coalesce(p_so_number, '')), '');
begin
  perform public.fms_assert_lead(p_enquiry, 'update');
  if p_outcome is null or p_outcome not in ('won', 'lost') then
    raise exception 'The outcome must be won or lost' using errcode = '22023';
  end if;
  if p_closed_at is not null and not (public.lc_has('sales_fms_edit') and public.lc_has('enquiry_view_all')) then
    raise exception 'Only an administrator can set a closing time' using errcode = '42501';
  end if;
  if v_at > now() + interval '5 minutes' then
    raise exception 'The closing time cannot be in the future' using errcode = '22023';
  end if;
  if p_outcome = 'lost' and (v_so is not null or p_amount is not null) then
    raise exception 'An SO number and an amount belong to a Won lead only' using errcode = '22023';
  end if;
  if p_amount is not null and p_amount < 0 then
    raise exception 'The amount cannot be negative' using errcode = '22023';
  end if;
  if v_so is not null and char_length(v_so) > 40 then
    raise exception 'The SO number is too long (40 characters at most)' using errcode = '22023';
  end if;
  if v_comment is not null and char_length(v_comment) > 500 then
    raise exception 'The comment is too long (500 characters at most)' using errcode = '22023';
  end if;
  if exists (select 1 from public.sales_fms_closures c where c.enquiry_id = p_enquiry) then
    raise exception 'This lead is already closed — reopen it first' using errcode = '22023';
  end if;

  insert into public.sales_fms_closures (enquiry_id, outcome, closed_at, comment, so_number, amount, updated_by)
  values (p_enquiry, p_outcome, v_at, v_comment, v_so, p_amount, public.lc_uid());
  update public.enquiries e set status = p_outcome where e.id = p_enquiry;
  return jsonb_build_object('outcome', p_outcome, 'closed_at', v_at);
end;
$function$;
```

#### delete_field_sales_entries(p_ids uuid[])

<!-- owner claude_code_leadcapture; security definer; volatility v; acl {claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture,service_role=X/claude_code_leadcapture} -->

Owner `claude_code_leadcapture`, security **definer**, volatility `v`, privileges `{claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture,service_role=X/claude_code_leadcapture}`

```sql
CREATE OR REPLACE FUNCTION public.delete_field_sales_entries(p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_requested    integer;
  v_deleted      integer;
  v_deleted_sent integer;
  v_enquiries    integer;
  v_can_sent     boolean;
  v_all          boolean;
begin
  if public.lc_uid() is null or not public.lc_has('field_sales_form_delete') then
    raise exception 'Not authorised to delete Field Sales entries' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'No entries selected' using errcode = '22023';
  end if;
  if cardinality(p_ids) > 1000 then
    raise exception 'Too many entries selected (limit 1000 per delete)' using errcode = '22023';
  end if;

  v_can_sent := public.lc_has('enquiry_delete_sent');
  v_all      := public.lc_has('field_sales_form_view_all');
  select count(distinct x) into v_requested from unnest(p_ids) x;

  -- 1. the enquiries of the pushed entries (enquiry first), 2. then the entries
  update public.enquiries e
     set deleted_at = now(), deleted_by = public.lc_uid()
   where e.deleted_at is null
     and v_can_sent
     and e.id in (select f.linked_enquiry_id
                    from public.field_sales_entries f
                   where f.id = any (p_ids) and f.deleted_at is null and f.linked_enquiry_id is not null
                     and (f.entered_by = public.lc_uid() or v_all));
  get diagnostics v_enquiries = row_count;

  with gone as (
    update public.field_sales_entries f
       set deleted_at = now(), deleted_by = public.lc_uid()
     where f.id = any (p_ids)
       and f.deleted_at is null
       and (f.entered_by = public.lc_uid() or v_all)
       and (f.linked_enquiry_id is null
            or (v_can_sent and exists (select 1 from public.enquiries e where e.id = f.linked_enquiry_id and e.deleted_at is not null)))
    returning f.id, f.linked_enquiry_id
  )
  select count(*), count(*) filter (where linked_enquiry_id is not null) into v_deleted, v_deleted_sent from gone;

  return jsonb_build_object('requested',         v_requested,
                            'deleted',           v_deleted,
                            'skipped',           v_requested - v_deleted,
                            'deleted_sent',      v_deleted_sent,
                            'enquiries_deleted', v_enquiries);
end;
$function$;
```

#### delete_scot_clients(p_ids uuid[])

<!-- owner claude_code_leadcapture; security definer; volatility v; acl {claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture} -->

Owner `claude_code_leadcapture`, security **definer**, volatility `v`, privileges `{claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture}`

```sql
CREATE OR REPLACE FUNCTION public.delete_scot_clients(p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_requested integer;
  v_deleted   integer;
begin
  perform public.scot_assert('scot_update');
  if not public.lc_has('scot_view_all') then raise exception 'Not authorised to delete SCOT entries' using errcode = '42501'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'No entries selected' using errcode = '22023'; end if;
  select count(distinct x) into v_requested from unnest(p_ids) x;
  update public.scot_clients set deleted_at = now(), deleted_by = public.lc_uid() where id = any (p_ids) and deleted_at is null;
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('requested', v_requested, 'deleted', v_deleted, 'skipped', v_requested - v_deleted);
end;
$function$;
```

#### fms_assert_lead(p_enquiry uuid, p_tier text)

<!-- owner claude_code_leadcapture; security definer; volatility v; acl {claude_code_leadcapture=X/claude_code_leadcapture} -->

Owner `claude_code_leadcapture`, security **definer**, volatility `v`, privileges `{claude_code_leadcapture=X/claude_code_leadcapture}`

```sql
CREATE OR REPLACE FUNCTION public.fms_assert_lead(p_enquiry uuid, p_tier text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.lc_uid() is null then
    raise exception 'Not authorised to work the sales pipeline' using errcode = '42501';
  end if;
  if p_tier = 'edit' then
    if not (public.lc_has('sales_fms_edit') and public.lc_has('enquiry_view_all')) then
      raise exception 'Not authorised to correct the sales pipeline' using errcode = '42501';
    end if;
  elsif not public.lc_has('sales_fms_update') then
    raise exception 'Not authorised to update the sales pipeline' using errcode = '42501';
  end if;
  if p_enquiry is null or not exists (select 1 from public.enquiries e
        where e.id = p_enquiry and e.sent_to_fms_at is not null and e.deleted_at is null
          and (e.entered_by = public.lc_uid() or public.lc_has('enquiry_view_all'))) then
    raise exception 'This enquiry is not in the sales pipeline' using errcode = 'P0002';
  end if;
end;
$function$;
```

#### import_scot_clients(p_file_name text, p_rows jsonb)

<!-- owner claude_code_leadcapture; security definer; volatility v; acl {claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture} -->

Owner `claude_code_leadcapture`, security **definer**, volatility `v`, privileges `{claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture}`

```sql
CREATE OR REPLACE FUNCTION public.import_scot_clients(p_file_name text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
```

#### log_scot_call(p_client uuid, p_outcome text, p_notes text, p_next_call_date date, p_called_at timestamp with time zone, p_sales_person text, p_auto_schedule boolean)

<!-- owner claude_code_leadcapture; security definer; volatility v; acl {claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture} -->

Owner `claude_code_leadcapture`, security **definer**, volatility `v`, privileges `{claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture}`

```sql
CREATE OR REPLACE FUNCTION public.log_scot_call(p_client uuid, p_outcome text, p_notes text, p_next_call_date date, p_called_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_sales_person text DEFAULT NULL::text, p_auto_schedule boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_next    date := p_next_call_date;
  v_days    integer;
  v_auto    boolean := false;
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

  -- THE AUTOMATIC NEXT-CALL DATE: only when the caller gave NO date and has not switched this off (the dialog always switches it off: what it shows is what is saved),
  -- only for an outcome that has an offset configured, and NEVER for Meeting Scheduled (that outcome always needs an explicit meeting date, below).
  if not v_meeting and v_next is null and coalesce(p_auto_schedule, true) then
    select o.default_next_call_days into v_days from public.enquiry_dropdown_options o where o.dropdown_type = 'scot_outcome' and o.value = p_outcome and o.is_active;
    if v_days is not null then
      v_next := greatest((v_at at time zone 'Asia/Kolkata')::date + v_days, public.scot_today());
      v_auto := true;
    end if;
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
  values (p_client, v_at, public.lc_uid(), p_outcome, v_notes, v_next) returning id into v_id;

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
     set last_called_at = greatest(coalesce(last_called_at, v_at), v_at), call_count = call_count + 1, next_call_date = v_next,
         converted_enquiry_id = case when v_meeting then v_enq else converted_enquiry_id end,
         sales_person = case when v_meeting then v_sp else sales_person end
   where id = p_client;
  return jsonb_build_object('call_id', v_id, 'next_call_date', v_next, 'auto_scheduled', v_auto, 'enquiry_id', v_enq, 'enquiry_created', v_created);
end;
$function$;
```

#### meca_assert_manage()

<!-- owner claude_code_leadcapture; security definer; volatility s; acl {claude_code_leadcapture=X/claude_code_leadcapture,service_role=X/claude_code_leadcapture} -->

Owner `claude_code_leadcapture`, security **definer**, volatility `s`, privileges `{claude_code_leadcapture=X/claude_code_leadcapture,service_role=X/claude_code_leadcapture}`

```sql
CREATE OR REPLACE FUNCTION public.meca_assert_manage()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.lc_uid() is null or not public.lc_has('sales_meca_manage') or not public.lc_has('sales_meca_view_all') then
    raise exception 'Not authorised to manage Sales Rep MeCa' using errcode = '42501';
  end if;
end;
$function$;
```

#### meca_scope(OUT is_all boolean, OUT my_email text)

<!-- owner claude_code_leadcapture; security definer; volatility s; acl {claude_code_leadcapture=X/claude_code_leadcapture,service_role=X/claude_code_leadcapture} -->

Owner `claude_code_leadcapture`, security **definer**, volatility `s`, privileges `{claude_code_leadcapture=X/claude_code_leadcapture,service_role=X/claude_code_leadcapture}`

```sql
CREATE OR REPLACE FUNCTION public.meca_scope(OUT is_all boolean, OUT my_email text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.lc_uid() is null then
    raise exception 'Not authorised to view Sales Rep MeCa' using errcode = '42501';
  end if;
  my_email := lower(btrim(coalesce(public.lc_jwt() ->> 'email', '')));
  if public.lc_has('sales_meca_view_all') then is_all := true;
  elsif public.lc_has('sales_meca_view') then is_all := false;
  else raise exception 'Not authorised to view Sales Rep MeCa' using errcode = '42501';
  end if;
end;
$function$;
```

#### scot_assert(p_perm text)

<!-- owner claude_code_leadcapture; security definer; volatility s; acl {claude_code_leadcapture=X/claude_code_leadcapture} -->

Owner `claude_code_leadcapture`, security **definer**, volatility `s`, privileges `{claude_code_leadcapture=X/claude_code_leadcapture}`

```sql
CREATE OR REPLACE FUNCTION public.scot_assert(p_perm text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.lc_uid() is null or not public.lc_has(p_perm) then
    raise exception 'Not authorised for SCOT Calls' using errcode = '42501';
  end if;
end;
$function$;
```

#### scot_can_see(p_id uuid)

<!-- owner claude_code_leadcapture; security definer; volatility s; acl {claude_code_leadcapture=X/claude_code_leadcapture} -->

Owner `claude_code_leadcapture`, security **definer**, volatility `s`, privileges `{claude_code_leadcapture=X/claude_code_leadcapture}`

```sql
CREATE OR REPLACE FUNCTION public.scot_can_see(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.scot_clients c
                  where c.id = p_id and c.deleted_at is null
                    and (c.entered_by = public.lc_uid() or public.lc_has('scot_view_all')));
$function$;
```

#### update_scot_client(p_id uuid, p_stamp timestamp with time zone, p_patch jsonb)

<!-- owner claude_code_leadcapture; security definer; volatility v; acl {claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture} -->

Owner `claude_code_leadcapture`, security **definer**, volatility `v`, privileges `{claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture}`

```sql
CREATE OR REPLACE FUNCTION public.update_scot_client(p_id uuid, p_stamp timestamp with time zone, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
```

#### delete_enquiries(p_ids uuid[])

<!-- owner claude_code_leadcapture; security definer; volatility v; acl {claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture,service_role=X/claude_code_leadcapture} -->

Owner `claude_code_leadcapture`, security **definer**, volatility `v`, privileges `{claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture,service_role=X/claude_code_leadcapture}`

```sql
CREATE OR REPLACE FUNCTION public.delete_enquiries(p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_requested    integer;
  v_deleted      integer;
  v_deleted_sent integer;
  v_entries      integer;
  v_can_sent     boolean;
  v_all          boolean;
begin
  if public.lc_uid() is null or not public.lc_has('enquiry_delete') then
    raise exception 'Not authorised to delete enquiries' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'No enquiries selected' using errcode = '22023';
  end if;
  if cardinality(p_ids) > 1000 then
    raise exception 'Too many enquiries selected (limit 1000 per delete)' using errcode = '22023';
  end if;

  v_can_sent := public.lc_has('enquiry_delete_sent');
  v_all      := public.lc_has('enquiry_view_all');
  select count(distinct x) into v_requested from unnest(p_ids) x;

  with gone as (
    update public.enquiries e
       set deleted_at = now(), deleted_by = public.lc_uid()
     where e.id = any (p_ids)
       and e.deleted_at is null
       and (e.sent_to_fms_at is null or v_can_sent)
       and (e.entered_by = public.lc_uid() or v_all)
    returning e.id, (e.sent_to_fms_at is not null) as was_sent
  ), entries_gone as (
    update public.field_sales_entries f
       set deleted_at = now(), deleted_by = public.lc_uid()
     where f.linked_enquiry_id in (select id from gone)
       and f.deleted_at is null
    returning f.id
  )
  select (select count(*) from gone),
         (select count(*) from gone where was_sent),
         (select count(*) from entries_gone)
    into v_deleted, v_deleted_sent, v_entries;

  return jsonb_build_object('requested',       v_requested,
                            'deleted',         v_deleted,
                            'skipped',         v_requested - v_deleted,
                            'deleted_sent',    v_deleted_sent,
                            'entries_deleted', v_entries);
end;
$function$;
```

#### send_enquiries_to_fms(p_ids uuid[])

<!-- owner claude_code_leadcapture; security definer; volatility v; acl {claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture,service_role=X/claude_code_leadcapture} -->

Owner `claude_code_leadcapture`, security **definer**, volatility `v`, privileges `{claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture,service_role=X/claude_code_leadcapture}`

```sql
CREATE OR REPLACE FUNCTION public.send_enquiries_to_fms(p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_scope     uuid[];
  v_sent      uuid[];
  v_requested integer;
  v_never     integer;
  v_all       boolean;
begin
  if public.lc_uid() is null or not public.lc_has('enquiry_assign_fms') then
    raise exception 'Not authorised to send enquiries to FMS' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'No enquiries selected' using errcode = '22023';
  end if;

  select count(distinct x) into v_requested from unnest(p_ids) x;
  v_all := public.lc_has('enquiry_view_all');

  -- rows the caller may act on: their own, or anyone's with view_all
  select coalesce(array_agg(e.id), '{}') into v_scope
    from public.enquiries e
   where e.id = any (p_ids)
     and (e.entered_by = public.lc_uid() or v_all);

  select count(*) into v_never
    from public.enquiries e
    join public.enquiry_dropdown_options o on o.dropdown_type = 'status' and o.value = e.status
   where e.id = any (v_scope) and e.sent_to_fms_at is null and e.deleted_at is null and o.fms_rule = 'never';

  v_sent := public.fms_send_enquiries(v_scope);

  return jsonb_build_object('requested',     v_requested,
                            'sent',          cardinality(v_sent),
                            'skipped',       v_requested - cardinality(v_sent),
                            'skipped_never', v_never);
end;
$function$;
```

#### scot_find_duplicates(p_phones text[])

<!-- owner claude_code_leadcapture; security definer; volatility s; acl {claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture} -->

Owner `claude_code_leadcapture`, security **definer**, volatility `s`, privileges `{claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture}`

```sql
CREATE OR REPLACE FUNCTION public.scot_find_duplicates(p_phones text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
```

#### enquiries_set_entry_channel()

<!-- owner claude_code_leadcapture; security invoker; volatility v; acl {claude_code_leadcapture=X/claude_code_leadcapture,service_role=X/claude_code_leadcapture} -->

Owner `claude_code_leadcapture`, security **invoker**, volatility `v`, privileges `{claude_code_leadcapture=X/claude_code_leadcapture,service_role=X/claude_code_leadcapture}`

```sql
CREATE OR REPLACE FUNCTION public.enquiries_set_entry_channel()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
```

#### enquiry_dropdown_can(p_type text, p_action text, p_active boolean)

<!-- owner claude_code_leadcapture; security definer; volatility s; acl {claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture,service_role=X/claude_code_leadcapture} -->

Owner `claude_code_leadcapture`, security **definer**, volatility `s`, privileges `{claude_code_leadcapture=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture,service_role=X/claude_code_leadcapture}`

```sql
CREATE OR REPLACE FUNCTION public.enquiry_dropdown_can(p_type text, p_action text, p_active boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select bool_or(
              case p_action
                when 'read' then
                     (p_active and ((m || '_view') = any (k.caps) or (m || '_create') = any (k.caps)))
                     or (m || '_view_all') = any (k.caps)
                     or (m || '_manage_dropdowns') = any (k.caps)
                when 'write' then
                     (m || '_manage_dropdowns') = any (k.caps)
              end)
       from (select public.lc_caps(public.lc_tier()) as caps) k,
            unnest(case
                     when p_type in ('source', 'sales_person', 'status') then array['enquiry']
                     when p_type = 'product_interested'                  then array['field_sales_form', 'enquiry']
                     when p_type in ('field_sales_source', 'visit_purpose',
                                     'field_sales_lead_stage')           then array['field_sales_form']
                     when p_type in ('fms_reason_first_call', 'fms_reason_demo',
                                     'fms_reason_quotation')             then array['sales_fms', 'enquiry']
                     when p_type = 'scot_outcome'                        then array['scot']
                     else array[]::text[]
                   end) as m),
    false);
$function$;
```

### Grant on an existing function

Step 21 granted `execute` on `public.meca_norm(text)` to `authenticated` (the Sheet policy calls it). Live privileges today: `{claude_code_leadcapture=X/claude_code_leadcapture,service_role=X/claude_code_leadcapture,authenticated=X/claude_code_leadcapture}`

### Policies (9)

#### enquiries_insert on enquiries

```sql
create policy enquiries_insert on public.enquiries as permissive for insert to authenticated
  with check (((entered_by = ( SELECT lc_uid() AS lc_uid)) AND ( SELECT lc_has('enquiry_create'::text) AS lc_has) AND (sent_to_fms_at IS NULL) AND (deleted_at IS NULL) AND (deleted_by IS NULL) AND (entry_channel <> ALL (ARRAY['field_sales_form'::text, 'scot_call'::text])) AND ((entry_channel <> 'excel_upload'::text) OR ( SELECT lc_has('enquiry_view_all'::text) AS lc_has))));
```

#### enquiries_select on enquiries

```sql
create policy enquiries_select on public.enquiries as permissive for select to authenticated
  using (((deleted_at IS NULL) AND (( SELECT lc_has('enquiry_view_all'::text) AS lc_has) OR ((entered_by = ( SELECT lc_uid() AS lc_uid)) AND ( SELECT lc_has('enquiry_view'::text) AS lc_has)) OR ((entered_by = ( SELECT lc_uid() AS lc_uid)) AND (entry_channel = 'field_sales_form'::text) AND ( SELECT lc_has('field_sales_form_view'::text) AS lc_has)) OR (( SELECT lc_has('enquiry_view'::text) AS lc_has) AND (meca_norm(sales_person_accountable) = ANY (( SELECT lc_my_label_keys() AS lc_my_label_keys)::text[]))))));
```

#### enquiries_update on enquiries

```sql
create policy enquiries_update on public.enquiries as permissive for update to authenticated
  using (((sent_to_fms_at IS NULL) AND (deleted_at IS NULL) AND ( SELECT lc_has('enquiry_create'::text) AS lc_has) AND ((entered_by = ( SELECT lc_uid() AS lc_uid)) OR ( SELECT lc_has('enquiry_view_all'::text) AS lc_has))))
  with check (((sent_to_fms_at IS NULL) AND (deleted_at IS NULL) AND ( SELECT lc_has('enquiry_create'::text) AS lc_has) AND ((entered_by = ( SELECT lc_uid() AS lc_uid)) OR ( SELECT lc_has('enquiry_view_all'::text) AS lc_has))));
```

#### enquiry_imports_insert on enquiry_imports

```sql
create policy enquiry_imports_insert on public.enquiry_imports as permissive for insert to authenticated
  with check (((uploaded_by = ( SELECT lc_uid() AS lc_uid)) AND ( SELECT lc_has('enquiry_create'::text) AS lc_has) AND ( SELECT lc_has('enquiry_view_all'::text) AS lc_has)));
```

#### enquiry_imports_select on enquiry_imports

```sql
create policy enquiry_imports_select on public.enquiry_imports as permissive for select to authenticated
  using (((uploaded_by = ( SELECT lc_uid() AS lc_uid)) OR ( SELECT lc_has('enquiry_view_all'::text) AS lc_has)));
```

#### field_sales_entries_insert on field_sales_entries

```sql
create policy field_sales_entries_insert on public.field_sales_entries as permissive for insert to authenticated
  with check (((entered_by = ( SELECT lc_uid() AS lc_uid)) AND ( SELECT lc_has('field_sales_form_create'::text) AS lc_has) AND (sent_to_fms_at IS NULL) AND (linked_enquiry_id IS NULL) AND (deleted_at IS NULL) AND (deleted_by IS NULL)));
```

#### field_sales_entries_select on field_sales_entries

```sql
create policy field_sales_entries_select on public.field_sales_entries as permissive for select to authenticated
  using (((deleted_at IS NULL) AND (((entered_by = ( SELECT lc_uid() AS lc_uid)) AND ( SELECT lc_has('field_sales_form_view'::text) AS lc_has)) OR ( SELECT lc_has('field_sales_form_view_all'::text) AS lc_has))));
```

#### scot_clients_select on scot_clients

```sql
create policy scot_clients_select on public.scot_clients as permissive for select to authenticated
  using (((deleted_at IS NULL) AND (((entered_by = ( SELECT lc_uid() AS lc_uid)) AND ( SELECT lc_has('scot_view'::text) AS lc_has)) OR ( SELECT lc_has('scot_view_all'::text) AS lc_has))));
```

#### scot_imports_select on scot_imports

```sql
create policy scot_imports_select on public.scot_imports as permissive for select to authenticated
  using (((uploaded_by = ( SELECT lc_uid() AS lc_uid)) OR ( SELECT lc_has('scot_view_all'::text) AS lc_has)));
```

## Step 24: next-call offsets

### Column, constraints, grant

```
column default_next_call_days: integer, nullable=YES, default=None
```

```sql
alter table public.enquiry_dropdown_options add constraint enquiry_dropdown_options_ncd_meeting_check CHECK (((default_next_call_days IS NULL) OR (lower(value) <> 'meeting scheduled'::text)));
alter table public.enquiry_dropdown_options add constraint enquiry_dropdown_options_ncd_range_check CHECK (((default_next_call_days IS NULL) OR ((default_next_call_days >= 0) AND (default_next_call_days <= 365))));
alter table public.enquiry_dropdown_options add constraint enquiry_dropdown_options_ncd_type_check CHECK (((default_next_call_days IS NULL) OR (dropdown_type = 'scot_outcome'::text)));
```

Column privileges (`attacl`; the update grant step 24 made to `authenticated` shows as `authenticated=w/...`): `{authenticated=w/claude_code_leadcapture}`

### Offsets as configured today (data, not schema: administrators can change these in the app)

| Outcome | Next call in (days) | Active |
|---|---|---|
| Connected | 7 | yes |
| Not Answer | 1 | yes |
| Busy | 1 | yes |
| Invalid number | none | yes |
| Follow-up | 3 | yes |
| Meeting Scheduled | none | yes |
| Not Interested | none | yes |
| Call back later | none | no |
| Order placed | none | no |

Step 24 seeded Connected 7, Not Answer 1, Busy 1 and Follow-up 3; anything else was set afterwards. `log_scot_call` is listed with the other functions above.
