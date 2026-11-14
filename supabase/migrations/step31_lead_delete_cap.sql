-- step 31: a Field Sales rep can delete a lead THEY created (a mistaken entry), at any time, even when it is already in Sales FMS with stage data.
-- A new, narrow capability 'field_sales_lead_delete' (Field Sales and Sales Person + Field Sales tiers) instead of handing out field_sales_form_delete +
-- enquiry_delete_sent: those two also gate the Sheet's delete of sent rows and the legacy Field Sales entries delete, so granting them to reps would widen
-- more than "my own lead". The Admin tier is untouched (it keeps both old capabilities and view_all, so it still deletes anyone's lead).
-- delete_field_sales_leads keeps its ownership rule (created_by = the caller, or field_sales_form_view_all) and its effect (the lead + its visits + the
-- enquiry it created are soft-deleted; an adopted Sheet enquiry stays). Two checks accept the new capability, and one addition: a SCOT contact that had
-- been converted into a deleted enquiry is released (converted_enquiry_id cleared) so it can be adopted again.
-- Exact-text patches of the LIVE definitions; each aborts if its anchor is missing. Runs as claude_code_leadcapture.
begin;

do $do$
declare v text; v2 text;
begin
  select pg_get_functiondef('public.lc_caps(text)'::regprocedure) into v;
  v2 := replace(v, $a$when 'lc_sales_field'  then array['enquiry_view', 'field_sales_form_view', 'field_sales_form_create', 'sales_fms_view', 'sales_meca_view']$a$,
                   $a$when 'lc_sales_field'  then array['enquiry_view', 'field_sales_form_view', 'field_sales_form_create', 'field_sales_lead_delete', 'sales_fms_view', 'sales_meca_view']$a$);
  if v2 = v then raise exception 'lc_caps: lc_sales_field anchor not found'; end if;
  v := v2;
  v2 := replace(v, $a$when 'lc_field_sales'  then array['field_sales_form_view', 'field_sales_form_create', 'sales_fms_view', 'sales_meca_view']$a$,
                   $a$when 'lc_field_sales'  then array['field_sales_form_view', 'field_sales_form_create', 'field_sales_lead_delete', 'sales_fms_view', 'sales_meca_view']$a$);
  if v2 = v then raise exception 'lc_caps: lc_field_sales anchor not found'; end if;
  execute v2;

  select pg_get_functiondef('public.delete_field_sales_leads(uuid[])'::regprocedure) into v;
  v2 := replace(v, $a$not public.lc_has('field_sales_form_delete') then raise exception 'Not authorised to delete Field Sales leads'$a$,
                   $a$not (public.lc_has('field_sales_form_delete') or public.lc_has('field_sales_lead_delete')) then raise exception 'Not authorised to delete Field Sales leads'$a$);
  if v2 = v then raise exception 'delete_field_sales_leads: gate anchor not found'; end if;
  v := v2;
  v2 := replace(v, $a$v_can_sent := public.lc_has('enquiry_delete_sent');$a$,
                   $a$v_can_sent := public.lc_has('enquiry_delete_sent') or public.lc_has('field_sales_lead_delete');   -- the lead's own creator may delete it even once it is in Sales FMS$a$);
  if v2 = v then raise exception 'delete_field_sales_leads: sent anchor not found'; end if;
  v := v2;
  v2 := replace(v, $a$get diagnostics v_enqs = row_count;$a$,
                   $a$get diagnostics v_enqs = row_count;
    -- an adopted SCOT contact was linked to the enquiry just deleted: release it so it can be adopted again
    update public.scot_clients s set converted_enquiry_id = null where s.converted_enquiry_id = any (v_enq) and s.deleted_at is null;$a$);
  if v2 = v then raise exception 'delete_field_sales_leads: enquiry anchor not found'; end if;
  execute v2;
end $do$;

commit;
