-- Step 26a — restores the execute grant to service_role that the step 26 functions do not carry (the step 25 pair had it). Runs as claude_code_leadcapture.
-- ONE transaction. Grants only: no function, table or policy is changed. meca_target stays closed to authenticated and anon; sales_meca_summary keeps its grant to authenticated.
begin;
grant execute on function public.meca_target(text, text, date, date, date, date, boolean) to service_role;
grant execute on function public.sales_meca_summary(date, date, text, boolean) to service_role;
commit;
