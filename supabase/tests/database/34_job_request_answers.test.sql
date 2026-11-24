-- Stage 15b-2: the office answers a request. Accepting adds or finds the
-- customer; a request is answered once; others cannot. Synthetic data (.test).
begin;
select plan(14);

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000001', 'eier@fjellkran.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'sjafor@fjellkran.test', now()),
  ('00000000-0000-0000-0000-000000000003', 'disponent@fjellkran.test', now()),
  ('55555555-5555-5555-5555-555555555555', 'bjorn@vestmaskin.test', now());
insert into public.organizations (id, name, org_number) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS', '123456785'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vest Maskin AS', '987654325');
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000002', 'driver'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000003', 'dispatcher'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'owner');
insert into public.company_pages (organization_id, slug, published, description, services, city, phone, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fjellkran-as', true, 'Kranbil.', array['crane_truck'], 'Bergen', '91234567', 'post@fjellkran.test');
-- An existing customer with Ola's phone number.
insert into public.customers (id, organization_id, kind, name, phone) values
  ('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'private', 'Ola Nordmann', '+4790000001');
insert into public.job_requests (id, organization_id, name, phone, email, place, description, locale) values
  ('e0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Kari Nordmann', '+4791234568', 'kari@nordmann.test', 'Bergen', 'Løfte takstein.', 'lt'),
  ('e0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ola N.', '+4790000001', null, 'Bergen', 'Graving.', 'nb'),
  ('e0000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Per', null, 'per@hansen.test', 'Bergen', 'Snø.', 'en');

create function pg_temp.as_user(id text, aal text default 'aal2') returns void language sql as $$
  select set_config('request.jwt.claim.sub', id, true),
         set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated', 'aal', aal)::text, true);
$$;

set local role authenticated;
-- A driver and another company cannot answer, and cannot tell the request exists.
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
select throws_ok($$ select public.answer_job_request('e0000000-0000-0000-0000-000000000001', true) $$,
  'P0002', 'Request not found', 'a driver cannot answer');
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select throws_ok($$ select public.answer_job_request('e0000000-0000-0000-0000-000000000001', true) $$,
  'P0002', 'Request not found', 'another company cannot answer');

-- The owner without the second step cannot; with it, accepting adds the customer.
select pg_temp.as_user('00000000-0000-0000-0000-000000000001', 'aal1');
select throws_ok($$ select public.answer_job_request('e0000000-0000-0000-0000-000000000001', true) $$,
  '42501', 'Two-step sign-in required', 'the owner needs the second step');
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select results_eq($$ select email, locale, name, company, page_email from public.answer_job_request('e0000000-0000-0000-0000-000000000001', true, '  Vi ringer deg i morgen. ') $$,
  $$ values ('kari@nordmann.test'::text, 'lt'::text, 'Kari Nordmann'::text, 'Fjellkran AS'::text, 'post@fjellkran.test'::text) $$,
  'accepting returns what the e-mail to the customer needs');
select results_eq($$ select c.kind::text, c.name, c.phone, c.email from public.customers c
  join public.job_requests r on r.customer_id = c.id where r.id = 'e0000000-0000-0000-0000-000000000001' $$,
  $$ values ('private'::text, 'Kari Nordmann'::text, '+4791234568'::text, 'kari@nordmann.test'::text) $$, 'a new private customer is added');
select results_eq($$ select status, answer, handled_by from public.job_requests where id = 'e0000000-0000-0000-0000-000000000001' $$,
  $$ values ('accepted'::text, 'Vi ringer deg i morgen.'::text, '00000000-0000-0000-0000-000000000001'::uuid) $$, 'the request is marked accepted, with the message');
select throws_ok($$ select public.answer_job_request('e0000000-0000-0000-0000-000000000001', false) $$,
  '55000', 'The request is already answered', 'a request is answered once');

-- A dispatcher accepts Ola: the existing customer is used, not a copy.
select pg_temp.as_user('00000000-0000-0000-0000-000000000003', 'aal1');
select is((select customer_id from public.answer_job_request('e0000000-0000-0000-0000-000000000002', true)),
  'c0000000-0000-0000-0000-000000000001'::uuid, 'the customer with the same phone is found');
select is((select count(*)::int from public.customers where phone = '+4790000001'), 1, 'no duplicate customer');

-- Declining adds no customer.
select throws_ok($$ select public.answer_job_request('e0000000-0000-0000-0000-000000000003', false, repeat('x', 1001)) $$,
  '22023', 'The message is too long', 'a message has a limit');
select is((select customer_id from public.answer_job_request('e0000000-0000-0000-0000-000000000003', false, 'Beklager, vi har ikke kapasitet.')),
  null, 'declining returns no customer');
select results_eq($$ select status, customer_id from public.job_requests where id = 'e0000000-0000-0000-0000-000000000003' $$,
  $$ values ('declined'::text, null::uuid) $$, 'the request is marked declined');
select is((select count(*)::int from public.customers where email = 'per@hansen.test'), 0, 'and no customer is added');

-- The table itself still cannot be changed directly.
select throws_ok($$ update public.job_requests set status = 'new' $$, '42501', null, 'the office cannot change requests directly');
reset role;

select * from finish();
rollback;
