-- The accountant: sees finished jobs (not the planning), their customers,
-- machines, time and invoice drafts; with the second step approves the time,
-- changes lines and marks invoices as sent; never adds or changes jobs,
-- customers or machines. Another company's accountant sees nothing.
-- All data is synthetic (.test e-mails).
begin;
select plan(18);

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'anna@fjellkran.test', now()),
  ('33333333-3333-3333-3333-333333333333', 'dina@fjellkran.test', now()),
  ('44444444-4444-4444-4444-444444444444', 'sander@fjellkran.test', now()),
  ('55555555-5555-5555-5555-555555555555', 'bjorn@vestmaskin.test', now()),
  ('66666666-6666-6666-6666-666666666666', 'kari@regnskap.test', now()),
  ('77777777-7777-7777-7777-777777777777', 'ola@regnskap.test', now());
insert into public.organizations (id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vest Maskin AS');
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'dispatcher'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'driver'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666666', 'accountant'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '77777777-7777-7777-7777-777777777777', 'accountant');
-- Kranbil 1: 1 200 kr/h, +50 % from 15:00.
insert into public.vehicles (id, organization_id, type, name, hourly_rate, evening_from, evening_percent) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'crane_truck', 'Kranbil 1', 120000, '15:00', 50);
insert into public.customers (id, organization_id, name) values
  ('a2000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nordbygg AS');
-- 1: finished; 2: cancelled; 3: planned.
insert into public.jobs (id, organization_id, customer_id, vehicle_id, driver_id, address, starts_at, ends_at, status) values
  ('a4000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Storgata 1, 0155 Oslo',
   '2026-11-02 07:00+01', '2026-11-02 17:00+01', 'done'),
  ('a4000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Storgata 1, 0155 Oslo',
   '2026-11-03 07:00+01', '2026-11-03 11:00+01', 'cancelled'),
  ('a4000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Storgata 1, 0155 Oslo',
   '2030-05-06 07:00+02', '2030-05-06 11:00+02', 'planned');

set local role authenticated;

-- Kari (accountant) without the second step reads, but changes nothing.
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select results_eq($$ select number from public.jobs order by number $$, $$ values (1) $$, 'the accountant sees the finished job, not the planning');
select is((select count(*)::int from public.customers), 1, 'and its customer');
select is((select count(*)::int from public.vehicles), 1, 'and its machine');
select results_eq($$ select number, state from public.invoice_queue() $$, $$ values (1, 'time'::text) $$, 'the invoicing list');
select is(public.invoices_waiting(), 1, 'and the bell');
select throws_ok($$
  select public.approve_job_time('a4000000-0000-0000-0000-000000000001', '2026-11-02 07:00+01', '2026-11-02 17:00+01', 30)
$$, '42501', null, 'without the second step no approval');
select throws_ok($$
  insert into public.job_lines (organization_id, job_id, description, quantity, unit_price) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000000000001', 'Ferje', 1, 100)
$$, '42501', null, 'nor lines');

-- With the second step.
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select lives_ok($$
  select public.approve_job_time('a4000000-0000-0000-0000-000000000001', '2026-11-02 07:00+01', '2026-11-02 17:00+01', 30)
$$, 'the accountant approves the time');
select is((select count(*)::int from public.job_times), 1, 'and reads it');
select lives_ok($$
  insert into public.job_lines (organization_id, job_id, description, quantity, unit_price) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000000000001', 'Ferje', 1, 100)
$$, 'adds a line');
select lives_ok($$ update public.job_lines set quantity = 2 where description = 'Ferje' $$, 'changes it');
select lives_ok($$ select public.mark_invoice_sent('a4000000-0000-0000-0000-000000000001', '1042') $$, 'marks the invoice as sent');
select is((select count(*)::int from public.job_invoices), 1, 'and reads the mark');

-- Never the planning, the customers or the machines.
select throws_ok($$
  insert into public.jobs (organization_id, customer_id, address, starts_at, ends_at)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001', 'Storgata 2', '2030-05-07 07:00+02', '2030-05-07 09:00+02')
$$, '42501', null, 'the accountant adds no jobs');
update public.customers set name = 'Endret AS';
select is((select name from public.customers), 'Nordbygg AS', 'changes no customers');
select throws_ok($$
  insert into public.vehicles (organization_id, type, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tipper', 'Ny bil')
$$, '42501', null, 'adds no machines');

-- Ola (another company's accountant) sees nothing of Fjellkran.
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', true);
select set_config('request.jwt.claims', '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.jobs) + (select count(*)::int from public.customers) + (select count(*)::int from public.job_lines), 0, 'another company''s accountant sees nothing');
select is((select count(*)::int from public.invoice_queue()), 0, 'nor its invoicing');

select * from finish();
rollback;
