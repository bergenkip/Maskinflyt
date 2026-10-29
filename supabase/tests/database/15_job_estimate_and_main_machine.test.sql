-- A job's time note, and each person's main machine: who may set it, and that
-- it must be a machine of the same company. All data is synthetic (.test e-mails).
begin;
select plan(12);

select ok(has_column_privilege('authenticated', 'public.jobs', 'time_note', 'insert'), 'the browser can write a time note on a new job');
select ok(has_column_privilege('authenticated', 'public.jobs', 'time_note', 'update'), 'the browser can change a job''s time note');
select ok(not has_table_privilege('authenticated', 'public.memberships', 'update'), 'memberships are only changed through functions');

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'anna@fjellkran.test', now()),
  ('33333333-3333-3333-3333-333333333333', 'dina@fjellkran.test', now()),
  ('44444444-4444-4444-4444-444444444444', 'sander@fjellkran.test', now()),
  ('55555555-5555-5555-5555-555555555555', 'bjorn@vestmaskin.test', now());
insert into public.organizations (id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vest Maskin AS');
insert into public.memberships (id, organization_id, user_id, role) values
  ('a3000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('a3000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'dispatcher'),
  ('a3000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'driver'),
  ('b3000000-0000-0000-0000-000000000005', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'owner');
insert into public.vehicles (id, organization_id, type, name, hourly_rate) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'crane_truck', 'Kranbil 1', 145000),
  ('b1000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'excavator', 'Gravemaskin B', 120000);
insert into public.customers (id, organization_id, name) values
  ('a2000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nordbygg AS');

set local role authenticated;

-- Dina (dispatcher) gives Sander the crane truck and books a job with a time note.
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select lives_ok(
  $$ select public.set_main_machine('a3000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001') $$,
  'a dispatcher can give a driver a main machine'
);
select is((select main_vehicle_id from public.memberships where id = 'a3000000-0000-0000-0000-000000000004'),
  'a1000000-0000-0000-0000-000000000001'::uuid, 'the team sees the driver''s main machine');
select throws_ok(
  $$ select public.set_main_machine('a3000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001') $$,
  '23503', null,
  'a machine of another company cannot be someone''s main machine'
);
insert into public.jobs (organization_id, customer_id, address, starts_at, ends_at, time_note)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001', 'Storgata 1, 0155 Oslo',
        '2026-11-02 07:00+01', '2026-11-02 11:30+01', 'May run until the afternoon');
select is((select time_note from public.jobs), 'May run until the afternoon', 'a dispatcher can write how sure the time is');
select throws_ok($$ update public.jobs set time_note = ' ' $$, '23514', null, 'an empty time note is refused (no note is null)');

-- Sander (driver) cannot change it; Anna (owner) needs the second step.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select throws_ok(
  $$ select public.set_main_machine('a3000000-0000-0000-0000-000000000004', null) $$,
  '42501', null,
  'a driver cannot choose main machines'
);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select throws_ok(
  $$ select public.set_main_machine('a3000000-0000-0000-0000-000000000004', null) $$,
  '42501', null,
  'an owner needs the second step to choose main machines'
);

-- Björn (other company) cannot touch Fjellkran's people.
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select throws_ok(
  $$ select public.set_main_machine('a3000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001') $$,
  'P0002', null,
  'another company cannot change Fjellkran''s people'
);

-- The machine is removed: Sander keeps his place in the team, without a main machine.
reset role;
delete from public.vehicles where id = 'a1000000-0000-0000-0000-000000000001';
select is((select main_vehicle_id from public.memberships where id = 'a3000000-0000-0000-0000-000000000004'), null,
  'a removed machine is no longer anyone''s main machine');

select * from finish();
rollback;
