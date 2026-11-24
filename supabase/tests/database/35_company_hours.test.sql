-- Stage 15c: opening hours, days off and the free times a visitor may pick.
-- Synthetic data (.test). "D" is the day after tomorrow in Oslo, always ahead.
begin;
select plan(22);

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
insert into public.vehicles (id, organization_id, type, name) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'crane_truck', 'Kranbil 1');
insert into public.customers (id, organization_id, name) values
  ('a2000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nordbygg AS');

create function pg_temp.d() returns date language sql as $$ select (now() at time zone 'Europe/Oslo')::date + 2 $$;
create function pg_temp.at(t text) returns timestamptz language sql as $$ select (pg_temp.d() + t::time) at time zone 'Europe/Oslo' $$;
create function pg_temp.as_user(id text, aal text default 'aal2') returns void language sql as $$
  select set_config('request.jwt.claim.sub', id, true),
         set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated', 'aal', aal)::text, true);
$$;
create function pg_temp.slots_on_d() returns text[] language sql as $$
  select coalesce(array_agg(start_time order by start_time), '{}') from public.company_free_slots('fjellkran-as') where day = pg_temp.d()
$$;
create function pg_temp.week() returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('weekday', w, 'opens', '07:00', 'closes', '15:00')) from generate_series(1, 7) w
$$;

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.save_company_hours('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true, 240, pg_temp.week()) $$,
  'P0002', 'Create the company page first', 'the page comes first');
select public.save_company_page('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fjellkran-as', true,
  'Kranbil.', array['crane_truck'], 'Bergen', null, '91234567', 'post@fjellkran.test');
select is((select free_times from public.company_pages), null, 'undecided until the company chooses');
select throws_ok($$ select public.save_company_hours('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true, 240, '[]') $$,
  '22023', 'Open at least one day to show free times', 'free times need an open day');
select throws_ok($$ select public.save_company_hours('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false, 240,
  '[{"weekday": 1, "opens": "15:00", "closes": "07:00"}]') $$, '22023', 'Invalid hours', 'closing before opening is refused');
select throws_ok($$ select public.save_company_hours('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false, 45, '[]') $$,
  '22023', 'Invalid booking length', 'only the listed booking lengths');
select lives_ok($$ select public.save_company_hours('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false, 240, pg_temp.week()) $$, 'the week is saved');
select is((select count(*)::int from public.company_hours), 7, 'seven open days');

-- Requests only: a visitor sees no times.
reset role;
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select results_eq($$ select free_times, slot_minutes from public.company_page_booking('fjellkran-as') $$,
  $$ values (false, 240) $$, 'the page says requests only');
select is(pg_temp.slots_on_d(), '{}'::text[], 'no free times while switched off');
reset role;

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select public.save_company_hours('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true, 240, pg_temp.week());
reset role;
set local role anon;
select is(pg_temp.slots_on_d(), array['07:00', '11:00'], 'two four-hour times a day within 07–15');
select ok(not exists (select 1 from public.company_free_slots('fjellkran-as') where starts_at < now() + interval '2 hours'),
  'nothing starts in less than two hours');
reset role;

-- A job takes the morning (one machine); a second machine frees it again.
insert into public.jobs (organization_id, number, customer_id, address, starts_at, ends_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 'a2000000-0000-0000-0000-000000000001', 'Storgata 1', pg_temp.at('08:00'), pg_temp.at('10:00'));
set local role anon;
select is(pg_temp.slots_on_d(), array['11:00'], 'a job takes the time it overlaps');
reset role;
insert into public.vehicles (organization_id, type, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'excavator', 'Gravemaskin');
set local role anon;
select is(pg_temp.slots_on_d(), array['07:00', '11:00'], 'with two machines the morning is free again');
reset role;
update public.vehicles set active = false where name = 'Gravemaskin';

-- A visitor picks 11:00; the time is then taken, and the request carries it.
set local role anon;
select lives_ok($$ select public.submit_job_request('fjellkran-as', 'Kari', 'Bergen', 'Løfte.', '91234568',
  request_wanted_start => pg_temp.at('11:00')) $$, 'a visitor picks a free time');
select is(pg_temp.slots_on_d(), '{}'::text[], 'the picked time is no longer offered');
select throws_ok($$ select public.submit_job_request('fjellkran-as', 'Ola', 'Bergen', 'Løfte.', '91234569',
  request_wanted_start => pg_temp.at('11:00')) $$, '22023', 'The time is no longer free', 'nobody else gets it');
select throws_ok($$ select public.submit_job_request('fjellkran-as', 'Ola', 'Bergen', 'Løfte.', '91234569',
  request_wanted_start => pg_temp.at('12:00')) $$, '22023', 'The time is no longer free', 'only offered times');
reset role;
select results_eq($$ select wanted_date, wanted_start from public.job_requests $$,
  $$ values (pg_temp.d(), pg_temp.at('11:00')) $$, 'the request has the day and the time');

-- A day off closes the whole day (the picked time answered, so it would be free again).
update public.job_requests set status = 'declined';
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select lives_ok($$ select public.add_company_day_off('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', pg_temp.d(), ' Fellesferie ') $$, 'a day off is added');
reset role;
set local role anon;
select is(pg_temp.slots_on_d(), '{}'::text[], 'no times on a day off');
reset role;

-- Others cannot change the hours, nor see them.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
select throws_ok($$ select public.remove_company_day_off('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', pg_temp.d()) $$,
  '42501', 'Only owners and admins change the company page', 'a driver cannot change the days off');
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select is((select count(*)::int from public.company_hours) + (select count(*)::int from public.company_days_off), 0,
  'another company reads neither');
reset role;

select * from finish();
rollback;
