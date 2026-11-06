-- Marking an invoice draft as sent: only a finished job with approved time,
-- only by the office; a sent draft is locked (time, lines, the job), and the
-- totals are kept. Drivers, owners without the second step and other
-- companies can do nothing. All data is synthetic (.test e-mails).
begin;
select plan(24);

select ok(not has_table_privilege('authenticated', 'public.job_invoices', 'insert'), 'marked only through mark_invoice_sent');
select ok(not has_table_privilege('authenticated', 'public.job_invoices', 'update'), 'a mark never changes');

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
-- Kranbil 1: 1 200 kr/h, +50 % from 15:00.
insert into public.vehicles (id, organization_id, type, name, hourly_rate, evening_from, evening_percent) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'crane_truck', 'Kranbil 1', 120000, '15:00', 50);
insert into public.customers (id, organization_id, name) values
  ('a2000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nordbygg AS');
-- 1: finished; 2: cancelled; 3: finished, time not approved.
insert into public.jobs (id, organization_id, customer_id, vehicle_id, driver_id, address, starts_at, ends_at, status) values
  ('a4000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Storgata 1, 0155 Oslo',
   '2026-11-02 07:00+01', '2026-11-02 17:00+01', 'done'),
  ('a4000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Storgata 1, 0155 Oslo',
   '2026-11-03 07:00+01', '2026-11-03 11:00+01', 'cancelled'),
  ('a4000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Storgata 1, 0155 Oslo',
   '2026-11-04 07:00+01', '2026-11-04 11:00+01', 'done');

set local role authenticated;

-- Dina (dispatcher): 07:00–17:00 less 30 min, a ferry (VAT 25 %) and a toll (VAT 0 %).
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select lives_ok($$
  select public.approve_job_time('a4000000-0000-0000-0000-000000000001', '2026-11-02 07:00+01', '2026-11-02 17:00+01', 30)
$$, 'the dispatcher approves the time');
insert into public.job_lines (organization_id, job_id, description, quantity, unit_price, vat_rate) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000000000001', 'Ferje', 3, 12345, 25),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000000000001', 'Bompenger', 1, 8000, 0);

-- 12 600 kr + 370,35 kr at 25 % (VAT 3 242,59 kr, rounded), 80 kr at 0 %.
select results_eq($$
  select number, state, total from public.invoice_queue() order by number
$$, $$ values (1, 'ready'::text, 1629294), (3, 'time', null) $$, 'the list: one ready with its total, one waiting for its time');
select is(public.invoices_waiting(), 2, 'the bell counts both');
select throws_ok($$ select public.mark_invoice_sent('a4000000-0000-0000-0000-000000000003') $$, '55000', null, 'not before the time is approved');
select throws_ok($$ select public.mark_invoice_sent('a4000000-0000-0000-0000-000000000002') $$, '55000', null, 'never a cancelled job');

-- Sander (driver) and Anna (owner without the second step) cannot mark.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select throws_ok($$ select public.mark_invoice_sent('a4000000-0000-0000-0000-000000000001') $$, '42501', null, 'the driver cannot mark');
select is((select count(*)::int from public.invoice_queue()), 0, 'nor sees the list');
select is(public.invoices_waiting(), 0, 'nor the bell');
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select throws_ok($$ select public.mark_invoice_sent('a4000000-0000-0000-0000-000000000001') $$, '42501', null, 'the owner needs the second step');

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select lives_ok($$ select public.mark_invoice_sent('a4000000-0000-0000-0000-000000000001', '  1042 ') $$, 'the dispatcher marks it as sent');
select results_eq($$ select reference, net, vat, total from public.job_invoices $$,
  $$ values ('1042'::text, 1305035, 324259, 1629294) $$, 'the number and the totals are kept');
select is(public.invoices_waiting(), 1, 'the bell counts one less');
select throws_ok($$ select public.mark_invoice_sent('a4000000-0000-0000-0000-000000000001') $$, '55006', null, 'marked only once');

-- Locked.
select throws_ok($$
  insert into public.job_lines (organization_id, job_id, description, quantity, unit_price) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000000000001', 'Sent', 1, 100)
$$, '55006', null, 'no new lines');
select throws_ok($$ update public.job_lines set quantity = 4 where description = 'Ferje' $$, '55006', null, 'no changed lines');
select throws_ok($$ delete from public.job_lines where description = 'Bompenger' $$, '55006', null, 'no removed lines');
select throws_ok($$
  select public.approve_job_time('a4000000-0000-0000-0000-000000000001', '2026-11-02 07:00+01', '2026-11-02 18:00+01', 30, 'Senere')
$$, '55006', null, 'no new time');
select throws_ok($$ update public.jobs set status = 'planned' where id = 'a4000000-0000-0000-0000-000000000001' $$, '55006', null, 'the job stays finished');

-- Björn (other company) sees nothing.
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.invoice_queue()) + (select count(*)::int from public.job_invoices), 0, 'another company sees nothing');

-- Anna without the second step cannot take the mark back; Dina can, and the draft opens again.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
delete from public.job_invoices;
select is((select count(*)::int from public.job_invoices), 1, 'the owner cannot take it back without the second step');
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
delete from public.job_invoices;
select is((select count(*)::int from public.job_invoices), 0, 'the dispatcher takes a mistaken mark back');
select lives_ok($$ update public.job_lines set quantity = 4 where description = 'Ferje' $$, 'and the lines can change again');

select * from finish();
rollback;
