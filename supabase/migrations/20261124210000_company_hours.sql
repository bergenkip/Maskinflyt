-- Stage 15c: the company "opens times". Working hours per weekday, days off,
-- and how long one booking is. When the company switches it on, the request
-- form on its public page shows the free times and the customer picks one.
-- A picked time is still only a wish: the office accepts or declines it.
-- Switched off, customers send requests with a wished-for day, as before.

-- free_times: null until the company decides (the overview recommends it), then on or off.
alter table public.company_pages
  add column free_times boolean,
  add column slot_minutes smallint not null default 120 check (slot_minutes in (60, 120, 240, 480));

create table public.company_hours (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- ISO weekday: 1 Monday … 7 Sunday. A weekday without a row is closed.
  weekday smallint not null check (weekday between 1 and 7),
  opens time not null,
  closes time not null,
  primary key (organization_id, weekday),
  check (closes > opens)
);

create table public.company_days_off (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  day date not null,
  note text check (char_length(note) between 1 and 100),
  primary key (organization_id, day)
);

comment on table public.company_hours is 'Opening hours per weekday, for the free times on the company page. Written by save_company_hours.';
comment on table public.company_days_off is 'Days the company is closed (holidays, fellesferie). Written by add/remove_company_day_off.';

alter table public.company_hours enable row level security;
alter table public.company_days_off enable row level security;
revoke all on public.company_hours, public.company_days_off from anon, authenticated;
grant select on public.company_hours, public.company_days_off to authenticated;

create policy "Members can read the opening hours"
  on public.company_hours for select to authenticated
  using ((select private.is_member(organization_id)));
create policy "Members can read the days off"
  on public.company_days_off for select to authenticated
  using ((select private.is_member(organization_id)));

create trigger company_hours_read_only
  before insert or update or delete on public.company_hours
  for each row execute function private.guard_read_only();
create trigger company_days_off_read_only
  before insert or update or delete on public.company_days_off
  for each row execute function private.guard_read_only();

-- The time a customer picked, when the company shows free times.
alter table public.job_requests add column wanted_start timestamptz;

-- Owners and admins, with the second step, on a company that has a page.
create function private.require_company_page_editor(org uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.has_role(org, array['owner', 'admin']::public.member_role[]) then
    raise exception 'Only owners and admins change the company page' using errcode = '42501', hint = 'not_allowed';
  end if;
  perform private.require_mfa();
  if not exists (select 1 from public.company_pages p where p.organization_id = org) then
    raise exception 'Create the company page first' using errcode = 'P0002', hint = 'no_page';
  end if;
end;
$$;

-- Saves the switch, the booking length and the whole week at once.
-- week: [{"weekday": 1, "opens": "07:00", "closes": "15:00"}, …]; a weekday left out is closed.
create function public.save_company_hours(org uuid, show_free_times boolean, booking_minutes integer, week jsonb)
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
  set free_times = show_free_times, slot_minutes = booking_minutes, updated_by = auth.uid(), updated_at = now()
  where p.organization_id = org;
end;
$$;

create function public.add_company_day_off(org uuid, off_day date, off_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_note text := nullif(regexp_replace(btrim(coalesce(off_note, '')), '\s+', ' ', 'g'), '');
begin
  perform private.require_company_page_editor(org);
  if off_day is null or off_day < current_date - 1 or off_day > current_date + 730 then
    raise exception 'Invalid date' using errcode = '22023', hint = 'invalid_date';
  end if;
  if clean_note is not null and char_length(clean_note) > 100 then
    raise exception 'Invalid note' using errcode = '22023', hint = 'invalid_note';
  end if;
  insert into public.company_days_off (organization_id, day, note) values (org, off_day, clean_note)
  on conflict (organization_id, day) do update set note = excluded.note;
end;
$$;

create function public.remove_company_day_off(org uuid, off_day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_company_page_editor(org);
  delete from public.company_days_off d where d.organization_id = org and d.day = off_day;
end;
$$;

-- Whether a visitor sees free times on the page, and how long a booking is.
create function public.company_page_booking(page_slug text)
returns table (free_times boolean, slot_minutes integer)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p.free_times, false), p.slot_minutes::integer
  from public.company_pages p
  where p.slug = lower(page_slug)
    and ((p.published and not private.is_read_only(p.organization_id)) or private.is_member(p.organization_id));
$$;

-- The free times of the next two weeks, for a visitor. A time is free when it
-- lies within the opening hours, not on a day off, starts at least two hours
-- from now, and fewer jobs and unanswered picked times overlap it than the
-- company has machines in use. Nothing about the jobs themselves is shown.
create function public.company_free_slots(page_slug text)
returns table (day date, start_time text, starts_at timestamptz)
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
  select s.day, to_char(s.start_time, 'HH24:MI'), s.starts_at
  from slots s, capacity c
  where s.starts_at >= now() + interval '2 hours'
    and (
      (select count(*) from public.jobs j
       where j.organization_id = s.org and j.status <> 'cancelled' and j.starts_at < s.ends_at and j.ends_at > s.starts_at)
      + (select count(*) from public.job_requests r
         where r.organization_id = s.org and r.status = 'new' and r.wanted_start = s.starts_at)
    ) < c.machines
  order by s.starts_at;
$$;

revoke all on function private.require_company_page_editor(uuid) from public;
revoke all on function public.save_company_hours(uuid, boolean, integer, jsonb) from public, anon;
grant execute on function public.save_company_hours(uuid, boolean, integer, jsonb) to authenticated;
revoke all on function public.add_company_day_off(uuid, date, text) from public, anon;
grant execute on function public.add_company_day_off(uuid, date, text) to authenticated;
revoke all on function public.remove_company_day_off(uuid, date) from public, anon;
grant execute on function public.remove_company_day_off(uuid, date) to authenticated;
revoke all on function public.company_page_booking(text) from public;
grant execute on function public.company_page_booking(text) to anon, authenticated;
revoke all on function public.company_free_slots(text) from public;
grant execute on function public.company_free_slots(text) to anon, authenticated;

-- The request form can now carry a picked time (request_wanted_start).
drop function public.submit_job_request(text, text, text, text, text, text, date, text, text);

create function public.submit_job_request(
  page_slug text,
  request_name text,
  request_place text,
  request_description text,
  request_phone text default null,
  request_email text default null,
  request_wanted_date date default null,
  request_service text default null,
  request_locale text default 'nb',
  request_wanted_start timestamptz default null
)
returns table (id uuid, company text, notify_email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  page public.company_pages;
  company_name text;
  clean_name text := nullif(regexp_replace(btrim(coalesce(request_name, '')), '\s+', ' ', 'g'), '');
  clean_place text := nullif(regexp_replace(btrim(coalesce(request_place, '')), '\s+', ' ', 'g'), '');
  clean_description text := nullif(btrim(regexp_replace(coalesce(request_description, ''), '\r\n?', E'\n', 'g')), '');
  clean_phone text := nullif(regexp_replace(coalesce(request_phone, ''), '[\s().-]', '', 'g'), '');
  clean_email text := nullif(lower(btrim(coalesce(request_email, ''))), '');
  new_id uuid;
  wanted_day date := request_wanted_date;
begin
  select p.* into page from public.company_pages p where p.slug = lower(btrim(coalesce(page_slug, '')));
  if not found or not page.published or private.is_read_only(page.organization_id) then
    raise exception 'The page does not take requests' using errcode = 'P0002', hint = 'not_found';
  end if;

  if clean_name is null or char_length(clean_name) > 100 then
    raise exception 'Invalid name' using errcode = '22023', hint = 'invalid_name';
  end if;
  if clean_place is null or char_length(clean_place) > 200 then
    raise exception 'Invalid place' using errcode = '22023', hint = 'invalid_place';
  end if;
  if clean_description is null or char_length(clean_description) > 2000 then
    raise exception 'Invalid description' using errcode = '22023', hint = 'invalid_description';
  end if;
  if clean_phone is not null and clean_phone !~ '^\+?[0-9]{5,15}$' then
    raise exception 'Invalid phone' using errcode = '22023', hint = 'invalid_phone';
  end if;
  if clean_email is not null and (char_length(clean_email) > 254 or clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Invalid e-mail' using errcode = '22023', hint = 'invalid_email';
  end if;
  if clean_phone is null and clean_email is null then
    raise exception 'A phone or e-mail is needed' using errcode = '22023', hint = 'contact_required';
  end if;
  if request_wanted_date is not null and (request_wanted_date < current_date - 1 or request_wanted_date > current_date + 730) then
    raise exception 'Invalid date' using errcode = '22023', hint = 'invalid_date';
  end if;
  if request_service is not null and request_service not in ('crane_truck', 'mobile_crane', 'excavation', 'transport', 'machine_transport', 'snow_clearing', 'demolition', 'landscaping') then
    raise exception 'Invalid service' using errcode = '22023', hint = 'invalid_service';
  end if;

  -- Against floods: at most 20 new requests an hour per company, and 3 an hour
  -- from the same phone or e-mail. One at a time per company, so the count holds.
  perform 1 from public.organizations o where o.id = page.organization_id for update;
  if (select count(*) from public.job_requests r
      where r.organization_id = page.organization_id and r.created_at > now() - interval '1 hour') >= 20
    or (select count(*) from public.job_requests r
      where r.organization_id = page.organization_id and r.created_at > now() - interval '1 hour'
        and (r.phone = clean_phone or r.email = clean_email)) >= 3 then
    raise exception 'Too many requests, try again later' using errcode = '54000', hint = 'too_many';
  end if;

  -- A picked time must still be free (counted under the same lock), and gives the day.
  if request_wanted_start is not null then
    if not exists (select 1 from public.company_free_slots(page.slug) s where s.starts_at = request_wanted_start) then
      raise exception 'The time is no longer free' using errcode = '22023', hint = 'slot_taken';
    end if;
    select (request_wanted_start at time zone o.timezone)::date into wanted_day
    from public.organizations o where o.id = page.organization_id;
  end if;

  insert into public.job_requests (organization_id, name, phone, email, place, wanted_date, wanted_start, service, description, locale)
  values (
    page.organization_id, clean_name, clean_phone, clean_email, clean_place, wanted_day, request_wanted_start, request_service,
    clean_description, case when request_locale in ('nb', 'en', 'lt') then request_locale else 'nb' end
  )
  returning job_requests.id into new_id;

  select o.name into company_name from public.organizations o where o.id = page.organization_id;
  return query select new_id, company_name, page.email;
end;
$$;

revoke all on function public.submit_job_request(text, text, text, text, text, text, date, text, text, timestamptz) from public;
grant execute on function public.submit_job_request(text, text, text, text, text, text, date, text, text, timestamptz) to anon, authenticated;
