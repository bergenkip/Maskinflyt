-- Stage 16b: the customer sees the job planned from their request. A job made
-- from an accepted request remembers that request, once; the customer's own
-- list of requests then shows the planned time and how the job is going. The
-- office still plans by hand: nothing here plans or confirms anything by itself.

-- So a job can point at a request of its own company only.
alter table public.job_requests
  add constraint job_requests_id_organization_key unique (id, organization_id);

alter table public.jobs
  add column request_id uuid unique,
  add constraint jobs_request_fkey foreign key (request_id, organization_id)
    references public.job_requests (id, organization_id) on delete set null (request_id);

comment on column public.jobs.request_id is 'The customer''s request this job was planned from, if any. Set when the job is added, never changed.';

-- Set only when the job is added: a job is not moved to another request later.
grant insert (request_id) on public.jobs to authenticated;

-- Only an accepted request is planned.
create function private.check_job_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.job_requests r
    where r.id = new.request_id and r.organization_id = new.organization_id and r.status = 'accepted'
  ) then
    raise exception 'Only an accepted request can be planned' using errcode = '23514', hint = 'request_not_accepted';
  end if;
  return new;
end;
$$;

create trigger jobs_check_request
  before insert on public.jobs
  for each row
  when (new.request_id is not null)
  execute function private.check_job_request();

-- The customer's requests, now with the job planned from each one: its time,
-- in the company's time zone, and whether it is planned, done or cancelled.
-- Only the time and the state: machine, driver, prices and notes stay with the company.
drop function public.my_job_requests();

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
  page_published boolean,
  job_status text,
  job_starts_at timestamptz,
  job_ends_at timestamptz,
  time_zone text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.created_at, r.status, r.place, r.wanted_date, r.wanted_start, r.service, r.description, r.answer,
         r.handled_at, o.name, p.slug, coalesce(p.published and not private.is_read_only(r.organization_id), false),
         -- "new" and "planned" are the same to the customer: the time is set.
         case j.status when 'new' then 'planned' else j.status::text end,
         j.starts_at, j.ends_at, o.timezone
  from public.job_requests r
  join public.organizations o on o.id = r.organization_id
  left join public.company_pages p on p.organization_id = r.organization_id
  left join public.jobs j on j.request_id = r.id
  where r.user_id = auth.uid()
  order by r.created_at desc
  limit 100;
$$;

revoke all on function public.my_job_requests() from public, anon;
grant execute on function public.my_job_requests() to authenticated;
