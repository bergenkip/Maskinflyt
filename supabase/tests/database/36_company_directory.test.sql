-- Stage 15d: the catalog lists published, running companies only, filtered by
-- service and place. Synthetic data (.test).
begin;
select plan(11);

insert into public.organizations (id, name, org_number) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS', '123456785'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vest Maskin AS', '987654325'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Skjult Graving AS', '111111118'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Stengt Transport AS', '222222226');
insert into public.company_pages (organization_id, slug, published, description, services, city, area, phone) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fjellkran-as', true, repeat('Kranbil med fører. ', 30), array['crane_truck', 'transport'], 'Bergen', 'Bergen og Askøy', '+4791234567'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'vest-maskin', true, 'Graving og transport.', array['excavation', 'transport'], 'Stord', 'Sunnhordland_100%', '+4791234568'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'skjult-graving', false, 'Ikke publisert.', array['excavation'], 'Bergen', null, '+4791234569'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'stengt-transport', true, 'Abonnement avsluttet.', array['transport'], 'bergen', null, '+4791234560');
insert into public.company_photos (organization_id, kind, path, width, height) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'logo', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/11111111-1111-1111-1111-111111111111.png', 512, 256);
update public.subscriptions set status = 'canceled' where organization_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select results_eq($$ select slug from public.company_directory() $$,
  $$ values ('fjellkran-as'::text), ('vest-maskin'::text) $$,
  'only published pages of running companies, by name');
select results_eq($$ select slug from public.company_directory('excavation') $$,
  $$ values ('vest-maskin'::text) $$, 'filtered by service');
select results_eq($$ select slug from public.company_directory(null, '  bERG ') $$,
  $$ values ('fjellkran-as'::text) $$, 'a place matches part of the city, any case');
select results_eq($$ select slug from public.company_directory(null, 'askøy') $$,
  $$ values ('fjellkran-as'::text) $$, 'a place also matches the area');
select results_eq($$ select slug from public.company_directory('transport', 'stord') $$,
  $$ values ('vest-maskin'::text) $$, 'service and place together');
select is((select count(*)::int from public.company_directory(null, 'Berg%n')), 0, 'a % typed by a visitor matches only itself');
select is((select count(*)::int from public.company_directory(null, '_100%')), 1, '_ and % match themselves in the area');
select is((select char_length(description) from public.company_directory('crane_truck')), 300, 'the description is shortened for the list');
select results_eq($$ select logo_path, logo_width from public.company_directory('crane_truck') $$,
  $$ values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/11111111-1111-1111-1111-111111111111.png'::text, 512) $$,
  'the logo comes with the company');
select results_eq($$ select city, companies from public.company_directory_places() $$,
  $$ values ('Bergen'::text, 1), ('Stord'::text, 1) $$, 'places count only listed companies');
select throws_ok($$ select * from public.company_pages $$, '42501', null, 'visitors still cannot read the table');
reset role;

select * from finish();
rollback;
