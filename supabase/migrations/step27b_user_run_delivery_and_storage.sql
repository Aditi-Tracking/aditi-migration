-- step 27b: USER-RUN (SQL editor, as postgres). Outside the Lead Capture allowlist: pg_cron, vault, storage.
-- Nothing here is run by Claude. Do it after step 27 and after deploying the send-pending-followup-alert Edge Function.

-- (1) secrets: RESEND_API_KEY already exists for the birthday function. Add FS_ALERT_SECRET to the function's secrets (same random string as below):
--       supabase secrets set FS_ALERT_SECRET=<random string>      and deploy:  supabase functions deploy send-pending-followup-alert --no-verify-jwt
select vault.create_secret('<the same random string>', 'fs_alert_secret');
-- select vault.create_secret('<service role key>', 'service_role_key');   -- only if the project has no such vault secret yet

-- (2) every 5 minutes
select cron.schedule('field-sales-alerts', '*/5 * * * *', $cron$
  select net.http_post(
    url     := 'https://rramdtpabwjsndgkohbi.supabase.co/functions/v1/send-pending-followup-alert',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fs_alert_secret')),
    body    := '{}'::jsonb)
$cron$);

-- (3) private bucket for the visit photo / location screenshot; files live under "<auth uid>/..."
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('field-sales-visits', 'field-sales-visits', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;
create policy fs_visits_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'field-sales-visits' and (storage.foldername(name))[1] = auth.uid()::text and public.lc_has('field_sales_form_create'));
create policy fs_visits_read on storage.objects for select to authenticated
  using (bucket_id = 'field-sales-visits' and ((storage.foldername(name))[1] = auth.uid()::text or public.lc_has('field_sales_form_view_all')));

-- (4) LATER, when the new form has replaced the old one: freeze the legacy form so no new rows land in field_sales_entries
-- drop policy field_sales_entries_insert on public.field_sales_entries;
