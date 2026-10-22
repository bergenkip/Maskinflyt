-- First and last names on profiles. All data is synthetic (.test e-mails).
begin;
select plan(7);

-- Arrange: sign-up sends the name as user metadata (as the app does).
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ingrid@fjordverktoy.test', now(), '{"first_name":"  Ingrid ","last_name":"Ødegård-Kristiansen"}'),
  ('22222222-2222-2222-2222-222222222222', 'old@fjordverktoy.test', now(), '{}'),
  ('33333333-3333-3333-3333-333333333333', 'jonas@nordpakk.test', now(), '{"first_name":"Jonas","last_name":"Berg"}');

insert into public.organizations (id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjord Verktøy AS'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Nordpakk AS');
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'viewer'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'owner');

select results_eq(
  $$ select first_name, last_name from public.profiles where id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values ('Ingrid'::text, 'Ødegård-Kristiansen'::text) $$,
  'the name from sign-up is copied into the profile, trimmed'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select results_eq(
  $$ select full_name, email from public.list_members('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  $$ values ('Ingrid Ødegård-Kristiansen'::text, 'ingrid@fjordverktoy.test'::text), (null, 'old@fjordverktoy.test') $$,
  'the member list shows names, and none for an older account'
);

-- An older account adds a name in Settings
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select lives_ok(
  $$ update public.profiles set first_name = 'Åse', last_name = 'Lien' where id = '22222222-2222-2222-2222-222222222222' $$,
  'a user can set their own name'
);
select is(
  (select first_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'Åse',
  'the name is saved'
);
select throws_ok(
  $$ update public.profiles set first_name = '   ' where id = '22222222-2222-2222-2222-222222222222' $$,
  '23514', null,
  'a blank name is rejected'
);

-- Nobody can rename someone else
update public.profiles set first_name = 'Hacked' where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select first_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  null,
  'another user''s profile is not even visible'
);
reset role;
select is(
  (select first_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Ingrid',
  'another user''s name stays unchanged'
);

select * from finish(true);
rollback;
