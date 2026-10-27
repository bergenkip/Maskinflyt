-- Invitation links and role management. All data is synthetic (.test e-mails).
begin;
select plan(35);

-- The secret link tokens handed out during the test.
create temporary table links (name text primary key, token text) on commit drop;
grant all on links to anon, authenticated;

-- Arrange (as the database owner, bypassing RLS)
-- Anna owns company A, Ola is admin there, Per is dispatcher there.
-- Bjørn owns company B. Kari and Lise have no company yet.
insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'anna@fjordverktoy.test', now()),
  ('22222222-2222-2222-2222-222222222222', 'ola@fjordverktoy.test', now()),
  ('33333333-3333-3333-3333-333333333333', 'per@fjordverktoy.test', now()),
  ('44444444-4444-4444-4444-444444444444', 'bjorn@nordpakk.test', now()),
  ('55555555-5555-5555-5555-555555555555', 'kari@fjordverktoy.test', now()),
  ('66666666-6666-6666-6666-666666666666', 'lise@fjordverktoy.test', now());

insert into public.organizations (id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjord Verktøy AS'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Nordpakk AS');

insert into public.memberships (id, organization_id, user_id, role) values
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'admin'),
  ('a0000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'dispatcher'),
  ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', 'owner');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.invitations'::regclass),
  'RLS is enabled on invitations'
);

set local role authenticated;

-- Per (dispatcher) can see the team but not invite
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select is(
  (select count(*)::int from public.list_members('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  3,
  'a dispatcher sees the three members of his company'
);
select is(
  (select email from public.list_members('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') limit 1),
  'anna@fjordverktoy.test',
  'the owner is listed first'
);
select throws_ok(
  $$ select public.create_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'driver') $$,
  '42501', null,
  'a dispatcher cannot invite'
);
select throws_ok(
  $$ select public.change_member_role('a0000000-0000-0000-0000-000000000003', 'admin') $$,
  '42501', null,
  'a dispatcher cannot change his own role'
);
select throws_ok(
  $$ insert into public.invitations (organization_id, role, token_hash) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'driver', repeat('a', 64)) $$,
  '42501', null,
  'invitations cannot be written directly from the browser'
);

-- Bjørn (other company) sees nothing of company A
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select throws_ok(
  $$ select * from public.list_members('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  '42501', null,
  'another company cannot list the members'
);
select throws_ok(
  $$ select public.create_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin') $$,
  '42501', null,
  'another company cannot invite into company A'
);
select throws_ok(
  $$ select public.remove_member('a0000000-0000-0000-0000-000000000003') $$,
  'P0002', null,
  'another company cannot remove a member of company A'
);

-- Ola (admin) creates invitation links
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1790000000}]}', true);
insert into links values
  ('kari', (select public.create_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dispatcher'))),
  ('cancelled', (select public.create_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'driver')));
select matches(
  (select token from links where name = 'kari'),
  '^[0-9a-f]{64}$',
  'an admin gets a long random link token'
);
select isnt(
  (select token from links where name = 'kari'),
  (select token from links where name = 'cancelled'),
  'every invitation gets its own token'
);
select is(
  (select count(*)::int from public.invitations where token_hash = (select token from links where name = 'kari')),
  0,
  'the token itself is not stored, only its hash'
);
select is(
  (select count(*)::int from public.invitations where email is null and role = 'dispatcher'),
  1,
  'an invitation needs no e-mail address'
);
select throws_ok(
  $$ select public.create_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner') $$,
  '22023', null,
  'nobody can be invited straight in as owner'
);
select lives_ok(
  $$ select public.revoke_invitation((select id from public.invitations where role = 'driver')) $$,
  'an admin can cancel an invitation'
);
select throws_ok(
  $$ select public.change_member_role('a0000000-0000-0000-0000-000000000001', 'admin') $$,
  '42501', null,
  'an admin cannot change the owner'
);
select throws_ok(
  $$ select public.change_member_role('a0000000-0000-0000-0000-000000000003', 'owner') $$,
  '42501', null,
  'an admin cannot make someone owner'
);
select lives_ok(
  $$ select public.change_member_role('a0000000-0000-0000-0000-000000000003', 'driver') $$,
  'an admin can change a dispatcher to driver'
);

-- Bjørn cannot see company A's invitations
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select is((select count(*)::int from public.invitations), 0, 'another company sees no invitations');
select throws_ok(
  $$ select public.accept_invitation((select token from links where name = 'kari')) $$,
  'P0001', null,
  'someone who already has a company cannot join another'
);

-- A visitor who is not signed in sees only what a valid link shows
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq(
  $$ select organization_name, role::text from public.invitation_preview((select token from links where name = 'kari')) $$,
  $$ values ('Fjord Verktøy AS'::text, 'dispatcher'::text) $$,
  'a valid link shows the company and role before signing up'
);
select is(
  (select count(*)::int from public.invitation_preview(repeat('0', 64))),
  0,
  'a made-up token shows nothing'
);
select is(
  (select count(*)::int from public.invitation_preview((select token from links where name = 'cancelled'))),
  0,
  'a cancelled link shows nothing'
);
select throws_ok(
  $$ select public.accept_invitation((select token from links where name = 'kari')) $$,
  '42501', null,
  'a visitor who is not signed in cannot accept'
);
reset role;
set local role authenticated;

-- Kari opens her link, signs up and joins
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select throws_ok(
  $$ select public.accept_invitation((select token from links where name = 'cancelled')) $$,
  'P0002', null,
  'a cancelled link cannot be used'
);
select throws_ok(
  $$ select public.accept_invitation(repeat('0', 64)) $$,
  'P0002', null,
  'a made-up token cannot be used'
);
select is(
  (select public.accept_invitation((select token from links where name = 'kari'))),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'Kari accepts and joins company A'
);
select is(
  (select role::text from public.memberships where user_id = '55555555-5555-5555-5555-555555555555'),
  'dispatcher',
  'Kari got the invited role'
);

-- Lise got the same link forwarded, but it works only once
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select throws_ok(
  $$ select public.accept_invitation((select token from links where name = 'kari')) $$,
  'P0002', null,
  'a used link cannot be used again'
);
select is(
  (select count(*)::int from public.invitation_preview((select token from links where name = 'kari'))),
  0,
  'a used link shows nothing any more'
);

-- An expired link cannot be used
reset role;
insert into links values ('expired', 'e' || repeat('1', 63));
insert into public.invitations (organization_id, role, token_hash, created_at, expires_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'driver', private.hash_token('e' || repeat('1', 63)), now() - interval '8 days', now() - interval '1 day');
set local role authenticated;
select throws_ok(
  $$ select public.accept_invitation((select token from links where name = 'expired')) $$,
  'P0002', null,
  'an expired link cannot be used'
);

-- Anna (owner) and the last-owner rule
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select throws_ok(
  $$ select public.change_member_role('a0000000-0000-0000-0000-000000000001', 'admin') $$,
  'P0001', null,
  'the last owner cannot step down'
);
select throws_ok(
  $$ select public.remove_member('a0000000-0000-0000-0000-000000000001') $$,
  'P0001', null,
  'the last owner cannot be removed'
);
select lives_ok(
  $$ select public.change_member_role('a0000000-0000-0000-0000-000000000002', 'owner') $$,
  'an owner can make an admin co-owner'
);
select lives_ok(
  $$ select public.remove_member('a0000000-0000-0000-0000-000000000003') $$,
  'an owner can remove a member'
);

select * from finish(true);
rollback;
