-- The request form's calendar shows every bookable time of the next two weeks,
-- free and taken (Li, 2026-11-25: "clear which times are open and closed").
-- Same hours, days off and capacity as company_free_slots, which still decides
-- what can be sent; this one only adds the taken times, marked free = false.
-- Nothing about the jobs themselves is shown: only that the time is taken.
create function public.company_time_slots(page_slug text)
returns table (day date, start_time text, starts_at timestamptz, free boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with page as (
    select p.organization_id as org, p.slot_minutes, o.timezone as tz
    from public.company_pages p
    join public.organizations o on o.id = p.organization_id
    where p.slug = lower(page_slug)
      and p.free_times
      and ((p.published and not private.is_read_only(p.organization_id)) or private.is_member(p.organization_id))
  ),
  capacity as (
    select greatest(1, count(*))::integer as machines
    from public.vehicles v, page
    where v.organization_id = page.org and v.active
  ),
  slots as (
    select d::date as day, t::time as start_time,
           ((d::date + t::time) at time zone page.tz) as starts_at,
           ((d::date + t::time) at time zone page.tz) + make_interval(mins => page.slot_minutes) as ends_at,
           page.org
    from page
    cross join generate_series((now() at time zone page.tz)::date::timestamp, ((now() at time zone page.tz)::date + 13)::timestamp, interval '1 day') d
    join public.company_hours h on h.organization_id = page.org and h.weekday = extract(isodow from d)
    cross join lateral generate_series(
      d::date + h.opens, d::date + h.closes - make_interval(mins => page.slot_minutes), make_interval(mins => page.slot_minutes)
    ) t
    where not exists (select 1 from public.company_days_off x where x.organization_id = page.org and x.day = d::date)
  )
  select s.day, to_char(s.start_time, 'HH24:MI'), s.starts_at,
    s.starts_at >= now() + interval '2 hours'
    and (
      (select count(*) from public.jobs j
       where j.organization_id = s.org and j.status <> 'cancelled' and j.starts_at < s.ends_at and j.ends_at > s.starts_at)
      + (select count(*) from public.job_requests r
         where r.organization_id = s.org and r.status = 'new' and r.wanted_start = s.starts_at)
    ) < c.machines
  from slots s, capacity c
  where s.day >= (now() at time zone (select tz from page))::date
  order by s.starts_at;
$$;

revoke all on function public.company_time_slots(text) from public;
grant execute on function public.company_time_slots(text) to anon, authenticated;
