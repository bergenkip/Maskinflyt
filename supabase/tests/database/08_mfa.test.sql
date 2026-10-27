-- Two-step sign-in (e-mailed link) for owners and admins. All data is synthetic (.test e-mails).
begin;
select plan(25);

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'anna@fjordverktoy.test', now()),
  ('22222222-2222-2222-2222-222222222222', 'ola@fjordverktoy.test', now()),
  ('33333333-3333-3333-3333-333333333333', 'per@fjordverktoy.test', now());
insert into public.organizations (id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjord Verktøy AS');
insert into public.memberships (id, organization_id, user_id, role) values
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'admin'),
  ('a0000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'operator');
insert into public.invitations (organization_id, role, token_hash)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'viewer', repeat('a', 64));

set local role authenticated;

-- Anna signed in with only her password
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select throws_ok(
  $$ select public.create_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'viewer') $$,
  '42501', null,
  'an owner without a code cannot invite'
);
select throws_ok(
  $$ select public.change_member_role('a0000000-0000-0000-0000-000000000003', 'viewer') $$,
  '42501', null,
  'an owner without a code cannot change a role'
);
select throws_ok(
  $$ select public.remove_member('a0000000-0000-0000-0000-000000000003') $$,
  '42501', null,
  'an owner without a code cannot remove a member'
);
select throws_ok(
  $$ select public.revoke_invitation((select id from public.invitations limit 1)) $$,
  'P0002', null,
  'an owner without a code cannot even see the invitation to cancel it'
);
select is((select count(*)::int from public.invitations), 0, 'an owner without a code sees no invitations');
update public.organizations set name = 'Kapret AS' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select is(
  (select name from public.organizations where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Fjord Verktøy AS',
  'an owner without a code cannot rename the company'
);
select is(
  (select count(*)::int from public.list_members('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  3,
  'the member list can still be read (the app asks for the code first)'
);

-- Claims without any sign-in methods, or with a malformed list, count as no code
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select throws_ok(
  $$ select public.create_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'viewer') $$,
  '42501', null,
  'missing sign-in methods are treated as no code'
);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","amr":"otp"}', true);
select throws_ok(
  $$ select public.create_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'viewer') $$,
  '42501', null,
  'a malformed list of sign-in methods is treated as no code'
);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","amr":[{"method":"totp"}]}', true);
select throws_ok(
  $$ select public.create_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'viewer') $$,
  '42501', null,
  'an unrelated method name is not accepted'
);

-- Ola (admin) in a session created from the e-mailed link
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select matches(
  (select public.create_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'viewer')),
  '^[0-9a-f]{64}$',
  'an admin with a code can invite'
);
select lives_ok(
  $$ select public.change_member_role('a0000000-0000-0000-0000-000000000003', 'viewer') $$,
  'an admin with a code can change a role'
);
select is((select count(*)::int from public.invitations), 2, 'an admin with a code sees the invitations');

-- A session at assurance level aal2 counts as well
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal2","amr":[{"method":"password","timestamp":1790000000}]}', true);
select lives_ok(
  $$ select public.change_member_role('a0000000-0000-0000-0000-000000000003', 'operator') $$,
  'an aal2 session counts as the second step'
);

-- Approving a waiting sign-in from the link, opened in another browser.
-- Anna's password session (s1) asks for a link.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","session_id":"51000000-0000-0000-0000-000000000001","amr":[{"method":"password","timestamp":1790000000}]}', true);
create temporary table req on commit drop as select public.request_second_step('Safari on iPhone') as id;
grant select on req to authenticated;
select is(public.second_step_passed(), false, 'a waiting sign-in has not passed yet');
select throws_ok(
  $$ select public.approve_second_step((select id from req)) $$,
  '42501', null,
  'the password session cannot approve itself'
);
select is((select count(*)::int from public.second_step_request((select id from req))), 0, 'the password session cannot read the request');
select throws_ok($$ select * from private.second_step_requests $$, '42501', null, 'requests are not readable directly');

-- Ola's link session cannot approve Anna's sign-in.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","session_id":"52000000-0000-0000-0000-000000000001","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select throws_ok(
  $$ select public.approve_second_step((select id from req)) $$,
  'P0002', null,
  'another person cannot approve the sign-in'
);

-- Anna's link session (s2) sees and approves it.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","session_id":"51000000-0000-0000-0000-000000000002","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select is(
  (select user_agent from public.second_step_request((select id from req))),
  'Safari on iPhone',
  'the link session sees which browser asked'
);
select lives_ok($$ select public.approve_second_step((select id from req)) $$, 'the link session approves the sign-in');

-- Back in the waiting password session: the second step is passed.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","session_id":"51000000-0000-0000-0000-000000000001","amr":[{"method":"password","timestamp":1790000000}]}', true);
select is(public.second_step_passed(), true, 'the approved session has passed the second step');
select lives_ok(
  $$ select public.create_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'viewer') $$,
  'the approved session can invite'
);

-- Another password session of Anna (s3) still needs its own approval.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","session_id":"51000000-0000-0000-0000-000000000003","amr":[{"method":"password","timestamp":1790000000}]}', true);
select is(public.second_step_passed(), false, 'an approval only covers the session that asked');

-- A request older than an hour cannot be approved.
create temporary table old_req on commit drop as select public.request_second_step('Old browser') as id;
grant select on old_req to authenticated;
reset role;
update private.second_step_requests set created_at = now() - interval '2 hours' where id = (select id from old_req);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","session_id":"51000000-0000-0000-0000-000000000004","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select throws_ok(
  $$ select public.approve_second_step((select id from old_req)) $$,
  'P0002', null,
  'an expired request cannot be approved'
);

select * from finish(true);
rollback;
