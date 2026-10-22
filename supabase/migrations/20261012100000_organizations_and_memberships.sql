-- Stage 3: tenants (organizations) and who belongs to them (memberships).
-- Every tenant-owned table added later references organizations(id) through
-- an organization_id column and is protected by row-level security (RLS).

create type public.member_role as enum ('owner', 'admin', 'operator', 'viewer');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  -- Norwegian organisasjonsnummer: 9 digits. MOD11 is validated in the app.
  org_number text check (org_number ~ '^[0-9]{9}$'),
  default_locale text not null default 'nb' check (default_locale in ('nb', 'en', 'lt')),
  currency text not null default 'NOK' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Europe/Oslo',
  created_at timestamptz not null default now()
);

comment on table public.organizations is 'A customer company (tenant). Users see only organizations they are members of.';

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

comment on table public.memberships is 'Links a user to an organization with one role.';

create index memberships_user_id_idx on public.memberships (user_id);

-- Helper functions live in a schema that the public API does not expose.
-- They are SECURITY DEFINER so policies on memberships can read memberships
-- without triggering their own policy again (infinite recursion).
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create function private.is_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
  );
$$;

create function private.has_role(org uuid, roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and m.role = any (roles)
  );
$$;

revoke all on function private.is_member(uuid) from public;
revoke all on function private.has_role(uuid, public.member_role[]) from public;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.has_role(uuid, public.member_role[]) to authenticated;

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;

-- New tables are not exposed automatically (project setting), so access is
-- granted here explicitly. Signed-out visitors (anon) get nothing.
revoke all on public.organizations from anon, authenticated;
revoke all on public.memberships from anon, authenticated;
grant select, update (name, org_number, default_locale, currency, timezone)
  on public.organizations to authenticated;
grant select on public.memberships to authenticated;

-- Organizations: members can read; only owner/admin can change settings.
-- Creating and deleting organizations is not allowed from the browser yet;
-- that comes with sign-up in stage 4 through a controlled server function.
create policy "Members can read their organizations"
  on public.organizations for select
  to authenticated
  using ((select private.is_member(id)));

create policy "Owners and admins can update their organization"
  on public.organizations for update
  to authenticated
  using ((select private.has_role(id, array['owner', 'admin']::public.member_role[])))
  with check ((select private.has_role(id, array['owner', 'admin']::public.member_role[])));

-- Memberships: members can see who else is in their organization.
-- Adding, changing and removing members comes with invitations in stage 4.
create policy "Members can read memberships of their organizations"
  on public.memberships for select
  to authenticated
  using ((select private.is_member(organization_id)));
