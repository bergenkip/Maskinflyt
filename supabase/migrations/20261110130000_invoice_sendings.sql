-- Stage 12c: an issued invoice is e-mailed to the customer, only when a
-- person presses "Send". The app sends the e-mail (with the stored PDF) and
-- the database keeps a record of every sending: to whom, by whom, when, and
-- whether the e-mail service took it. A record is never deleted; it changes
-- once, from "sending" to "sent" or "failed", by the person who started it.
--
-- Who may do what (as for issuing):
--   dispatcher, or owner/admin/accountant with the second step: send
--   those who invoice (office and accountant):                  read

create table public.invoice_sendings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  to_email text not null check (char_length(to_email) between 3 and 254 and to_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- In test mode (local development and CI), e-mails go to the
  -- e-mail service's test inbox only (and only for .test addresses).
  test_mode boolean not null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  -- The e-mail service's id of the message, when it took it.
  provider_id text check (char_length(provider_id) <= 200),
  sent_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check ((status = 'sending') = (finished_at is null))
);

comment on table public.invoice_sendings is 'Every e-mailing of an issued invoice. Never deleted; finished once by the person who started it.';

create index invoice_sendings_invoice on public.invoice_sendings (invoice_id, created_at);

alter table public.invoice_sendings enable row level security;
revoke all on public.invoice_sendings from anon, authenticated;
-- Written only through start_invoice_sending and finish_invoice_sending.
grant select on public.invoice_sendings to authenticated;

create policy "Those who invoice can read invoice sendings"
  on public.invoice_sendings for select
  to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher', 'accountant']::public.member_role[])));

-- A record is never deleted, and only its result is filled in, once.
create function private.check_invoice_sending_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     or old.status <> 'sending'
     or (new.id, new.organization_id, new.invoice_id, new.to_email, new.test_mode, new.sent_by, new.created_at)
        is distinct from (old.id, old.organization_id, old.invoice_id, old.to_email, old.test_mode, old.sent_by, old.created_at) then
    raise exception 'A sending record is kept as it is' using errcode = '55006', hint = 'sending_locked';
  end if;
  return new;
end;
$$;

create trigger invoice_sendings_kept
  before update or delete on public.invoice_sendings
  for each row execute function private.check_invoice_sending_change();

-- How many times one invoice may be e-mailed in a day (a typo, a new address,
-- a customer who lost it), so a mistake cannot flood anyone's inbox.
create function private.max_invoice_sendings_per_day()
returns integer
language sql
immutable
set search_path = ''
as $$ select 5 $$;

-- Start a sending: checks who may, and records it. Returns its id.
create function public.start_invoice_sending(invoice uuid, to_email text, test_mode boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.invoices;
  address text := lower(btrim(to_email));
  new_id uuid;
begin
  select * into i from public.invoices where id = invoice;
  if not found or not (
    private.has_role(i.organization_id, array['dispatcher']::public.member_role[])
    or (private.has_role(i.organization_id, array['owner', 'admin', 'accountant']::public.member_role[]) and private.second_step_done())
  ) then
    raise exception 'Only the office sends invoices' using errcode = '42501', hint = 'not_allowed';
  end if;
  if address is null or char_length(address) > 254 or address !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'The e-mail address is not valid' using errcode = '22023', hint = 'invalid_email';
  end if;
  if test_mode and address !~ '\.test$' then
    raise exception 'Only .test addresses in test mode' using errcode = '22023', hint = 'test_only';
  end if;

  -- One sending at a time per invoice, and a few a day.
  perform 1 from public.invoices x where x.id = i.id for update;
  if (select count(*) from public.invoice_sendings s where s.invoice_id = i.id and s.created_at > now() - interval '1 day')
     >= private.max_invoice_sendings_per_day() then
    raise exception 'The invoice was e-mailed too many times today' using errcode = '54000', hint = 'too_many';
  end if;

  insert into public.invoice_sendings (organization_id, invoice_id, to_email, test_mode)
  values (i.organization_id, i.id, address, test_mode)
  returning id into new_id;
  return new_id;
end;
$$;

-- Finish a sending: the e-mail service took it (with its id) or did not.
create function public.finish_invoice_sending(sending uuid, sent boolean, provider_id text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invoice_sendings s
  set status = case when sent then 'sent' else 'failed' end,
      provider_id = finish_invoice_sending.provider_id,
      finished_at = now()
  where s.id = sending and s.sent_by = auth.uid() and s.status = 'sending';
  if not found then
    raise exception 'Only an open sending of your own is finished' using errcode = '42501', hint = 'not_allowed';
  end if;
end;
$$;

revoke all on function public.start_invoice_sending(uuid, text, boolean) from public, anon;
revoke all on function public.finish_invoice_sending(uuid, boolean, text) from public, anon;
grant execute on function public.start_invoice_sending(uuid, text, boolean) to authenticated;
grant execute on function public.finish_invoice_sending(uuid, boolean, text) to authenticated;
