-- Jobs: who may add and change them, the price and status the database sets,
-- and that company A never sees company B's. All data is synthetic (.test e-mails).
begin;
select plan(31);

select ok((select relrowsecurity from pg_class where oid = 'public.jobs'::regclass), 'RLS is enabled on jobs');
select ok(not has_table_privilege('anon', 'public.jobs', 'select'), 'anon cannot read jobs');
select ok(not has_table_privilege('authenticated', 'public.jobs', 'delete'), 'nobody can delete a job from the browser');
select ok(not has_column_privilege('authenticated', 'public.jobs', 'hourly_rate', 'insert'), 'the browser cannot set a job''s price');
select ok(not has_column_privilege('authenticated', 'public.jobs', 'hourly_rate', 'update'), 'the browser cannot change a job''s price');
select ok(not has_column_privilege('authenticated', 'public.jobs', 'number', 'update'), 'the browser cannot change a job''s number');

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'anna@fjellkran.test', now()),
  ('33333333-3333-3333-3333-333333333333', 'dina@fjellkran.test', now()),
  ('44444444-4444-4444-4444-444444444444', 'sander@fjellkran.test', now()),
  ('55555555-5555-5555-5555-555555555555', 'bjorn@vestmaskin.test', now());
insert into public.organizations (id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vest Maskin AS');
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'dispatcher'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'driver'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'owner');
insert into public.vehicles (id, organization_id, type, name, hourly_rate) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'crane_truck', 'Kranbil 1', 145000),
  ('a1000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'excavator', 'Gravemaskin', null),
  ('b1000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'excavator', 'Gravemaskin B', 120000);
insert into public.customers (id, organization_id, name) values
  ('a2000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nordbygg AS'),
  ('a2000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Kari Nordmann'),
  ('b2000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vest Bygg AS');
insert into public.customer_rates (organization_id, customer_id, vehicle_id, hourly_rate) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 130000);

set local role authenticated;

-- Dina (dispatcher) takes two jobs by phone.
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
insert into public.jobs (organization_id, customer_id, vehicle_id, address, starts_at, ends_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
        'Storgata 1, 0155 Oslo', '2026-11-02 07:00+01', '2026-11-02 11:00+01');
insert into public.jobs (organization_id, customer_id, vehicle_id, driver_id, address, starts_at, ends_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001',
        '44444444-4444-4444-4444-444444444444', 'Fjellveien 3, 5003 Bergen', '2026-11-02 12:00+01', '2026-11-02 14:00+01');

select results_eq(
  $$ select number, hourly_rate, customer_rate, status::text from public.jobs order by number $$,
  $$ values (1, 130000, true, 'new'), (2, 145000, false, 'planned') $$,
  'jobs are numbered 1, 2; the price is the customer''s own or the machine''s; with a driver the job is planned'
);
select is((select created_by from public.jobs where number = 1), '33333333-3333-3333-3333-333333333333'::uuid, 'a job remembers who added it');
select throws_ok(
  $$ insert into public.jobs (organization_id, customer_id, address, starts_at, ends_at, hourly_rate)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000002', 'X', now(), now() + interval '1 hour', 1) $$,
  '42501', null,
  'a dispatcher cannot choose the price'
);
select throws_ok(
  $$ insert into public.jobs (organization_id, customer_id, address, starts_at, ends_at)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b2000000-0000-0000-0000-000000000001', 'X', now(), now() + interval '1 hour') $$,
  '23503', null,
  'a job cannot be for another company''s customer'
);
select throws_ok(
  $$ insert into public.jobs (organization_id, customer_id, vehicle_id, address, starts_at, ends_at)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'X', now(), now() + interval '1 hour') $$,
  '23503', null,
  'a job cannot use another company''s machine'
);
select throws_ok(
  $$ insert into public.jobs (organization_id, customer_id, driver_id, address, starts_at, ends_at)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555', 'X', now(), now() + interval '1 hour') $$,
  '23503', null,
  'the driver must work in the company'
);
select throws_ok(
  $$ insert into public.jobs (organization_id, customer_id, address, starts_at, ends_at)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000002', 'X', now(), now() - interval '1 hour') $$,
  '23514', null,
  'a job ends after it starts'
);
select throws_ok(
  $$ insert into public.jobs (organization_id, customer_id, address, starts_at, ends_at)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000002', 'X', now(), now() + interval '25 hours') $$,
  '23514', null,
  'a job lasts at most 24 hours'
);

-- Planning, finishing, cancelling.
update public.jobs set driver_id = '44444444-4444-4444-4444-444444444444' where number = 1;
select is((select status::text from public.jobs where number = 1), 'planned', 'with a machine and a driver the job becomes planned');
update public.jobs set status = 'done' where number = 1;
select is((select status::text from public.jobs where number = 1), 'done', 'a planned job can be marked done');
update public.jobs set vehicle_id = 'a1000000-0000-0000-0000-000000000002' where number = 2;
select results_eq(
  $$ select hourly_rate, customer_rate from public.jobs where number = 2 $$,
  $$ values (null::integer, false) $$,
  'another machine brings its own price (here none)'
);
update public.jobs set driver_id = null where number = 2;
select is((select status::text from public.jobs where number = 2), 'new', 'without a driver the job is new again');
select throws_ok(
  $$ update public.jobs set status = 'done' where number = 2 $$,
  '23514', null,
  'a job without a driver cannot be done'
);
update public.jobs set status = 'cancelled' where number = 2;
select is((select status::text from public.jobs where number = 2), 'cancelled', 'a job can be cancelled');
update public.jobs set status = 'new', driver_id = '44444444-4444-4444-4444-444444444444' where number = 2;
select is((select status::text from public.jobs where number = 2), 'planned', 'a cancelled job can be restored');

-- Sander (driver) sees no jobs yet and cannot add one.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.jobs), 0, 'a driver does not see jobs yet');
select throws_ok(
  $$ insert into public.jobs (organization_id, customer_id, address, starts_at, ends_at)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000002', 'X', now(), now() + interval '1 hour') $$,
  '42501', null,
  'a driver cannot add a job'
);

-- Bjørn (another company) sees and changes nothing.
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.jobs), 0, 'another company sees no jobs');
update public.jobs set address = 'Hacked' where number = 1;
select throws_ok(
  $$ insert into public.jobs (organization_id, customer_id, address, starts_at, ends_at)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000002', 'X', now(), now() + interval '1 hour') $$,
  '42501', null,
  'another company cannot add a job here'
);
-- His own company numbers from 1.
insert into public.jobs (organization_id, customer_id, address, starts_at, ends_at)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b2000000-0000-0000-0000-000000000001', 'Kaien 2', now(), now() + interval '1 hour');
select is((select number from public.jobs), 1, 'each company numbers its own jobs from 1');

-- Anna (owner) needs the second step.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select is((select address from public.jobs where number = 1), 'Storgata 1, 0155 Oslo', 'another company''s change did not reach the job');
select throws_ok(
  $$ insert into public.jobs (organization_id, customer_id, address, starts_at, ends_at)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000002', 'X', now(), now() + interval '1 hour') $$,
  '42501', null,
  'an owner without the second step cannot add a job'
);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select lives_ok(
  $$ insert into public.jobs (organization_id, customer_id, address, starts_at, ends_at)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000002', 'Kaien 5', now(), now() + interval '1 hour') $$,
  'an owner with the second step can add a job'
);
select is((select max(number) from public.jobs), 3, 'the next job in the company is number 3');

-- A driver who leaves leaves the job without a driver; it is no longer planned.
reset role;
delete from public.memberships where user_id = '44444444-4444-4444-4444-444444444444';
select results_eq(
  $$ select number, driver_id, status::text from public.jobs where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and number < 3 order by number $$,
  $$ values (1, null::uuid, 'done'), (2, null::uuid, 'new') $$,
  'a driver who leaves is taken off the jobs; a done job stays done'
);

select * from finish();
rollback;
