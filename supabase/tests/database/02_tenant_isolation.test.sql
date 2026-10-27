-- Proves that company A cannot see or change company B's data, and back.
-- All names and e-mails are synthetic (.test domain).
begin;
select plan(15);

-- Arrange (as the database owner, bypassing RLS)
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'anna@fjordverktoy.test'),
  ('22222222-2222-2222-2222-222222222222', 'bjorn@nordpakk.test'),
  ('33333333-3333-3333-3333-333333333333', 'viktor@fjordverktoy.test');

insert into public.organizations (id, name, org_number) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjord Verktøy AS', '100000008'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Nordpakk AS', '100000016');

insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'driver');

-- Act as Anna (owner of company A)
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1790000000}]}', true);

select results_eq(
  'select name from public.organizations',
  array['Fjord Verktøy AS'],
  'A: sees only her own organization'
);
select is(
  (select count(*)::int from public.memberships where organization_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  0,
  'A: sees no memberships of company B'
);
select is(
  (select count(*)::int from public.memberships),
  2,
  'A: sees the two memberships of her own company'
);

update public.organizations set name = 'Hacked' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
update public.organizations set name = 'Fjord Verktøy Norge AS' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select results_eq(
  'select name from public.organizations',
  array['Fjord Verktøy Norge AS'],
  'A: owner can rename her own organization'
);

select throws_ok(
  $$ insert into public.memberships (organization_id, user_id, role)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'owner') $$,
  '42501',
  null,
  'A: cannot add herself to company B'
);
select throws_ok(
  $$ insert into public.organizations (name) values ('New AS') $$,
  '42501',
  null,
  'A: cannot create organizations from the browser yet'
);

select throws_ok(
  $$ delete from public.organizations where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  '42501',
  null,
  'A: cannot delete company B'
);

-- Act as Viktor (driver in company A)
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

update public.organizations set name = 'Driver edit' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select results_eq(
  'select name from public.organizations',
  array['Fjord Verktøy Norge AS'],
  'driver: sees the organization but cannot rename it'
);
select is(
  (select role::text from public.memberships where user_id = '33333333-3333-3333-3333-333333333333'),
  'driver',
  'driver: sees his own role'
);
select throws_ok(
  $$ update public.memberships set role = 'owner' where user_id = '33333333-3333-3333-3333-333333333333' $$,
  '42501',
  null,
  'driver: cannot promote himself to owner'
);

-- Act as Bjørn (owner of company B)
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select results_eq(
  'select name from public.organizations',
  array['Nordpakk AS'],
  'B: sees only his own organization, unchanged by A'
);
select is(
  (select count(*)::int from public.memberships where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'B: sees no memberships of company A'
);

-- Signed-in user who belongs to no organization
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select is((select count(*)::int from public.organizations), 0, 'outsider: sees no organizations');

-- Signed-out visitor
reset role;
set local role anon;
select throws_ok('select * from public.organizations', '42501', null, 'anon: denied on organizations');
select throws_ok('select * from public.memberships', '42501', null, 'anon: denied on memberships');

select * from finish(true);
rollback;
