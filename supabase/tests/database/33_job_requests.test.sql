-- Stage 15b: requests from the company page. Visitors send them to a published
-- page only, within limits; the office reads them, nobody else. Synthetic data (.test).
begin;
select plan(17);

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
-- Fjellkran's page is published; Vest Maskin's is hidden.
insert into public.company_pages (organization_id, slug, published, description, services, city, phone, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fjellkran-as', true, 'Kranbil.', array['crane_truck'], 'Bergen', '91234567', 'post@fjellkran.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'vest-maskin', false, null, '{}', null, null, null);

create function pg_temp.as_user(id text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', id, true),
         set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;

-- A visitor without an account.
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select results_eq($$ select company, notify_email from public.submit_job_request('Fjellkran-AS', '  Kari   Nordmann ', 'Strandgaten 1, Bergen',
  'Løfte takstein til 3. etasje.', '+47 912 34 568', null, current_date + 7, 'crane_truck', 'lt') $$,
  $$ values ('Fjellkran AS'::text, 'post@fjellkran.test'::text) $$, 'a visitor sends a request; the company and its e-mail are returned');
select throws_ok($$ select public.submit_job_request('vest-maskin', 'Kari', 'Bergen', 'Graving.', '91234568') $$,
  'P0002', 'The page does not take requests', 'not to a hidden page');
select throws_ok($$ select public.submit_job_request('finnes-ikke', 'Kari', 'Bergen', 'Graving.', '91234568') $$,
  'P0002', 'The page does not take requests', 'not to a page that does not exist');
select throws_ok($$ select public.submit_job_request('fjellkran-as', 'Kari', 'Bergen', 'Graving.') $$,
  '22023', 'A phone or e-mail is needed', 'a phone or e-mail is needed');
select throws_ok($$ select public.submit_job_request('fjellkran-as', 'Kari', 'Bergen', 'Graving.', null, 'ikke-epost') $$,
  '22023', 'Invalid e-mail', 'a bad e-mail is refused');
select throws_ok($$ select public.submit_job_request('fjellkran-as', '   ', 'Bergen', 'Graving.', '91234568') $$,
  '22023', 'Invalid name', 'a name is needed');
select throws_ok($$ select public.submit_job_request('fjellkran-as', 'Kari', 'Bergen', 'Graving.', '91234568', null, null, 'rocket') $$,
  '22023', 'Invalid service', 'only services from the list');
select throws_ok($$ select public.submit_job_request('fjellkran-as', 'Kari', 'Bergen', 'Graving.', '91234568', null, current_date - 30) $$,
  '22023', 'Invalid date', 'not a date long past');
select throws_ok($$ select * from public.job_requests $$, '42501', null, 'visitors cannot read requests');
select throws_ok($$ insert into public.job_requests (organization_id, name, place, description, phone)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'X', 'Y', 'Z', '91234567') $$, '42501', null, 'nor write the table directly');

-- The same phone at most 3 times an hour.
select lives_ok($$ select public.submit_job_request('fjellkran-as', 'Kari', 'Bergen', 'To.', '+4791234568');
  select public.submit_job_request('fjellkran-as', 'Kari', 'Bergen', 'Tre.', '+4791234568') $$, 'two more from the same phone');
select throws_ok($$ select public.submit_job_request('fjellkran-as', 'Kari', 'Bergen', 'Fire.', '+47 912 34 568') $$,
  '54000', 'Too many requests, try again later', 'the fourth within an hour is refused');
reset role;

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select results_eq($$ select name, phone, locale, status from public.job_requests order by created_at limit 1 $$,
  $$ values ('Kari Nordmann'::text, '+4791234568'::text, 'lt'::text, 'new'::text) $$, 'the owner reads it, cleaned');
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.job_requests), 3, 'a dispatcher reads them');
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.job_requests), 0, 'a driver does not');
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select is((select count(*)::int from public.job_requests), 0, 'another company does not');
reset role;

-- A company whose subscription ended takes no requests.
update public.subscriptions set status = 'canceled' where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
set local role anon;
select throws_ok($$ select public.submit_job_request('fjellkran-as', 'Ola', 'Bergen', 'Graving.', '91234599') $$,
  'P0002', 'The page does not take requests', 'a read-only company takes no requests');
reset role;

select * from finish();
rollback;
