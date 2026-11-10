-- The language of Auth e-mails follows the person's choice, else the company
-- default, and is kept in auth.users metadata where the templates can read it.
-- All data is synthetic (.test e-mails).
begin;
select plan(8);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anna@fjellkran.test', '{"first_name":"Anna","email_locale":"en"}'),
  ('22222222-2222-2222-2222-222222222222', 'erik@fjellkran.test', '{}');

select is(
  (select raw_user_meta_data ->> 'email_locale' from auth.users where id = '11111111-1111-1111-1111-111111111111'),
  'en',
  'the language sent at sign-up stays while there is no choice or company'
);

insert into public.organizations (id, name, default_locale) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fjellkran AS', 'nb');
insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'driver');

select is(
  (select raw_user_meta_data ->> 'email_locale' from auth.users where id = '11111111-1111-1111-1111-111111111111'),
  'nb',
  'joining a company applies its default language'
);
select is(
  (select raw_user_meta_data ->> 'first_name' from auth.users where id = '11111111-1111-1111-1111-111111111111'),
  'Anna',
  'other metadata is kept'
);

-- Anna chooses Lithuanian in Settings, as herself.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
update public.profiles set locale = 'lt' where id = '11111111-1111-1111-1111-111111111111';
reset role;

select is(
  (select raw_user_meta_data ->> 'email_locale' from auth.users where id = '11111111-1111-1111-1111-111111111111'),
  'lt',
  'a language chosen in Settings is used for e-mails'
);

update public.organizations set default_locale = 'en' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select is(
  (select raw_user_meta_data ->> 'email_locale' from auth.users where id = '11111111-1111-1111-1111-111111111111'),
  'lt',
  'a changed company default does not override a personal choice'
);
select is(
  (select raw_user_meta_data ->> 'email_locale' from auth.users where id = '22222222-2222-2222-2222-222222222222'),
  'en',
  'a changed company default reaches members without a choice'
);

update public.profiles set locale = null where id = '11111111-1111-1111-1111-111111111111';

select is(
  (select raw_user_meta_data ->> 'email_locale' from auth.users where id = '11111111-1111-1111-1111-111111111111'),
  'en',
  'clearing the choice falls back to the company default'
);

select ok(
  not has_function_privilege('authenticated', 'private.sync_email_locale(uuid)', 'execute'),
  'users cannot call the sync function directly'
);

select * from finish();
rollback;
