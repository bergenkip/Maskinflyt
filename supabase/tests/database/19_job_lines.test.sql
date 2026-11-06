-- Extra lines on a job and the invoice draft: the office adds, changes and
-- removes lines; the draft is the approved time plus the lines, in øre. Drivers,
-- owners without the second step and other companies can do nothing.
-- All data is synthetic (.test e-mails).
begin;
select plan(21);

select ok(not has_column_privilege('authenticated', 'public.job_lines', 'amount', 'insert'), 'the amount is counted, never typed');
select ok(not has_column_privilege('authenticated', 'public.job_lines', 'job_id', 'update'), 'a line never moves to another job');

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
-- 1: finished; 2: cancelled.
insert into public.jobs (id, organization_id, customer_id, vehicle_id, driver_id, address, starts_at, ends_at, status) values
  ('a4000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Storgata 1, 0155 Oslo',
   '2026-11-02 07:00+01', '2026-11-02 17:00+01', 'done'),
  ('a4000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Storgata 1, 0155 Oslo',
   '2026-11-03 07:00+01', '2026-11-03 11:00+01', 'cancelled');

set local role authenticated;

-- Dina (dispatcher) approves 07:00–17:00 with 30 min break, then adds lines.
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select lives_ok($$
  select public.approve_job_time('a4000000-0000-0000-0000-000000000001', '2026-11-02 07:00+01', '2026-11-02 17:00+01', 30)
$$, 'the dispatcher approves the time');
select lives_ok($$
  insert into public.job_lines (organization_id, job_id, description, quantity, unit, unit_price, vat_rate) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000000000001', 'Ferje Bergen–Stord', 2.5, 'stk', 12345, 25)
$$, 'the dispatcher adds a line');
select is((select amount from public.job_lines where description = 'Ferje Bergen–Stord'), 30863,
  '2,5 × 123,45 kr = 308,63 kr, rounded to whole øre');
select lives_ok($$
  insert into public.job_lines (organization_id, job_id, description, quantity, unit_price, vat_rate) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000000000001', 'Bompenger', 1, 8000, 0)
$$, 'a line without VAT');
select throws_ok($$
  insert into public.job_lines (organization_id, job_id, description, quantity, unit_price, vat_rate) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000000000001', 'Feil', 1, 100, 20)
$$, '23514', null, 'only Norwegian VAT rates');
select throws_ok($$
  insert into public.job_lines (organization_id, job_id, description, quantity, unit_price) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000000000002', 'Sent', 1, 100)
$$, '55000', null, 'no lines on a cancelled job');
select lives_ok($$
  update public.job_lines set quantity = 3 where description = 'Ferje Bergen–Stord'
$$, 'the dispatcher changes a line');
select is((select amount from public.job_lines where description = 'Ferje Bergen–Stord'), 37035, 'and its amount follows');

-- The draft: 7,5 h at 1 200 kr, 2 h at 1 800 kr (from 15:00), then the lines.
select results_eq($$
  select kind, quantity, unit_price, vat_rate::int, amount from public.invoice_draft('a4000000-0000-0000-0000-000000000001')
$$, $$
  values ('time'::text, 7.50::numeric, 120000, 25, 900000), ('evening', 2.00, 180000, 25, 360000),
         ('line', 3.00, 12345, 25, 37035), ('line', 1.00, 8000, 0, 8000)
$$, 'the draft is the approved time, at both rates, then the lines in order');
select is((select sum(amount)::int from public.invoice_draft('a4000000-0000-0000-0000-000000000001') where kind <> 'line'),
  (select amount from public.job_times where job_id = 'a4000000-0000-0000-0000-000000000001'),
  'the time lines add up to the approved amount exactly');

-- Sander (driver) sees no prices and changes nothing.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.job_lines), 0, 'the driver sees no lines');
select is((select count(*)::int from public.invoice_draft('a4000000-0000-0000-0000-000000000001')), 0, 'nor the draft');
select throws_ok($$
  insert into public.job_lines (organization_id, job_id, description, quantity, unit_price) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000000000001', 'Ekstra', 1, 100)
$$, '42501', null, 'the driver cannot add a line');

-- Anna (owner) without the second step can read but not change.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.job_lines), 2, 'the owner reads the lines');
select throws_ok($$
  insert into public.job_lines (organization_id, job_id, description, quantity, unit_price) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000000000001', 'Ekstra', 1, 100)
$$, '42501', null, 'but adds nothing without the second step');
delete from public.job_lines where description = 'Bompenger';
select is((select count(*)::int from public.job_lines), 2, 'nor removes anything');

-- Björn (other company) sees nothing.
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.job_lines), 0, 'another company sees no lines');
select is((select count(*)::int from public.invoice_draft('a4000000-0000-0000-0000-000000000001')), 0, 'nor the draft');

-- Dina removes a line.
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
delete from public.job_lines where description = 'Bompenger';
select is((select count(*)::int from public.job_lines), 1, 'the dispatcher removes a line');

select * from finish();
rollback;
