-- Stage 3: the company's customers (kunderegister).
--
-- The companies and private persons the company works for. Jobs and invoices
-- will point at these rows later, so a customer is never deleted: it is
-- switched off (active = false) and keeps its history.
--
-- Who may do what:
--   owner, admin: add and change customers, and set a customer's own prices
--   dispatcher:   add and change customers (orders come in by phone), reads prices
--   driver:       nothing; drivers will see the customer of their own jobs

create type public.customer_kind as enum ('company', 'private');

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind public.customer_kind not null default 'company',
  name text not null check (char_length(btrim(name)) between 1 and 120),
  -- Norwegian organisasjonsnummer (9 digits), only for companies and optional
  -- (a new customer's number may not be known yet). The app checks the MOD11 digit.
  org_number text check (org_number ~ '^[0-9]{9}$'),
  contact_name text check (char_length(btrim(contact_name)) between 1 and 100),
  -- Stored as digits with an optional leading + ("+4791234567").
  phone text check (phone ~ '^\+?[0-9]{5,15}$'),
  email text check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Where invoices go, when not to the e-mail above.
  invoice_email text check (char_length(invoice_email) <= 254 and invoice_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  street text check (char_length(btrim(street)) between 1 and 200),
  postal_code text check (postal_code ~ '^[0-9]{4}$'),
  city text check (char_length(btrim(city)) between 1 and 100),
  note text check (char_length(note) between 1 and 1000),
  active boolean not null default true,
  -- Lower-case text the list is searched in (name, number, phone, contact, city).
  search text generated always as (
    lower(
      name || ' ' || coalesce(org_number, '') || ' ' || coalesce(phone, '') || ' '
      || coalesce(contact_name, '') || ' ' || coalesce(city, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'company' or org_number is null),
  -- Lets customer_rates point at a customer of the same organization only.
  unique (id, organization_id)
);

comment on table public.customers is 'A customer of an organization. Switched off, never deleted.';

create unique index customers_org_number_key on public.customers (organization_id, org_number);
create index customers_organization_id_idx on public.customers (organization_id);

create trigger customers_touch_updated_at
  before update on public.customers
  for each row execute function private.touch_updated_at();

alter table public.customers enable row level security;
revoke all on public.customers from anon, authenticated;
-- No delete; the organization and timestamps are never changed from the browser.
grant select on public.customers to authenticated;
grant insert (organization_id, kind, name, org_number, contact_name, phone, email, invoice_email, street, postal_code, city, note, active)
  on public.customers to authenticated;
grant update (kind, name, org_number, contact_name, phone, email, invoice_email, street, postal_code, city, note, active)
  on public.customers to authenticated;

create policy "Owners, admins and dispatchers can read customers"
  on public.customers for select
  to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[])));

create policy "Owners, admins and dispatchers can add customers"
  on public.customers for insert
  to authenticated
  with check ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[])));

create policy "Owners, admins and dispatchers can change customers"
  on public.customers for update
  to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[])))
  with check ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[])));

-- Owners and admins confirm their sign-in with the e-mailed second step;
-- dispatchers have no second step, so only their role is checked.
create policy "Adding customers needs two-step sign-in for owners and admins"
  on public.customers as restrictive for insert
  to authenticated
  with check (
    (select private.second_step_done())
    or (select private.has_role(organization_id, array['dispatcher']::public.member_role[]))
  );

create policy "Changing customers needs two-step sign-in for owners and admins"
  on public.customers as restrictive for update
  to authenticated
  using (
    (select private.second_step_done())
    or (select private.has_role(organization_id, array['dispatcher']::public.member_role[]))
  );

-- A customer's own hourly price for one machine, instead of the machine's
-- usual rate. Without a row here, the machine's own rate applies.

alter table public.vehicles add constraint vehicles_id_organization_id_key unique (id, organization_id);

create table public.customer_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid not null,
  vehicle_id uuid not null,
  -- Money in øre (whole numbers, never floating point); the company's currency.
  hourly_rate integer not null check (hourly_rate >= 0 and hourly_rate <= 10000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Both must belong to the same company as the price itself.
  foreign key (customer_id, organization_id) references public.customers (id, organization_id) on delete cascade,
  foreign key (vehicle_id, organization_id) references public.vehicles (id, organization_id) on delete cascade,
  unique (customer_id, vehicle_id)
);

comment on table public.customer_rates is 'A customer''s own hourly price for one vehicle.';

create index customer_rates_organization_id_idx on public.customer_rates (organization_id);
create index customer_rates_vehicle_id_idx on public.customer_rates (vehicle_id);

create trigger customer_rates_touch_updated_at
  before update on public.customer_rates
  for each row execute function private.touch_updated_at();

alter table public.customer_rates enable row level security;
revoke all on public.customer_rates from anon, authenticated;
-- A price can be removed (the machine's usual rate applies again).
grant select, delete on public.customer_rates to authenticated;
grant insert (organization_id, customer_id, vehicle_id, hourly_rate) on public.customer_rates to authenticated;
grant update (hourly_rate) on public.customer_rates to authenticated;

create policy "Owners, admins and dispatchers can read customer prices"
  on public.customer_rates for select
  to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[])));

create policy "Owners and admins can add customer prices"
  on public.customer_rates for insert
  to authenticated
  with check ((select private.has_role(organization_id, array['owner', 'admin']::public.member_role[])));

create policy "Owners and admins can change customer prices"
  on public.customer_rates for update
  to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin']::public.member_role[])))
  with check ((select private.has_role(organization_id, array['owner', 'admin']::public.member_role[])));

create policy "Owners and admins can remove customer prices"
  on public.customer_rates for delete
  to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin']::public.member_role[])));

create policy "Adding customer prices needs two-step sign-in"
  on public.customer_rates as restrictive for insert
  to authenticated
  with check ((select private.second_step_done()));

create policy "Changing customer prices needs two-step sign-in"
  on public.customer_rates as restrictive for update
  to authenticated
  using ((select private.second_step_done()));

create policy "Removing customer prices needs two-step sign-in"
  on public.customer_rates as restrictive for delete
  to authenticated
  using ((select private.second_step_done()));
