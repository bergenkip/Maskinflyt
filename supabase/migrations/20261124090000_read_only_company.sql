-- Stage 14b: a company without a running subscription can only read (Li's decision 2026-11-24).
--
-- Read-only when the free trial is over and no plan was chosen, or when Stripe
-- has ended the subscription (cancelled, unpaid, expired, paused). While Stripe
-- is still retrying a failed payment (past_due) the company keeps working.
-- Everything stays readable and downloadable. Choosing a plan still works (it
-- writes only public.subscriptions), and so do removing people and withdrawing
-- invitations, so a company can get back under a smaller plan's limit.
--
-- The rule is enforced here, in the database, for every write: the app's own
-- server actions, the security-definer functions and direct API calls alike.

create function private.is_read_only(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- No row should not happen (every company gets one); it does not lock anyone out.
  select coalesce((
    select case
      when s.status in ('active', 'past_due') then false
      -- A plan chosen during the trial: Stripe charges when the trial ends.
      when s.status = 'trialing' and s.stripe_subscription_id is not null then false
      when s.status in ('trialing', 'incomplete') then s.trial_ends_at is null or s.trial_ends_at <= now()
      else true
    end
    from public.subscriptions s
    where s.organization_id = org
  ), false);
$$;

revoke all on function private.is_read_only(uuid) from public;
grant execute on function private.is_read_only(uuid) to authenticated;

-- Stops a write to a read-only company's data. A write made by the database
-- itself as the result of another write (a foreign key's cascade when a person
-- is removed, an audit row) is let through: the write that caused it was checked.
create function private.guard_read_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
begin
  if pg_trigger_depth() > 1 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_table_name = 'organizations' then
    org := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    org := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
  end if;
  if private.is_read_only(org) then
    raise exception 'The company''s subscription is not active: its data can only be read'
      using errcode = '42501', hint = 'read_only';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.guard_read_only() from public;

do $$
declare
  t text;
begin
  foreach t in array array[
    'customers', 'customer_rates', 'vehicles',
    'jobs', 'job_events', 'job_times', 'job_files', 'job_lines', 'job_invoices',
    'invoice_settings', 'invoices', 'invoice_lines', 'invoice_sendings',
    'hour_settings', 'hour_sheets', 'hour_sheet_days'
  ] loop
    execute format(
      'create trigger %I before insert or update or delete on public.%I for each row execute function private.guard_read_only()',
      t || '_read_only', t);
  end loop;
end;
$$;

-- People: nobody joins and no role changes, but people can be removed and invitations withdrawn.
create trigger memberships_read_only
  before insert or update on public.memberships
  for each row execute function private.guard_read_only();
create trigger invitations_read_only
  before insert or update on public.invitations
  for each row execute function private.guard_read_only();
create trigger organizations_read_only
  before update or delete on public.organizations
  for each row execute function private.guard_read_only();

-- Photos and signatures go to storage before they are listed with the job:
-- a read-only company cannot upload them either.
create function private.job_read_only(job uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.is_read_only(j.organization_id) from public.jobs j where j.id = job), false);
$$;

revoke all on function private.job_read_only(uuid) from public;
grant execute on function private.job_read_only(uuid) to authenticated;

drop policy "The office and the job's driver can add job files" on storage.objects;
create policy "The office and the job's driver can add job files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'job-files'
    and (select private.may_add_job_files(private.job_of_path(name)))
    and not (select private.job_read_only(private.job_of_path(name)))
  );
