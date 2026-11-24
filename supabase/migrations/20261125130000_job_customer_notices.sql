-- Stage 16c: what the customer was last told about a job planned from their
-- request: the time, and whether it was cancelled. The job page compares it
-- with the job, so the office sees when the time has changed or the job was
-- cancelled since, and sends the news with one tap. Nothing is sent by itself.

create table public.job_customer_notices (
  job_id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  cancelled boolean not null default false,
  sent_at timestamptz not null default now(),
  sent_by uuid default auth.uid() references auth.users (id) on delete set null,
  foreign key (job_id, organization_id) references public.jobs (id, organization_id) on delete cascade
);

comment on table public.job_customer_notices is 'The time and state of a job as last e-mailed to the customer who requested it.';

create index job_customer_notices_organization_idx on public.job_customer_notices (organization_id);

alter table public.job_customer_notices enable row level security;

revoke all on public.job_customer_notices from anon, authenticated;
grant select on public.job_customer_notices to authenticated;
grant insert (job_id, organization_id, starts_at, ends_at, cancelled),
      update (starts_at, ends_at, cancelled, sent_at, sent_by)
  on public.job_customer_notices to authenticated;

-- The same people who plan jobs: owners, admins and dispatchers of the company.
create policy "The office can read customer notices"
  on public.job_customer_notices for select
  to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[])));

create policy "The office can record customer notices"
  on public.job_customer_notices for insert
  to authenticated
  with check ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[])));

create policy "The office can update customer notices"
  on public.job_customer_notices for update
  to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[])))
  with check ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[])));

-- As for jobs: owners and admins with the second step, dispatchers by their role.
create policy "Recording notices needs two-step sign-in for owners and admins"
  on public.job_customer_notices as restrictive for insert
  to authenticated
  with check (
    (select private.second_step_done())
    or (select private.has_role(organization_id, array['dispatcher']::public.member_role[]))
  );

create policy "Updating notices needs two-step sign-in for owners and admins"
  on public.job_customer_notices as restrictive for update
  to authenticated
  using (
    (select private.second_step_done())
    or (select private.has_role(organization_id, array['dispatcher']::public.member_role[]))
  );

-- Only for a job planned from a request.
create function private.check_job_customer_notice()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.jobs j where j.id = new.job_id and j.request_id is not null) then
    raise exception 'The job was not planned from a request' using errcode = '23514', hint = 'no_request';
  end if;
  return new;
end;
$$;

create trigger job_customer_notices_check
  before insert on public.job_customer_notices
  for each row execute function private.check_job_customer_notice();

create trigger job_customer_notices_read_only
  before insert or update or delete on public.job_customer_notices
  for each row execute function private.guard_read_only();
