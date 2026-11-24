-- Stage 16a: customer accounts. A customer sees only their own account and
-- requests; a request is linked to the account that sent it, never to another.
-- Synthetic data (.test).
begin;
select plan(16);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'eier@fjellkran.test', now(), '{}'),
  ('c0000000-0000-0000-0000-000000000001', 'kari@nordmann.test', now(), '{"account_type": "customer", "first_name": "Kari"}'),
  ('c0000000-0000-0000-0000-000000000002', 'ola@nordmann.test', now(), '{"account_type": "customer"}'),
  ('c0000000-0000-0000-0000-000000000003', 'per@nordmann.test', now(), '{}');
insert into public.organizations (id, name, org_number) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS', '123456785'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vest Maskin AS', '987654325');
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000001', 'owner');
insert into public.company_pages (organization_id, slug, published, description, services, city, phone) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fjellkran-as', true, 'Kranbil.', array['crane_truck'], 'Bergen', '+4791234567'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'vest-maskin', true, 'Graving.', array['excavation'], 'Stord', '+4791234568');

create function pg_temp.as_user(id text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', id, true),
         set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;

select is((select count(*)::int from public.customer_accounts), 2, 'signing up as a customer makes the customer account');

set local role authenticated;
select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
select lives_ok($$ select public.save_customer_account('+47 912 34 569', ' Strandgaten 1,  Bergen ') $$, 'the customer saves phone and place');
select results_eq($$ select phone, place from public.customer_accounts $$,
  $$ values ('+4791234569'::text, 'Strandgaten 1, Bergen'::text) $$, 'only their own row, cleaned');
select throws_ok($$ select public.save_customer_account('12') $$, '22023', 'Invalid phone', 'a bad phone is refused');
select throws_ok($$ update public.customer_accounts set phone = '+4700000000' $$, '42501', null, 'nobody updates the table directly');

-- Kari sends two requests to Fjellkran and one to Vest Maskin.
select lives_ok($$ select public.submit_job_request('fjellkran-as', 'Kari Nordmann', 'Strandgaten 1, Bergen', 'Løfte takstein.', '+4791234569') $$,
  'a signed-in customer sends a request');
select lives_ok($$ select public.submit_job_request('fjellkran-as', 'Kari Nordmann', 'Strandgaten 1, Bergen', 'Løfte glass.', '+4791234569') $$,
  'and another');
select lives_ok($$ select public.submit_job_request('vest-maskin', 'Kari Nordmann', 'Strandgaten 1, Bergen', 'Grave grøft.', '+4791234569') $$,
  'and one to another company');
select results_eq($$ select company, status from public.my_job_requests() order by company, description $$,
  $$ values ('Fjellkran AS'::text, 'new'::text), ('Fjellkran AS', 'new'), ('Vest Maskin AS', 'new') $$,
  'the customer sees their own requests with the company');
select results_eq($$ select slug, requests from public.my_companies() $$,
  $$ values ('fjellkran-as'::text, 2), ('vest-maskin'::text, 1) $$, 'the most used company comes first');
select is((select count(*)::int from public.job_requests), 0, 'a customer reads no rows of the requests table itself');

-- Ola (another customer) sees nothing of Kari's.
select pg_temp.as_user('c0000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.my_job_requests()), 0, 'another customer sees none of them');
select is((select count(*)::int from public.customer_accounts), 1, 'another customer reads only their own account');

-- Per has a login but no customer account: the request is not linked.
select pg_temp.as_user('c0000000-0000-0000-0000-000000000003');
select lives_ok($$ select public.submit_job_request('fjellkran-as', 'Per Hansen', 'Fjellveien 9', 'Grave.', '+4791234570') $$,
  'a login without a customer account still sends a request');
reset role;
select is((select count(*)::int from public.job_requests where user_id is not null), 3, 'only the customer''s requests are linked');

-- Visitors: no functions for them.
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$ select * from public.my_job_requests() $$, '42501', null, 'visitors cannot list requests');
reset role;

select * from finish();
rollback;
