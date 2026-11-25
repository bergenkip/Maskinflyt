-- The calendar's times (Li, 2026-11-25): free and taken times, never the job itself.
-- Synthetic data (.test). "D" is the day after tomorrow in Oslo, always ahead.
begin;
select plan(5);

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
select public.save_company_page('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fjellkran-as', true,
  'Kranbil.', array['crane_truck'], 'Bergen', null, '91234567', 'post@fjellkran.test');
select public.save_company_hours('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false, 240, pg_temp.week());
reset role;

create function pg_temp.board() returns text[] language sql as $$
  select coalesce(array_agg(start_time || case when free then ' free' else ' taken' end order by start_time), '{}')
  from public.company_time_slots('fjellkran-as') where day = pg_temp.d()
$$;

set local role anon;
select is(pg_temp.board(), '{}'::text[], 'no calendar while the company takes requests only');
reset role;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select public.save_company_hours('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true, 240, pg_temp.week(), 60);
reset role;

set local role anon;
select is(pg_temp.board(), array['07:00 free', '08:00 free', '09:00 free', '10:00 free', '11:00 free'], 'hourly times all free on an empty day');
reset role;
insert into public.jobs (organization_id, number, customer_id, address, starts_at, ends_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 'a2000000-0000-0000-0000-000000000001', 'Storgata 1', pg_temp.at('08:00'), pg_temp.at('10:00'));
set local role anon;
select is(pg_temp.board(), array['07:00 taken', '08:00 taken', '09:00 taken', '10:00 free', '11:00 free'], 'a job 08–10 marks the times it overlaps as taken');
select is(
  (select array_agg(start_time order by start_time) from public.company_time_slots('fjellkran-as') where free and day = pg_temp.d()),
  (select array_agg(start_time order by start_time) from public.company_free_slots('fjellkran-as') where day = pg_temp.d()),
  'the free times are exactly the ones that can be sent');
reset role;

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select public.add_company_day_off('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', pg_temp.d(), 'Fellesferie');
reset role;
set local role anon;
select is(pg_temp.board(), '{}'::text[], 'a day off has no times at all: the calendar shows it closed');
reset role;

select * from finish();
rollback;
