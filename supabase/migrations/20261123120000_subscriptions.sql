-- Stage 14a: the monthly subscription of each company (Li's decision 2026-11-23).
--
-- Plans differ only in how many people the company has (memberships):
--   solo 1–2, start up to 5, pro up to 15, bedrift up to 40 (more are billed
--   per person in stage 14b). Prices live in the app and in Stripe, not here.
-- A new company gets a 30-day trial with everything and no limit on people.
-- Stripe tells the app what was paid (a signed webhook); the app writes it
-- here with the server's secret key. Members only read.

create table public.subscriptions (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  -- Null while trying the app: no plan chosen yet.
  plan text check (plan in ('solo', 'start', 'pro', 'bedrift')),
  billing_interval text check (billing_interval in ('month', 'year')),
  -- Stripe's own statuses, as they come.
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  stripe_customer_id text unique check (char_length(stripe_customer_id) <= 255),
  stripe_subscription_id text unique check (char_length(stripe_subscription_id) <= 255),
  updated_at timestamptz not null default now(),
  check (plan is not null or stripe_subscription_id is null)
);

comment on table public.subscriptions is 'The company''s MaskinGo plan and what Stripe says about its payment. Written by the server only.';

alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;

create policy "Members can read their company's subscription"
  on public.subscriptions for select
  to authenticated
  using ((select private.is_member(organization_id)));

-- Every company tries the app for 30 days; those already here get 30 days from today.
create function private.start_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.subscriptions (organization_id, status, trial_ends_at)
  values (new.id, 'trialing', now() + interval '30 days')
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

revoke all on function private.start_trial() from public;

create trigger organizations_start_trial
  after insert on public.organizations
  for each row execute function private.start_trial();

insert into public.subscriptions (organization_id, status, trial_ends_at)
select id, 'trialing', now() + interval '30 days' from public.organizations
on conflict (organization_id) do nothing;

-- How many people a plan includes (the same as src/lib/billing.ts). Null: no limit
-- (the trial, and Bedrift, whose people past 40 are billed one by one).
create function private.plan_seats(plan text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case plan when 'solo' then 2 when 'start' then 5 when 'pro' then 15 else null end;
$$;

-- A company cannot have more people than its plan includes. Checked when a
-- person joins (an invitation is accepted or a company is made).
create function private.check_seats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  seats integer;
  taken integer;
begin
  -- One join at a time per company, so two invitations cannot both take the last place.
  select private.plan_seats(s.plan) into seats
  from public.subscriptions s where s.organization_id = new.organization_id for update;
  if seats is null then
    return new;
  end if;
  select count(*) into taken from public.memberships m where m.organization_id = new.organization_id;
  if taken >= seats then
    raise exception 'The company''s plan includes % people', seats using errcode = '53400', hint = 'seat_limit';
  end if;
  return new;
end;
$$;

revoke all on function private.check_seats() from public;

create trigger memberships_check_seats
  before insert on public.memberships
  for each row execute function private.check_seats();

-- People in the company and how many the plan includes, for the team page
-- and the plan choice. Members only.
create function public.seat_usage(org uuid)
returns table (taken integer, seats integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_member(org) then
    raise exception 'Not a member of this organization' using errcode = '42501', hint = 'not_allowed';
  end if;
  return query
    select (select count(*)::integer from public.memberships m where m.organization_id = org),
           (select private.plan_seats(s.plan) from public.subscriptions s where s.organization_id = org);
end;
$$;

revoke all on function private.plan_seats(text) from public;
revoke all on function public.seat_usage(uuid) from public, anon;
grant execute on function public.seat_usage(uuid) to authenticated;

-- Signing up from an invitation joins the company in the same transaction that
-- creates the account (20261014120000). When the company's plan is full, the
-- account is still created and the invitation stays open, so the person can
-- join once the company has room (instead of the whole sign-up failing).
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
      begin
        insert into public.memberships (organization_id, user_id, role)
        values (inv.organization_id, new.id, inv.role);

        update public.invitations
        set accepted_at = now(), accepted_by = new.id
        where id = inv.id;
      exception when sqlstate '53400' then
        null;
      end;
    end if;
  end if;

  return new;
end;
$$;
