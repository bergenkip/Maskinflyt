-- Vehicles and customers remember who added them, and nobody can fake or
-- change that from the browser. All data is synthetic (.test e-mails).
begin;
select plan(8);

select ok(not has_column_privilege('authenticated', 'public.vehicles', 'created_by', 'insert'), 'the browser cannot choose who added a vehicle');
select ok(not has_column_privilege('authenticated', 'public.vehicles', 'created_by', 'update'), 'the browser cannot change who added a vehicle');
select ok(not has_column_privilege('authenticated', 'public.customers', 'created_by', 'insert'), 'the browser cannot choose who added a customer');
select ok(not has_column_privilege('authenticated', 'public.customers', 'created_by', 'update'), 'the browser cannot change who added a customer');

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'anna@fjellkran.test', now()),
  ('33333333-3333-3333-3333-333333333333', 'dina@fjellkran.test', now());
insert into public.organizations (id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS');
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'dispatcher');

set local role authenticated;

-- Anna (owner, with the second step) adds a truck.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1790000000}]}', true);
insert into public.vehicles (organization_id, type, name, reg_number)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'crane_truck', 'Kranbil 1', 'AB12345');
select is(
  (select created_by from public.vehicles where reg_number = 'AB12345'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'a new vehicle remembers the owner who added it'
);

-- Dina (dispatcher) adds a customer, and cannot claim someone else did.
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
insert into public.customers (organization_id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nordbygg AS');
select is(
  (select created_by from public.customers where name = 'Nordbygg AS'),
  '33333333-3333-3333-3333-333333333333'::uuid,
  'a new customer remembers the dispatcher who added it'
);
select throws_ok(
  $$ insert into public.customers (organization_id, name, created_by)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fake AS', '11111111-1111-1111-1111-111111111111') $$,
  '42501', null,
  'a dispatcher cannot say the owner added a customer'
);
select throws_ok(
  $$ update public.customers set created_by = '11111111-1111-1111-1111-111111111111' where name = 'Nordbygg AS' $$,
  '42501', null,
  'a dispatcher cannot change who added a customer'
);

select * from finish();
rollback;
