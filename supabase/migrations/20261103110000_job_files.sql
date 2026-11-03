-- Stage 5, part 3: photos from the site and the customer's signature.
--
-- The files live in a private Storage bucket, job-files, at
-- <organization id>/<job id>/<random id>.jpg|png. Nothing in it is public:
-- pages show a file through a short-lived signed link. job_files lists the
-- files of each job, with the signer's name for a signature.
--
-- Who may do what:
--   the job's driver:                  add photos and the signature, see them
--   dispatcher, owner/admin (with the
--   second step for adding):           the same, for every job of the company
--   everyone else:                     nothing
-- Files are never changed. A file not yet listed in job_files (an upload whose
-- listing failed) can be removed by the person who uploaded it.

create type public.job_file_kind as enum ('photo', 'signature');

create table public.job_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  job_id uuid not null,
  kind public.job_file_kind not null,
  path text not null unique,
  -- The customer's name, as they wrote it, for a signature.
  signed_by text check (char_length(btrim(signed_by)) between 1 and 100),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((kind = 'signature') = (signed_by is not null)),
  check (path ~ ('^' || organization_id::text || '/' || job_id::text || '/[0-9a-f-]{36}\.(jpg|png)$')),
  foreign key (job_id, organization_id) references public.jobs (id, organization_id) on delete cascade
);

comment on table public.job_files is 'Photos and the customer''s signature of a job, stored in the private job-files bucket. Never changed.';

create index job_files_job_created_idx on public.job_files (job_id, created_at);
create index job_files_organization_idx on public.job_files (organization_id);
-- One signature per job.
create unique index job_files_one_signature_key on public.job_files (job_id) where kind = 'signature';

alter table public.job_files enable row level security;
revoke all on public.job_files from anon, authenticated;
-- Written only through add_job_file.
grant select on public.job_files to authenticated;

create policy "The office and the job's driver can read a job's files"
  on public.job_files for select
  to authenticated
  using (
    (select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[]))
    or (select private.drives_job(job_id))
  );

-- The job a file path belongs to, when its company and job match.
create function private.job_of_path(path text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with p as (
    select case when path ~ ('^' || u || '/' || u || '/[^/]+$')
             then array[split_part(path, '/', 1)::uuid, split_part(path, '/', 2)::uuid] end as ids
    from (select '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' as u) uuid_pattern
  )
  select j.id
  from public.jobs j, p
  where j.organization_id = p.ids[1] and j.id = p.ids[2];
$$;

-- Whether the signed-in person may see a job's files, or add to them.
create function private.may_see_job_files(job uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.jobs j
    where j.id = job
      and (j.driver_id = (select auth.uid())
           or private.has_role(j.organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[]))
  );
$$;

create function private.may_add_job_files(job uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.jobs j
    where j.id = job
      and j.status <> 'cancelled'
      and (j.driver_id = (select auth.uid())
           or private.has_role(j.organization_id, array['dispatcher']::public.member_role[])
           or (private.has_role(j.organization_id, array['owner', 'admin']::public.member_role[]) and private.second_step_done()))
  );
$$;

revoke all on function private.job_of_path(text), private.may_see_job_files(uuid), private.may_add_job_files(uuid) from public;
grant execute on function private.job_of_path(text), private.may_see_job_files(uuid), private.may_add_job_files(uuid) to authenticated;

-- The private bucket: photos (JPEG) and signatures (PNG), at most 2 MB each.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-files', 'job-files', false, 2097152, array['image/jpeg', 'image/png']);

create policy "The office and the job's driver can read job files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'job-files' and (select private.may_see_job_files(private.job_of_path(name))));

create policy "The office and the job's driver can add job files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'job-files' and (select private.may_add_job_files(private.job_of_path(name))));

create policy "An upload not yet listed can be removed by its uploader"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'job-files'
    and owner_id = (select auth.uid())::text
    and not exists (select 1 from public.job_files f where f.path = name)
  );

-- List an uploaded file with its job. The file must be in the bucket already.
create function public.add_job_file(job uuid, kind public.job_file_kind, path text, signed_by text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
  new_id uuid;
begin
  select * into j from public.jobs where id = job for update;
  if not found or not private.may_add_job_files(job) or private.job_of_path(path) is distinct from job then
    raise exception 'Only the job''s driver and the office add files' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'job-files' and o.name = path) then
    raise exception 'The file was not uploaded' using errcode = 'P0002';
  end if;
  if kind = 'photo' and (select count(*) from public.job_files f where f.job_id = j.id and f.kind = 'photo') >= 30 then
    raise exception 'At most 30 photos per job' using errcode = '54000';
  end if;

  insert into public.job_files (organization_id, job_id, kind, path, signed_by)
  values (j.organization_id, j.id, kind, path, nullif(btrim(signed_by), ''))
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.add_job_file(uuid, public.job_file_kind, text, text) from public, anon;
grant execute on function public.add_job_file(uuid, public.job_file_kind, text, text) to authenticated;
