-- Stage 16c: what the customer was last told about a planned job. Only the
-- office of the same company records it, and only for a job planned from a
-- request. Synthetic data (.test).
begin;
select plan(8);

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000002', 'sjafor@fjellkran.test', now()),
  ('00000000-0000-0000-0000-000000000003', 'disponent@fjellkran.test', now()),
  ('55555555-5555-5555-5555-555555555555', 'bjorn@vestmaskin.test', now());
insert into public.organizations (id, name, org_number) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS', '123456785'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vest Maskin AS', '987654325');
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000002', 'driver'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000003', 'dispatcher'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'dispatcher');
insert into public.customers (id, organization_id, kind, name) values
  ('a2000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'private', 'Kari Nordmann');
insert into public.job_requests (id, organization_id, name, email, place, description, locale, status) values
  ('e0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Kari Nordmann', 'kari@nordmann.test', 'Bergen', 'Løfte takstein.', 'nb', 'accepted');
insert into public.jobs (id, organization_id, customer_id, address, starts_at, ends_at, request_id) values
  ('f0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001', 'Bergen',
   '2026-12-01 08:00+01', '2026-12-01 12:00+01', 'e0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001', 'Bergen',
   '2026-12-02 08:00+01', '2026-12-02 12:00+01', null);

create function pg_temp.as_user(id text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', id, true),
         set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
select lives_ok(
  $$ insert into public.job_customer_notices (job_id, organization_id, starts_at, ends_at)
     values ('f0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-12-01 08:00+01', '2026-12-01 12:00+01') $$,
  'the office records what the customer was told');
select lives_ok(
  $$ update public.job_customer_notices set starts_at = '2026-12-01 09:00+01', ends_at = '2026-12-01 13:00+01', sent_at = now() $$,
  'and the new time it sends later');
select throws_ok(
  $$ insert into public.job_customer_notices (job_id, organization_id, starts_at, ends_at)
     values ('f0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-12-02 08:00+01', '2026-12-02 12:00+01') $$,
  '23514', 'The job was not planned from a request', 'only a job planned from a request');
select throws_ok(
  $$ update public.job_customer_notices set job_id = 'f0000000-0000-0000-0000-000000000002' $$,
  '42501', null, 'a notice is not moved to another job');

-- The driver and another company: nothing to read, nothing to record.
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.job_customer_notices), 0, 'a driver reads no notices');
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select is((select count(*)::int from public.job_customer_notices), 0, 'another company reads no notices');
select throws_ok(
  $$ insert into public.job_customer_notices (job_id, organization_id, starts_at, ends_at)
     values ('f0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-12-01 08:00+01', '2026-12-01 12:00+01') $$,
  '23514', null, 'another company cannot record one: it does not even see the job');
select throws_ok(
  $$ insert into public.job_customer_notices (job_id, organization_id, starts_at, ends_at)
     values ('f0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2026-12-01 08:00+01', '2026-12-01 12:00+01') $$,
  '23514', null, 'nor under its own name for another company''s job');
reset role;

select * from finish();
rollback;
