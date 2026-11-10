-- Stage 12a: what the company's own invoices say about the company.
--
-- Bokføringsforskriften §5-1-1 asks every sales invoice for the seller's name,
-- address and organisation number (followed by "MVA" when the company is
-- registered for VAT), and foretaksregisterloven §10-2 asks companies in the
-- Foretaksregisteret to say so. Payment needs a bank account and a due date.
-- Nothing is numbered or sent yet: that comes in stage 12b.
--
-- Who may do what:
--   those who invoice (office and accountant): read
--   owners and admins, with the second step:    change, through save_invoice_settings
--   drivers and everyone else:                   nothing

create table public.invoice_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  street text not null check (char_length(street) between 1 and 200),
  postal_code text not null check (postal_code ~ '^[A-Z0-9 -]{2,10}$'),
  city text not null check (char_length(city) between 1 and 100),
  vat_registered boolean not null default true,
  -- "Foretaksregisteret" on the invoice (AS, ASA, ENK registered there, …).
  in_business_register boolean not null default true,
  -- Norwegian kontonummer: 11 digits, the last one a MOD11 check digit.
  bank_account text not null check (bank_account ~ '^[0-9]{11}$'),
  payment_days integer not null default 14 check (payment_days between 0 and 90),
  -- Where customers answer about an invoice; optional.
  email text check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone ~ '^\+?[0-9]{5,15}$'),
  -- The first invoice's number. Stage 12b counts on from here and locks it.
  first_number integer not null default 1 check (first_number between 1 and 999999999),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.invoice_settings is 'The company''s details printed on its own invoices (bokføringsforskriften §5-1-1).';

alter table public.invoice_settings enable row level security;
revoke all on public.invoice_settings from anon, authenticated;
-- Written only through save_invoice_settings (it checks and cleans every field).
grant select on public.invoice_settings to authenticated;

create policy "Those who invoice can read the invoice settings"
  on public.invoice_settings for select
  to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher', 'accountant']::public.member_role[])));

-- Norwegian kontonummer: weights 5 4 3 2 7 6 5 4 3 2, remainder 0 gives 0, 1 is invalid.
create function private.is_valid_bank_account(account text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select account ~ '^[0-9]{11}$' and (
    select case r when 0 then 0 when 1 then -1 else 11 - r end = substr(account, 11, 1)::int
    from (
      select sum(substr(account, i::int, 1)::int * w) % 11 as r
      from unnest(array[5, 4, 3, 2, 7, 6, 5, 4, 3, 2]) with ordinality as t(w, i)
    ) x
  );
$$;

revoke all on function private.is_valid_bank_account(text) from public;
grant execute on function private.is_valid_bank_account(text) to authenticated;

-- Save the invoice settings and, in the same step, the organisation number
-- (it must be on every invoice). Owners and admins only, with the second step.
create function public.save_invoice_settings(
  org uuid,
  org_number text,
  street text,
  postal_code text,
  city text,
  vat_registered boolean,
  in_business_register boolean,
  bank_account text,
  payment_days integer,
  email text default null,
  phone text default null,
  first_number integer default 1
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  company public.organizations;
  clean_number text := upper(regexp_replace(coalesce(org_number, ''), '[\s.-]', '', 'g'));
  clean_street text := regexp_replace(btrim(coalesce(street, '')), '\s+', ' ', 'g');
  clean_postal text := upper(btrim(coalesce(postal_code, '')));
  clean_city text := regexp_replace(btrim(coalesce(city, '')), '\s+', ' ', 'g');
  clean_account text := regexp_replace(coalesce(bank_account, ''), '[\s.]', '', 'g');
  clean_email text := nullif(lower(btrim(coalesce(email, ''))), '');
  clean_phone text := nullif(regexp_replace(coalesce(phone, ''), '[\s().-]', '', 'g'), '');
begin
  select * into company from public.organizations o where o.id = org;
  if company.id is null or not private.has_role(org, array['owner', 'admin']::public.member_role[]) then
    raise exception 'Only owners and admins change the invoice settings' using errcode = '42501', hint = 'not_allowed';
  end if;
  perform private.require_mfa();

  if clean_number = '' or clean_number !~ '^[A-Z0-9]{2,20}$'
     or (company.country = 'NO' and not private.is_valid_org_number(clean_number)) then
    raise exception 'Invalid organization number' using errcode = '22023', hint = 'invalid_org_number';
  end if;
  if char_length(clean_street) not between 1 and 200 then
    raise exception 'Invalid street' using errcode = '22023', hint = 'invalid_street';
  end if;
  if clean_postal !~ '^[A-Z0-9 -]{2,10}$' or (company.country = 'NO' and clean_postal !~ '^[0-9]{4}$') then
    raise exception 'Invalid postal code' using errcode = '22023', hint = 'invalid_postal_code';
  end if;
  if char_length(clean_city) not between 1 and 100 then
    raise exception 'Invalid city' using errcode = '22023', hint = 'invalid_city';
  end if;
  if not private.is_valid_bank_account(clean_account) then
    raise exception 'Invalid bank account' using errcode = '22023', hint = 'invalid_bank_account';
  end if;
  if payment_days is null or payment_days not between 0 and 90 then
    raise exception 'Invalid payment terms' using errcode = '22023', hint = 'invalid_payment_days';
  end if;
  if clean_email is not null and (char_length(clean_email) > 254 or clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Invalid e-mail' using errcode = '22023', hint = 'invalid_email';
  end if;
  if clean_phone is not null and clean_phone !~ '^\+?[0-9]{5,15}$' then
    raise exception 'Invalid phone' using errcode = '22023', hint = 'invalid_phone';
  end if;
  if first_number is null or first_number not between 1 and 999999999 then
    raise exception 'Invalid first number' using errcode = '22023', hint = 'invalid_first_number';
  end if;

  begin
    update public.organizations o set org_number = clean_number where o.id = org;
  exception when unique_violation then
    raise exception 'Organization number is already registered' using errcode = '23505', hint = 'org_number_taken';
  end;

  insert into public.invoice_settings as s (
    organization_id, street, postal_code, city, vat_registered, in_business_register,
    bank_account, payment_days, email, phone, first_number
  ) values (
    org, clean_street, clean_postal, clean_city, coalesce(vat_registered, true), coalesce(in_business_register, true),
    clean_account, payment_days, clean_email, clean_phone, first_number
  )
  on conflict (organization_id) do update set
    street = excluded.street,
    postal_code = excluded.postal_code,
    city = excluded.city,
    vat_registered = excluded.vat_registered,
    in_business_register = excluded.in_business_register,
    bank_account = excluded.bank_account,
    payment_days = excluded.payment_days,
    email = excluded.email,
    phone = excluded.phone,
    first_number = excluded.first_number,
    updated_by = (select auth.uid()),
    updated_at = now();
end;
$$;

revoke all on function public.save_invoice_settings(uuid, text, text, text, text, boolean, boolean, text, integer, text, text, integer) from public, anon;
grant execute on function public.save_invoice_settings(uuid, text, text, text, text, boolean, boolean, text, integer, text, text, integer) to authenticated;
