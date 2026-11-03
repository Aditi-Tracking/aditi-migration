-- Step 25 — Sales Rep MeCa: the target now follows ANY date range, prorated by calendar days.
-- Runs as claude_code_leadcapture. ONE transaction. Replaces ONE function (meca_target); nothing else is touched. Access control is not touched.
--
-- WHY: until now a rep's target (monthly turnover target, set under Set up > Targets) was returned only for a range that is exactly whole months, or for a
-- month-week block. The new date filter (This Week, Previous Week, This Month to date, Last 3 Months rolling, Custom) is almost never whole months, so every
-- target, "% of target" and colour band would have gone blank. Now:
--
--   target of a range  =  the sum, over every calendar month the range touches, of  that month's target  x  (days of the month inside the range / days in the month)
--
--   * a month the range covers completely contributes its whole target (so whole-month, quarter and year ranges give EXACTLY the answers they gave before)
--   * a partly covered month contributes its share by calendar days (Sundays count: it is the same rule the month-week blocks already used)
--   * a month with no target set contributes nothing, and months_set / months_total say how many of the touched months had one (as before); no month set = no target
--   * 'prorata' in the answer is true when at least one touched month is only partly covered (the screen's note says "prorated")
--   * a breakdown bucket is first clipped to the range asked for (the first and last month of a rolling window are partial), then prorated the same way
--   * the per-day breakdown ('day') still carries no target (a day's share of a month is noise)
-- The answer keeps its shape: { amount, months_set, months_total, prorata }.

begin;

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

commit;
