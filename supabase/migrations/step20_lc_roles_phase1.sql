-- Step 20 (PHASE 1 of the Lead Capture permission rebuild) — ADDITIVE: it creates the new single-value access model and seeds four Admin rows.
-- NOTHING that exists today is changed or read by anything yet: no existing function, policy, table or view is touched, so every Lead Capture screen and
-- every check behaves exactly as before. Phase 3 (a later step, shown separately) moves the existing gates onto lc_has().
-- Runs as claude_code_leadcapture (it creates and owns everything below). One transaction.
--
-- THE MODEL
--   lead_capture_roles   one row per person who has Lead Capture access: lower-cased e-mail (PRIMARY KEY, so nobody can hold two tiers) and ONE tier:
--                          lc_field_sales   Field Sales Form (submit + own entries); own Sales FMS pipeline and MeCa numbers, view only
--                          lc_sales_person  Enquiry Capture Sheet view-only (own entered / assigned leads); own Sales FMS and MeCa, view only
--                          lc_admin         every tab, every write
--                        No row = no Lead Capture access. The names carry the lc_ prefix so they can never be confused with the portal's own roles
--                        (owner / mis / admin / employee / …), which this table does not read, replace or depend on.
--   lead_capture_roles_log   append-only history of every assignment (who, to whom, from which tier to which, when)
--   lc_caps(tier)        THE ONE PLACE the tiers are defined: the list of capabilities a tier holds, written with the same key names the existing gates use
--   lc_tier()            the caller's tier (one primary-key lookup; null when none)
--   lc_has(key)          does the caller's tier hold this capability — the single resolver every gate will call (an unknown key is always false)
--   lc_my_access()       {tier, permissions} for the screen, derived from lc_caps — the front end never carries its own copy of the mapping
--   lead_capture_roles_list() / set_lead_capture_role() / lead_capture_roles_history()   the Access Control picker — MIS only, like Access Control today
-- Direct table access is closed to every API role: reads and writes go through the functions above, which check who is asking.

begin;

-- 20a. the capabilities of each tier (IMMUTABLE: a constant per tier; the only definition of what a tier can do) ----------------------------------
create or replace function public.lc_caps(p_tier text)
 returns text[]
 language sql
 immutable
 set search_path to ''
as $function$
  select case p_tier
    when 'lc_admin' then array[
      'enquiry_view', 'enquiry_create', 'enquiry_view_all', 'enquiry_assign_fms', 'enquiry_manage_dropdowns', 'enquiry_delete', 'enquiry_delete_sent',
      'field_sales_form_view', 'field_sales_form_create', 'field_sales_form_view_all', 'field_sales_form_delete', 'field_sales_form_manage_dropdowns',
      'sales_fms_view', 'sales_fms_update', 'sales_fms_edit',
      'sales_meca_view', 'sales_meca_view_all', 'sales_meca_manage',
      'scot_view', 'scot_create', 'scot_update', 'scot_view_all', 'scot_manage_dropdowns']
    when 'lc_sales_person' then array['enquiry_view', 'sales_fms_view', 'sales_meca_view']
    when 'lc_field_sales'  then array['field_sales_form_view', 'field_sales_form_create', 'sales_fms_view', 'sales_meca_view']
    else array[]::text[]
  end
$function$;

-- 20b. the tables ----------------------------------------------------------------------------------------------------------------------------
create table public.lead_capture_roles (
  user_email        text primary key,
  lc_role           text not null,
  assigned_at       timestamptz not null default now(),
  assigned_by_email text not null,
  constraint lead_capture_roles_email_check check (user_email = lower(btrim(user_email)) and position('@' in user_email) > 1),
  constraint lead_capture_roles_role_check  check (lc_role in ('lc_field_sales', 'lc_sales_person', 'lc_admin'))
);

create table public.lead_capture_roles_log (
  id                bigint generated always as identity primary key,
  user_email        text not null,
  old_role          text,
  new_role          text,
  changed_by_email  text not null,
  changed_at        timestamptz not null default now()
);
create index lead_capture_roles_log_user_idx on public.lead_capture_roles_log (user_email, changed_at desc);

-- closed to every API role: no policy, no grant (the functions below run with the owner's rights and decide who may do what)
alter table public.lead_capture_roles     enable row level security;
alter table public.lead_capture_roles_log enable row level security;

-- 20c. the resolver ---------------------------------------------------------------------------------------------------------------------------
create or replace function public.lc_tier()
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select r.lc_role from public.lead_capture_roles r where r.user_email = lower(btrim(coalesce(public.lc_jwt() ->> 'email', '')))
$function$;

create or replace function public.lc_has(p_key text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((select p_key = any (public.lc_caps(r.lc_role)) from public.lead_capture_roles r
                     where r.user_email = lower(btrim(coalesce(public.lc_jwt() ->> 'email', '')))), false)
$function$;

create or replace function public.lc_my_access()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
           'tier', t.tier,
           'permissions', coalesce((select jsonb_object_agg(k, 'true') from unnest(public.lc_caps(t.tier)) k), '{}'::jsonb))
    from (select public.lc_tier() as tier) t
$function$;

-- 20d. the Access Control picker (MIS only — the same rule as the Access Control panel and its Flask endpoint) -------------------------------------
create or replace function public.lc_assert_mis()
 returns text
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_email text := lower(btrim(coalesce(public.lc_jwt() ->> 'email', '')));
begin
  if public.lc_uid() is null or v_email = ''
     or not exists (select 1 from public."Employee_details" ed where lower(btrim(ed."Email_Id")) = v_email and lower(btrim(ed."Employee_Dept")) = 'mis') then
    raise exception 'Only MIS can change Lead Capture access' using errcode = '42501';
  end if;
  return v_email;
end;
$function$;

-- everyone in the employee directory with their current tier, who set it and when, and the Sales Person name their login is linked to (the Sheet
-- shows a Sales Person tier user only the leads that name resolves to — an unlinked login would see none)
create or replace function public.lead_capture_roles_list()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  perform public.lc_assert_mis();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'email', e.email, 'name', e.name, 'dept', e.dept, 'tier', r.lc_role, 'assigned_by', r.assigned_by_email, 'assigned_at', r.assigned_at,
             'linked_sales_person', (select string_agg(a.label, ', ' order by a.label) from public.sales_rep_aliases a where lower(btrim(a.rep_email)) = e.email))
           order by lower(e.name), e.email)
      from (select distinct on (lower(btrim(ed."Email_Id"))) lower(btrim(ed."Email_Id")) as email, ed."Employee_name" as name, ed."Employee_Dept" as dept
              from public."Employee_details" ed
             where coalesce(btrim(ed."Email_Id"), '') <> ''
             order by lower(btrim(ed."Email_Id")), ed."Emp_id") e
      left join public.lead_capture_roles r on r.user_email = e.email
  ), '[]'::jsonb);
end;
$function$;

-- set one person's tier ('lc_field_sales' | 'lc_sales_person' | 'lc_admin'), or remove their access (null, '' or 'none'). A change is recorded; a call that
-- changes nothing is a no-op and records nothing. The person must be in the employee directory (a typo can never create a stray grant).
create or replace function public.set_lead_capture_role(p_email text, p_role text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_by    text := public.lc_assert_mis();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_new   text := case when p_role is null or btrim(p_role) in ('', 'none') then null else btrim(p_role) end;
  v_old   text;
begin
  if v_email = '' or not exists (select 1 from public."Employee_details" ed where lower(btrim(ed."Email_Id")) = v_email) then
    raise exception 'No employee with that e-mail address' using errcode = '22023';
  end if;
  if v_new is not null and v_new not in ('lc_field_sales', 'lc_sales_person', 'lc_admin') then
    raise exception '"%" is not a Lead Capture tier', v_new using errcode = '22023';
  end if;
  select r.lc_role into v_old from public.lead_capture_roles r where r.user_email = v_email for update;
  if v_old is not distinct from v_new then
    return jsonb_build_object('email', v_email, 'old', v_old, 'new', v_new, 'changed', false);
  end if;
  if v_new is null then
    delete from public.lead_capture_roles where user_email = v_email;
  else
    insert into public.lead_capture_roles (user_email, lc_role, assigned_by_email) values (v_email, v_new, v_by)
    on conflict (user_email) do update set lc_role = excluded.lc_role, assigned_at = now(), assigned_by_email = excluded.assigned_by_email;
  end if;
  insert into public.lead_capture_roles_log (user_email, old_role, new_role, changed_by_email) values (v_email, v_old, v_new, v_by);
  return jsonb_build_object('email', v_email, 'old', v_old, 'new', v_new, 'changed', true);
end;
$function$;

-- the assignment history, newest first (one person's, or everyone's)
create or replace function public.lead_capture_roles_history(p_email text default null, p_limit integer default 100)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  perform public.lc_assert_mis();
  return coalesce((
    select jsonb_agg(jsonb_build_object('email', l.user_email, 'old', l.old_role, 'new', l.new_role, 'by', l.changed_by_email, 'at', l.changed_at) order by l.changed_at desc, l.id desc)
      from (select * from public.lead_capture_roles_log
             where p_email is null or user_email = lower(btrim(p_email))
             order by changed_at desc, id desc limit least(greatest(coalesce(p_limit, 100), 1), 1000)) l
  ), '[]'::jsonb);
end;
$function$;

-- 20e. who may call what ----------------------------------------------------------------------------------------------------------------------
revoke all on function public.lc_caps(text), public.lc_assert_mis() from public, anon, authenticated;
revoke all on function public.lc_tier(), public.lc_has(text), public.lc_my_access(), public.lead_capture_roles_list(), public.set_lead_capture_role(text, text),
                       public.lead_capture_roles_history(text, integer) from public, anon;
-- lc_tier / lc_has are called BY the row-level-security policies as the signed-in user, so that user needs EXECUTE on them (as with enquiry_has_perm)
grant execute on function public.lc_tier(), public.lc_has(text), public.lc_my_access(), public.lead_capture_roles_list(), public.set_lead_capture_role(text, text),
                          public.lead_capture_roles_history(text, integer) to authenticated;

-- 20f. the four people who hold Lead Capture access today become Admin (they already hold the equivalent of every key). Nobody else is seeded: all other
--      access is given from the Access Control picker. The statement refuses to run unless ALL FOUR are found in the employee directory.
do $seed$
declare
  v_n integer;
begin
  insert into public.lead_capture_roles (user_email, lc_role, assigned_by_email)
  select distinct on (lower(btrim(ed."Email_Id"))) lower(btrim(ed."Email_Id")), 'lc_admin', 'migration (step 20)'
    from public."Employee_details" ed
   where lower(btrim(ed."Email_Id")) in ('chirag@adititracking.com', 'mis@adititracking.com', 'mis1@adititracking.com', 'info@adititracking.com')
   order by lower(btrim(ed."Email_Id")), ed."Emp_id";
  get diagnostics v_n = row_count;
  if v_n <> 4 then
    raise exception 'Expected to seed 4 Admin rows but found % of the 4 employees — nothing was changed', v_n;
  end if;
  insert into public.lead_capture_roles_log (user_email, old_role, new_role, changed_by_email)
  select user_email, null, lc_role, assigned_by_email from public.lead_capture_roles;
end
$seed$;

commit;
