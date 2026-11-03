-- ROLLBACK of step 25: restores meca_target exactly as it was (a target only for whole-month ranges and month-week blocks). Runs as claude_code_leadcapture, ONE transaction.
begin;

create or replace function public.meca_target(p_rep text, p_kind text, p_start date, p_end date, p_from date, p_to date)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  m0 date; m1 date;
  v_sum numeric; v_set int; v_tot int; v_target numeric; v_mdays int;
begin
  if p_rep is null or p_kind = 'day' then return null; end if;
  if p_kind = 'none' then
    if p_from <> date_trunc('month', p_from)::date or p_to <> (date_trunc('month', p_to) + interval '1 month - 1 day')::date then return null; end if;
    m0 := p_from; m1 := date_trunc('month', p_to)::date;
  else
    if p_start < p_from or p_end > p_to then return null; end if;
    m0 := date_trunc('month', p_start)::date; m1 := date_trunc('month', p_end)::date;
  end if;
  if p_kind = 'mweek' then
    select t.target_amount into v_target from public.sales_rep_targets t where t.rep_email = p_rep and t.month = m0;
    if v_target is null then return null; end if;
    v_mdays := (m0 + interval '1 month')::date - m0;
    return jsonb_build_object('amount', round(v_target * (p_end - p_start + 1) / v_mdays, 2), 'months_set', 1, 'months_total', 1, 'prorata', true);
  end if;
  select coalesce(sum(t.target_amount), 0), count(*) into v_sum, v_set
    from public.sales_rep_targets t where t.rep_email = p_rep and t.month between m0 and m1;
  if v_set = 0 then return null; end if;
  v_tot := (extract(year from age(m1, m0)) * 12 + extract(month from age(m1, m0)))::int + 1;
  return jsonb_build_object('amount', v_sum, 'months_set', v_set, 'months_total', v_tot, 'prorata', false);
end;
$function$;

commit;
