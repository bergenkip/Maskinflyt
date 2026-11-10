-- E-mailing an issued invoice: only the office (as for issuing), only to a
-- valid address, only .test addresses in test mode, a few times a day; every
-- sending is recorded, finished once by the one who started it, never deleted.
-- Another company sees nothing. All data is synthetic (.test e-mails).
begin;
select plan(20);

select ok(not has_table_privilege('authenticated', 'public.invoice_sendings', 'insert'), 'recorded only through start_invoice_sending');
select ok(not has_table_privilege('authenticated', 'public.invoice_sendings', 'delete'), 'never deleted');

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
select throws_ok($$ select public.start_invoice_sending((select id from ids where name = 'invoice'), 'faktura@nordbygg.test', true) $$,
  '42501', null, 'a driver sends nothing');
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select throws_ok($$ select public.start_invoice_sending((select id from ids where name = 'invoice'), 'faktura@nordbygg.test', true) $$,
  '42501', null, 'an owner needs the second step');
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select throws_ok($$ select public.start_invoice_sending((select id from ids where name = 'invoice'), 'faktura@nordbygg.test', true) $$,
  '42501', null, 'another company sends nothing');
select is((select count(*)::int from public.invoice_sendings), 0, 'and sees no sendings');

-- What may not be sent.
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select throws_ok($$ select public.start_invoice_sending((select id from ids where name = 'invoice'), 'not an address', true) $$,
  '22023', null, 'not to an invalid address');
select throws_ok($$ select public.start_invoice_sending((select id from ids where name = 'invoice'), 'post@nordbygg.no', true) $$,
  '22023', null, 'in test mode, only to .test addresses');

-- Sent: recorded, then finished once by the one who started it.
insert into ids values ('first', public.start_invoice_sending((select id from ids where name = 'invoice'), ' Faktura@Nordbygg.TEST ', true));
select is((select to_email || ' ' || status || ' ' || test_mode from public.invoice_sendings where id = (select id from ids where name = 'first')),
  'faktura@nordbygg.test sending true', 'the sending is recorded, the address cleaned');
select is((select sent_by from public.invoice_sendings where id = (select id from ids where name = 'first')),
  '33333333-3333-3333-3333-333333333333'::uuid, 'with who sent it');

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select throws_ok($$ select public.finish_invoice_sending((select id from ids where name = 'first'), true, 'msg_1') $$,
  '42501', null, 'only the one who started it finishes it');

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select lives_ok($$ select public.finish_invoice_sending((select id from ids where name = 'first'), true, 'msg_1') $$, 'the sending is finished');
select is((select status || ' ' || provider_id || ' ' || (finished_at is not null) from public.invoice_sendings where id = (select id from ids where name = 'first')),
  'sent msg_1 true', 'as sent, with the message id');
select throws_ok($$ select public.finish_invoice_sending((select id from ids where name = 'first'), false) $$,
  '42501', null, 'and only once');

-- A failed sending is kept too.
select public.finish_invoice_sending(public.start_invoice_sending((select id from ids where name = 'invoice'), 'faktura@nordbygg.test', true), false);
select is((select array_agg(status order by created_at, status) from public.invoice_sendings), array['failed', 'sent'], 'a failed sending is kept');

-- Live mode (after the accountant's check) sends to any valid address.
select lives_ok($$ select public.start_invoice_sending((select id from ids where name = 'invoice'), 'post@nordbygg.no', false) $$,
  'in live mode, to any valid address');

-- A few a day: two more, then no more.
select public.start_invoice_sending((select id from ids where name = 'invoice'), 'faktura@nordbygg.test', true) from generate_series(1, 2);
select throws_ok($$ select public.start_invoice_sending((select id from ids where name = 'invoice'), 'faktura@nordbygg.test', true) $$,
  '54000', null, 'at most five sendings a day');

select throws_ok($$ update public.invoice_sendings set to_email = 'x@y.test' $$, '42501', null, 'nobody changes a record directly');

reset role;
select throws_ok($$ delete from public.invoice_sendings $$, '55006', null, 'not even the table owner deletes one');
select throws_ok($$ update public.invoice_sendings set to_email = 'x@y.test' where status = 'sent' $$, '55006', null,
  'nor changes a finished one');

select * from finish();
rollback;
