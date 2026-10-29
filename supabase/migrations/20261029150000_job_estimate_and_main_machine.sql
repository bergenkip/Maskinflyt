-- Stage 4, jobs part 1, follow-up: the job's time is an estimate, and each
-- person can have a main machine.
--
-- A job is booked with a start and an expected duration. ends_at is the start
-- plus that duration: an estimate, not a promise. time_note lets the dispatcher
-- say how sure it is ("may run until the evening").
--
-- A person's main machine is suggested when they are chosen as a job's driver;
-- the job can still get another machine. It is set on the team page by owners,
-- admins and dispatchers (who plan machines and drivers), with the second step
-- for owners and admins as elsewhere. A machine of another company cannot be
-- chosen, and memberships stay without update grants: only set_main_machine
-- changes the column.

alter table public.jobs
  add column time_note text check (char_length(btrim(time_note)) between 1 and 200);

comment on column public.jobs.ends_at is 'Expected end: the start plus the expected duration. An estimate, not a promise.';
comment on column public.jobs.time_note is 'How sure the expected duration is, in the dispatcher''s words.';

grant insert (time_note), update (time_note) on public.jobs to authenticated;

alter table public.memberships
  add column main_vehicle_id uuid,
  add constraint memberships_main_vehicle_fkey foreign key (main_vehicle_id, organization_id)
    references public.vehicles (id, organization_id) on delete set null (main_vehicle_id);

comment on column public.memberships.main_vehicle_id is 'The machine this person usually drives, suggested when they get a job.';

create index memberships_main_vehicle_id_idx on public.memberships (main_vehicle_id);

create function public.set_main_machine(membership_id uuid, vehicle_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.memberships;
  actor public.member_role;
begin
  select * into target from public.memberships m where m.id = membership_id;
  actor := private.role_of(target.organization_id);
  if target.id is null or actor is null then
    raise exception 'Member not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if actor not in ('owner', 'admin', 'dispatcher') then
    raise exception 'Not allowed' using errcode = '42501', hint = 'not_allowed';
  end if;
  if actor in ('owner', 'admin') then
    perform private.require_mfa();
  end if;

  -- The foreign key refuses a machine of another company (23503).
  update public.memberships m set main_vehicle_id = set_main_machine.vehicle_id where m.id = target.id;
end;
$$;

revoke all on function public.set_main_machine(uuid, uuid) from public, anon;
grant execute on function public.set_main_machine(uuid, uuid) to authenticated;
