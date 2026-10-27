-- Join the invited company when the account is created, not when the
-- confirmation e-mail is opened.
--
-- Before: the invitation token travelled in the confirmation link's redirect
-- address and was accepted in /auth/callback. If that address was changed
-- (Supabase redirect allow list) or the link was opened elsewhere, the person
-- ended up without a company. Now the sign-up form sends the token as user
-- metadata and this trigger accepts it in the same transaction that creates
-- the user. The link is the key (see 20261014110000), so an unconfirmed
-- e-mail address does not matter here: the person still cannot sign in until
-- the address is confirmed.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_token text := new.raw_user_meta_data ->> 'invite_token';
  inv public.invitations;
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), 100), ''),
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), 100), '')
  );

  if invite_token is not null then
    -- Lock the row so the same link cannot be used twice at once.
    select * into inv from public.invitations i
    where i.token_hash = private.hash_token(invite_token)
      and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    for update;

    -- A used, cancelled or made-up token is ignored: the account is still
    -- created and the person can create a company or ask for a new link.
    if inv.id is not null then
      insert into public.memberships (organization_id, user_id, role)
      values (inv.organization_id, new.id, inv.role);

      update public.invitations
      set accepted_at = now(), accepted_by = new.id
      where id = inv.id;
    end if;
  end if;

  return new;
end;
$$;
