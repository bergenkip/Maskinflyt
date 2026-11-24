-- Stage 15a+: the logo and photos on the company page. Owners and admins add
-- them; visitors see the files of a published page only. Synthetic data (.test).
begin;
select plan(27);

select is((select public from storage.buckets where id = 'company-photos'), false, 'the company-photos bucket is private');
select ok(not has_table_privilege('authenticated', 'public.company_photos', 'insert'), 'photos are listed only through add_company_photo');

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
create function pg_temp.upload(file text) returns void language sql as $$
  insert into storage.objects (bucket_id, name, owner_id) values ('company-photos', file, current_setting('request.jwt.claim.sub'));
$$;

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select lives_ok($$ select public.save_company_page('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fjellkran-as', false) $$, 'the owner starts a hidden page');
select lives_ok($$
  select pg_temp.upload('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/f1000000-0000-0000-0000-000000000001.jpg');
  select pg_temp.upload('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/f1000000-0000-0000-0000-000000000002.jpg');
  select pg_temp.upload('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/f1000000-0000-0000-0000-000000000003.png');
  select pg_temp.upload('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/f1000000-0000-0000-0000-000000000004.png');
$$, 'the owner uploads to the company''s folder');
select throws_ok($$ select pg_temp.upload('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/f1000000-0000-0000-0000-000000000009.jpg') $$,
  '42501', null, 'not to another company''s folder');
select throws_ok($$ select pg_temp.upload('random/name.jpg') $$, '42501', null, 'not outside a company''s folder');

select lives_ok($$ select public.add_company_photo('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'photo',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/f1000000-0000-0000-0000-000000000001.jpg', 1600, 1200, '  Kranbil   i Bergen ') $$, 'the first photo is listed');
select lives_ok($$ select public.add_company_photo('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'photo',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/f1000000-0000-0000-0000-000000000002.jpg', 1200, 1600) $$, 'a second photo, without a description');
select results_eq($$ select alt, position from public.company_photos where kind = 'photo' order by position $$,
  $$ values ('Kranbil i Bergen'::text, 0), (null, 1) $$, 'descriptions are tidied; photos are added at the end');
select throws_ok($$ select public.add_company_photo('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'photo',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/f1000000-0000-0000-0000-000000000008.jpg', 10, 10) $$,
  'P0002', 'The file was not uploaded', 'a file must be uploaded first');

-- A new logo replaces the old one and says which file to remove.
select is((select replaced_path from public.add_company_photo('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'logo',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/f1000000-0000-0000-0000-000000000003.png', 512, 512)), null, 'the first logo replaces nothing');
select is((select replaced_path from public.add_company_photo('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'logo',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/f1000000-0000-0000-0000-000000000004.png', 512, 256)),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/f1000000-0000-0000-0000-000000000003.png', 'a new logo returns the old one''s file');
select is((select count(*)::int from public.company_photos where kind = 'logo'), 1, 'one logo');

select lives_ok($$ select public.move_company_photo((select id from public.company_photos where kind = 'photo' and alt is null), true) $$, 'a photo moves earlier');
select results_eq($$ select alt from public.company_photos where kind = 'photo' order by position $$,
  $$ values (null::text), ('Kranbil i Bergen') $$, 'the order changed');
select lives_ok($$ select public.update_company_photo((select id from public.company_photos where kind = 'photo' and alt is null), 'Gravemaskin') $$, 'a description is added');

-- Before the page is published a visitor sees no photos, a member does.
reset role;
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is((select count(*)::int from public.company_page_photos('fjellkran-as')), 0, 'a visitor sees no photos of a hidden page');
select is((select count(*)::int from storage.objects where bucket_id = 'company-photos'), 0, 'nor their files');
reset role;

-- A driver sees them but cannot change them; another company sees nothing.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.company_page_photos('fjellkran-as')), 3, 'a member sees them as a preview');
select throws_ok($$ select public.remove_company_photo((select id from public.company_photos limit 1)) $$,
  '42501', 'Only owners and admins change the company page', 'a driver cannot remove a photo');
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select is((select count(*)::int from public.company_photos), 0, 'another company reads no rows');
select throws_ok($$ select public.remove_company_photo((select id from public.company_photos limit 1)) $$,
  '42501', null, 'nor removes them');

-- Published: visitors see the listed files, but not a leftover unlisted one.
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select public.save_company_page('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fjellkran-as', true,
  'Kranbil med fører.', array['crane_truck'], 'Bergen', null, '91234567');
select is(public.remove_company_photo((select id from public.company_photos where alt = 'Gravemaskin')),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/f1000000-0000-0000-0000-000000000002.jpg', 'removing returns the file to delete');
select is((select count(*)::int from storage.objects where bucket_id = 'company-photos'), 4,
  'the owner still reads the files no longer listed, so they can be removed');
select lives_ok($$ delete from storage.objects where name = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/f1000000-0000-0000-0000-000000000002.jpg' $$,
  'and removes the file');
reset role;
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select results_eq($$ select kind, alt from public.company_page_photos('fjellkran-as') $$,
  $$ values ('logo'::text, null::text), ('photo', 'Kranbil i Bergen') $$, 'a visitor sees the logo and the photo');
select is((select count(*)::int from storage.objects where bucket_id = 'company-photos'), 2,
  'and only the listed files (the replaced logo stays hidden)');
reset role;

select * from finish();
rollback;
