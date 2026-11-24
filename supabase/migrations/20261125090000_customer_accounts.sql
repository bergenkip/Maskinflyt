-- Stage 16a: customer accounts. A person who orders from companies signs up as
-- a customer, not as a company: no organization. Their requests are linked to
-- the account, so they follow them in one place and order again quickly. The
-- company still accepts or declines every request; nothing is confirmed by itself.

create table public.customer_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Filled into new requests; the name comes from the profile, the e-mail from the login.
  phone text check (phone is null or phone ~ '^\+?[0-9]{5,15}$'),
  place text check (place is null or (place = btrim(place) and char_length(place) between 1 and 200)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.customer_accounts is 'A person who orders from companies (stage 16a). Each person sees and changes only their own row, through save_customer_account.';

alter table public.customer_accounts enable row level security;
revoke all on public.customer_accounts from anon, authenticated;
grant select on public.customer_accounts to authenticated;

create policy "Customers read their own account"
  on public.customer_accounts for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Signing up from the customer form: the account is made with the login.
create function private.handle_new_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_user_meta_data ->> 'account_type' = 'customer' then
    insert into public.customer_accounts (user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.handle_new_customer() from public;

create trigger on_auth_user_created_customer
  after insert on auth.users
  for each row execute function private.handle_new_customer();

-- A signed-in person makes or updates their own customer account.
create function public.save_customer_account(account_phone text default null, account_place text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_phone text := nullif(regexp_replace(coalesce(account_phone, ''), '[\s().-]', '', 'g'), '');
  clean_place text := nullif(regexp_replace(btrim(coalesce(account_place, '')), '\s+', ' ', 'g'), '');
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if clean_phone is not null and clean_phone !~ '^\+?[0-9]{5,15}$' then
    raise exception 'Invalid phone' using errcode = '22023', hint = 'invalid_phone';
  end if;
  if clean_place is not null and char_length(clean_place) > 200 then
    raise exception 'Invalid place' using errcode = '22023', hint = 'invalid_place';
  end if;
  insert into public.customer_accounts (user_id, phone, place)
  values (auth.uid(), clean_phone, clean_place)
  on conflict (user_id) do update set phone = excluded.phone, place = excluded.place, updated_at = now();
end;
$$;

revoke all on function public.save_customer_account(text, text) from public, anon;
grant execute on function public.save_customer_account(text, text) to authenticated;

-- A request sent by a signed-in customer belongs to their account. Set here,
-- from the login itself, so it can never be claimed for someone else.
alter table public.job_requests add column user_id uuid references auth.users (id) on delete set null;
create index job_requests_user_id_idx on public.job_requests (user_id, created_at desc) where user_id is not null;

create function private.link_job_request_to_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.user_id := case
    when exists (select 1 from public.customer_accounts a where a.user_id = auth.uid()) then auth.uid()
  end;
  return new;
end;
$$;

revoke all on function private.link_job_request_to_customer() from public;

create trigger job_requests_link_customer
  before insert on public.job_requests
  for each row execute function private.link_job_request_to_customer();

-- The customer's own requests, newest first, with the company they went to.
create function public.my_job_requests()
returns table (
  id uuid,
  created_at timestamptz,
  status text,
  place text,
  wanted_date date,
  wanted_start timestamptz,
  service text,
  description text,
  answer text,
  handled_at timestamptz,
  company text,
  slug text,
  page_published boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.created_at, r.status, r.place, r.wanted_date, r.wanted_start, r.service, r.description, r.answer,
         r.handled_at, o.name, p.slug, coalesce(p.published and not private.is_read_only(r.organization_id), false)
  from public.job_requests r
  join public.organizations o on o.id = r.organization_id
  left join public.company_pages p on p.organization_id = r.organization_id
  where r.user_id = auth.uid()
  order by r.created_at desc
  limit 100;
$$;

-- The companies the customer orders from most, for ordering again in one tap.
create function public.my_companies()
returns table (slug text, name text, city text, requests int, last_request timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.slug, o.name, p.city, count(*)::int, max(r.created_at)
  from public.job_requests r
  join public.organizations o on o.id = r.organization_id
  join public.company_pages p on p.organization_id = r.organization_id
  where r.user_id = auth.uid() and p.published and not private.is_read_only(r.organization_id)
  group by p.slug, o.name, p.city
  order by count(*) desc, max(r.created_at) desc
  limit 10;
$$;

revoke all on function public.my_job_requests(), public.my_companies() from public, anon;
grant execute on function public.my_job_requests(), public.my_companies() to authenticated;
