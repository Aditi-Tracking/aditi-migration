-- step 29b: remove the user's own end-to-end test lead (a Discovery with no demo, no enquiry): soft delete, exactly the effect of delete_field_sales_leads.
-- Guarded: it acts only if the lead has NO enquiry, ONE visit, and is still undeleted. Runs as claude_code_leadcapture.
begin;
do $do$
declare v_lead uuid := '5b45e080-d95a-43ea-9e08-1fa3905613fb'; v_by uuid; v_n integer;
begin
  select l.created_by into v_by from public.field_sales_leads l
   where l.id = v_lead and l.deleted_at is null and l.enquiry_id is null
     and (select count(*) from public.field_sales_visits x where x.lead_id = l.id) = 1;
  if v_by is null then
    raise notice 'step 29b: lead % not found in the expected state - nothing deleted', v_lead;
    return;
  end if;
  update public.field_sales_visits set deleted_at = now(), deleted_by = v_by where lead_id = v_lead and deleted_at is null;
  get diagnostics v_n = row_count;
  update public.field_sales_leads set deleted_at = now(), deleted_by = v_by where id = v_lead and deleted_at is null;
  raise notice 'step 29b: lead % soft-deleted with % visit(s)', v_lead, v_n;
end $do$;
commit;
