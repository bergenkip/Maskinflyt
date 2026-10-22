-- Stage 4a: user profiles (language preference) and creating an organization.

-- One profile per signed-in user. Not company data, so no organization_id:
-- it belongs to the person and follows them between companies and devices.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- null means "not chosen": the organization default or browser language is used.
  locale text check (locale in ('nb', 'en', 'lt')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Personal settings of a user. Each user sees and edits only their own row.';

alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select, update (locale) on public.profiles to authenticated;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function private.touch_updated_at();

-- Every new auth user gets a profile automatically.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Profiles for users that existed before this migration.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- Norwegian organisasjonsnummer check digit (MOD11, weights 3 2 7 6 5 4 3 2).
create function private.is_valid_org_number(value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  weights int[] := array[3, 2, 7, 6, 5, 4, 3, 2];
  total int := 0;
  remainder int;
  check_digit int;
begin
  if value is null or value !~ '^[0-9]{9}$' then
    return false;
  end if;
  for i in 1..8 loop
    total := total + substr(value, i, 1)::int * weights[i];
  end loop;
  remainder := total % 11;
  check_digit := case when remainder = 0 then 0 else 11 - remainder end;
  if check_digit = 10 then
    return false;
  end if;
  return check_digit = substr(value, 9, 1)::int;
end;
$$;

-- Onboarding: a signed-in user without a company creates one and becomes its owner.
-- Runs with elevated rights because the browser may not insert into these
-- tables directly; every check happens here instead.
create function public.create_organization(org_name text, org_number text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  clean_name text := btrim(coalesce(org_name, ''));
  clean_number text := nullif(regexp_replace(coalesce(org_number, ''), '\s', '', 'g'), '');
  new_org_id uuid;
begin
  if current_user_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if exists (select 1 from public.memberships m where m.user_id = current_user_id) then
    raise exception 'User already belongs to an organization' using errcode = 'P0001', hint = 'already_member';
  end if;

  if char_length(clean_name) not between 1 and 200 then
    raise exception 'Invalid organization name' using errcode = '22023', hint = 'invalid_name';
  end if;

  if clean_number is not null and not private.is_valid_org_number(clean_number) then
    raise exception 'Invalid organization number' using errcode = '22023', hint = 'invalid_org_number';
  end if;

  insert into public.organizations (name, org_number)
  values (clean_name, clean_number)
  returning id into new_org_id;

  insert into public.memberships (organization_id, user_id, role)
  values (new_org_id, current_user_id, 'owner');

  return new_org_id;
end;
$$;

revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

revoke all on function private.is_valid_org_number(text) from public;
revoke all on function private.handle_new_user() from public;
revoke all on function private.touch_updated_at() from public;
