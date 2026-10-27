-- Stage 4b-2: two-step sign-in for owners and admins.
--
-- After the password, owners and admins ask for a sign-in link that Supabase
-- Auth e-mails to them, and approve the sign-in from that link. The link may
-- be opened in any browser (the Gmail app, another phone): opening it creates
-- a short-lived "link session" whose JWT lists "otp" or "magiclink" among its
-- authentication methods (amr). With it the person approves the waiting
-- sign-in request, which belongs to the session that asked for the link. The
-- app then signs the link session out again.
--
-- Everything only owners and admins may do requires a passed second step,
-- checked here in the database, so a stolen password alone cannot change the
-- team or the company. A session at assurance level "aal2" (an authenticator
-- app, if ever turned on) counts as well.

-- The JWT claims PostgREST sets for every request.
create function private.jwt_claims()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

-- Whether the current session was created from an e-mailed link or code.
create function private.is_link_session()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(private.jwt_claims() -> 'amr') = 'array' then private.jwt_claims() -> 'amr' else '[]'::jsonb end
    ) as m
    where m ->> 'method' in ('otp', 'magiclink')
  );
$$;

-- The Supabase Auth session of the current request, if the claim is a uuid.
create function private.session_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when private.jwt_claims() ->> 'session_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (private.jwt_claims() ->> 'session_id')::uuid
  end;
$$;

-- A sign-in waiting for approval from the e-mailed link. Not reachable through
-- the API; only the functions below read or change it.
create table private.second_step_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null,
  user_agent text check (char_length(user_agent) <= 500),
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create index second_step_requests_session on private.second_step_requests (session_id) where approved_at is not null;

create function private.second_step_done()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.jwt_claims() ->> 'aal' = 'aal2'
    or private.is_link_session()
    or exists (
      select 1 from private.second_step_requests r
      where r.session_id = private.session_id()
        and r.user_id = (select auth.uid())
        and r.approved_at is not null
    ),
    false
  );
$$;

create function private.require_mfa()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.second_step_done() then
    raise exception 'Two-step sign-in required' using errcode = '42501', hint = 'mfa_required';
  end if;
end;
$$;

-- Called by the waiting browser when it asks for a link. Returns the request
-- id, which goes into the link so the approval page can show which sign-in it
-- approves. Earlier unapproved requests of this session are replaced.
create function public.request_second_step(user_agent text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_session uuid := private.session_id();
  request_id uuid;
begin
  if current_user_id is null or current_session is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  delete from private.second_step_requests r
  where r.session_id = current_session and r.approved_at is null;

  insert into private.second_step_requests (user_id, session_id, user_agent)
  values (current_user_id, current_session, left(user_agent, 500))
  returning id into request_id;

  return request_id;
end;
$$;

-- What the approval page shows: when and from which browser the sign-in was
-- asked for. Only for the same person, from a link session.
create function public.second_step_request(request uuid)
returns table (user_agent text, created_at timestamptz, approved boolean, expired boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select r.user_agent, r.created_at, r.approved_at is not null, r.created_at < now() - interval '1 hour'
  from private.second_step_requests r
  where r.id = request
    and r.user_id = (select auth.uid())
    and private.is_link_session();
$$;

-- Approves a waiting sign-in. Needs a link session of the same person, and the
-- request must be less than an hour old.
create function public.approve_second_step(request uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_link_session() then
    raise exception 'Open the e-mailed link first' using errcode = '42501', hint = 'not_link_session';
  end if;

  update private.second_step_requests r
  set approved_at = now()
  where r.id = request
    and r.user_id = (select auth.uid())
    and r.approved_at is null
    and r.created_at >= now() - interval '1 hour';

  if not found then
    raise exception 'Request not found' using errcode = 'P0002', hint = 'not_found';
  end if;
end;
$$;

-- Whether the current session has passed the second step (the waiting browser asks this).
create function public.second_step_passed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.second_step_done();
$$;

revoke all on table private.second_step_requests from public, anon, authenticated;
revoke all on function private.jwt_claims() from public;
revoke all on function private.is_link_session() from public;
revoke all on function private.session_id() from public;
revoke all on function private.second_step_done() from public;
revoke all on function private.require_mfa() from public;
revoke all on function public.request_second_step(text) from public, anon;
revoke all on function public.second_step_request(uuid) from public, anon;
revoke all on function public.approve_second_step(uuid) from public, anon;
revoke all on function public.second_step_passed() from public, anon;
-- Used inside RLS policies, which run as the signed-in user.
grant execute on function private.second_step_done() to authenticated;
grant execute on function public.request_second_step(text) to authenticated;
grant execute on function public.second_step_request(uuid) to authenticated;
grant execute on function public.approve_second_step(uuid) to authenticated;
grant execute on function public.second_step_passed() to authenticated;

-- Direct table access by owners and admins needs the second step as well. Restrictive
-- policies are combined with AND, on top of the existing role checks.
create policy "Changing a company needs two-step sign-in"
  on public.organizations as restrictive for update
  to authenticated
  using ((select private.second_step_done()));

create policy "Reading invitations needs two-step sign-in"
  on public.invitations as restrictive for select
  to authenticated
  using ((select private.second_step_done()));

-- The functions owners and admins use, now with the second-step check (bodies otherwise unchanged).
create or replace function public.create_invitation(org uuid, invitee_role public.member_role)
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
  perform private.require_mfa();

  if invitee_role is null or invitee_role = 'owner' then
    raise exception 'Invalid role' using errcode = '22023', hint = 'invalid_role';
  end if;

  insert into public.invitations (organization_id, role, invited_by, token_hash)
  values (org, invitee_role, (select auth.uid()), private.hash_token(token));

  return token;
end;
$$;

create or replace function public.revoke_invitation(invitation_id uuid)
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
  perform private.require_mfa();

  update public.invitations
  set revoked_at = now()
  where id = inv.id and accepted_at is null and revoked_at is null;
end;
$$;

create or replace function public.change_member_role(membership_id uuid, new_role public.member_role)
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
  perform private.require_mfa();
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

create or replace function public.remove_member(membership_id uuid)
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
  perform private.require_mfa();
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
