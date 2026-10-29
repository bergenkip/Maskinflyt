-- Customers and their own prices: who may read and change them, and that
-- company A never sees company B's. All data is synthetic (.test e-mails).
begin;
select plan(31);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.customers'::regclass),
  'RLS is enabled on customers'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.customer_rates'::regclass),
  'RLS is enabled on customer prices'
);
select ok(not has_table_privilege('anon', 'public.customers', 'select'), 'anon cannot read customers');
select ok(not has_table_privilege('anon', 'public.customer_rates', 'select'), 'anon cannot read customer prices');
select ok(not has_table_privilege('authenticated', 'public.customers', 'delete'), 'nobody can delete a customer from the browser');

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'anna@fjellkran.test', now()),
  ('22222222-2222-2222-2222-222222222222', 'ola@fjellkran.test', now()),
  ('33333333-3333-3333-3333-333333333333', 'dina@fjellkran.test', now()),
  ('44444444-4444-4444-4444-444444444444', 'sander@fjellkran.test', now()),
  ('55555555-5555-5555-5555-555555555555', 'bjorn@vestmaskin.test', now());
insert into public.organizations (id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vest Maskin AS');
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'admin'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'dispatcher'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'driver'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'owner');
insert into public.vehicles (id, organization_id, type, name, hourly_rate) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'crane_truck', 'Kranbil 1', 145000),
  ('b1000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'excavator', 'Gravemaskin 1', 120000);
insert into public.customers (id, organization_id, name, org_number) values
  ('b2000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vest Bygg AS', '123456785');

set local role authenticated;

-- Dina (dispatcher, no second step) takes an order by phone from a new customer.
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select lives_ok(
  $$ insert into public.customers (organization_id, name, org_number, phone, email, street, postal_code, city)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nordbygg AS', '123456785', '+4791234567', 'post@nordbygg.test', 'Storgata 1', '0155', 'Oslo') $$,
  'a dispatcher can add a customer'
);
select throws_ok(
  $$ insert into public.customers (organization_id, name, org_number)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nordbygg Two AS', '123456785') $$,
  '23505', null,
  'the same organization number cannot be added twice in one company'
);
select lives_ok(
  $$ insert into public.customers (organization_id, kind, name, phone)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'private', 'Kari Nordmann', '41234567') $$,
  'a private person can be a customer'
);
select throws_ok(
  $$ insert into public.customers (organization_id, kind, name, org_number)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'private', 'Per Hansen', '987654321') $$,
  '23514', null,
  'a private person has no organization number'
);
select throws_ok(
  $$ insert into public.customers (organization_id, name, postal_code)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Feil AS', '155') $$,
  '23514', null,
  'a postal code has four digits'
);
select throws_ok(
  $$ insert into public.customers (organization_id, name, email)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Feil AS', 'not-an-address') $$,
  '23514', null,
  'an e-mail address needs an @ and a domain'
);
select throws_ok(
  $$ insert into public.customers (organization_id, name)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Planted AS') $$,
  '42501', null,
  'a dispatcher cannot add a customer to another company'
);
update public.customers set city = 'Lillestrøm', postal_code = '2000' where org_number = '123456785';
select results_eq(
  $$ select city, postal_code from public.customers where org_number = '123456785' $$,
  $$ values ('Lillestrøm'::text, '2000'::text) $$,
  'a dispatcher can change a customer'
);
select results_eq(
  $$ select name from public.customers where search like '%' || 'oslo' || '%' or search like '%4123%' order by name $$,
  $$ values ('Kari Nordmann') $$,
  'the list can be searched by phone (and the old city is gone)'
);
select throws_ok(
  $$ insert into public.customer_rates (organization_id, customer_id, vehicle_id, hourly_rate)
     select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', id, 'a1000000-0000-0000-0000-000000000001', 130000
     from public.customers where org_number = '123456785' $$,
  '42501', null,
  'a dispatcher cannot set a customer''s own price'
);
select throws_ok(
  $$ delete from public.customers where org_number = '123456785' $$,
  '42501', null,
  'a customer cannot be deleted'
);

-- Anna (owner, with the e-mailed second step) gives Nordbygg its own crane price.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select lives_ok(
  $$ insert into public.customer_rates (organization_id, customer_id, vehicle_id, hourly_rate)
     select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', id, 'a1000000-0000-0000-0000-000000000001', 130000
     from public.customers where org_number = '123456785' $$,
  'an owner can set a customer''s own price for a machine'
);
select throws_ok(
  $$ insert into public.customer_rates (organization_id, customer_id, vehicle_id, hourly_rate)
     select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', id, 'a1000000-0000-0000-0000-000000000001', 125000
     from public.customers where org_number = '123456785' $$,
  '23505', null,
  'one customer has one price per machine'
);
select throws_ok(
  $$ insert into public.customer_rates (organization_id, customer_id, vehicle_id, hourly_rate)
     select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', id, 'b1000000-0000-0000-0000-000000000001', 100000
     from public.customers where org_number = '123456785' $$,
  '23503', null,
  'a price cannot point at another company''s machine'
);
select throws_ok(
  $$ insert into public.customer_rates (organization_id, customer_id, vehicle_id, hourly_rate)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 100000) $$,
  '23503', null,
  'a price cannot point at another company''s customer'
);
select throws_ok(
  $$ update public.customers set organization_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' where org_number = '123456785' $$,
  '42501', null,
  'a customer cannot be moved to another company'
);
select results_eq(
  $$ select name from public.customers order by name $$,
  $$ values ('Kari Nordmann'), ('Nordbygg AS') $$,
  'an owner sees only her own company''s customers'
);

-- Anna with only her password: no price changes
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
update public.customer_rates set hourly_rate = 1 where vehicle_id = 'a1000000-0000-0000-0000-000000000001';
update public.customers set name = 'Changed without link' where org_number = '123456785';
delete from public.customer_rates where vehicle_id = 'a1000000-0000-0000-0000-000000000001';

-- Ola (admin, with the second step) changes the price and switches a customer off
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select results_eq(
  $$ select hourly_rate from public.customer_rates $$,
  $$ values (130000) $$,
  'without the second step an owner could not change or remove a price'
);
select is(
  (select name from public.customers where org_number = '123456785'),
  'Nordbygg AS',
  'without the second step an owner could not change a customer'
);
update public.customer_rates set hourly_rate = 135000;
update public.customers set active = false where name = 'Kari Nordmann';
select results_eq(
  $$ select hourly_rate from public.customer_rates $$,
  $$ values (135000) $$,
  'an admin can change a customer''s price'
);
select is(
  (select active from public.customers where name = 'Kari Nordmann'),
  false,
  'an admin can switch a customer off'
);

-- Dina (dispatcher) reads the price but cannot remove it
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
delete from public.customer_rates;
select is((select count(*)::int from public.customer_rates), 1, 'a dispatcher sees the price and could not remove it');

-- Sander (driver) sees no customers and no prices
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select is((select count(*)::int from public.customers), 0, 'a driver does not see the customer list');
select is((select count(*)::int from public.customer_rates), 0, 'a driver does not see customer prices');

-- Bjørn (owner of company B) sees only his own customer, and no prices of company A
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select results_eq(
  $$ select name from public.customers $$,
  $$ values ('Vest Bygg AS') $$,
  'company B sees only its own customer'
);
select is((select count(*)::int from public.customer_rates), 0, 'company B sees none of company A''s prices');

select * from finish(true);
rollback;
