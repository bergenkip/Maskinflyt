-- Stage 16b: a job planned from an accepted request. Only an accepted request
-- of the same company, only once; the customer sees the time and the state of
-- their own job, nothing of anyone else's. Synthetic data (.test).
begin;
select plan(12);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000003', 'disponent@fjellkran.test', now(), '{}'),
  ('55555555-5555-5555-5555-555555555555', 'bjorn@vestmaskin.test', now(), '{}'),
  ('c0000000-0000-0000-0000-000000000001', 'kari@nordmann.test', now(), '{"account_type": "customer"}'),
  ('c0000000-0000-0000-0000-000000000002', 'ola@nordmann.test', now(), '{"account_type": "customer"}');
insert into public.organizations (id, name, org_number) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS', '123456785'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vest Maskin AS', '987654325');
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000003', 'dispatcher'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'dispatcher');
insert into public.company_pages (organization_id, slug, published, description, services, city, phone) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fjellkran-as', true, 'Kranbil.', array['crane_truck'], 'Bergen', '+4791234567');
insert into public.customers (id, organization_id, kind, name) values
  ('a2000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'private', 'Kari Nordmann'),
  ('b2000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'private', 'Kari Nordmann');

create function pg_temp.as_user(id text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', id, true),
         set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;

-- Kari sends two requests from her customer account.
set local role authenticated;
select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
select public.submit_job_request('fjellkran-as', 'Kari Nordmann', 'Strandgaten 1, Bergen', 'Løfte takstein.', '+4791234569');
select public.submit_job_request('fjellkran-as', 'Kari Nordmann', 'Strandgaten 1, Bergen', 'Løfte glass.', '+4791234569');
reset role;
create temp table ids as
  select (select id from public.job_requests where description = 'Løfte takstein.') as first,
         (select id from public.job_requests where description = 'Løfte glass.') as second;
grant select on ids to authenticated;
update public.job_requests set status = 'accepted' where description = 'Løfte takstein.';

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
select throws_ok(
  $$ insert into public.jobs (organization_id, customer_id, address, starts_at, ends_at, request_id)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001', 'Strandgaten 1, Bergen',
             '2026-12-01 08:00+01', '2026-12-01 12:00+01', (select second from ids)) $$,
  '23514', 'Only an accepted request can be planned', 'a request not yet accepted is not planned');
select lives_ok(
  $$ insert into public.jobs (organization_id, customer_id, address, starts_at, ends_at, request_id)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001', 'Strandgaten 1, Bergen',
             '2026-12-01 08:00+01', '2026-12-01 12:00+01', (select first from ids)) $$,
  'the office plans the accepted request');
select throws_ok(
  $$ insert into public.jobs (organization_id, customer_id, address, starts_at, ends_at, request_id)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001', 'Strandgaten 1, Bergen',
             '2026-12-02 08:00+01', '2026-12-02 12:00+01', (select first from ids)) $$,
  '23505', null, 'a request is planned once');
select throws_ok(
  $$ update public.jobs set request_id = (select second from ids) $$,
  '42501', null, 'a job is not moved to another request');

-- Another company cannot hang its job on Fjellkran's request.
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select throws_ok(
  $$ insert into public.jobs (organization_id, customer_id, address, starts_at, ends_at, request_id)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b2000000-0000-0000-0000-000000000001', 'Strandgaten 1, Bergen',
             '2026-12-01 08:00+01', '2026-12-01 12:00+01', (select first from ids)) $$,
  '23514', null, 'another company cannot plan the request');

-- Kari sees the planned time; the other request has none yet.
select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
select results_eq(
  $$ select job_status, job_starts_at, job_ends_at, time_zone from public.my_job_requests() where description = 'Løfte takstein.' $$,
  $$ values ('planned'::text, '2026-12-01 08:00+01'::timestamptz, '2026-12-01 12:00+01'::timestamptz, 'Europe/Oslo'::text) $$,
  'the customer sees the planned time of their job');
select is((select job_status from public.my_job_requests() where description = 'Løfte glass.'), null,
  'a request not planned has no job');
select is((select count(*)::int from public.jobs), 0, 'the customer reads no rows of the jobs table itself');

-- A cancelled job shows as cancelled, with the time it had.
reset role;
update public.jobs set status = 'cancelled';
set local role authenticated;
select is((select job_status from public.my_job_requests() where description = 'Løfte takstein.'), 'cancelled', 'a cancelled job shows as cancelled');

-- Ola sees nothing of Kari's job.
select pg_temp.as_user('c0000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.my_job_requests()), 0, 'another customer sees none of it');

-- Removing the request leaves the job, without the link.
reset role;
delete from public.job_requests where id = (select first from ids);
select is((select count(*)::int from public.jobs where request_id is null), 1, 'the job stays when the request is removed');

select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$ select * from public.my_job_requests() $$, '42501', null, 'visitors cannot list requests');
reset role;

select * from finish();
rollback;
