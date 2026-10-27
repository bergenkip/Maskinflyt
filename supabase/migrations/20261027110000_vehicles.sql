-- Stage 2: the company's machines (vehicles).
--
-- Every truck or machine the company sends out on jobs. Jobs, the calendar and
-- invoices will point at these rows later, so a vehicle is never deleted: it is
-- switched off (active = false) and keeps its history.
--
-- Who may do what:
--   owner, admin: add and change vehicles (with the e-mailed second step)
--   dispatcher:   reads the list, to plan jobs with it
--   driver:       nothing yet; drivers will see the vehicle of their own jobs

create type public.vehicle_type as enum (
  'crane_truck',      -- kranbil
  'crane_truck_grab', -- kranbil med grabb
  'tipper',           -- tippbil
  'excavator',        -- gravemaskin
  'wheel_loader',     -- hjullaster
  'other'             -- anything else; the company names the type itself (type_name)
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  type public.vehicle_type not null,
  -- The company's own type name, only (and always) for type 'other', e.g. "Vilkikas".
  type_name text check (char_length(btrim(type_name)) between 1 and 60),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  -- Stored without spaces in capitals ("AB12345"), so "ab 12345" is the same vehicle.
  -- Optional: machines that never drive on public roads have no plates.
  reg_number text check (reg_number ~ '^[A-ZÆØÅ0-9]{2,10}$'),
  -- Crane capacity in tonne-metres (e.g. 20.5 tm) and payload in kilograms.
  crane_tm numeric(5, 1) check (crane_tm > 0),
  payload_kg integer check (payload_kg > 0 and payload_kg <= 100000),
  -- Money in øre (whole numbers, never floating point); the company's currency.
  hourly_rate integer check (hourly_rate >= 0 and hourly_rate <= 10000000),
  -- The shortest time a job with this vehicle is billed for, in minutes.
  min_billable_minutes integer not null default 0 check (min_billable_minutes between 0 and 1440),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((type = 'other') = (type_name is not null))
);

comment on table public.vehicles is 'A truck or machine of an organization. Switched off, never deleted.';

create unique index vehicles_reg_number_key on public.vehicles (organization_id, reg_number);
create index vehicles_organization_id_idx on public.vehicles (organization_id);

create trigger vehicles_touch_updated_at
  before update on public.vehicles
  for each row execute function private.touch_updated_at();

alter table public.vehicles enable row level security;
revoke all on public.vehicles from anon, authenticated;
-- No delete; the organization and timestamps are never changed from the browser.
grant select on public.vehicles to authenticated;
grant insert (organization_id, type, type_name, name, reg_number, crane_tm, payload_kg, hourly_rate, min_billable_minutes, active)
  on public.vehicles to authenticated;
grant update (type, type_name, name, reg_number, crane_tm, payload_kg, hourly_rate, min_billable_minutes, active)
  on public.vehicles to authenticated;

create policy "Owners, admins and dispatchers can read vehicles"
  on public.vehicles for select
  to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[])));

create policy "Owners and admins can add vehicles"
  on public.vehicles for insert
  to authenticated
  with check ((select private.has_role(organization_id, array['owner', 'admin']::public.member_role[])));

create policy "Owners and admins can change vehicles"
  on public.vehicles for update
  to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin']::public.member_role[])))
  with check ((select private.has_role(organization_id, array['owner', 'admin']::public.member_role[])));

-- Like changing the company: adding or changing a vehicle needs the second step.
create policy "Adding vehicles needs two-step sign-in"
  on public.vehicles as restrictive for insert
  to authenticated
  with check ((select private.second_step_done()));

create policy "Changing vehicles needs two-step sign-in"
  on public.vehicles as restrictive for update
  to authenticated
  using ((select private.second_step_done()));
