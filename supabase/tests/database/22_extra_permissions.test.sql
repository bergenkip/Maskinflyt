-- Extra rights: an owner or admin gives a member more than their role, and
-- only that. Nobody gives rights to themselves, to owners or admins, or in
-- another company, and a right in one company counts nowhere else.
-- All data is synthetic (.test e-mails).
begin;
select plan(24);

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'anna@fjellkran.test', now()),
  ('22222222-2222-2222-2222-222222222222', 'erik@fjellkran.test', now()),
  ('33333333-3333-3333-3333-333333333333', 'dina@fjellkran.test', now()),
  ('44444444-4444-4444-4444-444444444444', 'sander@fjellkran.test', now()),
  ('55555555-5555-5555-5555-555555555555', 'bjorn@vestmaskin.test', now()),
  ('66666666-6666-6666-6666-666666666666', 'lars@vestmaskin.test', now());
insert into public.organizations (id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vest Maskin AS');
insert into public.memberships (id, organization_id, user_id, role) values
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'admin'),
  ('a0000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'dispatcher'),
  ('a0000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'driver'),
  ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'owner'),
  ('b0000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '66666666-6666-6666-6666-666666666666', 'driver');
insert into public.vehicles (id, organization_id, type, name, hourly_rate) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'crane_truck', 'Kranbil 1', 120000);
insert into public.customers (id, organization_id, name) values
  ('a2000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nordbygg AS');
-- 1: finished, driven by Dina; 2: planned, no driver yet.
insert into public.jobs (id, organization_id, customer_id, vehicle_id, driver_id, address, starts_at, ends_at, status) values
  ('a4000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Storgata 1, 0155 Oslo', '2026-11-02 07:00+01', '2026-11-02 17:00+01', 'done'),
  ('a4000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', null, 'Storgata 1, 0155 Oslo', '2030-05-06 07:00+02', '2030-05-06 11:00+02', 'planned');

set local role authenticated;

-- Sander (driver) without extra rights sees none of the office.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.jobs) + (select count(*)::int from public.customers) + (select count(*)::int from public.vehicles), 0,
  'a driver sees no jobs, customers or machines');
select throws_ok($$ select public.set_member_permissions('a0000000-0000-0000-0000-000000000004', array['plan_jobs']) $$,
  '42501', null, 'and gives himself no rights');

-- Dina (dispatcher) gives no rights either.
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select throws_ok($$ select public.set_member_permissions('a0000000-0000-0000-0000-000000000004', array['plan_jobs']) $$,
  '42501', null, 'a dispatcher gives no rights');

-- Erik (admin) needs the second step; then gives rights, but not to owners or admins.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select throws_ok($$ select public.set_member_permissions('a0000000-0000-0000-0000-000000000004', array['plan_jobs']) $$,
  '42501', null, 'an admin without the second step gives no rights');
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select throws_ok($$ select public.set_member_permissions('a0000000-0000-0000-0000-000000000001', array['plan_jobs']) $$,
  '42501', null, 'nor to the owner');
select throws_ok($$ select public.set_member_permissions('a0000000-0000-0000-0000-000000000004', array['everything']) $$,
  '22023', null, 'nor an unknown right');
select throws_ok($$ select public.set_member_permissions('b0000000-0000-0000-0000-000000000002', array['plan_jobs']) $$,
  'P0002', null, 'nor in another company');
select lives_ok($$ select public.set_member_permissions('a0000000-0000-0000-0000-000000000004', array['plan_jobs', 'plan_jobs']) $$,
  'an admin gives the driver the planning');
select is((select permissions from public.memberships where id = 'a0000000-0000-0000-0000-000000000004'), array['plan_jobs']::text[],
  'once');
select throws_ok($$ update public.memberships set permissions = array['machines'] where id = 'a0000000-0000-0000-0000-000000000004' $$,
  '42501', null, 'rights are never written straight into the table');

-- Sander plans like a dispatcher, without the second step (as a dispatcher).
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.jobs), 2, 'with plan_jobs the driver sees every job');
select lives_ok($$
  insert into public.jobs (organization_id, customer_id, address, starts_at, ends_at)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001', 'Storgata 2', '2030-05-07 07:00+02', '2030-05-07 09:00+02')
$$, 'adds a job');
select lives_ok($$ update public.customers set name = 'Nordbygg Vest AS' $$, 'changes a customer');
select is((select name from public.customers), 'Nordbygg Vest AS', 'and it is changed');
select throws_ok($$ insert into public.vehicles (organization_id, type, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tipper', 'Ny bil') $$,
  '42501', null, 'but adds no machines');
select throws_ok($$ select public.create_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'driver') $$,
  '42501', null, 'and invites nobody');

-- Machines and inviting instead, both with the second step.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select lives_ok($$ select public.set_member_permissions('a0000000-0000-0000-0000-000000000004', array['machines', 'invite']) $$,
  'the owner swaps the rights');
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.jobs), 0, 'without plan_jobs the planning is gone again');
select throws_ok($$ insert into public.vehicles (organization_id, type, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tipper', 'Ny bil') $$,
  '42501', null, 'machines need the second step');
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select lives_ok($$ insert into public.vehicles (organization_id, type, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tipper', 'Ny bil') $$,
  'then the driver adds a machine');
select lives_ok($$ select public.create_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'driver') $$, 'and invites a driver');
select throws_ok($$ select public.create_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin') $$,
  '22023', null, 'but no admin');
select is((select count(*)::int from public.invitations), 1, 'and reads the invitation');

-- Lars (driver in Vest Maskin) gets nothing from Sander's rights in Fjellkran.
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.vehicles) + (select count(*)::int from public.invitations), 0,
  'another company sees nothing of it');

select * from finish();
rollback;
