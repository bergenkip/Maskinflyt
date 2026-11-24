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

-- What Stripe says is written through two functions, not with Supabase's
-- all-powerful secret key. The server proves itself with its own billing
-- token (BILLING_WRITE_TOKEN in Vercel); only the token's hash is kept here,
-- set by hand after deploying. Until it is set, nothing can be written.
create table private.billing_writer (
  id boolean primary key default true check (id),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$')
);

create function private.check_billing_token(token text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if token is null or char_length(token) < 40
     or not exists (select 1 from private.billing_writer w where w.token_hash = private.hash_token(token)) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'not_allowed';
  end if;
end;
$$;

-- The company's Stripe customer, saved before the payment page opens.
create function public.save_stripe_customer(token text, org uuid, customer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_billing_token(token);
  if customer is null or customer !~ '^cus_[A-Za-z0-9]{1,250}$' then
    raise exception 'Not a Stripe customer' using errcode = '22023', hint = 'invalid';
  end if;
  update public.subscriptions s
  set stripe_customer_id = customer, updated_at = now()
  where s.organization_id = org;
end;
$$;

-- A Stripe subscription as the app reads it (src/lib/billing.ts rowFromStripe).
-- A company's newer, running subscription is not overwritten by an older, ended one.
create function public.save_subscription(
  token text,
  org uuid,
  new_plan text,
  new_interval text,
  new_status text,
  period_end timestamptz,
  cancelling boolean,
  customer text,
  subscription text,
  trial_end timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current public.subscriptions;
  ended text[] := array['canceled', 'incomplete_expired'];
begin
  perform private.check_billing_token(token);
  if subscription is null or subscription !~ '^sub_[A-Za-z0-9]{1,250}$'
     or customer is null or customer !~ '^cus_[A-Za-z0-9]{1,250}$' then
    raise exception 'Not a Stripe subscription' using errcode = '22023', hint = 'invalid';
  end if;
  select * into current from public.subscriptions s where s.organization_id = org for update;
  if current.organization_id is null then
    raise exception 'No such company' using errcode = 'P0002', hint = 'not_found';
  end if;
  if current.stripe_subscription_id is not null and current.stripe_subscription_id <> subscription
     and not current.status = any (ended) and new_status = any (ended) then
    return;
  end if;
  update public.subscriptions s
  set plan = new_plan,
      billing_interval = new_interval,
      status = new_status,
      current_period_end = period_end,
      cancel_at_period_end = coalesce(cancelling, false),
      stripe_customer_id = customer,
      stripe_subscription_id = subscription,
      trial_ends_at = coalesce(trial_end, s.trial_ends_at),
      updated_at = now()
  where s.organization_id = org;
end;
$$;

revoke all on table private.billing_writer from public, anon, authenticated;
revoke all on function private.check_billing_token(text) from public;
revoke all on function public.save_stripe_customer(text, uuid, text) from public;
revoke all on function public.save_subscription(text, uuid, text, text, text, timestamptz, boolean, text, text, timestamptz) from public;
-- The webhook has no signed-in person, so it calls as anon; the token is the key.
grant execute on function public.save_stripe_customer(text, uuid, text) to anon, authenticated;
grant execute on function public.save_subscription(text, uuid, text, text, text, timestamptz, boolean, text, text, timestamptz) to anon, authenticated;
