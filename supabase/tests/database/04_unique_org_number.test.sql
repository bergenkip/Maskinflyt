-- One company per name and per (country, org number); the number stays optional
-- and may come from other countries. All data is synthetic (.test e-mails,
-- made-up org numbers).
begin;
select plan(13);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'anna@fjordverktoy.test'),
  ('22222222-2222-2222-2222-222222222222', 'bjorn@nordpakk.test'),
  ('33333333-3333-3333-3333-333333333333', 'ruta@baltpack.test');

-- Companies without a number never clash (NULLs are not equal).
insert into public.organizations (name) values ('Old One AS'), ('Old Two AS');
select is(
  (select count(*)::int from public.organizations where org_number is null),
  2,
  'several companies without an org number can exist'
);
select throws_ok(
  $$ insert into public.organizations (name, country, org_number) values ('Bad NO AS', 'NO', 'AB1234567') $$,
  '23514',
  null,
  'a Norwegian org number must be 9 digits'
);

set local role authenticated;

-- Anna creates her company
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select isnt(
  (select public.create_organization('Fjord Verktøy AS', '100000008')),
  null,
  'Anna creates her company with org number 100000008 (Norway by default)'
);

-- Bjørn tries the same company
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select throws_ok(
  $$ select public.create_organization('Nordpakk AS', '100000008') $$,
  '23505',
  'Organization number is already registered',
  'the same org number cannot be registered twice'
);
select throws_ok(
  $$ select public.create_organization('Nordpakk AS', '100 000 008') $$,
  '23505',
  'Organization number is already registered',
  'spaces do not get around the number check'
);
select throws_ok(
  $$ select public.create_organization('Fjord Verktøy AS', null) $$,
  '23505',
  'Organization name is already registered',
  'the same name cannot be registered twice'
);
select throws_ok(
  $$ select public.create_organization('  fjord   VERKTØY as ', null) $$,
  '23505',
  'Organization name is already registered',
  'case and extra spaces do not get around the name check'
);
select throws_ok(
  $$ select public.create_organization('Nordpakk AS', '100000009') $$,
  '22023',
  'Invalid organization number',
  'Norwegian numbers still need a valid MOD11 check digit'
);
select is(
  (select count(*)::int from public.organizations),
  0,
  'the failed attempts reveal nothing else about Anna''s company'
);

-- Other countries: letters and digits, no MOD11 check.
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select throws_ok(
  $$ select public.create_organization('Baltpack UAB', '1', 'LT') $$,
  '22023',
  'Invalid organization number',
  'a foreign number must still have 2 to 20 letters or digits'
);
select throws_ok(
  $$ select public.create_organization('Baltpack UAB', '123', 'Lithuania') $$,
  '22023',
  'Invalid country',
  'the country must be a two-letter code'
);
select isnt(
  (select public.create_organization('Baltpack UAB', '100000008', 'lt')),
  null,
  'the same digits are allowed in another country'
);
select results_eq(
  'select country, org_number from public.organizations',
  $$ values ('LT'::text, '100000008'::text) $$,
  'country is stored as an upper-case code'
);

select * from finish(true);
rollback;
