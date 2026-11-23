-- Subscriptions: every company starts a 30-day trial; members read their own
-- subscription and nobody writes it from the app; a plan caps the number of
-- people. All data is synthetic (.test e-mails).
begin;
select plan(13);

insert into auth.users (id, email, email_confirmed_at)
select ('00000000-0000-0000-0000-00000000000' || n)::uuid, 'person' || n || '@fjellkran.test', now() from generate_series(1, 7) n;
insert into auth.users (id, email, email_confirmed_at) values ('55555555-5555-5555-5555-555555555555', 'bjorn@vestmaskin.test', now());
insert into public.organizations (id, name, org_number) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS', '123456785'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vest Maskin AS', '987654325');
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'owner');

select results_eq(
  $$ select status, plan, trial_ends_at between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour' from public.subscriptions order by organization_id $$,
  $$ values ('trialing', null::text, true), ('trialing', null::text, true) $$,
  'a new company tries the app for 30 days, without a plan');

-- In the trial there is no limit on people.
insert into public.memberships (organization_id, user_id, role)
select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', ('00000000-0000-0000-0000-00000000000' || n)::uuid, 'driver' from generate_series(2, 6) n;
select is((select count(*)::int from public.memberships where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 6, 'six people in the trial');

create function pg_temp.as_user(id text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', id, true),
         set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.subscriptions), 1, 'a member reads only the own company''s subscription');
select results_eq($$ select taken, seats from public.seat_usage('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$, $$ values (6, null::int) $$, 'six people, no limit yet');
select throws_ok($$ update public.subscriptions set status = 'active', plan = 'bedrift' $$, '42501', null, 'the owner cannot mark the company as paid');
select throws_ok($$ insert into public.subscriptions (organization_id, plan, status) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pro', 'active') $$, '42501', null, '… nor add a subscription');
select throws_ok($$ select public.seat_usage('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$, '42501', null, 'another company''s numbers are not shown');
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select is((select count(*)::int from public.subscriptions where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'another company reads nothing');
reset role;

-- The server records Start (up to 5 people): nobody more can join; Pro has room.
update public.subscriptions set plan = 'start', status = 'active', billing_interval = 'month'
where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select throws_ok($$ insert into public.memberships (organization_id, user_id, role) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000007', 'driver') $$,
  '53400', 'The company''s plan includes 5 people', 'Start includes 5 people');
update public.subscriptions set plan = 'pro' where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select lives_ok($$ insert into public.memberships (organization_id, user_id, role) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000007', 'driver') $$,
  'Pro has room for a seventh');
-- Signing up from an invitation when the plan is full: the account is made, the invitation stays open.
update public.subscriptions set plan = 'solo' where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into public.invitations (organization_id, role, token_hash)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'driver', private.hash_token('f' || repeat('2', 63)));
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000009', 'person9@fjellkran.test', now(), json_build_object('invite_token', 'f' || repeat('2', 63))::jsonb);
select is((select count(*)::int from public.memberships where user_id = '00000000-0000-0000-0000-000000000009'), 0, 'a full plan does not take a new person at sign-up');
select is((select accepted_at from public.invitations where token_hash = private.hash_token('f' || repeat('2', 63))), null, '… and the invitation stays open');
select throws_ok($$ update public.subscriptions set stripe_subscription_id = 'sub_1', plan = null $$, '23514', null, 'a paid subscription always has a plan');

select * from finish();
rollback;
