-- Stage 5, part 2: working time and its approval.
--
-- The driver's presses (part 1) give the working time of a job: from "on the
-- way" (or "arrived", without travel) to "finished", less the breaks. The office
-- approves that time, or corrects it first and says why. Each approval is kept
-- as a new row, never changed, so earlier versions and their reasons stay.
--
-- The price of the time is counted here, in one place, in øre:
--   - the shortest billed time is the machine's minimum (min_billable_minutes);
--   - a machine can have a higher rate from a time of day (e.g. after 15:00):
--     either a surcharge in percent of the job's hourly price, or another
--     hourly price. It applies from that time on the day the work started
--     until the work ends, also past midnight;
--   - breaks are taken from the time at the usual rate first;
--   - the time added to reach the minimum is billed at the usual rate.
-- Rates are taken when the time is approved and kept with it, so later price
-- changes do not touch approved time. Nothing is invoiced or sent from here.
--
-- Who may do what:
--   owner, admin (with the second step), dispatcher: read, approve, correct
--   driver and everyone else:                        nothing (prices are the office's)

alter table public.vehicles
  add column evening_from time check (evening_from = date_trunc('minute', evening_from)),
  add column evening_percent integer check (evening_percent between 1 and 500),
  add column evening_rate integer check (evening_rate >= 0 and evening_rate <= 10000000),
  add constraint vehicles_evening_check check (
    (evening_from is null and evening_percent is null and evening_rate is null)
    or (evening_from is not null and (evening_percent is null) <> (evening_rate is null))
  );

comment on column public.vehicles.evening_from is 'From this time of day a higher rate applies: evening_percent on top of the price, or evening_rate instead.';

grant insert (evening_from, evening_percent, evening_rate), update (evening_from, evening_percent, evening_rate)
  on public.vehicles to authenticated;

create table public.job_times (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  job_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  break_minutes integer not null check (break_minutes >= 0),
  -- Counted by private.price_job_time when approved.
  worked_minutes integer not null check (worked_minutes >= 0),
  evening_minutes integer not null check (evening_minutes >= 0 and evening_minutes <= worked_minutes),
  minimum_minutes integer not null check (minimum_minutes >= 0),
  billed_minutes integer not null check (billed_minutes >= worked_minutes),
  -- Money in øre (whole numbers, never floating point); null when the job has no price.
  hourly_rate integer check (hourly_rate >= 0),
  evening_rate integer check (evening_rate >= 0),
  amount integer check (amount >= 0),
  -- Whether the time differs from the driver's presses or replaces an earlier approval.
  corrected boolean not null,
  reason text check (char_length(btrim(reason)) between 1 and 500),
  approved_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ended_at > started_at and ended_at - started_at <= interval '24 hours'),
  check (not corrected or reason is not null),
  foreign key (job_id, organization_id) references public.jobs (id, organization_id) on delete cascade
);

comment on table public.job_times is 'Approved working time of a job with its price. The latest row counts; never changed.';

create index job_times_job_created_idx on public.job_times (job_id, created_at);
create index job_times_organization_idx on public.job_times (organization_id);

alter table public.job_times enable row level security;
revoke all on public.job_times from anon, authenticated;
-- Written only through approve_job_time, never changed or deleted.
grant select on public.job_times to authenticated;

create policy "The office can read approved working time"
  on public.job_times for select
  to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[])));

-- The time the driver's presses give: from "on the way" (else "arrived") to
-- "finished", in whole minutes, and the breaks between. Nothing when the job
-- is not finished.
create function private.driver_time(job uuid, out started_at timestamptz, out ended_at timestamptz, out break_minutes integer)
language sql
stable
set search_path = ''
as $$
  with e as (select kind, created_at from public.job_events where job_id = job),
  span as (
    -- Whole minutes, as the office reads and corrects them.
    select date_trunc('minute', coalesce((select min(created_at) from e where kind = 'on_the_way'), (select min(created_at) from e where kind = 'arrived'))) as s,
           date_trunc('minute', (select max(created_at) from e where kind = 'finished')) as f
  )
  select span.s, span.f,
         coalesce((
           select round(sum(extract(epoch from (
             coalesce((select min(b.created_at) from e b where b.kind = 'break_ended' and b.created_at >= a.created_at), span.f) - a.created_at
           ))) / 60)::integer
           from e a where a.kind = 'break_started'
         ), 0)
  from span
  where span.s is not null and span.f is not null and span.f > span.s;
$$;

revoke all on function private.driver_time(uuid) from public;

-- The price of a working time on a job, as described at the top.
create function private.price_job_time(
  job uuid, started_at timestamptz, ended_at timestamptz, break_minutes integer,
  out worked_minutes integer, out evening_minutes integer, out minimum_minutes integer, out billed_minutes integer,
  out hourly_rate integer, out evening_rate integer, out amount integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
  j public.jobs;
  v public.vehicles;
  tz text;
  total integer;
  evening_raw integer := 0;
  evening_starts timestamptz;
  usual integer;
begin
  select * into j from public.jobs where id = job;
  select * into v from public.vehicles where id = j.vehicle_id;
  select o.timezone into tz from public.organizations o where o.id = j.organization_id;

  total := floor(extract(epoch from (ended_at - started_at)) / 60);
  if break_minutes < 0 or break_minutes >= total then
    raise exception 'The breaks are longer than the working time' using errcode = '22023';
  end if;

  if v.evening_from is not null then
    evening_starts := greatest(started_at, (((started_at at time zone tz)::date + v.evening_from) at time zone tz));
    if evening_starts < ended_at then
      evening_raw := floor(extract(epoch from (ended_at - evening_starts)) / 60);
    end if;
  end if;

  -- Breaks come off the time at the usual rate first.
  usual := greatest(total - evening_raw - break_minutes, 0);
  evening_minutes := evening_raw - greatest(break_minutes - (total - evening_raw), 0);
  worked_minutes := usual + evening_minutes;
  minimum_minutes := coalesce(v.min_billable_minutes, 0);
  billed_minutes := greatest(worked_minutes, minimum_minutes);

  hourly_rate := j.hourly_rate;
  evening_rate := case
    when v.evening_rate is not null then v.evening_rate
    when v.evening_percent is not null then round(j.hourly_rate * (100 + v.evening_percent) / 100.0)::integer
  end;
  if hourly_rate is not null and (evening_minutes = 0 or evening_rate is not null) then
    amount := round(
      ((billed_minutes - evening_minutes)::numeric * hourly_rate + evening_minutes::numeric * coalesce(evening_rate, 0)) / 60
    )::integer;
  end if;
end;
$$;

revoke all on function private.price_job_time(uuid, timestamptz, timestamptz, integer) from public;

-- The office reads what the driver's presses give, priced as it would be
-- approved now. No row when the job has no complete record.
create function public.job_time_draft(job uuid)
returns table (
  started_at timestamptz, ended_at timestamptz, break_minutes integer,
  worked_minutes integer, evening_minutes integer, minimum_minutes integer, billed_minutes integer,
  hourly_rate integer, evening_rate integer, amount integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  j public.jobs;
  d record;
begin
  select * into j from public.jobs where id = job;
  if not found or not private.has_role(j.organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[]) then
    raise exception 'Only the office reads working time' using errcode = '42501';
  end if;
  select * into d from private.driver_time(job);
  if d.started_at is null then
    return;
  end if;
  return query
    select d.started_at, d.ended_at, d.break_minutes, p.*
    from private.price_job_time(job, d.started_at, d.ended_at, d.break_minutes) p;
end;
$$;

revoke all on function public.job_time_draft(uuid) from public, anon;
grant execute on function public.job_time_draft(uuid) to authenticated;

-- The office approves a finished job's working time. A time that differs from
-- the driver's presses, or replaces an earlier approval, needs a reason.
create function public.approve_job_time(job uuid, started_at timestamptz, ended_at timestamptz, break_minutes integer, reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
  d record;
  p record;
  why text := nullif(btrim(reason), '');
  is_corrected boolean;
  new_id uuid;
begin
  select * into j from public.jobs where id = job for update;
  if not found or not (
    private.has_role(j.organization_id, array['dispatcher']::public.member_role[])
    or (private.has_role(j.organization_id, array['owner', 'admin']::public.member_role[]) and private.second_step_done())
  ) then
    raise exception 'Only the office approves working time' using errcode = '42501';
  end if;
  if j.status <> 'done' then
    raise exception 'Only a finished job''s time is approved' using errcode = '55000';
  end if;
  if not (ended_at > started_at and ended_at - started_at <= interval '24 hours') then
    raise exception 'The end must come after the start, within 24 hours' using errcode = '22023';
  end if;

  select * into d from private.driver_time(job);
  is_corrected := exists (select 1 from public.job_times t where t.job_id = j.id)
    or (d.started_at is not null and (d.started_at, d.ended_at, d.break_minutes)
        is distinct from (approve_job_time.started_at, approve_job_time.ended_at, approve_job_time.break_minutes));
  if is_corrected and why is null then
    raise exception 'A corrected time needs a reason' using errcode = '23514', hint = 'reason_required';
  end if;

  select * into p from private.price_job_time(job, approve_job_time.started_at, approve_job_time.ended_at, approve_job_time.break_minutes);
  insert into public.job_times (
    organization_id, job_id, started_at, ended_at, break_minutes, worked_minutes, evening_minutes,
    minimum_minutes, billed_minutes, hourly_rate, evening_rate, amount, corrected, reason
  ) values (
    j.organization_id, j.id, approve_job_time.started_at, approve_job_time.ended_at, approve_job_time.break_minutes,
    p.worked_minutes, p.evening_minutes, p.minimum_minutes, p.billed_minutes, p.hourly_rate, p.evening_rate, p.amount,
    is_corrected, why
  ) returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.approve_job_time(uuid, timestamptz, timestamptz, integer, text) from public, anon;
grant execute on function public.approve_job_time(uuid, timestamptz, timestamptz, integer, text) to authenticated;
