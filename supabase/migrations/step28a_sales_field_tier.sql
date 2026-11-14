-- step 28a: a new Lead Capture tier 'lc_sales_field' = everything 'lc_sales_person' has + the Field Sales Form (view + create), and its first three holders.
-- Why a new tier: one tier per login. Moving a sales person to lc_field_sales would drop enquiry_view (the Enquiry Sheet and the row policy that shows them their own
-- labelled enquiries); lc_admin would hand out every write. Runs as claude_code_leadcapture.
begin;

-- 1. the tier is allowed
alter table public.lead_capture_roles drop constraint lead_capture_roles_role_check;
alter table public.lead_capture_roles add constraint lead_capture_roles_role_check
  check (lc_role = any (array['lc_field_sales', 'lc_sales_person', 'lc_sales_field', 'lc_admin']));

-- 2. what it holds (exact-text patches of the LIVE definitions; each aborts if its anchor is missing)
do $do$
declare v text; v2 text;
begin
  select pg_get_functiondef('public.lc_caps(text)'::regprocedure) into v;
  v2 := replace(v, '    when ''lc_field_sales''  then array[',
    '    when ''lc_sales_field''  then array[''enquiry_view'', ''field_sales_form_view'', ''field_sales_form_create'', ''sales_fms_view'', ''sales_meca_view'']' || E'\n' ||
    '    when ''lc_field_sales''  then array[');
  if v2 = v then raise exception 'lc_caps: anchor not found'; end if;
  execute v2;

  select pg_get_functiondef('public.set_lead_capture_role(text,text)'::regprocedure) into v;
  v2 := replace(v, 'v_new not in (''lc_field_sales'', ''lc_sales_person'', ''lc_admin'')', 'v_new not in (''lc_field_sales'', ''lc_sales_person'', ''lc_sales_field'', ''lc_admin'')');
  if v2 = v then raise exception 'set_lead_capture_role: anchor not found'; end if;
  execute v2;
end
$do$;

-- 3. the holders: Ronak and Vishwas (sales-person tier today), Suhas (no tier today). Pooja is already Admin (has create); Vignesh owns no enquiry yet and is NOT assigned.
--    Same effect as set_lead_capture_role (which needs an MIS session): the role row and its history row, attributed to the approver.
with t(email) as (values ('salesmumbai@adititracking.com'), ('salesbanglore@adititracking.com'), ('infogoa@adititracking.com')),
     ok as (select t.email, (select r.lc_role from public.lead_capture_roles r where r.user_email = t.email) as old_role
              from t where exists (select 1 from public."Employee_details" ed where lower(btrim(ed."Email_Id")) = t.email)),
     up as (insert into public.lead_capture_roles (user_email, lc_role, assigned_by_email)
            select email, 'lc_sales_field', 'mis@adititracking.com' from ok
            on conflict (user_email) do update set lc_role = excluded.lc_role, assigned_at = now(), assigned_by_email = excluded.assigned_by_email
            returning user_email)
insert into public.lead_capture_roles_log (user_email, old_role, new_role, changed_by_email)
select ok.email, ok.old_role, 'lc_sales_field', 'mis@adititracking.com' from ok join up on up.user_email = ok.email;

commit;
