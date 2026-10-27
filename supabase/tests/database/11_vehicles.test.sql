-- Vehicles: who may read and change them, and that company A never sees company B's.
-- All data is synthetic (.test e-mails, made-up plates).
begin;
select plan(19);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.vehicles'::regclass),
  'RLS is enabled on vehicles'
);
select ok(not has_table_privilege('anon', 'public.vehicles', 'select'), 'anon cannot read vehicles');
select ok(not has_table_privilege('authenticated', 'public.vehicles', 'delete'), 'nobody can delete a vehicle from the browser');

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'anna@fjellkran.test', now()),
  ('22222222-2222-2222-2222-222222222222', 'ola@fjellkran.test', now()),
  ('33333333-3333-3333-3333-333333333333', 'dina@fjellkran.test', now()),
  ('44444444-4444-4444-4444-444444444444', 'sander@fjellkran.test', now()),
  ('55555555-5555-5555-5555-555555555555', 'bjorn@vestmaskin.test', now());
insert into public.organizations (id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vest Maskin AS');
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'admin'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'dispatcher'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'driver'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'owner');
insert into public.vehicles (id, organization_id, type, name, reg_number, hourly_rate) values
  ('b1000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'excavator', 'Gravemaskin 1', null, 120000);

set local role authenticated;

-- Anna (owner, with the e-mailed second step) adds a crane truck
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select lives_ok(
  $$ insert into public.vehicles (id, organization_id, type, name, reg_number, crane_tm, payload_kg, hourly_rate, min_billable_minutes)
     values ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'crane_truck', 'Kranbil 1', 'AB12345', 20.5, 12000, 145000, 120) $$,
  'an owner can add a vehicle'
);
select throws_ok(
  $$ insert into public.vehicles (organization_id, type, name, reg_number)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tipper', 'Tippbil', 'AB12345') $$,
  '23505', null,
  'the same plates cannot be added twice in one company'
);
select throws_ok(
  $$ insert into public.vehicles (organization_id, type, name, reg_number)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tipper', 'Tippbil', 'ab 12') $$,
  '23514', null,
  'plates are stored in capitals without spaces'
);
select throws_ok(
  $$ insert into public.vehicles (organization_id, type, name, hourly_rate)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tipper', 'Tippbil', -1) $$,
  '23514', null,
  'a rate cannot be negative'
);
select throws_ok(
  $$ insert into public.vehicles (organization_id, type, name)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'tipper', 'Planted') $$,
  '42501', null,
  'an owner cannot add a vehicle to another company'
);
select results_eq(
  $$ select name from public.vehicles $$,
  $$ values ('Kranbil 1') $$,
  'an owner sees only her own company''s vehicles'
);
update public.vehicles set name = 'Hacked' where id = 'b1000000-0000-0000-0000-000000000001';

-- Anna with only her password: no changes
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select throws_ok(
  $$ insert into public.vehicles (organization_id, type, name)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tipper', 'Tippbil') $$,
  '42501', null,
  'an owner without the second step cannot add a vehicle'
);
update public.vehicles set name = 'Changed without link' where id = 'a1000000-0000-0000-0000-000000000001';
select is(
  (select name from public.vehicles where id = 'a1000000-0000-0000-0000-000000000001'),
  'Kranbil 1',
  'an owner without the second step cannot change a vehicle'
);

-- Ola (admin, with the second step) switches the truck off
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1790000000}]}', true);
update public.vehicles set active = false, hourly_rate = 150000 where id = 'a1000000-0000-0000-0000-000000000001';
select results_eq(
  $$ select active, hourly_rate from public.vehicles where id = 'a1000000-0000-0000-0000-000000000001' $$,
  $$ values (false, 150000) $$,
  'an admin can change and switch off a vehicle'
);
select throws_ok(
  $$ update public.vehicles set organization_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' where id = 'a1000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'a vehicle cannot be moved to another company'
);
select throws_ok(
  $$ delete from public.vehicles where id = 'a1000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'a vehicle cannot be deleted'
);

-- Dina (dispatcher) reads the list but cannot change it
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select is((select count(*)::int from public.vehicles), 1, 'a dispatcher sees her company''s vehicle');
select throws_ok(
  $$ insert into public.vehicles (organization_id, type, name)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tipper', 'Tippbil') $$,
  '42501', null,
  'a dispatcher cannot add a vehicle'
);
update public.vehicles set name = 'Dina was here' where id = 'a1000000-0000-0000-0000-000000000001';

-- Sander (driver) sees no vehicles yet
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select is((select count(*)::int from public.vehicles), 0, 'a driver does not see the vehicle list');

-- Bjørn (owner of company B) sees only his own machine, unchanged
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select results_eq(
  $$ select name from public.vehicles $$,
  $$ values ('Gravemaskin 1') $$,
  'company B sees only its own vehicle, untouched by company A'
);

reset role;
select is(
  (select name from public.vehicles where id = 'a1000000-0000-0000-0000-000000000001'),
  'Kranbil 1',
  'the dispatcher''s attempted change did not happen'
);

select * from finish(true);
rollback;
