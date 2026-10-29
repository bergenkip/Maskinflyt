-- Who added a vehicle or a customer.
--
-- The database fills in the person who is signed in; the column is in no
-- grant, so the browser can neither choose nor change it. Rows added before
-- this migration have no known author (null), and a person whose account is
-- deleted leaves null behind too.

alter table public.vehicles
  add column created_by uuid default auth.uid() references auth.users (id) on delete set null;

alter table public.customers
  add column created_by uuid default auth.uid() references auth.users (id) on delete set null;

comment on column public.vehicles.created_by is 'The person who added the vehicle; set by the database.';
comment on column public.customers.created_by is 'The person who added the customer; set by the database.';
