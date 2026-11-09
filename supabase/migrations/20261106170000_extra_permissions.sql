-- Stage 9: extra rights for a member, on top of their role.
--
-- An owner or admin can give a dispatcher, driver or accountant extra rights.
-- They only add: nobody loses what their role gives them.
--
--   plan_jobs  plan jobs and customers as a dispatcher does (that includes the
--              invoicing, as for a dispatcher)
--   invoicing  finish the invoicing as an accountant does (finished jobs only,
--              with the second step)
--   machines   add and change machines and prices as an owner or admin does
--              (with the second step)
--   invite     invite drivers and dispatchers (with the second step)
--
-- plan_jobs and invoicing reuse every rule written for dispatchers and
-- accountants: private.has_role counts the member as one where those roles are
-- named. machines and invite get their own policies and checks below.

alter table public.memberships
  add column permissions text[] not null default '{}'
    check (permissions <@ array['plan_jobs', 'invoicing', 'machines', 'invite']::text[]);

comment on column public.memberships.permissions is 'Extra rights on top of the role, given by an owner or admin.';

-- Does the signed-in user have this extra right in the company?
create function private.has_permission(org uuid, permission text)
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
      and has_permission.permission = any (m.permissions)
  );
$$;

revoke all on function private.has_permission(uuid, text) from public;
grant execute on function private.has_permission(uuid, text) to authenticated;

-- The role check, now also true for the matching extra right: plan_jobs where
-- dispatchers are named, invoicing where accountants are named.
create or replace function private.has_role(org uuid, roles public.member_role[])
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
      and (
        m.role = any (roles)
        or ('dispatcher'::public.member_role = any (roles) and 'plan_jobs' = any (m.permissions))
        or ('accountant'::public.member_role = any (roles) and 'invoicing' = any (m.permissions))
      )
  );
$$;

-- Machines and prices. The restrictive policies already ask everyone for the second step.
create policy "Members with the machines right can read vehicles"
  on public.vehicles for select
  to authenticated
  using ((select private.has_permission(organization_id, 'machines')));

create policy "Members with the machines right can add vehicles"
  on public.vehicles for insert
  to authenticated
  with check ((select private.has_permission(organization_id, 'machines')));

create policy "Members with the machines right can change vehicles"
  on public.vehicles for update
  to authenticated
  using ((select private.has_permission(organization_id, 'machines')))
  with check ((select private.has_permission(organization_id, 'machines')));

create policy "Members with the machines right can read customer prices"
  on public.customer_rates for select
  to authenticated
  using ((select private.has_permission(organization_id, 'machines')));

create policy "Members with the machines right can add customer prices"
  on public.customer_rates for insert
  to authenticated
  with check ((select private.has_permission(organization_id, 'machines')));

create policy "Members with the machines right can change customer prices"
  on public.customer_rates for update
  to authenticated
  using ((select private.has_permission(organization_id, 'machines')))
  with check ((select private.has_permission(organization_id, 'machines')));

create policy "Members with the machines right can remove customer prices"
  on public.customer_rates for delete
  to authenticated
  using ((select private.has_permission(organization_id, 'machines')));

-- Inviting. The restrictive policy already asks for the second step to read invitations.
create policy "Members with the invite right can read invitations"
  on public.invitations for select
  to authenticated
  using ((select private.has_permission(organization_id, 'invite')));

create or replace function public.create_invitation(org uuid, invitee_role public.member_role)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.member_role := private.role_of(org);
  inviter boolean := private.has_permission(org, 'invite');
  token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if actor is null or (actor not in ('owner', 'admin') and not inviter) then
    raise exception 'Only owners and admins can invite' using errcode = '42501';
  end if;
  perform private.require_mfa();

  if invitee_role is null or invitee_role = 'owner'
     or (actor not in ('owner', 'admin') and invitee_role not in ('dispatcher', 'driver')) then
    raise exception 'Invalid role' using errcode = '22023', hint = 'invalid_role';
  end if;

  insert into public.invitations (organization_id, role, invited_by, token_hash)
  values (org, invitee_role, (select auth.uid()), private.hash_token(token));

  return token;
end;
$$;

-- Owners and admins take back any invitation, the others the ones they made.
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
  if inv.id is null or not (
    private.has_role(inv.organization_id, array['owner', 'admin']::public.member_role[])
    or (private.has_permission(inv.organization_id, 'invite') and inv.invited_by = (select auth.uid()))
  ) then
    raise exception 'Invitation not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  perform private.require_mfa();

  update public.invitations
  set revoked_at = now()
  where id = inv.id and accepted_at is null and revoked_at is null;
end;
$$;

-- Those who plan jobs choose main machines, now also with the plan_jobs right.
create or replace function public.set_main_machine(membership_id uuid, vehicle_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.memberships;
begin
  select * into target from public.memberships m where m.id = membership_id;
  if target.id is null or not private.is_member(target.organization_id) then
    raise exception 'Member not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if not private.has_role(target.organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[]) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'not_allowed';
  end if;
  if not private.has_role(target.organization_id, array['dispatcher']::public.member_role[]) then
    perform private.require_mfa();
  end if;

  -- The foreign key refuses a machine of another company (23503).
  update public.memberships m set main_vehicle_id = set_main_machine.vehicle_id where m.id = target.id;
end;
$$;

-- Give or take back extra rights. Owners and admins only, with the second
-- step; owners and admins themselves have every right already.
create function public.set_member_permissions(membership_id uuid, new_permissions text[])
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
  actor := private.role_of(target.organization_id);
  if target.id is null or actor is null then
    raise exception 'Member not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if actor not in ('owner', 'admin') or target.role in ('owner', 'admin') then
    raise exception 'Not allowed' using errcode = '42501', hint = 'not_allowed';
  end if;
  perform private.require_mfa();
  if new_permissions is null
     or not (new_permissions <@ array['plan_jobs', 'invoicing', 'machines', 'invite']::text[]) then
    raise exception 'Unknown right' using errcode = '22023', hint = 'invalid_permission';
  end if;

  update public.memberships m
  set permissions = array(select distinct p from unnest(new_permissions) p order by p)
  where m.id = target.id;
end;
$$;

revoke all on function public.set_member_permissions(uuid, text[]) from public, anon;
grant execute on function public.set_member_permissions(uuid, text[]) to authenticated;
