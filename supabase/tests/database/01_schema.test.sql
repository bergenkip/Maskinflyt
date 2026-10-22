begin;
select plan(9);

select has_table('public', 'organizations', 'organizations table exists');
select has_table('public', 'memberships', 'memberships table exists');
select col_not_null('public', 'memberships', 'organization_id', 'every membership belongs to an organization');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.organizations'::regclass),
  'RLS is enabled on organizations'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.memberships'::regclass),
  'RLS is enabled on memberships'
);

-- Every table in the public schema must have RLS, including future ones.
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0,
  'no table in public is missing RLS'
);

select ok(
  not has_table_privilege('anon', 'public.organizations', 'select'),
  'anon has no select privilege on organizations'
);
select ok(
  not has_table_privilege('anon', 'public.memberships', 'select'),
  'anon has no select privilege on memberships'
);

select throws_ok(
  $$ insert into public.organizations (name, org_number) values ('Bad AS', '12345') $$,
  '23514',
  null,
  'org_number must be 9 digits'
);

select * from finish(true);
rollback;
