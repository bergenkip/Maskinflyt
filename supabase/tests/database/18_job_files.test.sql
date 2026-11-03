-- Photos and the customer's signature: the job's driver and the office add and
-- see them, in a private bucket; other drivers and other companies see nothing.
-- All data is synthetic (.test e-mails).
begin;
select plan(23);

select is((select public from storage.buckets where id = 'job-files'), false, 'the job-files bucket is private');
select ok(not has_table_privilege('authenticated', 'public.job_files', 'insert'), 'files are listed only through add_job_file');
select ok(not has_table_privilege('authenticated', 'public.job_files', 'delete'), 'listed files are never deleted');

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'anna@fjellkran.test', now()),
  ('33333333-3333-3333-3333-333333333333', 'dina@fjellkran.test', now()),
  ('44444444-4444-4444-4444-444444444444', 'sander@fjellkran.test', now()),
  ('66666666-6666-6666-6666-666666666666', 'ola@fjellkran.test', now()),
  ('55555555-5555-5555-5555-555555555555', 'bjorn@vestmaskin.test', now());
insert into public.organizations (id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vest Maskin AS');
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'dispatcher'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'driver'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666666', 'driver'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'owner');
insert into public.vehicles (id, organization_id, type, name) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'crane_truck', 'Kranbil 1');
insert into public.customers (id, organization_id, name) values
  ('a2000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nordbygg AS');
-- Sander's job, and a cancelled one of his.
insert into public.jobs (id, organization_id, customer_id, vehicle_id, driver_id, address, starts_at, ends_at, status) values
  ('a4000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Storgata 1, 0155 Oslo',
   '2026-11-02 07:00+01', '2026-11-02 11:00+01', 'planned'),
  ('a4000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Storgata 1, 0155 Oslo',
   '2026-11-03 07:00+01', '2026-11-03 11:00+01', 'cancelled');

set local role authenticated;

-- Sander (driver) uploads to his own job's folder and lists the files.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select lives_ok($$
  insert into storage.objects (bucket_id, name, owner_id) values
    ('job-files', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a4000000-0000-0000-0000-000000000001/f1000000-0000-0000-0000-000000000001.jpg', '44444444-4444-4444-4444-444444444444'),
    ('job-files', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a4000000-0000-0000-0000-000000000001/f1000000-0000-0000-0000-000000000002.png', '44444444-4444-4444-4444-444444444444'),
    ('job-files', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a4000000-0000-0000-0000-000000000001/f1000000-0000-0000-0000-000000000003.png', '44444444-4444-4444-4444-444444444444')
$$, 'the driver uploads to his own job');
select throws_ok($$
  insert into storage.objects (bucket_id, name, owner_id) values
    ('job-files', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a4000000-0000-0000-0000-000000000002/f1000000-0000-0000-0000-000000000009.jpg', '44444444-4444-4444-4444-444444444444')
$$, '42501', null, 'not to a cancelled job');
select throws_ok($$
  insert into storage.objects (bucket_id, name, owner_id) values
    ('job-files', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/a4000000-0000-0000-0000-000000000001/f1000000-0000-0000-0000-000000000009.jpg', '44444444-4444-4444-4444-444444444444')
$$, '42501', null, 'not under another company''s folder');
select throws_ok($$
  insert into storage.objects (bucket_id, name, owner_id) values ('job-files', 'random/name.jpg', '44444444-4444-4444-4444-444444444444')
$$, '42501', null, 'not outside a job''s folder');

select lives_ok($$
  select public.add_job_file('a4000000-0000-0000-0000-000000000001', 'photo',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a4000000-0000-0000-0000-000000000001/f1000000-0000-0000-0000-000000000001.jpg')
$$, 'the driver lists a photo');
select lives_ok($$
  select public.add_job_file('a4000000-0000-0000-0000-000000000001', 'signature',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a4000000-0000-0000-0000-000000000001/f1000000-0000-0000-0000-000000000002.png', '  Per Hansen ')
$$, 'and the customer''s signature with the name');
select throws_ok($$
  select public.add_job_file('a4000000-0000-0000-0000-000000000001', 'signature',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a4000000-0000-0000-0000-000000000001/f1000000-0000-0000-0000-000000000003.png', 'Kari')
$$, '23505', null, 'one signature per job');
select throws_ok($$
  select public.add_job_file('a4000000-0000-0000-0000-000000000001', 'photo',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a4000000-0000-0000-0000-000000000001/f1000000-0000-0000-0000-000000000004.jpg')
$$, 'P0002', null, 'a file not uploaded is not listed');
select throws_ok($$
  select public.add_job_file('a4000000-0000-0000-0000-000000000001', 'signature',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a4000000-0000-0000-0000-000000000001/f1000000-0000-0000-0000-000000000003.png')
$$, '23514', null, 'a signature needs the signer''s name');
select is((select signed_by from public.job_files where kind = 'signature'), 'Per Hansen', 'the name is kept as written, trimmed');
select is((select count(*)::int from storage.objects where bucket_id = 'job-files'), 3, 'the driver sees his job''s files');
-- The unlisted upload can be removed by its uploader; a listed one cannot.
delete from storage.objects where name like '%f1000000-0000-0000-0000-000000000003.png';
delete from storage.objects where name like '%f1000000-0000-0000-0000-000000000001.jpg';
select is((select count(*)::int from storage.objects where bucket_id = 'job-files'), 2,
  'only the unlisted upload was removed');

-- Ola (another driver) sees nothing and adds nothing.
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'job-files'), 0, 'another driver sees no files');
select is((select count(*)::int from public.job_files), 0, 'nor their list');
select throws_ok($$
  insert into storage.objects (bucket_id, name, owner_id) values
    ('job-files', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a4000000-0000-0000-0000-000000000001/f1000000-0000-0000-0000-000000000005.jpg', '66666666-6666-6666-6666-666666666666')
$$, '42501', null, 'another driver cannot upload to the job');

-- Dina (dispatcher) sees them all.
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1790000000}]}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'job-files'), 2, 'the dispatcher sees the job''s files');
select is((select array_agg(kind::text order by kind) from public.job_files), array['photo', 'signature'], 'and their list');

-- Björn (other company) sees nothing and adds nothing.
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1790000000}]}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'job-files'), 0, 'another company sees no files');
select is((select count(*)::int from public.job_files), 0, 'nor their list');
select throws_ok($$
  select public.add_job_file('a4000000-0000-0000-0000-000000000001', 'photo',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a4000000-0000-0000-0000-000000000001/f1000000-0000-0000-0000-000000000002.png')
$$, '42501', null, 'another company cannot list files on the job');

select * from finish();
rollback;
