-- Stage 14b: a company whose trial is over without a plan, or whose subscription
-- Stripe has ended, can only read. All data is synthetic (.test e-mails).
begin;
select plan(18);

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000001', 'eier@fjellkran.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'sjafor@fjellkran.test', now()),
  ('55555555-5555-5555-5555-555555555555', 'bjorn@vestmaskin.test', now());
insert into public.organizations (id, name, org_number) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS', '123456785'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vest Maskin AS', '987654325');
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000002', 'driver'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'owner');
insert into public.customers (id, organization_id, name) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Byggmester Hansen AS');
-- The driver has a job, so removing the driver also changes the job (a cascade).
insert into public.jobs (organization_id, number, customer_id, driver_id, address, starts_at, ends_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 'cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000002',
   'Strandgaten 1, Bergen', now(), now() + interval '2 hours');

create function pg_temp.as_user(id text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', id, true),
         set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;
create function pg_temp.set_status(new_status text, trial_end timestamptz, sub text) returns void language sql as $$
  update public.subscriptions set status = new_status, trial_ends_at = trial_end, stripe_subscription_id = sub,
    plan = case when sub is null then null else 'pro' end
  where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
$$;

select is(private.is_read_only('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), false, 'a company in its trial can write');

-- The trial ends without a plan.
select pg_temp.set_status('trialing', now() - interval '1 minute', null);
select is(private.is_read_only('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), true, 'the trial is over and no plan was chosen: read-only');

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.customers), 1, 'the owner still reads the customers');
select throws_ok($$ insert into public.customers (organization_id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ny Kunde AS') $$,
  '42501', 'The company''s subscription is not active: its data can only be read', 'no new customer');
select throws_ok($$ update public.customers set name = 'Endret AS' $$,
  '42501', 'The company''s subscription is not active: its data can only be read', 'no change to a customer');
select throws_ok($$ update public.jobs set address = 'Kaien 2, Bergen' $$,
  '42501', 'The company''s subscription is not active: its data can only be read', 'no change to a job');
select throws_ok($$ update public.organizations set name = 'Nytt Navn AS' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501', 'The company''s subscription is not active: its data can only be read', 'no change to the company');
select throws_ok($$ select public.create_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'driver') $$,
  '42501', 'The company''s subscription is not active: its data can only be read', 'a database function cannot write either (no invitation)');
select lives_ok($$ select public.remove_member((select id from public.memberships where user_id = '00000000-0000-0000-0000-000000000002')) $$,
  'a person can still be removed, to fit a smaller plan');
select is((select driver_id from public.jobs), null, '… and their job is left without a driver');

-- Another company is not affected.
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select lives_ok($$ insert into public.customers (organization_id, name) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Kunde Vest AS') $$,
  'another company in its trial still writes');
reset role;

-- A plan chosen during the trial, a payment Stripe is still retrying, and an ended subscription.
select pg_temp.set_status('trialing', now() - interval '1 minute', 'sub_A1');
select is(private.is_read_only('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), false, 'a plan chosen during the trial: writable');
select pg_temp.set_status('past_due', now() - interval '1 day', 'sub_A1');
select is(private.is_read_only('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), false, 'Stripe still retrying a failed payment: writable');
select pg_temp.set_status('canceled', now() - interval '1 day', 'sub_A1');
select is(private.is_read_only('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), true, 'the subscription ended: read-only');
select pg_temp.set_status('unpaid', now() - interval '1 day', 'sub_A1');
select is(private.is_read_only('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), true, 'unpaid: read-only');

-- Paying again opens the company for writing.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select throws_ok($$ insert into public.customers (organization_id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ny Kunde AS') $$,
  '42501', 'The company''s subscription is not active: its data can only be read', 'still read-only before paying');
reset role;
select pg_temp.set_status('active', now() - interval '1 day', 'sub_A1');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select lives_ok($$ insert into public.customers (organization_id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ny Kunde AS') $$,
  'after paying the company writes again');
reset role;
select is((select count(*)::int from public.customers where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 2, 'two customers now');

select * from finish();
rollback;
