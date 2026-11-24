-- Stage 15a: the company's public page. Owners and admins write it, visitors
-- see only published pages and only the public fields. Synthetic data (.test).
begin;
select plan(20);

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000001', 'eier@fjellkran.test', now()),
  ('00000000-0000-0000-0000-000000000002', 'sjafor@fjellkran.test', now()),
  ('55555555-5555-5555-5555-555555555555', 'bjorn@vestmaskin.test', now());
insert into public.organizations (id, name, org_number) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS', '123456785'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vest Maskin AS', '987654325');
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000002', 'driver'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'owner');

create function pg_temp.as_user(id text, aal text default 'aal2') returns void language sql as $$
  select set_config('request.jwt.claim.sub', id, true),
         set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated', 'aal', aal)::text, true);
$$;

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select lives_ok($$ select public.save_company_page('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran-AS', false) $$,
  'the owner starts a page with only an address');
select is((select slug from public.company_pages), 'fjellkran-as', 'the address is kept in lower case');
select throws_ok($$ select public.save_company_page('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fjellkran-as', true) $$,
  '22023', 'A published page needs a description, a city, a service and a phone or e-mail', 'an empty page cannot be published');
select throws_ok($$ select public.save_company_page('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fjell kran', false) $$,
  '22023', 'Invalid address', 'an address with a space is refused');
select throws_ok($$ select public.save_company_page('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fjellkran-as', false, null, array['crane_truck', 'rocket']) $$,
  '22023', 'Invalid services', 'only services from the list');
select throws_ok($$ select public.save_company_page('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fjellkran-as', false, null, '{}', null, null, null, null, 'http://fjellkran.test') $$,
  '22023', 'Invalid website', 'a website must use https');
select lives_ok($$ select public.save_company_page('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fjellkran-as', true,
  'Kranbil med fører i Bergen.', array['transport', 'crane_truck', 'crane_truck'], ' Bergen ', 'Bergen og omegn', '+47 912 34 567', 'Post@Fjellkran.test', 'https://fjellkran.test') $$,
  'the owner publishes a complete page');
select results_eq($$ select services, city, phone, email from public.company_pages $$,
  $$ values (array['crane_truck', 'transport'], 'Bergen', '+4791234567', 'post@fjellkran.test') $$,
  'services are sorted without repeats; city, phone and e-mail are cleaned');

-- Without the second step the owner cannot change it.
select pg_temp.as_user('00000000-0000-0000-0000-000000000001', 'aal1');
select throws_ok($$ select public.save_company_page('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fjellkran-as', false) $$,
  '42501', null, 'the second step is needed');

-- A driver reads the page but cannot change it, and nobody writes the table directly.
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.company_pages), 1, 'a member reads the company''s page');
select throws_ok($$ select public.save_company_page('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fjellkran-as', false) $$,
  '42501', 'Only owners and admins change the company page', 'a driver cannot change it');
select throws_ok($$ update public.company_pages set published = false $$, '42501', null, 'nobody updates the table directly');

-- Another company cannot read the row, nor take the address.
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select is((select count(*)::int from public.company_pages), 0, 'another company reads no rows');
select throws_ok($$ select public.save_company_page('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'fjellkran-as', false) $$,
  '23505', 'The address is taken', 'another company cannot take the address');
select lives_ok($$ select public.save_company_page('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'vest-maskin', false) $$,
  'another company keeps its page unpublished');
reset role;

-- Visitors: the published page with public fields only; never an unpublished one.
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select results_eq($$ select name, org_number, city, published from public.company_page('Fjellkran-AS') $$,
  $$ values ('Fjellkran AS'::text, '123456785'::text, 'Bergen'::text, true) $$, 'a visitor sees the published page');
select is((select count(*)::int from public.company_page('vest-maskin')), 0, 'a visitor does not see an unpublished page');
select results_eq($$ select slug from public.published_company_pages() $$, $$ values ('fjellkran-as'::text) $$,
  'only published pages are listed for the sitemap');
select throws_ok($$ select * from public.company_pages $$, '42501', null, 'visitors cannot read the table');
reset role;

-- A company whose subscription ended (stage 14b) disappears from the web.
update public.subscriptions set status = 'canceled' where organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
set local role anon;
select is((select count(*)::int from public.company_page('fjellkran-as')), 0, 'a read-only company''s page is not shown');
reset role;

select * from finish();
rollback;
