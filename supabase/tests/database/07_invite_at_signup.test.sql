-- Joining with an invitation link at sign-up. All data is synthetic (.test e-mails).
begin;
select plan(7);

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'anna@fjordverktoy.test', now());
insert into public.organizations (id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjord Verktøy AS');
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner');

create temporary table links (name text primary key, token text) on commit drop;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1790000000}]}', true);
reset role;
insert into links values
  ('operator', (select public.create_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'operator'))),
  ('cancelled', (select public.create_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'viewer')));
update public.invitations set revoked_at = now() where role = 'viewer';

-- Kari signs up from the link, before confirming her e-mail address (as GoTrue does).
insert into auth.users (id, email, raw_user_meta_data)
select '22222222-2222-2222-2222-222222222222', 'kari@other-mail.test',
  jsonb_build_object('first_name', 'Kari', 'last_name', 'Kollega', 'invite_token', token)
from links where name = 'operator';

select is(
  (select role::text from public.memberships where user_id = '22222222-2222-2222-2222-222222222222'),
  'operator',
  'signing up with a link joins the company with the invited role'
);
select is(
  (select accepted_by from public.invitations where role = 'operator'),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'the invitation is marked as used by the new account'
);
select is(
  (select first_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'Kari',
  'the profile still gets the name'
);

-- Lise got the same link forwarded: her account is created, but without a company.
insert into auth.users (id, email, raw_user_meta_data)
select '33333333-3333-3333-3333-333333333333', 'lise@other-mail.test', jsonb_build_object('invite_token', token)
from links where name = 'operator';
select is(
  (select count(*)::int from public.memberships where user_id = '33333333-3333-3333-3333-333333333333'),
  0,
  'a used link does not join a second person'
);

-- Cancelled and made-up tokens are ignored; sign-up itself still works.
insert into auth.users (id, email, raw_user_meta_data)
select '44444444-4444-4444-4444-444444444444', 'ola@other-mail.test', jsonb_build_object('invite_token', token)
from links where name = 'cancelled';
select is(
  (select count(*)::int from public.memberships where user_id = '44444444-4444-4444-4444-444444444444'),
  0,
  'a cancelled link does not join'
);
select lives_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data) values
     ('55555555-5555-5555-5555-555555555555', 'per@other-mail.test', '{"invite_token":"not-a-token"}') $$,
  'a made-up token does not break sign-up'
);
select is(
  (select count(*)::int from public.memberships where user_id = '55555555-5555-5555-5555-555555555555'),
  0,
  'a made-up token does not join'
);

select * from finish(true);
rollback;
