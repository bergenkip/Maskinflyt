-- Invoice settings: the office and the accountant read them, only owners and
-- admins with the second step change them, and only through
-- save_invoice_settings, which checks every field. Another company sees nothing.
-- All data is synthetic (.test e-mails, made-up numbers that pass MOD11).
begin;
select plan(23);

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'anna@fjellkran.test', now()),
  ('22222222-2222-2222-2222-222222222222', 'dina@fjellkran.test', now()),
  ('33333333-3333-3333-3333-333333333333', 'sander@fjellkran.test', now()),
  ('44444444-4444-4444-4444-444444444444', 'kari@fjellkran.test', now()),
  ('55555555-5555-5555-5555-555555555555', 'bjorn@vestmaskin.test', now());
insert into public.organizations (id, name, org_number) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS', null),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vest Maskin AS', '987654325');
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'dispatcher'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'driver'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'accountant'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'owner');

select ok(private.is_valid_bank_account('12345678903'), 'a kontonummer with the right check digit is valid');
select ok(not private.is_valid_bank_account('12345678904'), 'a wrong check digit is not');
select ok(not private.is_valid_bank_account('1234567890'), 'nor ten digits');

set local role authenticated;

-- Anna (owner) without the second step changes nothing.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select throws_ok($$ select public.save_invoice_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '123456785', 'Storgata 1', '0155', 'Oslo', true, true, '12345678903', 14) $$,
  '42501', null, 'an owner without the second step changes nothing');

-- With the second step: every field is checked.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select throws_ok($$ select public.save_invoice_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '123456789', 'Storgata 1', '0155', 'Oslo', true, true, '12345678903', 14) $$,
  '22023', null, 'an organisation number with a wrong check digit is refused');
select throws_ok($$ select public.save_invoice_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '', 'Storgata 1', '0155', 'Oslo', true, true, '12345678903', 14) $$,
  '22023', null, 'and so is none: every invoice needs it');
select throws_ok($$ select public.save_invoice_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '123456785', 'Storgata 1', '0155', 'Oslo', true, true, '12345678904', 14) $$,
  '22023', null, 'a bank account with a wrong check digit is refused');
select throws_ok($$ select public.save_invoice_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '123456785', 'Storgata 1', '155', 'Oslo', true, true, '12345678903', 14) $$,
  '22023', null, 'a Norwegian postal code has four digits');
select throws_ok($$ select public.save_invoice_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '123456785', '  ', '0155', 'Oslo', true, true, '12345678903', 14) $$,
  '22023', null, 'the street is needed');
select throws_ok($$ select public.save_invoice_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '123456785', 'Storgata 1', '0155', 'Oslo', true, true, '12345678903', 91) $$,
  '22023', null, 'payment terms go up to 90 days');
select throws_ok($$ select public.save_invoice_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '987 654 325', 'Storgata 1', '0155', 'Oslo', true, true, '12345678903', 14) $$,
  '23505', null, 'another company''s organisation number is taken');
select lives_ok($$ select public.save_invoice_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '123 456 785', ' Storgata   1 ', '0155', 'Oslo', true, true, '1234.56.78903', 14, 'Faktura@Fjellkran.test', '+47 912 34 567', 1001) $$,
  'the owner saves the settings');
select is((select row(street, postal_code, city, bank_account, payment_days, email, phone, first_number)::text from public.invoice_settings),
  '("Storgata 1",0155,Oslo,12345678903,14,faktura@fjellkran.test,+4791234567,1001)', 'cleaned as they are saved');
select is((select org_number from public.organizations where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), '123456785',
  'and the organisation number with them');
select lives_ok($$ select public.save_invoice_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '123456785', 'Storgata 1', '0155', 'Oslo', false, false, '15031234562', 30) $$,
  'and changes them again');
select is((select row(vat_registered, in_business_register, bank_account, payment_days, email, first_number)::text from public.invoice_settings),
  '(f,f,15031234562,30,,1)', 'one row, changed');
select throws_ok($$ insert into public.invoice_settings (organization_id, street, postal_code, city, bank_account) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'X', '0155', 'Oslo', '12345678903') $$,
  '42501', null, 'never written straight into the table');

-- Dina (dispatcher) and Kari (accountant) read them; they change nothing.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.invoice_settings), 1, 'the dispatcher reads them');
select throws_ok($$ select public.save_invoice_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '123456785', 'Storgata 1', '0155', 'Oslo', true, true, '12345678903', 14) $$,
  '42501', null, 'but changes nothing');
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.invoice_settings), 1, 'the accountant reads them');

-- Sander (driver) and Bjørn (another company) see nothing.
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.invoice_settings), 0, 'a driver sees nothing');
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.invoice_settings), 0, 'nor does another company');
select throws_ok($$ select public.save_invoice_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '123456785', 'Storgata 1', '0155', 'Oslo', true, true, '12345678903', 14) $$,
  '42501', null, 'and its owner changes nothing here');

select * from finish();
rollback;
