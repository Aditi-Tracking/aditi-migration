-- step 33: the 'lc_sales_enquiry' tier may change the STATUS (and nothing else) of the unsent Enquiry Sheet rows labelled to them.
-- New capability 'enquiry_update_assigned' (held only by lc_sales_enquiry). Three parts, one transaction; the lc_caps patch aborts if its anchor is missing.
--   1. lc_caps          lc_sales_enquiry gains enquiry_update_assigned
--   2. enquiries_update_assigned   a second (permissive, OR-ed) UPDATE policy: unsent, not deleted, and the row's Sales Person label resolves to the caller
--                                  (same test the SELECT policy already uses: meca_norm(label) = any(lc_my_label_keys()))
--   3. enquiries_status_only_guard a BEFORE UPDATE trigger: a caller whose ONLY write right is enquiry_update_assigned may change `status` and nothing else
--                                  (RLS cannot limit columns). Skipped for nested trigger updates (the auto-send runs as one), for anyone holding
--                                  enquiry_create / enquiry_view_all, and for callers with no tier at all (service role, backend jobs).
-- Changing the status to an auto-send one (Open, Interested, RNR, Future Lead) still sends the lead to Sales FMS and locks it — unchanged.
begin;

-- 1. the capability
do $do$
declare v text; v2 text;
begin
  select pg_get_functiondef('public.lc_caps(text)'::regprocedure) into v;
  v2 := replace(v, 'when ''lc_sales_enquiry'' then array[''enquiry_view'', ''sales_fms_view'', ''sales_meca_view'']',
                   'when ''lc_sales_enquiry'' then array[''enquiry_view'', ''enquiry_update_assigned'', ''sales_fms_view'', ''sales_meca_view'']');
  if v2 = v then raise exception 'lc_caps: anchor not found'; end if;
  execute v2;
end
$do$;

-- 2. the row policy
drop policy if exists enquiries_update_assigned on public.enquiries;
create policy enquiries_update_assigned on public.enquiries as permissive for update to authenticated
  using (sent_to_fms_at is null and deleted_at is null
         and (select public.lc_has('enquiry_update_assigned'))
         and public.meca_norm(sales_person_accountable) = any ((select public.lc_my_label_keys())::text[]))
  with check (sent_to_fms_at is null and deleted_at is null
         and (select public.lc_has('enquiry_update_assigned'))
         and public.meca_norm(sales_person_accountable) = any ((select public.lc_my_label_keys())::text[]));

-- 3. the column guard (named aaa_ so it runs first among the BEFORE triggers and sees only what the caller sent)
create or replace function public.enquiries_status_only_guard()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if not public.lc_has('enquiry_update_assigned') then return new; end if;
  if public.lc_has('enquiry_create') or public.lc_has('enquiry_view_all') then return new; end if;
  if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'You can only change the status of an enquiry' using errcode = '42501';
  end if;
  return new;
end;
$function$;
revoke all on function public.enquiries_status_only_guard() from public;

drop trigger if exists aaa_enquiries_status_only_guard on public.enquiries;
create trigger aaa_enquiries_status_only_guard before update on public.enquiries
  for each row execute function public.enquiries_status_only_guard();

commit;
