-- Language of the e-mails Supabase Auth sends (sign-up confirmation, sign-in
-- link for the second step, password reset).
--
-- The e-mail templates can only read auth.users.raw_user_meta_data
-- ({{ .Data }}), not our tables. So the person's effective language is copied
-- there as "email_locale": their own choice in Settings, otherwise the
-- company's default language. Before either exists (right after sign-up) the
-- value sent with the sign-up form, i.e. the language the page was shown in,
-- stays. The templates fall back to Norwegian when nothing is set.

create function private.sync_email_locale(target_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  effective text;
begin
  select coalesce(
    (select p.locale from public.profiles p where p.id = target_user),
    (select o.default_locale
       from public.memberships m
       join public.organizations o on o.id = m.organization_id
      where m.user_id = target_user
      order by m.created_at
      limit 1)
  ) into effective;

  if effective is null then
    return;
  end if;

  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                              || jsonb_build_object('email_locale', effective)
   where id = target_user
     and raw_user_meta_data ->> 'email_locale' is distinct from effective;
end;
$$;

revoke all on function private.sync_email_locale(uuid) from public, anon, authenticated;

create function private.sync_email_locale_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'profiles' then
    perform private.sync_email_locale(new.id);
  else
    perform private.sync_email_locale(new.user_id);
  end if;
  return null;
end;
$$;

create function private.sync_email_locale_for_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member uuid;
begin
  for member in select m.user_id from public.memberships m where m.organization_id = new.id loop
    perform private.sync_email_locale(member);
  end loop;
  return null;
end;
$$;

-- A language chosen in Settings.
create trigger profiles_sync_email_locale
  after update of locale on public.profiles
  for each row
  when (old.locale is distinct from new.locale)
  execute function private.sync_email_locale_for_user();

-- Joining a company: its default language applies until the person chooses one.
create trigger memberships_sync_email_locale
  after insert on public.memberships
  for each row execute function private.sync_email_locale_for_user();

-- The company's default language changed.
create trigger organizations_sync_email_locale
  after update of default_locale on public.organizations
  for each row
  when (old.default_locale is distinct from new.default_locale)
  execute function private.sync_email_locale_for_organization();

-- Users that existed before this migration.
select private.sync_email_locale(u.id) from auth.users u;
