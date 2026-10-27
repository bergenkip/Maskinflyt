-- Personal invitation links, and names for every person.
--
-- 1. Instead of naming an e-mail address, an owner or admin creates an
--    invitation with only a role and gets a personal link with a secret token.
--    Whoever opens the link creates an account (or signs in) and joins, so the
--    link works like a key: it can be used once, expires after 7 days and can
--    be cancelled. Only a SHA-256 hash of the token is stored, so not even a
--    database reader can rebuild a working link.
-- 2. Profiles get a first and last name, entered at sign-up and shown in the
--    team list instead of only the e-mail address.

-- Names ------------------------------------------------------------------

alter table public.profiles
  add column first_name text check (first_name is null or (first_name = btrim(first_name) and char_length(first_name) between 1 and 100)),
  add column last_name text check (last_name is null or (last_name = btrim(last_name) and char_length(last_name) between 1 and 100));

grant update (first_name, last_name) on public.profiles to authenticated;

-- The sign-up form sends the name as user metadata; copy it into the profile.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), 100), ''),
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), 100), '')
  );
  return new;
end;
$$;

-- Invitation links -------------------------------------------------------

alter table public.invitations
  alter column email drop not null,
  add column token_hash text unique check (token_hash ~ '^[0-9a-f]{64}$'),
  add constraint invitations_email_or_token check (email is not null or token_hash is not null);

comment on table public.invitations is 'An invitation to join an organization with a role, opened through a personal link.';

-- Invitations bound to an e-mail address have no link and can no longer be accepted.
update public.invitations
set revoked_at = now()
where token_hash is null and accepted_at is null and revoked_at is null;

drop function public.my_invitations();
drop function public.accept_invitation(uuid);
drop function public.create_invitation(uuid, text, public.member_role);
drop function private.confirmed_email();

create function private.hash_token(token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(coalesce(token, ''), 'UTF8')), 'hex');
$$;

-- Returns the secret token once. gen_random_uuid() uses the system's strong
-- random source; two of them give 244 random bits.
create function public.create_invitation(org uuid, invitee_role public.member_role)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.member_role := private.role_of(org);
  token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if actor is null or actor not in ('owner', 'admin') then
    raise exception 'Only owners and admins can invite' using errcode = '42501';
  end if;

  if invitee_role is null or invitee_role = 'owner' then
    raise exception 'Invalid role' using errcode = '22023', hint = 'invalid_role';
  end if;

  insert into public.invitations (organization_id, role, invited_by, token_hash)
  values (org, invitee_role, (select auth.uid()), private.hash_token(token));

  return token;
end;
$$;

-- What the invitation page shows before signing up: company and role.
-- Open to visitors who are not signed in, but only with a valid token.
create function public.invitation_preview(token text)
returns table (organization_name text, role public.member_role, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, i.role, i.expires_at
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  where i.token_hash = private.hash_token(token)
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now();
$$;

create function public.accept_invitation(token text)
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

  -- Lock the row so the same link cannot be used twice at once.
  select * into inv from public.invitations i
  where i.token_hash = private.hash_token(token)
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

-- The member list now includes names (null for older accounts without one).
drop function public.list_members(uuid);

create function public.list_members(org uuid)
returns table (
  membership_id uuid,
  user_id uuid,
  email text,
  full_name text,
  role public.member_role,
  joined_at timestamptz
)
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
    select
      m.id,
      m.user_id,
      u.email::text,
      nullif(concat_ws(' ', p.first_name, p.last_name), ''),
      m.role,
      m.created_at
    from public.memberships m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
    where m.organization_id = org
    order by
      array_position(array['owner', 'admin', 'operator', 'viewer']::public.member_role[], m.role),
      lower(coalesce(p.first_name, '')), lower(coalesce(p.last_name, '')), u.email;
end;
$$;

revoke all on function private.hash_token(text) from public;
revoke all on function public.create_invitation(uuid, public.member_role) from public, anon;
revoke all on function public.invitation_preview(text) from public;
revoke all on function public.accept_invitation(text) from public, anon;
revoke all on function public.list_members(uuid) from public, anon;
grant execute on function public.create_invitation(uuid, public.member_role) to authenticated;
grant execute on function public.invitation_preview(text) to anon, authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.list_members(uuid) to authenticated;
