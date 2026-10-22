-- Profiles are private to each user; creating an organization makes you its owner.
-- All data is synthetic (.test e-mails, made-up org numbers with valid MOD11).
begin;
select plan(19);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'anna@fjordverktoy.test'),
  ('22222222-2222-2222-2222-222222222222', 'bjorn@nordpakk.test');

select is(
  (select count(*)::int from public.profiles where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')),
  2,
  'a profile is created for every new user'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS is enabled on profiles'
);

-- Org number check digit
select ok(private.is_valid_org_number('100000008'), 'valid org number 100000008');
select ok(not private.is_valid_org_number('100000009'), 'wrong check digit is rejected');
select ok(not private.is_valid_org_number('12345678'), 'too short is rejected');

-- Act as Anna
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is((select count(*)::int from public.profiles), 1, 'Anna sees only her own profile');

update public.profiles set locale = 'lt' where id = '11111111-1111-1111-1111-111111111111';
select is((select locale from public.profiles), 'lt', 'Anna can change her own language');

update public.profiles set locale = 'en' where id = '22222222-2222-2222-2222-222222222222';
select throws_ok(
  $$ update public.profiles set locale = 'de' where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'unsupported language is rejected'
);
select throws_ok(
  $$ update public.profiles set id = '22222222-2222-2222-2222-222222222222' $$,
  '42501',
  null,
  'Anna cannot change the profile owner'
);

select throws_ok(
  $$ select public.create_organization('Fjord Verktøy AS', '100000009') $$,
  '22023',
  null,
  'onboarding rejects an invalid org number'
);
select throws_ok(
  $$ select public.create_organization('   ', null) $$,
  '22023',
  null,
  'onboarding rejects an empty name'
);

select isnt(
  (select public.create_organization('  Fjord Verktøy AS ', '100 000 008')),
  null,
  'Anna creates her organization'
);
select results_eq(
  'select name, org_number from public.organizations',
  $$ values ('Fjord Verktøy AS'::text, '100000008'::text) $$,
  'name is trimmed and spaces are removed from the org number'
);
select is(
  (select role::text from public.memberships where user_id = '11111111-1111-1111-1111-111111111111'),
  'owner',
  'the creator becomes owner'
);
select throws_ok(
  $$ select public.create_organization('Second AS', null) $$,
  'P0001',
  null,
  'a user who already has an organization cannot create another one here'
);

-- Act as Bjørn: still sees nothing of Anna
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select is((select locale from public.profiles), null, 'Anna could not change Bjørn''s language');
select is((select count(*)::int from public.organizations), 0, 'Bjørn does not see Anna''s organization');

-- Signed-out visitor
reset role;
set local role anon;
select throws_ok(
  $$ select public.create_organization('Anon AS', null) $$,
  '42501',
  null,
  'anon cannot create organizations'
);
select throws_ok('select * from public.profiles', '42501', null, 'anon cannot read profiles');

select * from finish(true);
rollback;
