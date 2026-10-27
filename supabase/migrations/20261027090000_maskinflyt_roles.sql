-- Stage 1: Maskinflyt roles.
--
-- The base came from OrderFlow with the roles owner / admin / operator / viewer.
-- A machine contractor works with different people:
--   owner:      runs the company; everything an admin can do, plus ownership
--   admin:      manages people and company settings
--   dispatcher: plans jobs, machines and drivers (job permissions come with the jobs stage)
--   driver:     does the jobs in the field (sees own jobs once the driver view exists)
--
-- Renaming keeps existing memberships and invitations: operator becomes
-- dispatcher and viewer becomes driver. Who may manage whom does not change:
-- owners and admins manage people, dispatchers and drivers only read the team.

alter type public.member_role rename value 'operator' to 'dispatcher';
alter type public.member_role rename value 'viewer' to 'driver';

alter table public.memberships alter column role set default 'driver';

-- Same function as before; only the role order in the list changes.
create or replace function public.list_members(org uuid)
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
      array_position(array['owner', 'admin', 'dispatcher', 'driver']::public.member_role[], m.role),
      lower(coalesce(p.first_name, '')), lower(coalesce(p.last_name, '')), u.email;
end;
$$;
