-- Credit notes: only the office (as for issuing), only for an invoice, once,
-- in full, with a reason; numbered in the invoices' series without gaps, with
-- every amount negative; the job opens again for a new invoice. Nothing is
-- changed or deleted, and another company sees nothing.
-- All data is synthetic (.test e-mails, made-up numbers that pass MOD11).
begin;
select plan(22);

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

-- The owner fills them in, first number 1001.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select public.save_invoice_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '123456785', 'Kranveien 5', '0581', 'Oslo', true, true, '12345678903', 14, null, null, 1001);

-- Dina (dispatcher) issues invoice 1001.
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select public.issue_invoice('a4000000-0000-0000-0000-000000000001');
create temporary table ids (name text primary key, id uuid);
grant all on ids to authenticated;
insert into ids values ('invoice', (select id from public.invoices where number = 1001));


-- Who may not.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select throws_ok($$ select public.credit_invoice((select id from ids where name = 'invoice'), 'Feil antall timer') $$, '42501', null, 'a driver credits nothing');
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select throws_ok($$ select public.credit_invoice((select id from ids where name = 'invoice'), 'Feil antall timer') $$, '42501', null, 'an owner needs the second step');
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select throws_ok($$ select public.credit_invoice((select id from ids where name = 'invoice'), 'Feil antall timer') $$, '42501', null, 'another company credits nothing');

-- Dina credits it, with a reason.
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select throws_ok($$ select public.credit_invoice((select id from ids where name = 'invoice'), '   ') $$, '22023', null, 'not without a reason');
insert into ids values ('credit', public.credit_invoice((select id from ids where name = 'invoice'), '  Feil   antall timer '));
select is((select number from public.invoices where id = (select id from ids where name = 'credit')), 1002, 'the next number of the same series');
select is((select kind || ' ' || reason from public.invoices where id = (select id from ids where name = 'credit')),
  'credit_note Feil antall timer', 'a credit note, with the reason cleaned');
select is((select credits from public.invoices where id = (select id from ids where name = 'credit')),
  (select id from ids where name = 'invoice'), 'that credits the invoice');
select is((select row(net, vat, total)::text from public.invoices where id = (select id from ids where name = 'credit')),
  '(-1305035,-324259,-1629294)', 'every total negative');
select is((select due_date - issue_date from public.invoices where id = (select id from ids where name = 'credit')), 0, 'nothing to pay by a date');
select results_eq($$
  select l.position::int, l.quantity, l.amount from public.invoice_lines l
  where l.invoice_id = (select id from ids where name = 'credit') order by l.position
$$, $$ values (1, -7.50::numeric(12, 2), -900000), (2, -2.00, -360000), (3, -3.00, -37035), (4, -1.00, -8000) $$,
  'the lines, negative');
select is((select seller ->> 'name' || ' / ' || (buyer ->> 'name') from public.invoices where id = (select id from ids where name = 'credit')),
  'Fjellkran AS / Nordbygg AS', 'seller and buyer as on the invoice');
select is((select count(*)::int from public.job_invoices where job_id = 'a4000000-0000-0000-0000-000000000001'), 0,
  'the job opens again');

select throws_ok($$ select public.credit_invoice((select id from ids where name = 'invoice'), 'En gang til') $$, '55006', null, 'credited once');
select throws_ok($$ select public.credit_invoice((select id from ids where name = 'credit'), 'Kreditnota') $$, '55000', null,
  'a credit note is not credited');
select throws_ok($$ update public.invoices set reason = 'x' where id = (select id from ids where name = 'credit') $$, '42501', null,
  'nobody changes a credit note');

-- The draft is corrected and invoiced anew: 1003.
update public.job_lines set quantity = 2 where description = 'Ferje';
select lives_ok($$ select public.issue_invoice('a4000000-0000-0000-0000-000000000001') $$, 'a new invoice for the same job');
select is((select array_agg(number || ' ' || kind order by number) from public.invoices),
  array['1001 invoice', '1002 credit_note', '1003 invoice'], 'numbered without gaps, in one series');
select is((select total from public.invoices where number = 1003), 1613863, 'with the corrected draft');
select throws_ok($$ delete from public.job_invoices where job_id = 'a4000000-0000-0000-0000-000000000001' $$, '55006', null,
  'its mark cannot be taken back again');

-- The credit note is e-mailed as an invoice is.
select lives_ok($$ select public.start_invoice_sending((select id from ids where name = 'credit'), 'faktura@nordbygg.test', true) $$,
  'the credit note can be e-mailed');

select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.invoices), 0, 'another company sees no invoices or credit notes');

reset role;
select throws_ok($$ delete from public.invoices where kind = 'credit_note' $$, '55006', null, 'not even the table owner deletes one');

select * from finish();
rollback;
