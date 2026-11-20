-- step 32: a new Lead Capture tier 'lc_sales_enquiry' = Enquiry Capture Sheet (own leads, view) + own Sales FMS + own MeCa, view only. NO Field Sales Form.
-- Why a new tier: one tier per login. lc_sales_person lost enquiry_view in step 29; lc_sales_field adds the Field Sales Form; lc_admin hands out every write.
-- Same shape as step 28a: the constraint, the two patched functions (lc_caps, set_lead_capture_role). No holders are assigned here — assign people from Access Control
-- (Lead Capture access dropdown: "Sales Person + Enquiry Sheet"), which needs an MIS session. Runs as claude_code_leadcapture. Each patch aborts if its anchor is missing.
begin;

-- 1. the tier is allowed
alter table public.lead_capture_roles drop constraint lead_capture_roles_role_check;
alter table public.lead_capture_roles add constraint lead_capture_roles_role_check
  check (lc_role = any (array['lc_field_sales', 'lc_sales_person', 'lc_sales_field', 'lc_sales_enquiry', 'lc_admin']));

-- 2. what it holds
do $do$
declare v text; v2 text;
begin
  select pg_get_functiondef('public.lc_caps(text)'::regprocedure) into v;
  v2 := replace(v, '    when ''lc_sales_field''  then array[',
    '    when ''lc_sales_enquiry'' then array[''enquiry_view'', ''sales_fms_view'', ''sales_meca_view'']' || E'\n' ||
    '    when ''lc_sales_field''  then array[');
  if v2 = v then raise exception 'lc_caps: anchor not found'; end if;
  execute v2;

  select pg_get_functiondef('public.set_lead_capture_role(text,text)'::regprocedure) into v;
  v2 := replace(v, 'v_new not in (''lc_field_sales'', ''lc_sales_person'', ''lc_sales_field'', ''lc_admin'')', 'v_new not in (''lc_field_sales'', ''lc_sales_person'', ''lc_sales_field'', ''lc_sales_enquiry'', ''lc_admin'')');
  if v2 = v then raise exception 'set_lead_capture_role: anchor not found'; end if;
  execute v2;
end
$do$;

commit;
