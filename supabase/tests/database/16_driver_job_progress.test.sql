-- The driver's phone view: a driver reads only their own jobs (without prices),
-- reports steps in order, and the office reads them; nobody else sees or writes
-- anything. All data is synthetic (.test e-mails).
begin;
select plan(25);

select ok(not has_table_privilege('authenticated', 'public.job_events', 'insert'), 'events are written only through functions');
select ok(not has_table_privilege('authenticated', 'public.job_events', 'update'), 'events are never changed');
select ok(not has_table_privilege('authenticated', 'public.job_events', 'delete'), 'events are never deleted');
select ok(not has_column_privilege('authenticated', 'public.jobs', 'progress', 'update'), 'the browser cannot set a job''s progress');

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'anna@fjellkran.test', now()),
  ('33333333-3333-3333-3333-333333333333', 'dina@fjellkran.test', now()),
  ('44444444-4444-4444-4444-444444444444', 'sander@fjellkran.test', now()),
  ('66666666-6666-6666-6666-666666666666', 'ola@fjellkran.test', now()),
  ('55555555-5555-5555-5555-555555555555', 'bjorn@vestmaskin.test', now());
insert into public.organizations (id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vest Maskin AS');
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'dispatcher'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'driver'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666666', 'driver'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'owner');
insert into public.vehicles (id, organization_id, type, name, hourly_rate) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'crane_truck', 'Kranbil 1', 145000);
insert into public.customers (id, organization_id, name) values
  ('a2000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nordbygg AS');
-- Sander's job today, and Ola's.
insert into public.jobs (id, organization_id, customer_id, vehicle_id, driver_id, address, starts_at, ends_at) values
  ('a4000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Storgata 1, 0155 Oslo',
   '2026-11-02 07:00+01', '2026-11-02 11:00+01'),
  ('a4000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666', 'Kaigaten 4, 5015 Bergen',
   '2026-11-02 12:00+01', '2026-11-02 14:00+01');

set local role authenticated;

-- Sander (driver) sees his own job, and still not the jobs table with its prices.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select is(
  (select array_agg(customer_name || ' / ' || vehicle_name) from public.my_jobs('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-11-02 00:00+01', '2026-11-03 00:00+01')),
  array['Nordbygg AS / Kranbil 1'], 'a driver sees their own job of the day, with customer and machine'
);
select is((select count(*)::int from public.jobs), 0, 'a driver still cannot read the jobs table (prices stay with the office)');

-- Steps only in order.
select throws_ok($$ select public.record_job_step('a4000000-0000-0000-0000-000000000001', 'arrived') $$, '55000', null,
  'a driver cannot arrive before being on the way');
select is(public.record_job_step('a4000000-0000-0000-0000-000000000001', 'accepted'), 'accepted'::public.job_progress, 'the driver accepts the job');
select is(public.record_job_step('a4000000-0000-0000-0000-000000000001', 'on_the_way'), 'on_the_way'::public.job_progress, 'then is on the way');
select is(public.record_job_step('a4000000-0000-0000-0000-000000000001', 'arrived'), 'arrived'::public.job_progress, 'then arrives');
select is(public.record_job_step('a4000000-0000-0000-0000-000000000001', 'break_started'), 'on_break'::public.job_progress, 'takes a break');
select throws_ok($$ select public.record_job_step('a4000000-0000-0000-0000-000000000001', 'finished') $$, '55000', null,
  'a job is not finished during a break');
select is(public.record_job_step('a4000000-0000-0000-0000-000000000001', 'break_ended'), 'arrived'::public.job_progress, 'the break ends');
select lives_ok($$ select public.add_job_note('a4000000-0000-0000-0000-000000000001', '  Kunden var ikke der, ventet 30 min  ') $$,
  'the driver writes a note from the site');
select throws_ok($$ select public.add_job_note('a4000000-0000-0000-0000-000000000001', '   ') $$, '23514', null, 'an empty note is refused');
select is(public.record_job_step('a4000000-0000-0000-0000-000000000001', 'finished'), 'finished'::public.job_progress, 'and finishes');
select is(
  -- In one test transaction every step has the same time, so they are listed by kind.
  (select array_agg(kind::text order by kind) from public.job_events),
  array['accepted', 'on_the_way', 'arrived', 'break_started', 'break_ended', 'finished', 'note'],
  'the driver reads every step and note of their job'
);

-- Not Ola's job: no steps, no notes, no events.
select throws_ok($$ select public.record_job_step('a4000000-0000-0000-0000-000000000002', 'accepted') $$, '42501', null,
  'a driver cannot report steps on someone else''s job');
select throws_ok($$ select public.add_job_note('a4000000-0000-0000-0000-000000000002', 'Hei') $$, '42501', null,
  'a driver cannot write notes on someone else''s job');
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.job_events), 0, 'another driver sees none of Sander''s steps');

-- Dina (dispatcher) sees the steps and that the job is done.
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.job_events), 7, 'the dispatcher reads the steps of the company''s jobs');
select is((select status::text || '/' || progress::text from public.jobs where number = 1), 'done/finished',
  'finishing marks the job done for the office');
select throws_ok($$ select public.record_job_step('a4000000-0000-0000-0000-000000000002', 'accepted') $$, '42501', null,
  'the office does not report steps for the driver');

-- Björn (other company) sees nothing of Fjellkran.
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.job_events), 0, 'another company sees none of the steps');
select is((select count(*)::int from public.my_jobs('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-11-01', '2026-11-04')), 0,
  'another company gets no jobs from my_jobs');

select * from finish();
rollback;
