-- Stage 4: jobs (oppdrag).
--
-- A job is work for a customer at a place and time, with a machine and the
-- person who drives it. Invoices will point at these rows later, so a job is
-- never deleted: it is cancelled and keeps its history.
--
-- Who may do what:
--   owner, admin, dispatcher: add, change, plan, finish and cancel jobs
--   driver:                   nothing yet; drivers will see their own jobs later
--
-- The database decides two things the browser cannot:
--   - the hourly price: the customer's own price for the machine, else the
--     machine's usual rate, taken when the job is added or its machine or
--     customer changes (later price changes do not touch existing jobs);
--   - "new" or "planned": a job is planned once it has both a machine and a driver.

create type public.job_status as enum ('new', 'planned', 'done', 'cancelled');

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- 1, 2, 3 … per company, for talking about a job on the phone.
  number integer not null,
  customer_id uuid not null,
  vehicle_id uuid,
  driver_id uuid,
  address text not null check (char_length(btrim(address)) between 1 and 200),
  -- Who to meet at the site, e.g. "Per, 912 34 567".
  site_contact text check (char_length(btrim(site_contact)) between 1 and 100),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  description text check (char_length(description) between 1 and 2000),
  status public.job_status not null default 'new',
  -- Money in øre (whole numbers, never floating point); the company's currency.
  hourly_rate integer check (hourly_rate >= 0 and hourly_rate <= 10000000),
  -- Whether the price above is the customer's own price for the machine.
  customer_rate boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '24 hours'),
  check (status <> 'planned' or (vehicle_id is not null and driver_id is not null)),
  unique (organization_id, number),
  -- The customer, the machine and the driver all belong to the job's company.
  foreign key (customer_id, organization_id) references public.customers (id, organization_id),
  foreign key (vehicle_id, organization_id) references public.vehicles (id, organization_id),
  -- A driver who leaves the company leaves the job without a driver.
  foreign key (organization_id, driver_id) references public.memberships (organization_id, user_id) on delete set null (driver_id)
);

comment on table public.jobs is 'A job for a customer: place, time, machine and driver. Cancelled, never deleted.';

create index jobs_organization_starts_idx on public.jobs (organization_id, starts_at);
create index jobs_customer_id_idx on public.jobs (customer_id);
create index jobs_vehicle_starts_idx on public.jobs (vehicle_id, starts_at);
create index jobs_driver_starts_idx on public.jobs (driver_id, starts_at);

create trigger jobs_touch_updated_at
  before update on public.jobs
  for each row execute function private.touch_updated_at();

-- The next number in the company. Definer rights: it must see every job of the
-- company, and the lock keeps two jobs added at once from getting the same number.
create function private.number_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text, 0));
  select coalesce(max(j.number), 0) + 1 into new.number
  from public.jobs j
  where j.organization_id = new.organization_id;
  return new;
end;
$$;

create trigger jobs_number
  before insert on public.jobs
  for each row execute function private.number_job();

-- Price and status, as described at the top.
create function private.prepare_job()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  own integer;
begin
  if tg_op = 'INSERT'
    or new.vehicle_id is distinct from old.vehicle_id
    or new.customer_id is distinct from old.customer_id then
    select r.hourly_rate into own
    from public.customer_rates r
    where r.customer_id = new.customer_id and r.vehicle_id = new.vehicle_id;
    new.customer_rate := own is not null;
    new.hourly_rate := coalesce(own, (select v.hourly_rate from public.vehicles v where v.id = new.vehicle_id));
  end if;

  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done')
    and (new.vehicle_id is null or new.driver_id is null) then
    raise exception 'A job needs a machine and a driver before it is done' using errcode = '23514';
  end if;
  if new.status in ('new', 'planned') then
    new.status := case when new.vehicle_id is not null and new.driver_id is not null then 'planned' else 'new' end;
  end if;
  return new;
end;
$$;

create trigger jobs_prepare
  before insert or update on public.jobs
  for each row execute function private.prepare_job();

alter table public.jobs enable row level security;
revoke all on public.jobs from anon, authenticated;
-- No delete. The number, price and timestamps are never set from the browser.
grant select on public.jobs to authenticated;
grant insert (organization_id, customer_id, vehicle_id, driver_id, address, site_contact, starts_at, ends_at, description)
  on public.jobs to authenticated;
grant update (customer_id, vehicle_id, driver_id, address, site_contact, starts_at, ends_at, description, status)
  on public.jobs to authenticated;

create policy "Owners, admins and dispatchers can read jobs"
  on public.jobs for select
  to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[])));

create policy "Owners, admins and dispatchers can add jobs"
  on public.jobs for insert
  to authenticated
  with check ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[])));

create policy "Owners, admins and dispatchers can change jobs"
  on public.jobs for update
  to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[])))
  with check ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[])));

-- As for customers: owners and admins confirm their sign-in with the e-mailed
-- second step; dispatchers have no second step, so only their role is checked.
create policy "Adding jobs needs two-step sign-in for owners and admins"
  on public.jobs as restrictive for insert
  to authenticated
  with check (
    (select private.second_step_done())
    or (select private.has_role(organization_id, array['dispatcher']::public.member_role[]))
  );

create policy "Changing jobs needs two-step sign-in for owners and admins"
  on public.jobs as restrictive for update
  to authenticated
  using (
    (select private.second_step_done())
    or (select private.has_role(organization_id, array['dispatcher']::public.member_role[]))
  );
