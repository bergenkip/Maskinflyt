-- Stage 4b-1: inviting colleagues and managing roles.
--
-- An invitation is bound to an e-mail address. The invited person signs up or
-- signs in with that address (confirmed by Supabase Auth) and accepts it; no
-- secret link is needed. Everything goes through the functions below, which
-- check the caller's role. The browser cannot write these tables directly.
--
-- Who may do what:
--   owner: invite (admin/operator/viewer), change any role incl. owner, remove anyone
--   admin: invite (admin/operator/viewer), manage admins/operators/viewers, never owners
--   operator, viewer: read the member list only
-- A company always keeps at least one owner.

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.member_role not null check (role <> 'owner'),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  check (accepted_at is null or revoked_at is null)
);

comment on table public.invitations is 'An invitation for an e-mail address to join an organization with a role.';

-- One open invitation per address and company.
create unique index invitations_open_email_key
  on public.invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;

create index invitations_email_idx on public.invitations (email);

alter table public.invitations enable row level security;
revoke all on public.invitations from anon, authenticated;
grant select on public.invitations to authenticated;

create policy "Owners and admins can read invitations of their organization"
  on public.invitations for select
  to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin']::public.member_role[])));

-- The signed-in user's e-mail, only once Supabase Auth has confirmed it.
create function private.confirmed_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email)
  from auth.users u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
$$;

create function private.role_of(org uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.memberships m
  where m.organization_id = org and m.user_id = (select auth.uid());
$$;

-- May someone with role actor change a member from target_role to new_role?
-- Owners may do anything; admins never touch owners.
create function private.may_manage(actor public.member_role, target_role public.member_role, new_role public.member_role)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case actor
    when 'owner' then true
    when 'admin' then target_role is distinct from 'owner' and new_role is distinct from 'owner'
    else false
  end;
$$;

-- Members of the caller's company, with e-mail addresses (auth.users is not
-- readable from the browser).
create function public.list_members(org uuid)
returns table (membership_id uuid, user_id uuid, email text, role public.member_role, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_member(org) then
    raise exception 'Not a member of this organization' using errcode = '42501';
  end if;

  return query
    select m.id, m.user_id, u.email::text, m.role, m.created_at
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = org
    order by array_position(array['owner', 'admin', 'operator', 'viewer']::public.member_role[], m.role), u.email;
end;
$$;

create function public.create_invitation(org uuid, invitee_email text, invitee_role public.member_role)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.member_role := private.role_of(org);
  clean_email text := lower(btrim(coalesce(invitee_email, '')));
  new_id uuid;
begin
  if actor is null or actor not in ('owner', 'admin') then
    raise exception 'Only owners and admins can invite' using errcode = '42501';
  end if;

  if clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(clean_email) > 254 then
    raise exception 'Invalid e-mail address' using errcode = '22023', hint = 'invalid_email';
  end if;

  if invitee_role is null or invitee_role = 'owner' then
    raise exception 'Invalid role' using errcode = '22023', hint = 'invalid_role';
  end if;

  if exists (
    select 1 from public.memberships m join auth.users u on u.id = m.user_id
    where m.organization_id = org and lower(u.email) = clean_email
  ) then
    raise exception 'Already a member' using errcode = '23505', hint = 'already_member';
  end if;

  -- Inviting again replaces the earlier open invitation (new role, new expiry).
  update public.invitations
  set revoked_at = now()
  where organization_id = org and email = clean_email and accepted_at is null and revoked_at is null;

  insert into public.invitations (organization_id, email, role, invited_by)
  values (org, clean_email, invitee_role, (select auth.uid()))
  returning id into new_id;

  return new_id;
end;
$$;

create function public.revoke_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invitations;
begin
  select * into inv from public.invitations i where i.id = invitation_id;
  if inv.id is null or not private.has_role(inv.organization_id, array['owner', 'admin']::public.member_role[]) then
    raise exception 'Invitation not found' using errcode = 'P0002', hint = 'not_found';
  end if;

  update public.invitations
  set revoked_at = now()
  where id = inv.id and accepted_at is null and revoked_at is null;
end;
$$;

-- Open invitations for the signed-in user's confirmed e-mail address.
create function public.my_invitations()
returns table (invitation_id uuid, organization_name text, role public.member_role, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, o.name, i.role, i.expires_at
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  where i.email = private.confirmed_email()
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
  order by i.created_at desc;
$$;

create function public.accept_invitation(invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  inv public.invitations;
begin
  if current_user_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  -- Lock the row so the same invitation cannot be accepted twice at once.
  select * into inv from public.invitations i
  where i.id = invitation_id
    and i.email = private.confirmed_email()
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
  for update;

  if inv.id is null then
    raise exception 'Invitation not found' using errcode = 'P0002', hint = 'not_found';
  end if;

  -- For now a person belongs to one company.
  if exists (select 1 from public.memberships m where m.user_id = current_user_id) then
    raise exception 'User already belongs to an organization' using errcode = 'P0001', hint = 'already_member';
  end if;

  insert into public.memberships (organization_id, user_id, role)
  values (inv.organization_id, current_user_id, inv.role);

  update public.invitations
  set accepted_at = now(), accepted_by = current_user_id
  where id = inv.id;

  return inv.organization_id;
end;
$$;

create function public.change_member_role(membership_id uuid, new_role public.member_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.memberships;
  actor public.member_role;
begin
  select * into target from public.memberships m where m.id = membership_id;
  if target.id is null then
    raise exception 'Member not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  -- Lock the company's memberships so two changes cannot both remove the
  -- last owner, then read the member again under the lock.
  perform 1 from public.memberships m where m.organization_id = target.organization_id for update;
  select * into target from public.memberships m where m.id = membership_id;

  actor := private.role_of(target.organization_id);
  if actor is null then
    raise exception 'Member not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if new_role is null or not private.may_manage(actor, target.role, new_role) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'not_allowed';
  end if;

  if target.role = 'owner' and new_role <> 'owner' and (
    select count(*) from public.memberships m
    where m.organization_id = target.organization_id and m.role = 'owner'
  ) = 1 then
    raise exception 'The last owner cannot be changed' using errcode = 'P0001', hint = 'last_owner';
  end if;

  update public.memberships set role = new_role where id = target.id;
end;
$$;

create function public.remove_member(membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.memberships;
  actor public.member_role;
begin
  select * into target from public.memberships m where m.id = membership_id;
  if target.id is null then
    raise exception 'Member not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  perform 1 from public.memberships m where m.organization_id = target.organization_id for update;
  select * into target from public.memberships m where m.id = membership_id;

  actor := private.role_of(target.organization_id);
  if actor is null then
    raise exception 'Member not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if not private.may_manage(actor, target.role, target.role) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'not_allowed';
  end if;

  if target.role = 'owner' and (
    select count(*) from public.memberships m
    where m.organization_id = target.organization_id and m.role = 'owner'
  ) = 1 then
    raise exception 'The last owner cannot be removed' using errcode = 'P0001', hint = 'last_owner';
  end if;

  delete from public.memberships where id = target.id;
end;
$$;

revoke all on function private.confirmed_email() from public;
revoke all on function private.role_of(uuid) from public;
revoke all on function private.may_manage(public.member_role, public.member_role, public.member_role) from public;
-- The three helpers above are only called from inside the functions below,
-- which run as their owner, so the browser role gets no direct access.

revoke all on function public.list_members(uuid) from public, anon;
revoke all on function public.create_invitation(uuid, text, public.member_role) from public, anon;
revoke all on function public.revoke_invitation(uuid) from public, anon;
revoke all on function public.my_invitations() from public, anon;
revoke all on function public.accept_invitation(uuid) from public, anon;
revoke all on function public.change_member_role(uuid, public.member_role) from public, anon;
revoke all on function public.remove_member(uuid) from public, anon;
grant execute on function public.list_members(uuid) to authenticated;
grant execute on function public.create_invitation(uuid, text, public.member_role) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.my_invitations() to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;
grant execute on function public.change_member_role(uuid, public.member_role) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
