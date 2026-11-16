-- Stage 12d: a mistake on an issued invoice is corrected with a credit note.
--
-- A person presses "Credit invoice" and writes why. In one transaction the
-- database gives the credit note the company's next number (the same series
-- as the invoices, without gaps), copies the invoice with every amount turned
-- negative, and takes the job's mark "sent" away, so the draft opens again
-- and a new, correct invoice can be issued. The invoice and its credit note
-- stay as they are, forever (bokføringsloven); an invoice is credited once,
-- and always in full.
--
-- Who may: as for issuing (dispatcher, or owner/admin/accountant with the second step).

alter table public.invoices
  add column kind text not null default 'invoice' check (kind in ('invoice', 'credit_note')),
  -- The invoice a credit note credits, and why.
  add column credits uuid references public.invoices (id) on delete restrict,
  add column reason text check (char_length(reason) between 1 and 300),
  add constraint invoices_credit_note_shape check (
    (kind = 'invoice' and credits is null and reason is null)
    or (kind = 'credit_note' and credits is not null and reason is not null)
  );

-- Credit notes carry negative amounts.
alter table public.invoices drop constraint invoices_net_check, drop constraint invoices_vat_check;
alter table public.invoices add constraint invoices_amounts_sign check (
  (kind = 'invoice' and net >= 0 and vat >= 0) or (kind = 'credit_note' and net <= 0 and vat <= 0)
);

-- A job can now have an invoice, its credit note and a new invoice; issue_invoice
-- still refuses a second invoice while the job is marked "sent" (job_invoices).
alter table public.invoices drop constraint invoices_job_id_key;
create index invoices_job on public.invoices (job_id, number);
-- An invoice is credited once.
create unique index invoices_credited_once on public.invoices (credits) where credits is not null;

comment on table public.invoices is
  'Invoices and credit notes issued by MaskinGo, numbered in one series without gaps per company. Never changed or deleted. Amounts in øre; negative on credit notes.';

-- The mark "sent" of an issued invoice stays until the invoice is credited.
create or replace function private.check_unmark()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.invoices i
    where i.job_id = old.job_id and i.kind = 'invoice'
      and not exists (select 1 from public.invoices c where c.credits = i.id)
  ) then
    raise exception 'The invoice is issued: correct it with a credit note' using errcode = '55006', hint = 'invoice_issued';
  end if;
  return old;
end;
$$;

-- Credit an issued invoice in full. Returns the credit note's id.
create function public.credit_invoice(invoice uuid, reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.invoices;
  why text := btrim(regexp_replace(coalesce(reason, ''), '\s+', ' ', 'g'));
  company public.organizations;
  next_no integer;
  today date;
  new_id uuid;
begin
  select * into i from public.invoices where id = invoice;
  if not found or not (
    private.has_role(i.organization_id, array['dispatcher']::public.member_role[])
    or (private.has_role(i.organization_id, array['owner', 'admin', 'accountant']::public.member_role[]) and private.second_step_done())
  ) then
    raise exception 'Only the office credits invoices' using errcode = '42501', hint = 'not_allowed';
  end if;
  if i.kind <> 'invoice' then
    raise exception 'Only an invoice is credited' using errcode = '55000', hint = 'not_an_invoice';
  end if;
  if char_length(why) not between 1 and 300 then
    raise exception 'Write why the invoice is credited' using errcode = '22023', hint = 'invalid_reason';
  end if;

  -- One at a time per job (as issuing), and once per invoice.
  perform 1 from public.jobs j where j.id = i.job_id for update;
  if exists (select 1 from public.invoices c where c.credits = i.id) then
    raise exception 'The invoice is already credited' using errcode = '55006', hint = 'already_credited';
  end if;

  -- The next number of the same series, without gaps.
  select c.next_number into next_no from private.invoice_counters c where c.organization_id = i.organization_id for update;
  update private.invoice_counters c set next_number = next_no + 1 where c.organization_id = i.organization_id;

  select * into company from public.organizations o where o.id = i.organization_id;
  today := (now() at time zone company.timezone)::date;

  -- What the invoice said, every amount turned negative.
  insert into public.invoices (organization_id, job_id, number, issue_date, due_date, currency, seller, buyer, job, net, vat, total, kind, credits, reason)
  values (i.organization_id, i.job_id, next_no, today, today, i.currency, i.seller, i.buyer, i.job, -i.net, -i.vat, -i.total, 'credit_note', i.id, why)
  returning id into new_id;

  insert into public.invoice_lines (invoice_id, organization_id, position, description, quantity, unit, unit_price, vat_rate, amount)
  select new_id, l.organization_id, l.position, l.description, -l.quantity, l.unit, l.unit_price, l.vat_rate, -l.amount
  from public.invoice_lines l where l.invoice_id = i.id;

  -- The job opens again: its draft can be corrected and invoiced anew.
  delete from public.job_invoices m where m.job_id = i.job_id;

  return new_id;
end;
$$;

revoke all on function public.credit_invoice(uuid, text) from public, anon;
grant execute on function public.credit_invoice(uuid, text) to authenticated;
