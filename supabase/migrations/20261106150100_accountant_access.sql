-- Stage 8: the accountant (regnskapsfører) as a member of the company.
--
-- The accountant finishes the invoicing and nothing else: they see finished
-- jobs (not the planning), the customers and machines those jobs name, the
-- working time and the invoice drafts. With the second step they approve or
-- correct the time, change the extra lines and mark invoices as sent. They do
-- not add or change jobs, customers, machines or people, and do not see the
-- drivers' photos.
--
-- The value 'accountant' is added to the role type in the migration before,
-- since a new enum value cannot be used in the transaction that adds it.

create policy "Accountants can read finished jobs"
  on public.jobs for select
  to authenticated
  using (status = 'done' and (select private.has_role(organization_id, array['accountant']::public.member_role[])));

create policy "Accountants can read customers"
  on public.customers for select
  to authenticated
  using ((select private.has_role(organization_id, array['accountant']::public.member_role[])));

create policy "Accountants can read machines"
  on public.vehicles for select
  to authenticated
  using ((select private.has_role(organization_id, array['accountant']::public.member_role[])));

create policy "Accountants can read approved working time"
  on public.job_times for select
  to authenticated
  using ((select private.has_role(organization_id, array['accountant']::public.member_role[])));

-- Job lines: the restrictive policies already ask everyone but dispatchers for the second step.
create policy "Accountants can read job lines"
  on public.job_lines for select
  to authenticated
  using ((select private.has_role(organization_id, array['accountant']::public.member_role[])));

create policy "Accountants can add job lines"
  on public.job_lines for insert
  to authenticated
  with check ((select private.has_role(organization_id, array['accountant']::public.member_role[])));

create policy "Accountants can change job lines"
  on public.job_lines for update
  to authenticated
  using ((select private.has_role(organization_id, array['accountant']::public.member_role[])))
  with check ((select private.has_role(organization_id, array['accountant']::public.member_role[])));

create policy "Accountants can remove job lines"
  on public.job_lines for delete
  to authenticated
  using ((select private.has_role(organization_id, array['accountant']::public.member_role[])));

create policy "Accountants can read sent invoices"
  on public.job_invoices for select
  to authenticated
  using ((select private.has_role(organization_id, array['accountant']::public.member_role[])));

create policy "Accountants can take back a mark with the second step"
  on public.job_invoices for delete
  to authenticated
  using ((select private.has_role(organization_id, array['accountant']::public.member_role[])) and (select private.second_step_done()));

-- The same functions as before, with the accountant (and their second step) added.

create or replace function public.approve_job_time(job uuid, started_at timestamptz, ended_at timestamptz, break_minutes integer, reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
  d record;
  p record;
  why text := nullif(btrim(reason), '');
  is_corrected boolean;
  new_id uuid;
begin
  select * into j from public.jobs where id = job for update;
  if not found or not (
    private.has_role(j.organization_id, array['dispatcher']::public.member_role[])
    or (private.has_role(j.organization_id, array['owner', 'admin', 'accountant']::public.member_role[]) and private.second_step_done())
  ) then
    raise exception 'Only the office approves working time' using errcode = '42501';
  end if;
  if j.status <> 'done' then
    raise exception 'Only a finished job''s time is approved' using errcode = '55000';
  end if;
  if not (ended_at > started_at and ended_at - started_at <= interval '24 hours') then
    raise exception 'The end must come after the start, within 24 hours' using errcode = '22023';
  end if;

  select * into d from private.driver_time(job);
  is_corrected := exists (select 1 from public.job_times t where t.job_id = j.id)
    or (d.started_at is not null and (d.started_at, d.ended_at, d.break_minutes)
        is distinct from (approve_job_time.started_at, approve_job_time.ended_at, approve_job_time.break_minutes));
  if is_corrected and why is null then
    raise exception 'A corrected time needs a reason' using errcode = '23514', hint = 'reason_required';
  end if;

  select * into p from private.price_job_time(job, approve_job_time.started_at, approve_job_time.ended_at, approve_job_time.break_minutes);
  insert into public.job_times (
    organization_id, job_id, started_at, ended_at, break_minutes, worked_minutes, evening_minutes,
    minimum_minutes, billed_minutes, hourly_rate, evening_rate, amount, corrected, reason
  ) values (
    j.organization_id, j.id, approve_job_time.started_at, approve_job_time.ended_at, approve_job_time.break_minutes,
    p.worked_minutes, p.evening_minutes, p.minimum_minutes, p.billed_minutes, p.hourly_rate, p.evening_rate, p.amount,
    is_corrected, why
  ) returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.job_time_draft(job uuid)
returns table (
  started_at timestamptz, ended_at timestamptz, break_minutes integer,
  worked_minutes integer, evening_minutes integer, minimum_minutes integer, billed_minutes integer,
  hourly_rate integer, evening_rate integer, amount integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  j public.jobs;
  d record;
begin
  select * into j from public.jobs where id = job;
  if not found or not private.has_role(j.organization_id, array['owner', 'admin', 'dispatcher', 'accountant']::public.member_role[]) then
    raise exception 'Only the office reads working time' using errcode = '42501';
  end if;
  select * into d from private.driver_time(job);
  if d.started_at is null then
    return;
  end if;
  return query
    select d.started_at, d.ended_at, d.break_minutes, p.*
    from private.price_job_time(job, d.started_at, d.ended_at, d.break_minutes) p;
end;
$$;

create or replace function public.mark_invoice_sent(job uuid, reference text default null)
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
    or (private.has_role(j.organization_id, array['owner', 'admin', 'accountant']::public.member_role[]) and private.second_step_done())
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

create or replace function public.invoice_queue()
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
    and (select private.has_role(j.organization_id, array['owner', 'admin', 'dispatcher', 'accountant']::public.member_role[]))
  order by i.sent_at desc nulls first, j.ends_at;
$$;

create or replace function public.invoices_waiting()
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from public.jobs j
  where j.status = 'done'
    and not exists (select 1 from public.job_invoices i where i.job_id = j.id)
    and (select private.has_role(j.organization_id, array['owner', 'admin', 'dispatcher', 'accountant']::public.member_role[]));
$$;
