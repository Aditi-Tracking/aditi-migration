-- ROLLBACK of step 26: puts meca_target (six arguments) and sales_meca_summary (three arguments) back EXACTLY as they were after step 25, and drops the versions
-- with the p_prorate parameter. Runs as claude_code_leadcapture, ONE transaction. Safe at any time: it stores nothing. A web app that already sends
-- p_prorate = false (the date filter's This Month / Custom) would then get "function not found" from the database, so roll the web app back first.
begin;

-- ==== the old versions, as after step 25 ====
create or replace function public.meca_target(p_rep text, p_kind text, p_start date, p_end date, p_from date, p_to date)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  s date; e date;
  v_amount numeric; v_set int; v_tot int; v_partial boolean;
begin
  if p_rep is null or p_kind = 'day' then return null; end if;
  if p_kind = 'none' then
    s := p_from; e := p_to;
  else
    s := greatest(p_start, p_from); e := least(p_end, p_to);
  end if;
  if s is null or e is null or s > e then return null; end if;

  select count(*)::int,
         count(t.target_amount)::int,
         sum(t.target_amount * ((least(e, m.m1 - 1) - greatest(s, m.m0)) + 1) / (m.m1 - m.m0)),
         bool_or(not (s <= m.m0 and e >= m.m1 - 1))
    into v_tot, v_set, v_amount, v_partial
    from (select d::date as m0, (d::date + interval '1 month')::date as m1
            from generate_series(date_trunc('month', s::timestamp), date_trunc('month', e::timestamp), interval '1 month') d) m
    left join public.sales_rep_targets t on t.rep_email = p_rep and t.month = m.m0;

  if v_set = 0 then return null; end if;
  return jsonb_build_object('amount', round(v_amount, 2), 'months_set', v_set, 'months_total', v_tot, 'prorata', v_partial);
end;
$function$;
revoke all on function public.meca_target(text, text, date, date, date, date) from public, anon, authenticated;

create or replace function public.sales_meca_summary(p_from date, p_to date, p_bucket text DEFAULT 'none'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_all  boolean;
  v_me   text;
  v_rows jsonb;
  v_warn jsonb;
  v_linked boolean;
begin
  select s.is_all, s.my_email into v_all, v_me from public.meca_scope() s;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Choose a valid date range' using errcode = '22023';
  end if;
  if p_to - p_from > 1830 then
    raise exception 'The range is too long (limit about 5 years)' using errcode = '22023';
  end if;
  if p_bucket is null or p_bucket not in ('none', 'day', 'mweek', 'month', 'quarter', 'year') then
    raise exception 'Unknown bucket "%"', coalesce(p_bucket, '') using errcode = '22023';
  end if;

  with ev as (select * from public.meca_events(p_from, p_to)),
  scoped as (select * from ev where v_all or ev.rep_email = v_me),
  agg as (
    select s.rep_email,
           case when s.rep_email is null then public.meca_norm(s.rep_label) end as label_key,
           min(s.rep_label) filter (where s.rep_email is null) as rep_label,
           public.meca_bucket(s.event_date, p_bucket) as b,
           count(*) filter (where s.kind = 'meeting') as meetings,
           count(*) filter (where s.kind = 'client')  as clients,
           coalesce(sum(s.amount) filter (where s.kind = 'client'), 0) as turnover,
           count(s.amount) filter (where s.kind = 'client') as amount_n
      from scoped s
     group by 1, 2, 4
  ),
  reps as (
    select distinct r.rep_email
      from (select a.rep_email from public.sales_rep_aliases a
            union select nullif(lower(btrim(f.entered_by_email)), '') from public.field_sales_entries f where f.deleted_at is null
            union select t.rep_email from public.sales_rep_targets t
            union select g.rep_email from agg g where g.rep_email is not null
            union select v_me where not v_all) r
     where r.rep_email is not null and (v_all or r.rep_email = v_me)
  ),
  buckets as (
    select distinct public.meca_bucket(d::date, p_bucket) as b
      from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g(d)
  ),
  grid as (
    select r.rep_email, public.meca_rep_name(r.rep_email) as rep_name, null::text as rep_label, b.b as bucket_start,
           coalesce(a.meetings, 0) as meetings, coalesce(a.clients, 0) as clients,
           coalesce(a.turnover, 0) as turnover, coalesce(a.amount_n, 0) as amount_n
      from reps r cross join buckets b
      left join agg a on a.rep_email = r.rep_email and a.b is not distinct from b.b
    union all
    select null, case when a.label_key = '' then 'Unassigned' else 'Unmapped: ' || a.rep_label end, a.rep_label, a.b,
           a.meetings, a.clients, a.turnover, a.amount_n
      from agg a where a.rep_email is null and v_all
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'rep_email', g.rep_email, 'rep_name', g.rep_name, 'rep_label', g.rep_label,
           'bucket_start', g.bucket_start, 'bucket_end', public.meca_bucket_end(g.bucket_start, p_bucket),
           'meetings', g.meetings, 'clients', g.clients, 'turnover', g.turnover, 'amount_n', g.amount_n,
           'target', public.meca_target(g.rep_email, p_bucket, g.bucket_start, public.meca_bucket_end(g.bucket_start, p_bucket), p_from, p_to))
         order by (g.rep_email is null), g.rep_name, g.bucket_start), '[]'::jsonb)
    into v_rows
    from grid g;

  with ev as (select * from public.meca_events(p_from, p_to)),
  scoped as (select * from ev where v_all or ev.rep_email = v_me)
  select jsonb_build_object(
           'clients_without_amount', (select count(*) from scoped s where s.kind = 'client' and s.amount is null),
           'unmapped_events',   case when v_all then (select count(*) from ev where ev.rep_email is null and public.meca_norm(ev.rep_label) <> '') else 0 end,
           'unassigned_events', case when v_all then (select count(*) from ev where ev.rep_email is null and public.meca_norm(ev.rep_label) = '') else 0 end,
           'won_without_closing_date', case when v_all then
              (select count(*) from public.enquiries e
                where e.status = 'won' and e.sent_to_fms_at is not null and e.deleted_at is null
                  and not exists (select 1 from public.sales_fms_closures c where c.enquiry_id = e.id and c.outcome = 'won')) else 0 end)
    into v_warn;

  v_linked := exists (select 1 from public.sales_rep_aliases a where a.rep_email = v_me)
           or exists (select 1 from public.field_sales_entries f where lower(btrim(f.entered_by_email)) = v_me and f.deleted_at is null);

  return jsonb_build_object(
           'me', jsonb_build_object('email', v_me, 'name', public.meca_rep_name(v_me), 'is_all', v_all, 'linked', v_linked),
           'from', p_from, 'to', p_to, 'bucket', p_bucket,
           'rows', v_rows, 'warnings', v_warn);
end;
$function$;
revoke all on function public.sales_meca_summary(date, date, text) from public, anon;
grant execute on function public.sales_meca_summary(date, date, text) to authenticated;

-- ==== the step 26 versions ====
drop function public.sales_meca_summary(date, date, text, boolean);
drop function public.meca_target(text, text, date, date, date, date, boolean);

commit;
