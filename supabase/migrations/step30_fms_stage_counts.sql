-- step 30: sales_fms_summary gets the per-stage counts of OPEN leads (the Sales FMS tile strip: In pipeline, then First Call / Demo / Quotation / Negotiation / Closure).
-- Same function, same security (a view-following invoker function: each caller counts only the leads they may see); every existing key is unchanged
-- (total, overdue, not_scheduled, on_track, won, lost, and all of 'stages'), so nothing that reads the old result can break.
-- New keys inside 'counts': open (leads with no closure) and stage_first_call / stage_demo / stage_quotation / stage_negotiation / stage_closure, using the
-- view's own current_stage (the stage after the latest stamped one) - the same value the table's Current stage column and filter use. They add up to 'open'.
-- Exact-text patch of the LIVE definition; aborts if the anchor is missing. Runs as claude_code_leadcapture.
begin;
do $do$
declare v text; v2 text;
begin
  select pg_get_functiondef('public.sales_fms_summary()'::regprocedure) into v;
  v2 := replace(v, $a$'total', count(*),$a$,
    $a$'total', count(*),
                 'open', count(*) filter (where v.outcome is null),
                 'stage_first_call', count(*) filter (where v.outcome is null and v.current_stage = 'first_call'),
                 'stage_demo', count(*) filter (where v.outcome is null and v.current_stage = 'demo'),
                 'stage_quotation', count(*) filter (where v.outcome is null and v.current_stage = 'quotation'),
                 'stage_negotiation', count(*) filter (where v.outcome is null and v.current_stage = 'negotiation'),
                 'stage_closure', count(*) filter (where v.outcome is null and v.current_stage = 'closure'),$a$);
  if v2 = v then raise exception 'sales_fms_summary: anchor not found'; end if;
  execute v2;
end $do$;
commit;
