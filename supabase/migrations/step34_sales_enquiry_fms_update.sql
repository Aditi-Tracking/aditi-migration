-- step 34: the 'lc_sales_enquiry' tier may work its OWN Sales FMS leads: pick a stage Reason, enter the negotiation time, Close Won / Lost (sales_fms_update).
-- "Own" is decided by the database as before: sales_fms_update acts only on leads the caller can already see, and this tier sees only the enquiries
-- labelled to it (enquiries_select). Reopen and stage corrections stay Admin-only (sales_fms_edit is NOT granted). One change, one transaction;
-- the patch aborts if its anchor is missing. The screen needs no change: it draws the Reason cells and Close button from sales_fms_update.
begin;

do $do$
declare v text; v2 text;
begin
  select pg_get_functiondef('public.lc_caps(text)'::regprocedure) into v;
  v2 := replace(v, 'when ''lc_sales_enquiry'' then array[''enquiry_view'', ''enquiry_update_assigned'', ''sales_fms_view'', ''sales_meca_view'']',
                   'when ''lc_sales_enquiry'' then array[''enquiry_view'', ''enquiry_update_assigned'', ''sales_fms_view'', ''sales_fms_update'', ''sales_meca_view'']');
  if v2 = v then raise exception 'lc_caps: anchor not found'; end if;
  execute v2;
end
$do$;

commit;
