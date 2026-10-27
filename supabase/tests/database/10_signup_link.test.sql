-- The sign-up confirmation link counts as the second step. All data is synthetic (.test e-mails).
begin;
select plan(4);

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'anna@fjellkran.test', now());
insert into public.organizations (id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS');
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

-- Anna just opened the confirmation link from her sign-up e-mail
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"email/signup","timestamp":1790000000}]}', true);
select ok(private.second_step_done(), 'the sign-up confirmation session counts as the second step');
select lives_ok(
  $$ select public.create_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'driver') $$,
  'right after sign-up the new owner can invite without another link'
);

-- Later she signs in again with only her password
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000100}]}', true);
select ok(not private.second_step_done(), 'a later password sign-in needs the second step again');
select throws_ok(
  $$ select public.create_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'driver') $$,
  '42501', null,
  'and cannot invite without it'
);

select * from finish(true);
rollback;
