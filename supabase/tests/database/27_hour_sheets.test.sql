-- Hours sheets: an employee fills in their own sheet and confirms it; the
-- day is split by the company's overtime rules (two levels); a confirmed sheet
-- is locked. The owner changes the rules; the accountant and the owner read
-- every sheet; a colleague and another company read none.
-- All data is synthetic (.test e-mails).
begin;
select plan(30);

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'anna@fjellkran.test', now()),
  ('22222222-2222-2222-2222-222222222222', 'regn@fjellkran.test', now()),
  ('33333333-3333-3333-3333-333333333333', 'dina@fjellkran.test', now()),
  ('44444444-4444-4444-4444-444444444444', 'sander@fjellkran.test', now()),
  ('55555555-5555-5555-5555-555555555555', 'bjorn@vestmaskin.test', now());
update public.profiles set first_name = 'Sander', last_name = 'Lie' where id = '44444444-4444-4444-4444-444444444444';
insert into public.organizations (id, name, org_number) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS', '123456785'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vest Maskin AS', '987654325');
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'accountant'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'dispatcher'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'driver'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'owner');

create function pg_temp.as_user(id text, aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claim.sub', id, true),
         set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated', 'aal', aal,
           'amr', json_build_array(json_build_object('method', 'password', 'timestamp', 1790000000)))::text, true);
$$;

set local role authenticated;

-- Rules: the owner, with the second step only.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select throws_ok($$ select public.save_hour_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 450, 50) $$,
  '42501', null, 'the owner needs the second step to change the rules');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'aal2');
select throws_ok($$ select public.save_hour_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 450, 50, 450, 100) $$,
  '22023', null, 'the second level starts later');
select throws_ok($$ select public.save_hour_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 450, 50, 600, 40) $$,
  '22023', null, 'the second level pays more');
select throws_ok($$ select public.save_hour_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 450, 50, null, null, 'not-an-address') $$,
  '22023', null, 'the accountant''s e-mail is checked');
select lives_ok($$ select public.save_hour_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 450, 50, 600, 100, ' Lonn@Regnskap.TEST ') $$,
  'the owner saves overtime from 7.5 h (+50 %) and from 10 h (+100 %)');
select is((select accountant_email from public.hour_settings), 'lonn@regnskap.test', 'the address is kept in lower case');

select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select throws_ok($$ select public.save_hour_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 480, 50) $$,
  '42501', null, 'a dispatcher does not change the rules');
select is((select overtime_after from public.hour_settings), 450, 'every member reads the rules');
select pg_temp.as_user('55555555-5555-5555-5555-555555555555', 'aal2');
select is((select count(*)::int from public.hour_settings), 0, 'another company does not read them');
select throws_ok($$ select public.create_hour_sheet('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-11-01', '2026-11-30') $$,
  '42501', null, 'another company cannot start a sheet here');

-- Sander (driver) fills in November.
select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
select throws_ok($$ select public.create_hour_sheet('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-11-30', '2026-11-01') $$,
  '22023', null, 'the period runs forwards');
select throws_ok($$ select public.create_hour_sheet('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-11-01', '2027-01-31') $$,
  '22023', null, 'at most 62 days');
select set_config('test.sheet', public.create_hour_sheet('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-11-01', '2026-11-30')::text, true);
select throws_ok($$ select public.create_hour_sheet('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-11-30', '2026-12-31') $$,
  '23P01', null, 'two sheets never cover the same day');

-- 2 Nov: 07:00–15:00, 30 min break = 7.5 h. 3 Nov: 06:00–18:00, 30 min = 11.5 h.
-- 4 Nov: 20:00–02:00 (past midnight), no break = 6 h.
select lives_ok($$ select public.save_hour_sheet_day(current_setting('test.sheet')::uuid, '2026-11-02', '07:00', '15:00', 30) $$, 'a day is written');
select lives_ok($$ select public.save_hour_sheet_day(current_setting('test.sheet')::uuid, '2026-11-03', '06:00', '18:00', 30, '  Verksted   og  kran ') $$, 'a long day with a note');
select lives_ok($$ select public.save_hour_sheet_day(current_setting('test.sheet')::uuid, '2026-11-04', '20:00', '02:00', 0) $$, 'a night past midnight');
select lives_ok($$ select public.save_hour_sheet_day(current_setting('test.sheet')::uuid, '2026-11-05', '07:00', '08:00', 0) $$, 'a day written by mistake');
select lives_ok($$ select public.remove_hour_sheet_day(current_setting('test.sheet')::uuid, '2026-11-05') $$, '… and removed');
select throws_ok($$ select public.save_hour_sheet_day(current_setting('test.sheet')::uuid, '2026-12-01', '07:00', '15:00', 0) $$,
  '22023', null, 'a day outside the period is refused');
select throws_ok($$ select public.save_hour_sheet_day(current_setting('test.sheet')::uuid, '2026-11-06', '07:00', '08:00', 60) $$,
  '22023', null, 'a break as long as the work is refused');
select results_eq(
  $$ select day::text, worked_minutes, note from public.hour_sheet_days order by day $$,
  $$ values ('2026-11-02', 450, null), ('2026-11-03', 690, 'Verksted og kran'), ('2026-11-04', 360, null) $$,
  'the minutes are counted, the note is tidied');

-- Dina (colleague) neither reads nor writes it.
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select is((select count(*)::int from public.hour_sheets) + (select count(*)::int from public.hour_sheet_days), 0, 'a colleague reads nothing');
select throws_ok($$ select public.save_hour_sheet_day(current_setting('test.sheet')::uuid, '2026-11-06', '07:00', '15:00', 0) $$,
  '42501', null, 'a colleague writes nothing');

-- Sander confirms: the address comes back for the e-mail.
select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
select is(public.submit_hour_sheet(current_setting('test.sheet')::uuid), 'lonn@regnskap.test', 'confirmed; the accountant''s address is returned');
select results_eq(
  $$ select day::text, normal_minutes, overtime_minutes, overtime2_minutes from public.hour_sheet_days order by day $$,
  $$ values ('2026-11-02', 450, 0, 0), ('2026-11-03', 450, 150, 90), ('2026-11-04', 360, 0, 0) $$,
  'each day is split: normal up to 7.5 h, +50 % to 10 h, +100 % after');
select results_eq(
  $$ select status, employee_name, worked_minutes, normal_minutes, overtime_minutes, overtime2_minutes, overtime_percent, overtime2_percent from public.hour_sheets $$,
  $$ values ('submitted', 'Sander Lie', 1500, 1260, 150, 90, 50, 100) $$,
  'the sheet keeps the totals, the name and the rules it was confirmed with');
select throws_ok($$ select public.save_hour_sheet_day(current_setting('test.sheet')::uuid, '2026-11-06', '07:00', '15:00', 0) $$,
  '55006', null, 'a confirmed sheet is locked');
select lives_ok($$ select public.record_hour_sheet_email(current_setting('test.sheet')::uuid, 'lonn@regnskap.test', 'sent', 're_1') $$,
  'the e-mail is recorded');

-- The accountant and the owner (second step) read it; another company does not.
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select is((select count(*)::int from public.hour_sheet_days), 3, 'the accountant reads the days');
select pg_temp.as_user('55555555-5555-5555-5555-555555555555', 'aal2');
select is((select count(*)::int from public.hour_sheets), 0, 'another company reads nothing');

select * from finish();
rollback;
