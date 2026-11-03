-- Working time: the driver's presses give the time, the office approves or
-- corrects it (with a reason), and the price is counted with the machine's
-- minimum and higher rate from a time of day. Drivers and other companies see
-- nothing. All data is synthetic (.test e-mails).
begin;
select plan(27);

select ok(not has_table_privilege('authenticated', 'public.job_times', 'insert'), 'approved time is written only through approve_job_time');
select ok(not has_table_privilege('authenticated', 'public.job_times', 'update'), 'approved time is never changed');
select ok(not has_table_privilege('authenticated', 'public.job_times', 'delete'), 'approved time is never deleted');

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

-- Kranbil 1: 1 450 kr/h, at least 4 hours, +50 % from 15:00.
-- Lastebil 2: 1 000 kr/h, 2 000 kr/h from 15:00.
insert into public.vehicles (id, organization_id, type, name, hourly_rate, min_billable_minutes, evening_from, evening_percent, evening_rate) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'crane_truck', 'Kranbil 1', 145000, 240, '15:00', 50, null),
  ('a1000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tipper', 'Lastebil 2', 100000, 0, '15:00', null, 200000);
select throws_ok($$
  insert into public.vehicles (organization_id, type, name, evening_from, evening_percent, evening_rate)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tipper', 'Feil', '15:00', 50, 200000)
$$, '23514', null, 'a machine has a surcharge or another evening price, not both');

insert into public.customers (id, organization_id, name) values
  ('a2000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nordbygg AS');
insert into public.jobs (id, organization_id, customer_id, vehicle_id, driver_id, address, starts_at, ends_at, status) values
  -- 1: a long day into the evening; 2: a short job under the minimum;
  -- 3: no presses from the driver; 4: not finished yet.
  ('a4000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Storgata 1, 0155 Oslo',
   '2026-11-02 07:00+01', '2026-11-02 15:00+01', 'done'),
  ('a4000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Kaigaten 4, 5015 Bergen',
   '2026-11-03 08:00+01', '2026-11-03 09:00+01', 'done'),
  ('a4000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'Strandkaien 2, 5013 Bergen',
   '2026-11-04 14:00+01', '2026-11-04 18:00+01', 'done'),
  ('a4000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Storgata 1, 0155 Oslo',
   '2026-11-05 07:00+01', '2026-11-05 11:00+01', 'planned');
-- The driver's presses, with their real times (record_job_step would stamp them all with now()).
insert into public.job_events (organization_id, job_id, kind, created_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000000000001', 'on_the_way', '2026-11-02 07:00+01'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000000000001', 'arrived', '2026-11-02 07:30+01'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000000000001', 'break_started', '2026-11-02 11:00+01'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000000000001', 'break_ended', '2026-11-02 11:30+01'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000000000001', 'finished', '2026-11-02 16:00+01'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000000000002', 'on_the_way', '2026-11-03 08:00+01'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000000000002', 'arrived', '2026-11-03 08:20+01'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000000000002', 'finished', '2026-11-03 09:00+01');

set local role authenticated;

-- Dina (dispatcher) reads the time the presses give.
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
-- 07:00–16:00 is 540 min; less a 30 min break, 510 worked, of which 60 after 15:00.
-- 450 × 1 450 kr/60 + 60 × 2 175 kr/60 = 10 875 + 2 175 = 13 050 kr.
select is(
  (select row(worked_minutes, evening_minutes, billed_minutes, break_minutes, evening_rate, amount)::text
   from public.job_time_draft('a4000000-0000-0000-0000-000000000001')),
  row(510, 60, 510, 30, 217500, 1305000)::text,
  'the presses give 510 minutes, 60 of them at the evening rate (+50 %), 13 050 kr'
);
-- 60 min, billed as the machine's minimum of 4 hours: 4 × 1 450 kr.
select is(
  (select row(worked_minutes, billed_minutes, amount)::text from public.job_time_draft('a4000000-0000-0000-0000-000000000002')),
  row(60, 240, 580000)::text,
  'a short job is billed as the machine''s minimum'
);
select is((select count(*)::int from public.job_time_draft('a4000000-0000-0000-0000-000000000003')), 0,
  'no draft without the driver''s presses');

-- Approving as the presses say needs no reason.
select lives_ok($$
  select public.approve_job_time('a4000000-0000-0000-0000-000000000001', '2026-11-02 07:00+01', '2026-11-02 16:00+01', 30)
$$, 'the dispatcher approves the time as the driver pressed it');
select is((select row(corrected, amount)::text from public.job_times), row(false, 1305000)::text,
  'the approved time keeps its price, not corrected');

-- A second approval is a correction: it needs a reason, and both versions stay.
select throws_ok($$
  select public.approve_job_time('a4000000-0000-0000-0000-000000000001', '2026-11-02 07:00+01', '2026-11-02 15:00+01', 30)
$$, '23514', null, 'a correction without a reason is refused');
select throws_ok($$
  select public.approve_job_time('a4000000-0000-0000-0000-000000000001', '2026-11-02 07:00+01', '2026-11-02 15:00+01', 30, '   ')
$$, '23514', null, 'a blank reason is no reason');
select lives_ok($$
  select public.approve_job_time('a4000000-0000-0000-0000-000000000001', '2026-11-02 07:00+01', '2026-11-02 15:00+01', 30,
    'Sjåføren glemte å trykke ferdig')
$$, 'a correction with a reason is approved');
select is(
  (select array_agg(row(corrected, evening_minutes, amount)::text order by corrected) from public.job_times),
  array[row(false, 60, 1305000)::text, row(true, 0, 1087500)::text],
  'both versions are kept; ending at 15:00 has no evening time'
);

-- Different from the presses: a reason, even the first time.
select throws_ok($$
  select public.approve_job_time('a4000000-0000-0000-0000-000000000002', '2026-11-03 08:00+01', '2026-11-03 10:00+01', 0)
$$, '23514', null, 'a time other than the presses needs a reason');
select throws_ok($$
  select public.approve_job_time('a4000000-0000-0000-0000-000000000002', '2026-11-03 08:00+01', '2026-11-03 09:00+01', 60, 'Pause')
$$, '22023', null, 'breaks cannot be as long as the work');
select throws_ok($$
  select public.approve_job_time('a4000000-0000-0000-0000-000000000002', '2026-11-03 09:00+01', '2026-11-03 08:00+01', 0, 'Feil')
$$, '22023', null, 'the end comes after the start');

-- No presses: the office enters the time; another evening price instead of a surcharge.
-- 14:00–18:00: 60 × 1 000 kr/60 + 180 × 2 000 kr/60 = 1 000 + 6 000 = 7 000 kr.
select lives_ok($$
  select public.approve_job_time('a4000000-0000-0000-0000-000000000003', '2026-11-04 14:00+01', '2026-11-04 18:00+01', 0)
$$, 'without presses the office enters the time, no reason needed');
select is(
  (select row(evening_minutes, evening_rate, amount)::text from public.job_times where job_id = 'a4000000-0000-0000-0000-000000000003'),
  row(180, 200000, 700000)::text,
  'after 15:00 the machine''s other hourly price applies'
);
select throws_ok($$
  select public.approve_job_time('a4000000-0000-0000-0000-000000000004', '2026-11-05 07:00+01', '2026-11-05 11:00+01', 0)
$$, '55000', null, 'a job not finished has no time to approve');

-- Sander (driver) sees no prices and approves nothing.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.job_times), 0, 'a driver reads no approved time or prices');
select throws_ok($$ select * from public.job_time_draft('a4000000-0000-0000-0000-000000000002') $$, '42501', null,
  'a driver reads no draft with prices');
select throws_ok($$
  select public.approve_job_time('a4000000-0000-0000-0000-000000000002', '2026-11-03 08:00+01', '2026-11-03 09:00+01', 0)
$$, '42501', null, 'a driver cannot approve their own time');

-- Anna (owner) needs the second step to approve.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select throws_ok($$
  select public.approve_job_time('a4000000-0000-0000-0000-000000000002', '2026-11-03 08:00+01', '2026-11-03 09:00+01', 0)
$$, '42501', null, 'an owner without the second step cannot approve');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select lives_ok($$
  select public.approve_job_time('a4000000-0000-0000-0000-000000000002', '2026-11-03 08:00+01', '2026-11-03 09:00+01', 0)
$$, 'with the second step the owner approves');

-- Björn (other company) sees nothing of Fjellkran.
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.job_times), 0, 'another company reads none of the approved time');
select throws_ok($$ select * from public.job_time_draft('a4000000-0000-0000-0000-000000000001') $$, '42501', null,
  'another company reads no draft');
select throws_ok($$
  select public.approve_job_time('a4000000-0000-0000-0000-000000000002', '2026-11-03 08:00+01', '2026-11-03 09:00+01', 0, 'x')
$$, '42501', null, 'another company cannot approve');

select * from finish();
rollback;
