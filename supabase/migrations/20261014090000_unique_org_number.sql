-- One company per name and per organisation number: a second sign-up for the
-- same company must join through an invitation (stage 4b), not create a
-- duplicate tenant. The org number stays optional and may come from another
-- country; only Norwegian numbers get the MOD11 check.

alter table public.organizations
  add column country text not null default 'NO' check (country ~ '^[A-Z]{2}$');

comment on column public.organizations.country is 'ISO 3166-1 alpha-2 country of the company register the org number belongs to.';

-- Before: 9 digits for every number. Now: letters and digits for any country,
-- and still exactly 9 digits for Norway.
alter table public.organizations drop constraint organizations_org_number_check;
alter table public.organizations
  add constraint organizations_org_number_check check (
    org_number ~ '^[A-Z0-9]{2,20}$'
    and (country <> 'NO' or org_number ~ '^[0-9]{9}$')
  );

-- Before this migration duplicates were possible, and the constraints below
-- cannot be added while any exist. Only synthetic test data exists so far.
-- Keep the number on the oldest company and clear it on later copies.
update public.organizations o
set org_number = null
from (
  select id, row_number() over (partition by country, org_number order by created_at, id) as position
  from public.organizations
  where org_number is not null
) ranked
where ranked.id = o.id and ranked.position > 1;

-- Keep the name on the oldest company and add a short id to later copies.
update public.organizations o
set name = left(btrim(o.name), 189) || ' (' || left(o.id::text, 8) || ')'
from (
  select id, row_number() over (
    partition by lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) order by created_at, id
  ) as position
  from public.organizations
) ranked
where ranked.id = o.id and ranked.position > 1;

-- NULLs never clash, so any number of companies may leave the number empty.
alter table public.organizations
  add constraint organizations_org_number_key unique (country, org_number);

-- Names are compared ignoring case, outer spaces and repeated spaces.
create unique index organizations_name_key
  on public.organizations (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

drop function public.create_organization(text, text);

create function public.create_organization(
  org_name text,
  org_number text default null,
  org_country text default 'NO'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  clean_name text := btrim(coalesce(org_name, ''));
  clean_country text := upper(btrim(coalesce(org_country, '')));
  clean_number text := nullif(upper(regexp_replace(coalesce(org_number, ''), '[\s.-]', '', 'g')), '');
  violated text;
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

  if clean_country !~ '^[A-Z]{2}$' then
    raise exception 'Invalid country' using errcode = '22023', hint = 'invalid_country';
  end if;

  if clean_number is not null and (
    (clean_country = 'NO' and not private.is_valid_org_number(clean_number))
    or clean_number !~ '^[A-Z0-9]{2,20}$'
  ) then
    raise exception 'Invalid organization number' using errcode = '22023', hint = 'invalid_org_number';
  end if;

  begin
    insert into public.organizations (name, org_number, country)
    values (clean_name, clean_number, clean_country)
    returning id into new_org_id;
  exception when unique_violation then
    -- Says only which field is taken; nothing else about that company.
    get stacked diagnostics violated = constraint_name;
    if violated = 'organizations_name_key' then
      raise exception 'Organization name is already registered' using errcode = '23505', hint = 'org_name_taken';
    end if;
    raise exception 'Organization number is already registered' using errcode = '23505', hint = 'org_number_taken';
  end;

  insert into public.memberships (organization_id, user_id, role)
  values (new_org_id, current_user_id, 'owner');

  return new_org_id;
end;
$$;

revoke all on function public.create_organization(text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text) to authenticated;

-- Same rights as org_number: owners and admins may correct it (RLS decides who).
grant update (country) on public.organizations to authenticated;
