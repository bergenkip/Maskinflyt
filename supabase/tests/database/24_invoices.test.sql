-- Issuing invoices: only the office (owners, admins and accountants with the
-- second step), only a finished job with approved time, only with the
-- company's invoice details and the buyer's address or organisation number.
-- Numbers have no gaps, an issued invoice never changes, its PDF is added once
-- and never removed, and another company sees nothing.
-- All data is synthetic (.test e-mails, made-up numbers that pass MOD11).
begin;
select plan(33);

select ok(not has_table_privilege('authenticated', 'public.invoices', 'insert'), 'issued only through issue_invoice');
select ok(not has_table_privilege('authenticated', 'public.invoices', 'update'), 'never changed');
select ok(not has_table_privilege('authenticated', 'public.invoice_lines', 'delete'), 'nor its lines');

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'anna@fjellkran.test', now()),
  ('33333333-3333-3333-3333-333333333333', 'dina@fjellkran.test', now()),
  ('44444444-4444-4444-4444-444444444444', 'sander@fjellkran.test', now()),
  ('55555555-5555-5555-5555-555555555555', 'bjorn@vestmaskin.test', now());
insert into public.organizations (id, name, org_number) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS', '123456785'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vest Maskin AS', '987654325');
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'dispatcher'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'driver'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'owner');
-- Kranbil 1: 1 200 kr/h, +50 % from 15:00.
insert into public.vehicles (id, organization_id, type, name, hourly_rate, evening_from, evening_percent) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'crane_truck', 'Kranbil 1', 120000, '15:00', 50);
-- A company with its number; a private person without an address.
insert into public.customers (id, organization_id, kind, name, org_number, invoice_email) values
  ('a2000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'company', 'Nordbygg AS', '987654325', 'faktura@nordbygg.test'),
  ('a2000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'private', 'Ola Nordmann', null, null);
-- 1 and 3: finished (3 for the second invoice); 2: finished, time not approved; 4: the private person.
insert into public.jobs (id, organization_id, customer_id, vehicle_id, driver_id, address, starts_at, ends_at, status) values
  ('a4000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Storgata 1, 0155 Oslo',
   '2026-11-02 07:00+01', '2026-11-02 17:00+01', 'done'),
  ('a4000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Storgata 1, 0155 Oslo',
   '2026-11-03 07:00+01', '2026-11-03 11:00+01', 'done'),
  ('a4000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Storgata 2, 0155 Oslo',
   '2026-11-04 07:00+01', '2026-11-04 11:00+01', 'done'),
  ('a4000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Hjemmevei 3, 0155 Oslo',
   '2026-11-05 07:00+01', '2026-11-05 11:00+01', 'done'),
  ('a4000000-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Storgata 5, 0155 Oslo',
   '2026-11-06 07:00+01', '2026-11-06 11:00+01', 'done');

set local role authenticated;

-- Dina (dispatcher) approves the time; one ferry (VAT 25 %) and one toll (VAT 0 %).
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select public.approve_job_time('a4000000-0000-0000-0000-000000000001', '2026-11-02 07:00+01', '2026-11-02 17:00+01', 30);
select public.approve_job_time('a4000000-0000-0000-0000-000000000003', '2026-11-04 07:00+01', '2026-11-04 11:00+01', 0);
select public.approve_job_time('a4000000-0000-0000-0000-000000000004', '2026-11-05 07:00+01', '2026-11-05 11:00+01', 0);
select public.approve_job_time('a4000000-0000-0000-0000-000000000005', '2026-11-06 07:00+01', '2026-11-06 11:00+01', 0);
insert into public.job_lines (organization_id, job_id, description, quantity, unit_price, vat_rate) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000000000001', 'Ferje', 3, 12345, 25),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000000000001', 'Bompenger', 1, 8000, 0);

select throws_ok($$ select public.issue_invoice('a4000000-0000-0000-0000-000000000001') $$,
  '55000', null, 'no invoice before the invoice details are filled in');

-- The owner fills them in, first number 1001.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select public.save_invoice_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '123456785', 'Kranveien 5', '0581', 'Oslo', true, true, '12345678903', 14, null, null, 1001);

-- Who may not.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select throws_ok($$ select public.issue_invoice('a4000000-0000-0000-0000-000000000001') $$, '42501', null, 'a driver issues nothing');
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select throws_ok($$ select public.issue_invoice('a4000000-0000-0000-0000-000000000001') $$, '42501', null, 'an owner needs the second step');
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select throws_ok($$ select public.issue_invoice('a4000000-0000-0000-0000-000000000001') $$, '42501', null, 'another company issues nothing');

-- What may not be invoiced yet.
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select throws_ok($$ select public.issue_invoice('a4000000-0000-0000-0000-000000000002') $$, '55000', null, 'not before the time is approved');
select throws_ok($$ select public.issue_invoice('a4000000-0000-0000-0000-000000000004') $$, '55000', null,
  'not to a buyer without an address or organisation number');

-- Issued: number 1001, today, due in 14 days, the totals of the draft.
select lives_ok($$ select public.issue_invoice('a4000000-0000-0000-0000-000000000001') $$, 'the dispatcher issues the invoice');
select is((select number from public.invoices where job_id = 'a4000000-0000-0000-0000-000000000001'), 1001, 'with the first number');
select is((select due_date - issue_date from public.invoices where job_id = 'a4000000-0000-0000-0000-000000000001'), 14, 'due in 14 days');
select is((select row(net, vat, total)::text from public.invoices where job_id = 'a4000000-0000-0000-0000-000000000001'),
  '(1305035,324259,1629294)', 'with the totals of the draft');
select results_eq($$
  select l.position::int, l.description, l.unit, l.amount from public.invoice_lines l
  join public.invoices i on i.id = l.invoice_id where i.job_id = 'a4000000-0000-0000-0000-000000000001' order by l.position
$$, $$ values
  (1, 'Arbeidstid, Kranbil 1', 'timer'::text, 900000),
  (2, 'Arbeidstid med høyere sats, Kranbil 1', 'timer', 360000),
  (3, 'Ferje', null, 37035),
  (4, 'Bompenger', null, 8000)
$$, 'the lines, in Norwegian, in the order of the draft');
select is((select seller ->> 'bank_account' || ' ' || (seller ->> 'org_number') || ' ' || (buyer ->> 'name') || ' ' || (buyer ->> 'email')
  from public.invoices where number = 1001), '12345678903 123456785 Nordbygg AS faktura@nordbygg.test', 'seller and buyer copied');
select is((select reference from public.job_invoices where job_id = 'a4000000-0000-0000-0000-000000000001'), '1001',
  'the job is locked as sent, with the number');

select throws_ok($$ select public.issue_invoice('a4000000-0000-0000-0000-000000000001') $$, '55006', null, 'issued once');
select throws_ok($$ delete from public.job_invoices where job_id = 'a4000000-0000-0000-0000-000000000001' $$, '55006', null,
  'its mark cannot be taken back');
select throws_ok($$ update public.invoices set total = 1 where number = 1001 $$, '42501', null, 'nobody changes it');

-- A later change to the customer does not change the invoice.
update public.customers set name = 'Nordbygg Vest AS' where id = 'a2000000-0000-0000-0000-000000000001';
select is((select buyer ->> 'name' from public.invoices where number = 1001), 'Nordbygg AS', 'the invoice keeps the buyer as it was');

-- The failed tries above used no number: the next one is 1002.
select lives_ok($$ select public.issue_invoice('a4000000-0000-0000-0000-000000000003') $$, 'a second invoice');
select is((select array_agg(number order by number) from public.invoices), array[1001, 1002], 'numbered without gaps');

-- The PDF: added once at its own path, never removed.
select lives_ok(format($$ insert into storage.objects (bucket_id, name) values ('invoices', %L) $$,
  (select organization_id || '/' || id || '.pdf' from public.invoices where number = 1001)), 'the PDF is added');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('invoices', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/other.pdf') $$,
  '42501', null, 'but nothing else');
delete from storage.objects where bucket_id = 'invoices';
select is((select count(*)::int from storage.objects where bucket_id = 'invoices'), 1, 'and it is never removed');

-- The owner keeps the first number once the numbering has started.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select throws_ok($$ select public.save_invoice_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '123456785', 'Kranveien 5', '0581', 'Oslo', true, true, '12345678903', 14, null, null, 1) $$,
  '55006', null, 'the first number is locked after the first invoice');
select lives_ok($$ select public.save_invoice_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '123456785', 'Kranveien 7', '0581', 'Oslo', true, true, '12345678903', 30, null, null, 1001) $$,
  'the rest can still change');
select is((select seller ->> 'street' from public.invoices where number = 1001), 'Kranveien 5', 'without changing issued invoices');

-- Outside the VAT register: no VAT on the invoice.
select public.save_invoice_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '123456785', 'Kranveien 7', '0581', 'Oslo', false, true, '12345678903', 30, null, null, 1001);
select lives_ok($$ select public.issue_invoice('a4000000-0000-0000-0000-000000000005') $$, 'an invoice without VAT registration');
select is((select row(vat, total = net, (select max(vat_rate) from public.invoice_lines l where l.invoice_id = i.id))::text
  from public.invoices i where number = 1003), '(0,t,0)', 'charges no VAT');

-- Sander (driver) and Bjørn (another company) see nothing.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.invoices) + (select count(*)::int from public.invoice_lines)
  + (select count(*)::int from storage.objects where bucket_id = 'invoices'), 0, 'a driver sees no invoices or PDFs');
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.invoices) + (select count(*)::int from public.invoice_lines)
  + (select count(*)::int from storage.objects where bucket_id = 'invoices'), 0, 'nor does another company');

-- Not even the database owner changes an issued invoice.
reset role;
select throws_ok($$ update public.invoices set total = 1 where number = 1001 $$, '55006', null, 'the trigger refuses it for everyone');

select * from finish();
rollback;
