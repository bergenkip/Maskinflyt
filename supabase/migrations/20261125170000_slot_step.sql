-- Start times every 15, 30 or 60 minutes (Li, 2026-11-25: "every 30 min, or 15").
-- Before, times started one booking length apart (07:00, 11:00 for four hours).
-- Now the company picks the step; a booking still lasts slot_minutes, so a
-- picked, unanswered time blocks every start time it overlaps, like a job does.

alter table public.company_pages
  add column slot_step_minutes smallint not null default 30 check (slot_step_minutes in (15, 30, 60));

drop function public.save_company_hours(uuid, boolean, integer, jsonb);

-- Saves the switch, the booking length, the start time step and the whole week at once.
create function public.save_company_hours(org uuid, show_free_times boolean, booking_minutes integer, week jsonb, step_minutes integer default 30)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  day jsonb;
begin
  perform private.require_company_page_editor(org);
  if booking_minutes not in (60, 120, 240, 480) then
    raise exception 'Invalid booking length' using errcode = '22023', hint = 'invalid_length';
  end if;
  if step_minutes is null or step_minutes not in (15, 30, 60) then
    raise exception 'Invalid time step' using errcode = '22023', hint = 'invalid_step';
  end if;
  if jsonb_typeof(coalesce(week, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(week, '[]'::jsonb)) > 7 then
    raise exception 'Invalid hours' using errcode = '22023', hint = 'invalid_hours';
  end if;

  delete from public.company_hours h where h.organization_id = org;
  begin
    for day in select * from jsonb_array_elements(coalesce(week, '[]'::jsonb)) loop
      insert into public.company_hours (organization_id, weekday, opens, closes)
      values (org, (day ->> 'weekday')::smallint, (day ->> 'opens')::time, (day ->> 'closes')::time);
    end loop;
  exception when check_violation or unique_violation or not_null_violation or invalid_datetime_format
    or datetime_field_overflow or invalid_text_representation then
    raise exception 'Invalid hours' using errcode = '22023', hint = 'invalid_hours';
  end;

  -- Free times need at least one open day.
  if show_free_times and not exists (select 1 from public.company_hours h where h.organization_id = org) then
    raise exception 'Open at least one day to show free times' using errcode = '22023', hint = 'no_hours';
  end if;

  update public.company_pages p
  set free_times = show_free_times, slot_minutes = booking_minutes, slot_step_minutes = step_minutes, updated_by = auth.uid(), updated_at = now()
  where p.organization_id = org;
end;
$$;


-- The free times of the next two weeks, for a visitor (see 20261124210000).
create or replace function public.company_free_slots(page_slug text)
returns table (day date, start_time text, starts_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with page as (
    select p.organization_id as org, p.slot_minutes, p.slot_step_minutes, o.timezone as tz
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
           page.org, page.slot_minutes
    from page
    cross join generate_series((now() at time zone page.tz)::date::timestamp, ((now() at time zone page.tz)::date + 13)::timestamp, interval '1 day') d
    join public.company_hours h on h.organization_id = page.org and h.weekday = extract(isodow from d)
    cross join lateral generate_series(
      d::date + h.opens, d::date + h.closes - make_interval(mins => page.slot_minutes), make_interval(mins => page.slot_step_minutes)
    ) t
    where not exists (select 1 from public.company_days_off x where x.organization_id = page.org and x.day = d::date)
  )
  select s.day, to_char(s.start_time, 'HH24:MI'), s.starts_at
  from slots s, capacity c
  where s.starts_at >= now() + interval '2 hours'
    and (
      (select count(*) from public.jobs j
       where j.organization_id = s.org and j.status <> 'cancelled' and j.starts_at < s.ends_at and j.ends_at > s.starts_at)
      + (select count(*) from public.job_requests r
         where r.organization_id = s.org and r.status = 'new'
           and r.wanted_start < s.ends_at and r.wanted_start + make_interval(mins => s.slot_minutes) > s.starts_at)
    ) < c.machines
  order by s.starts_at;
$$;


create or replace function public.company_time_slots(page_slug text)
returns table (day date, start_time text, starts_at timestamptz, free boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with page as (
    select p.organization_id as org, p.slot_minutes, p.slot_step_minutes, o.timezone as tz
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
           page.org, page.slot_minutes
    from page
    cross join generate_series((now() at time zone page.tz)::date::timestamp, ((now() at time zone page.tz)::date + 13)::timestamp, interval '1 day') d
    join public.company_hours h on h.organization_id = page.org and h.weekday = extract(isodow from d)
    cross join lateral generate_series(
      d::date + h.opens, d::date + h.closes - make_interval(mins => page.slot_minutes), make_interval(mins => page.slot_step_minutes)
    ) t
    where not exists (select 1 from public.company_days_off x where x.organization_id = page.org and x.day = d::date)
  )
  select s.day, to_char(s.start_time, 'HH24:MI'), s.starts_at,
    s.starts_at >= now() + interval '2 hours'
    and (
      (select count(*) from public.jobs j
       where j.organization_id = s.org and j.status <> 'cancelled' and j.starts_at < s.ends_at and j.ends_at > s.starts_at)
      + (select count(*) from public.job_requests r
         where r.organization_id = s.org and r.status = 'new'
           and r.wanted_start < s.ends_at and r.wanted_start + make_interval(mins => s.slot_minutes) > s.starts_at)
    ) < c.machines
  from slots s, capacity c
  where s.day >= (now() at time zone (select tz from page))::date
  order by s.starts_at;
$$;


revoke all on function public.save_company_hours(uuid, boolean, integer, jsonb, integer) from public, anon;
grant execute on function public.save_company_hours(uuid, boolean, integer, jsonb, integer) to authenticated;
