-- Stage 5, part 1: the driver's phone view.
--
-- A driver sees the jobs given to them and reports how each goes, with big
-- buttons on the phone: accepted → on the way → arrived (with breaks) →
-- finished. Every press is kept with its time in job_events, so working time
-- can be counted from them later (part 2); notes from the site go there too.
--
-- Who may do what:
--   the job's driver:          read their own jobs (my_jobs), report steps, add notes
--   owner, admin, dispatcher:  read every step and note of the company's jobs, add notes
--   everyone else:             nothing
--
-- Drivers do not get read access to the jobs table itself: it holds prices,
-- which are the office's business. my_jobs returns only what the work needs.

create type public.job_progress as enum ('accepted', 'on_the_way', 'arrived', 'on_break', 'finished');
create type public.job_event_kind as enum ('accepted', 'on_the_way', 'arrived', 'break_started', 'break_ended', 'finished', 'note');

-- The driver's latest step and when, for the office's lists and calendar.
alter table public.jobs
  add column progress public.job_progress,
  add column progress_at timestamptz;
comment on column public.jobs.progress is 'The driver''s latest step on the job; set only by record_job_step.';

alter table public.jobs add constraint jobs_id_organization_id_key unique (id, organization_id);

create table public.job_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  job_id uuid not null,
  kind public.job_event_kind not null,
  note text check (char_length(btrim(note)) between 1 and 500),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((kind = 'note') = (note is not null)),
  foreign key (job_id, organization_id) references public.jobs (id, organization_id) on delete cascade
);

comment on table public.job_events is 'What happened on a job and when: the driver''s steps and notes. Never changed.';

create index job_events_job_created_idx on public.job_events (job_id, created_at);
create index job_events_organization_idx on public.job_events (organization_id);

alter table public.job_events enable row level security;
revoke all on public.job_events from anon, authenticated;
-- Written only through the functions below, never changed or deleted.
grant select on public.job_events to authenticated;

-- Whether the signed-in person drives the job. Definer rights, since drivers
-- cannot read the jobs table themselves.
create function private.drives_job(job uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.jobs j where j.id = job and j.driver_id = (select auth.uid()));
$$;

revoke all on function private.drives_job(uuid) from public;
grant execute on function private.drives_job(uuid) to authenticated;

create policy "The office and the job's driver can read a job's events"
  on public.job_events for select
  to authenticated
  using (
    (select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[]))
    or (select private.drives_job(job_id))
  );

-- The driver's jobs between two instants, and any job they started and have
-- not finished, with what the work needs (no prices). Definer rights: drivers
-- cannot read jobs, customers or vehicles themselves.
create function public.my_jobs(org uuid, from_at timestamptz, to_at timestamptz)
returns table (
  id uuid,
  number integer,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.job_status,
  progress public.job_progress,
  progress_at timestamptz,
  address text,
  site_contact text,
  description text,
  time_note text,
  customer_name text,
  vehicle_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select j.id, j.number, j.starts_at, j.ends_at, j.status, j.progress, j.progress_at, j.address,
         j.site_contact, j.description, j.time_note, c.name, v.name
  from public.jobs j
  join public.customers c on c.id = j.customer_id
  left join public.vehicles v on v.id = j.vehicle_id
  where j.organization_id = org
    and j.driver_id = (select auth.uid())
    and j.status <> 'cancelled'
    and (
      (j.starts_at < to_at and j.ends_at > from_at)
      or (j.status in ('new', 'planned') and j.progress in ('on_the_way', 'arrived', 'on_break'))
    )
  order by j.starts_at
  limit 100;
$$;

revoke all on function public.my_jobs(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.my_jobs(uuid, timestamptz, timestamptz) to authenticated;

-- The driver reports the next step. Only the job's own driver, only on an open
-- job, and only in order; finishing marks the job done when it has a machine.
create function public.record_job_step(job uuid, step public.job_event_kind)
returns public.job_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
  reached public.job_progress;
begin
  select * into j from public.jobs where id = job for update;
  if not found or j.driver_id is distinct from (select auth.uid()) then
    raise exception 'Only the job''s driver reports its steps' using errcode = '42501';
  end if;
  if j.status not in ('new', 'planned') then
    raise exception 'The job is closed' using errcode = '55000';
  end if;

  reached := case
    when step = 'accepted' and j.progress is null then 'accepted'
    when step = 'on_the_way' and (j.progress is null or j.progress = 'accepted') then 'on_the_way'
    when step = 'arrived' and j.progress = 'on_the_way' then 'arrived'
    when step = 'break_started' and j.progress = 'arrived' then 'on_break'
    when step = 'break_ended' and j.progress = 'on_break' then 'arrived'
    when step = 'finished' and j.progress = 'arrived' then 'finished'
  end::public.job_progress;
  if reached is null then
    raise exception 'That step does not come next' using errcode = '55000';
  end if;

  insert into public.job_events (organization_id, job_id, kind) values (j.organization_id, j.id, step);
  update public.jobs
  set progress = reached,
      progress_at = now(),
      status = case when reached = 'finished' and j.vehicle_id is not null then 'done' else status end
  where id = j.id;
  return reached;
end;
$$;

revoke all on function public.record_job_step(uuid, public.job_event_kind) from public, anon;
grant execute on function public.record_job_step(uuid, public.job_event_kind) to authenticated;

-- A note from the site ("the customer was not there, waited 30 min"). The
-- job's driver, or the office (owners and admins after the second step).
create function public.add_job_note(job uuid, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
begin
  select * into j from public.jobs where id = job;
  if not found or not (
    j.driver_id = (select auth.uid())
    or private.has_role(j.organization_id, array['dispatcher']::public.member_role[])
    or (private.has_role(j.organization_id, array['owner', 'admin']::public.member_role[]) and private.second_step_done())
  ) then
    raise exception 'Only the job''s driver and the office write notes' using errcode = '42501';
  end if;
  if j.status = 'cancelled' then
    raise exception 'The job is cancelled' using errcode = '55000';
  end if;
  insert into public.job_events (organization_id, job_id, kind, note) values (j.organization_id, j.id, 'note', btrim(note));
end;
$$;

revoke all on function public.add_job_note(uuid, text) from public, anon;
grant execute on function public.add_job_note(uuid, text) to authenticated;
