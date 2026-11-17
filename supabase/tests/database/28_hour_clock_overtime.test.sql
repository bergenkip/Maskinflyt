-- Overtime by the time of day: 15:00–19:00 +50 % and 19:00–06:00 +100 %.
-- The minutes in each window are counted, the break comes off the normal
-- minutes first, and the confirmed sheet keeps the windows. The per-day way
-- still works, and old rules stay as they were.
-- All data is synthetic (.test e-mails).
begin;
select plan(17);

insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'anna@fjellkran.test', now()),
  ('44444444-4444-4444-4444-444444444444', 'sander@fjellkran.test', now());
insert into public.organizations (id, name, org_number) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS', '123456785');
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'driver');

create function pg_temp.as_user(id text, aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claim.sub', id, true),
         set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated', 'aal', aal,
           'amr', json_build_array(json_build_object('method', 'password', 'timestamp', 1790000000)))::text, true);
$$;

-- The split itself (as the owner of the functions).
select is(
  (select row(normal, overtime, overtime2)::text from private.split_day('clock', '07:00', '21:00', 30, 810, 480, null, '15:00', '19:00', '19:00', '06:00')),
  '(450,240,120)', '07–21 with 30 min break: 7.5 h normal, 4 h +50 %, 2 h +100 %');
select is(
  (select row(normal, overtime, overtime2)::text from private.split_day('clock', '22:00', '06:00', 30, 450, 480, null, '15:00', '19:00', '19:00', '06:00')),
  '(0,0,450)', 'a night shift is all +100 %, the break too');
select is(
  (select row(normal, overtime, overtime2)::text from private.split_day('clock', '05:00', '16:00', 60, 600, 480, null, '15:00', '19:00', '19:00', '06:00')),
  '(480,60,60)', '05–06 is in the night window; the hour break comes off the normal minutes');
select is(
  (select row(normal, overtime, overtime2)::text from private.split_day('clock', '14:00', '20:00', 0, 360, 480, null, '15:00', '06:00', '19:00', '06:00')),
  '(60,240,60)', 'where the windows overlap, the second level wins');
select is(
  (select row(normal, overtime, overtime2)::text from private.split_day('clock', '14:00', '20:00', 0, 360, 480, null, '15:00', '06:00', null, null)),
  '(60,300,0)', 'one window past midnight, no second level');
select is(
  (select row(normal, overtime, overtime2)::text from private.split_day('daily', '06:00', '18:00', 30, 690, 450, 600, null, null, null, null)),
  '(450,150,90)', 'the per-day way is unchanged');

set local role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'aal2');
select throws_ok($$ select public.save_hour_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 50, 'hourly') $$,
  '22023', 'Choose how overtime is counted', 'only the two ways');
select throws_ok($$ select public.save_hour_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 50, 'clock', overtime_from => '15:00', overtime_to => '15:00') $$,
  '22023', 'Write when overtime starts and ends', 'a window has a start and a different end');
select throws_ok($$ select public.save_hour_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 50, 'clock', overtime_from => '15:00', overtime_to => '19:00',
    overtime2_from => '19:00', overtime2_to => '06:00', overtime2_percent => 40) $$,
  '22023', 'The second window pays more', 'the second window pays more');
select throws_ok($$ select public.save_hour_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 50, 'clock', overtime_from => '15:00', overtime_to => '19:00',
    overtime2_from => '19:00', overtime2_percent => 100) $$,
  '22023', 'The second window pays more', 'the second window needs both times');
select lives_ok($$ select public.save_hour_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 50, 'clock', overtime_after => 300, overtime_from => '15:00', overtime_to => '19:00',
    overtime2_from => '19:00', overtime2_to => '06:00', overtime2_percent => 100) $$,
  'the owner saves 15–19 +50 % and 19–06 +100 %');
select results_eq(
  $$ select overtime_mode, overtime_after, overtime_from::text, overtime_to::text, overtime2_from::text, overtime2_to::text, overtime2_after from public.hour_settings $$,
  $$ values ('clock', 480, '15:00:00', '19:00:00', '19:00:00', '06:00:00', null::int) $$,
  'the windows are kept; the hours a day are left as they were');

-- Sander works 07–21 (30 min break) and a night 22–06 (30 min), then confirms.
select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
select set_config('test.sheet', public.create_hour_sheet('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-11-01', '2026-11-30')::text, true);
select public.save_hour_sheet_day(current_setting('test.sheet')::uuid, '2026-11-02', '07:00', '21:00', 30);
select public.save_hour_sheet_day(current_setting('test.sheet')::uuid, '2026-11-03', '22:00', '06:00', 30);
select is(public.submit_hour_sheet(current_setting('test.sheet')::uuid), null, 'confirmed (no accountant yet)');
select results_eq(
  $$ select day::text, normal_minutes, overtime_minutes, overtime2_minutes from public.hour_sheet_days order by day $$,
  $$ values ('2026-11-02', 450, 240, 120), ('2026-11-03', 0, 0, 450) $$,
  'each day is split by the clock');
select results_eq(
  $$ select overtime_mode, overtime_from::text, overtime_to::text, overtime2_from::text, overtime2_to::text, worked_minutes, normal_minutes, overtime_minutes, overtime2_minutes from public.hour_sheets $$,
  $$ values ('clock', '15:00:00', '19:00:00', '19:00:00', '06:00:00', 1260, 450, 240, 570) $$,
  'the sheet keeps the windows it was confirmed with');

-- Back to per day: the windows are cleared.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'aal2');
select lives_ok($$ select public.save_hour_settings('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 50, 'daily', overtime_after => 450) $$, 'the owner goes back to per day');
select results_eq(
  $$ select overtime_mode, overtime_after, overtime_from, overtime2_from, overtime2_percent from public.hour_settings $$,
  $$ values ('daily', 450, null::time, null::time, null::int) $$,
  'per day again, without the windows');

select * from finish();
rollback;
