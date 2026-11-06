-- Stage 7: one place to finish the invoicing, and the mark "sent".
--
-- MaskinGo does not send invoices yet: the office sends the invoice from its
-- own accounting system (Fiken, Tripletex, …) and marks the job's draft as
-- sent here, with the invoice number there if it likes. A sent draft is locked:
-- its time, its lines and the job's customer, machine, time and status no
-- longer change, and the totals are kept as they were when it was marked.
-- A mark made by mistake can be taken back by the office.
--
-- Who may do what:
--   owner, admin (with the second step), dispatcher: read, mark, take back
--   driver and everyone else:                        nothing

create table public.job_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  job_id uuid not null unique,
  -- The number in the accounting system, written as it is there.
  reference text check (char_length(btrim(reference)) between 1 and 40),
  -- The totals at the time of the mark, in øre.
  net integer not null check (net >= 0),
  vat integer not null check (vat >= 0),
  total integer not null check (total = net + vat),
  sent_by uuid default auth.uid() references auth.users (id) on delete set null,
  sent_at timestamptz not null default now(),
  foreign key (job_id, organization_id) references public.jobs (id, organization_id) on delete cascade
);

comment on table public.job_invoices is 'Invoice drafts marked as sent from the company''s accounting system. Amounts in øre.';

create index job_invoices_organization_idx on public.job_invoices (organization_id, sent_at desc);

alter table public.job_invoices enable row level security;
revoke all on public.job_invoices from anon, authenticated;
-- Marked only through mark_invoice_sent (the totals are counted there).
grant select, delete on public.job_invoices to authenticated;

create policy "The office can read sent invoices"
  on public.job_invoices for select
  to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[])));

create policy "The office can take back a mark"
  on public.job_invoices for delete
  to authenticated
  using (
    (select private.has_role(organization_id, array['dispatcher']::public.member_role[]))
    or ((select private.has_role(organization_id, array['owner', 'admin']::public.member_role[])) and (select private.second_step_done()))
  );

-- A sent draft is locked: no new time approvals, no line changes.
create function private.invoice_sent(job uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.job_invoices i where i.job_id = invoice_sent.job);
$$;

revoke all on function private.invoice_sent(uuid) from public;
-- Used inside triggers, which run as the signed-in user.
grant execute on function private.invoice_sent(uuid) to authenticated;

create or replace function private.check_job_line()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target uuid := case when tg_op = 'DELETE' then old.job_id else new.job_id end;
begin
  if exists (select 1 from public.jobs j where j.id = target and j.status = 'cancelled') then
    raise exception 'A cancelled job has no invoice lines' using errcode = '55000';
  end if;
  if private.invoice_sent(target) then
    raise exception 'The invoice is sent: its lines are locked' using errcode = '55006';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create function private.check_job_time_unlocked()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.invoice_sent(new.job_id) then
    raise exception 'The invoice is sent: its time is locked' using errcode = '55006';
  end if;
  return new;
end;
$$;

create trigger job_times_unlocked
  before insert on public.job_times
  for each row execute function private.check_job_time_unlocked();

-- What the invoice says about the job stays as it was.
create function private.check_invoiced_job()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.status, new.customer_id, new.vehicle_id, new.starts_at, new.ends_at, new.hourly_rate)
       is distinct from (old.status, old.customer_id, old.vehicle_id, old.starts_at, old.ends_at, old.hourly_rate)
     and private.invoice_sent(old.id) then
    raise exception 'The invoice is sent: the job is locked' using errcode = '55006';
  end if;
  return new;
end;
$$;

create trigger jobs_invoiced_locked
  before update on public.jobs
  for each row execute function private.check_invoiced_job();

-- Mark a job's draft as sent: only a finished job with approved, priced time.
-- Checks the caller's role itself; the totals are counted from the whole draft.
create function public.mark_invoice_sent(job uuid, reference text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
  ref text := nullif(btrim(reference), '');
  sums record;
  new_id uuid;
begin
  select * into j from public.jobs where id = job for update;
  if not found or not (
    private.has_role(j.organization_id, array['dispatcher']::public.member_role[])
    or (private.has_role(j.organization_id, array['owner', 'admin']::public.member_role[]) and private.second_step_done())
  ) then
    raise exception 'Only the office marks invoices' using errcode = '42501';
  end if;
  if j.status <> 'done' then
    raise exception 'Only a finished job is invoiced' using errcode = '55000';
  end if;
  if not exists (select 1 from public.job_times t where t.job_id = j.id and t.amount is not null) then
    raise exception 'The working time is not approved and priced yet' using errcode = '55000', hint = 'time_required';
  end if;
  if ref is not null and char_length(ref) > 40 then
    raise exception 'The invoice number is too long' using errcode = '22001';
  end if;

  -- As the page counts it (src/lib/invoice.ts): VAT per rate from that rate's sum.
  select coalesce(sum(r.base), 0)::integer as net, coalesce(sum(round(r.base * r.rate / 100.0)), 0)::integer as vat into sums
  from (select d.vat_rate as rate, sum(d.amount) as base from public.invoice_draft(j.id) d group by d.vat_rate) r;

  insert into public.job_invoices (organization_id, job_id, reference, net, vat, total)
  values (j.organization_id, j.id, ref, sums.net, sums.vat, sums.net + sums.vat)
  returning id into new_id;
  return new_id;
exception
  when unique_violation then
    raise exception 'The invoice is already marked as sent' using errcode = '55006';
end;
$$;

revoke all on function public.mark_invoice_sent(uuid, text) from public, anon;
grant execute on function public.mark_invoice_sent(uuid, text) to authenticated;

-- The invoicing list: every finished job, whether its time waits for approval,
-- it is ready to invoice, or it is marked as sent, with its total. Runs with
-- the caller's rights: for anyone but the office it returns nothing.
create function public.invoice_queue()
returns table (
  job_id uuid, number integer, customer text, ends_at timestamptz, state text,
  total integer, reference text, sent_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select j.id, j.number, c.name, j.ends_at,
    case when i.id is not null then 'sent'
         when exists (select 1 from public.job_times t where t.job_id = j.id and t.amount is not null) then 'ready'
         else 'time' end,
    coalesce(i.total, d.total), i.reference, i.sent_at
  from public.jobs j
  join public.customers c on c.id = j.customer_id
  left join public.job_invoices i on i.job_id = j.id
  left join lateral (
    select (sum(r.base) + sum(round(r.base * r.rate / 100.0)))::integer as total
    from (select x.vat_rate as rate, sum(x.amount) as base from public.invoice_draft(j.id) x group by x.vat_rate) r
  ) d on i.id is null
  where j.status = 'done'
    and (select private.has_role(j.organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[]))
  order by i.sent_at desc nulls first, j.ends_at;
$$;

revoke all on function public.invoice_queue() from public, anon;
grant execute on function public.invoice_queue() to authenticated;

-- The bell: finished jobs not yet marked as sent, for the office.
create function public.invoices_waiting()
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from public.jobs j
  where j.status = 'done'
    and not exists (select 1 from public.job_invoices i where i.job_id = j.id)
    and (select private.has_role(j.organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[]));
$$;

revoke all on function public.invoices_waiting() from public, anon;
grant execute on function public.invoices_waiting() to authenticated;
