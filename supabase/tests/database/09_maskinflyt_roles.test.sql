-- Maskinflyt roles: owner, admin, dispatcher, driver. All data is synthetic (.test e-mails).
begin;
select plan(12);

select results_eq(
  $$ select unnest(enum_range(null::public.member_role))::text $$,
  $$ values ('owner'), ('admin'), ('dispatcher'), ('driver') $$,
  'the roles are owner, admin, dispatcher and driver'
);

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'anna@fjellkran.test', now()),
  ('22222222-2222-2222-2222-222222222222', 'ola@fjellkran.test', now()),
  ('33333333-3333-3333-3333-333333333333', 'dina@fjellkran.test', now()),
  ('44444444-4444-4444-4444-444444444444', 'sander@fjellkran.test', now()),
  ('55555555-5555-5555-5555-555555555555', 'bjorn@vestmaskin.test', now());
insert into public.organizations (id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vest Maskin AS');
insert into public.memberships (id, organization_id, user_id, role) values
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'admin'),
  ('a0000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'dispatcher'),
  ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'owner');
-- Sander joins without a role given: he becomes a driver, the least access.
insert into public.memberships (id, organization_id, user_id) values
  ('a0000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444');
select is(
  (select role::text from public.memberships where id = 'a0000000-0000-0000-0000-000000000004'),
  'driver',
  'a membership without a role is a driver'
);

set local role authenticated;

-- Ola (admin, with the e-mailed second step) invites a dispatcher and a driver
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select lives_ok(
  $$ select public.create_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dispatcher') $$,
  'an admin can invite a dispatcher'
);
select lives_ok(
  $$ select public.create_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'driver') $$,
  'an admin can invite a driver'
);
select results_eq(
  $$ select role::text from public.list_members('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  $$ values ('owner'), ('admin'), ('dispatcher'), ('driver') $$,
  'the team is listed owner, admin, dispatcher, driver'
);

-- Dina (dispatcher) sees her team but cannot manage people
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.list_members('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  4,
  'a dispatcher sees the four members of her company'
);
select throws_ok(
  $$ select public.create_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'driver') $$,
  '42501', null,
  'a dispatcher cannot invite'
);
select throws_ok(
  $$ select public.change_member_role('a0000000-0000-0000-0000-000000000004', 'dispatcher') $$,
  '42501', null,
  'a dispatcher cannot change a driver''s role'
);
select throws_ok(
  $$ select public.list_members('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$,
  '42501', null,
  'a dispatcher cannot see another company''s team'
);

-- Sander (driver) cannot promote himself or remove anyone
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select throws_ok(
  $$ select public.change_member_role('a0000000-0000-0000-0000-000000000004', 'dispatcher') $$,
  '42501', null,
  'a driver cannot make himself a dispatcher'
);
select throws_ok(
  $$ select public.remove_member('a0000000-0000-0000-0000-000000000003') $$,
  '42501', null,
  'a driver cannot remove a colleague'
);
select throws_ok(
  $$ select public.list_members('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$,
  '42501', null,
  'a driver cannot see another company''s team'
);

select * from finish(true);
rollback;
