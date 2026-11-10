-- Stage 12b: MaskinGo issues the company's own invoices.
--
-- A person presses "Issue invoice" on a finished job with approved, priced
-- time. In one transaction the database gives the next number of the company
-- (no gaps: a failed issue rolls the counter back too), copies what the
-- invoice says (seller, buyer, job, lines, totals) and locks the job the way
-- the mark "sent" does. An issued invoice is never changed or deleted
-- (bokføringsloven): a mistake is corrected with a credit note (stage 12d).
-- The PDF is made from the copy and kept in the private invoices bucket,
-- where it can be added once and never replaced or removed.
--
-- Who may do what (as for the mark "sent"):
--   dispatcher, or owner/admin/accountant with the second step: issue
--   those who invoice (office and accountant):                  read
--   drivers and everyone else:                                  nothing

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  job_id uuid not null,
  number integer not null check (number >= 1),
  issue_date date not null,
  due_date date not null check (due_date >= issue_date),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  -- What the invoice says, copied when it is issued (later changes to the
  -- company, the customer or the job do not change it).
  seller jsonb not null,
  buyer jsonb not null,
  job jsonb not null,
  -- In øre.
  net integer not null check (net >= 0),
  vat integer not null check (vat >= 0),
  total integer not null check (total = net + vat),
  issued_by uuid default auth.uid() references auth.users (id) on delete set null,
  issued_at timestamptz not null default now(),
  unique (organization_id, number),
  -- One invoice per job until credit notes come (stage 12d).
  unique (job_id),
  foreign key (job_id, organization_id) references public.jobs (id, organization_id) on delete restrict
);

comment on table public.invoices is 'Invoices issued by MaskinGo, numbered without gaps per company. Never changed or deleted. Amounts in øre.';

create table public.invoice_lines (
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  organization_id uuid not null,
  position smallint not null check (position >= 1),
  description text not null check (char_length(description) between 1 and 300),
  quantity numeric(12, 2) not null,
  unit text,
  unit_price integer not null,
  vat_rate smallint not null check (vat_rate in (0, 12, 15, 25)),
  amount integer not null,
  primary key (invoice_id, position)
);

comment on table public.invoice_lines is 'The lines of an issued invoice, copied from the draft. Never changed. Amounts in øre.';

-- The next number of each company. Not reachable through the API.
create table private.invoice_counters (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  next_number integer not null check (next_number >= 1)
);

alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
revoke all on public.invoices, public.invoice_lines from anon, authenticated;
-- Issued only through issue_invoice.
grant select on public.invoices, public.invoice_lines to authenticated;
revoke all on private.invoice_counters from public, anon, authenticated;

create policy "Those who invoice can read invoices"
  on public.invoices for select
  to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher', 'accountant']::public.member_role[])));

create policy "Those who invoice can read invoice lines"
  on public.invoice_lines for select
  to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher', 'accountant']::public.member_role[])));

-- Never changed or deleted, by anyone (the table owner included).
create function private.refuse_invoice_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'An issued invoice is never changed or deleted: correct it with a credit note' using errcode = '55006', hint = 'invoice_locked';
end;
$$;

create trigger invoices_never_change
  before update or delete on public.invoices
  for each row execute function private.refuse_invoice_change();

create trigger invoice_lines_never_change
  before update or delete on public.invoice_lines
  for each row execute function private.refuse_invoice_change();

-- The mark "sent" of an issued invoice cannot be taken back.
create function private.check_unmark()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.invoices i where i.job_id = old.job_id) then
    raise exception 'The invoice is issued: correct it with a credit note' using errcode = '55006', hint = 'invoice_issued';
  end if;
  return old;
end;
$$;

create trigger job_invoices_issued_stay
  before delete on public.job_invoices
  for each row execute function private.check_unmark();

-- The first number is kept once the first invoice is issued.
create function private.check_first_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.first_number <> old.first_number
     and exists (select 1 from public.invoices i where i.organization_id = new.organization_id) then
    raise exception 'The numbering has started' using errcode = '55006', hint = 'first_number_locked';
  end if;
  return new;
end;
$$;

create trigger invoice_settings_first_number
  before update on public.invoice_settings
  for each row execute function private.check_first_number();

-- Issue the invoice of a finished job. Returns the new invoice's id.
create function public.issue_invoice(job uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
  company public.organizations;
  settings public.invoice_settings;
  customer public.customers;
  machine text;
  next_no integer;
  today date;
  sums record;
  new_id uuid;
begin
  select * into j from public.jobs where id = job for update;
  if not found or not (
    private.has_role(j.organization_id, array['dispatcher']::public.member_role[])
    or (private.has_role(j.organization_id, array['owner', 'admin', 'accountant']::public.member_role[]) and private.second_step_done())
  ) then
    raise exception 'Only the office issues invoices' using errcode = '42501', hint = 'not_allowed';
  end if;
  if j.status <> 'done' then
    raise exception 'Only a finished job is invoiced' using errcode = '55000', hint = 'not_done';
  end if;
  if not exists (select 1 from public.job_times t where t.job_id = j.id and t.amount is not null) then
    raise exception 'The working time is not approved and priced yet' using errcode = '55000', hint = 'time_required';
  end if;
  if exists (select 1 from public.job_invoices i where i.job_id = j.id) then
    raise exception 'The invoice is already issued or marked as sent' using errcode = '55006', hint = 'already';
  end if;

  select * into company from public.organizations o where o.id = j.organization_id;
  select * into settings from public.invoice_settings s where s.organization_id = j.organization_id;
  if settings.organization_id is null or company.org_number is null then
    raise exception 'The invoice details are not filled in' using errcode = '55000', hint = 'settings_required';
  end if;
  -- Bokføringsforskriften §5-1-1: the buyer's name and address or organisation number.
  select * into customer from public.customers c where c.id = j.customer_id;
  if customer.org_number is null and (customer.street is null or customer.postal_code is null or customer.city is null) then
    raise exception 'The customer needs an address or an organisation number' using errcode = '55000', hint = 'buyer_required';
  end if;
  select v.name into machine from public.vehicles v where v.id = j.vehicle_id;

  -- The next number, without gaps: the counter row is locked until this transaction ends.
  insert into private.invoice_counters (organization_id, next_number)
  values (j.organization_id, settings.first_number)
  on conflict (organization_id) do nothing;
  select c.next_number into next_no from private.invoice_counters c where c.organization_id = j.organization_id for update;
  update private.invoice_counters c set next_number = next_no + 1 where c.organization_id = j.organization_id;

  today := (now() at time zone company.timezone)::date;

  -- As the page counts it (src/lib/invoice.ts): VAT per rate from that rate's sum.
  -- A company outside the VAT register charges no VAT: every line at 0 %.
  select coalesce(sum(r.base), 0)::integer as net, coalesce(sum(round(r.base * r.rate / 100.0)), 0)::integer as vat into sums
  from (
    select case when settings.vat_registered then d.vat_rate else 0 end as rate, sum(d.amount) as base
    from public.invoice_draft(j.id) d group by 1
  ) r;

  insert into public.invoices (organization_id, job_id, number, issue_date, due_date, currency, seller, buyer, job, net, vat, total)
  values (
    j.organization_id, j.id, next_no, today, today + settings.payment_days, company.currency,
    jsonb_build_object(
      'name', company.name, 'org_number', company.org_number, 'country', company.country,
      'street', settings.street, 'postal_code', settings.postal_code, 'city', settings.city,
      'vat_registered', settings.vat_registered, 'in_business_register', settings.in_business_register,
      'bank_account', settings.bank_account, 'email', settings.email, 'phone', settings.phone
    ),
    jsonb_build_object(
      'name', customer.name, 'org_number', customer.org_number,
      'street', customer.street, 'postal_code', customer.postal_code, 'city', customer.city,
      'email', coalesce(customer.invoice_email, customer.email)
    ),
    jsonb_build_object(
      'number', j.number, 'address', j.address, 'starts_at', j.starts_at, 'ends_at', j.ends_at,
      'vehicle', machine, 'timezone', company.timezone
    ),
    sums.net, sums.vat, sums.net + sums.vat
  )
  returning id into new_id;

  -- The lines as the draft shows them; the invoice is in Norwegian.
  insert into public.invoice_lines (invoice_id, organization_id, position, description, quantity, unit, unit_price, vat_rate, amount)
  select new_id, j.organization_id, d.n::smallint,
    case d.kind
      when 'time' then 'Arbeidstid' || coalesce(', ' || machine, '')
      when 'evening' then 'Arbeidstid med høyere sats' || coalesce(', ' || machine, '')
      else d.description
    end,
    d.quantity,
    case when d.kind = 'line' then d.unit else 'timer' end,
    d.unit_price, case when settings.vat_registered then d.vat_rate else 0 end, d.amount
  from public.invoice_draft(j.id) with ordinality as d(kind, line_id, description, quantity, unit, unit_price, vat_rate, amount, n);

  -- Locks the job and its draft, as the mark "sent" does, and moves it out of the waiting list.
  insert into public.job_invoices (organization_id, job_id, reference, net, vat, total)
  values (j.organization_id, j.id, next_no::text, sums.net, sums.vat, sums.net + sums.vat);

  return new_id;
end;
$$;

revoke all on function public.issue_invoice(uuid) from public, anon;
grant execute on function public.issue_invoice(uuid) to authenticated;

-- The PDFs: <organization id>/<invoice id>.pdf, added once, never replaced or removed.
create function private.may_add_invoice_pdf(path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.invoices i
    where path = i.organization_id::text || '/' || i.id::text || '.pdf'
      and (
        private.has_role(i.organization_id, array['dispatcher']::public.member_role[])
        or (private.has_role(i.organization_id, array['owner', 'admin', 'accountant']::public.member_role[]) and private.second_step_done())
      )
  );
$$;

create function private.may_read_invoice_pdf(path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.invoices i
    where path = i.organization_id::text || '/' || i.id::text || '.pdf'
      and private.has_role(i.organization_id, array['owner', 'admin', 'dispatcher', 'accountant']::public.member_role[])
  );
$$;

revoke all on function private.may_add_invoice_pdf(text), private.may_read_invoice_pdf(text) from public;
grant execute on function private.may_add_invoice_pdf(text), private.may_read_invoice_pdf(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoices', 'invoices', false, 2097152, array['application/pdf']);

create policy "Those who invoice can read invoice PDFs"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'invoices' and (select private.may_read_invoice_pdf(name)));

create policy "Those who issue invoices can add an invoice's PDF"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'invoices' and (select private.may_add_invoice_pdf(name)));
