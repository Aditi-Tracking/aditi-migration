-- step 35: fms_assert_lead (the gate every Sales FMS write passes: stage Reason, negotiation time, Close) accepts a lead LABELLED to the caller, not only one the
-- caller entered or one seen through enquiry_view_all. Only for p_tier = 'update'; the 'edit' tier (correct a stage, reopen) still needs enquiry_view_all.
-- Same test as the enquiries SELECT policy: meca_norm(sales_person_accountable) = any(lc_my_label_keys()). One change, one transaction; aborts if its anchor is missing.
begin;

do $do$
declare v text; v2 text;
begin
  select pg_get_functiondef('public.fms_assert_lead(uuid,text)'::regprocedure) into v;
  v2 := replace(v, '(e.entered_by = public.lc_uid() or public.lc_has(''enquiry_view_all''))',
                   '(e.entered_by = public.lc_uid() or public.lc_has(''enquiry_view_all'') or (p_tier = ''update'' and public.meca_norm(e.sales_person_accountable) = any (public.lc_my_label_keys())))');
  if v2 = v then raise exception 'fms_assert_lead: anchor not found'; end if;
  execute v2;
end
$do$;

commit;
