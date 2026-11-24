-- Stage 15b, part 1: a customer sends a request from the company's public page
-- (maskingo.no/firma/<slug>), without an account. The office reads the requests;
-- accepting or declining them comes in part 2. Nothing is confirmed automatically.
--
-- Visitors never read or change this table. They write one request at a time
-- through public.submit_job_request(), which accepts it only for a published
-- page of a company that is not read-only, and limits how many arrive.

create table public.job_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  status text not null default 'new' check (status in ('new', 'accepted', 'declined')),
  -- What the customer wrote, kept as written (spaces tidied).
  name text not null check (char_length(name) between 1 and 100),
  phone text check (phone ~ '^\+?[0-9]{5,15}$'),
  email text check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  place text not null check (char_length(place) between 1 and 200),
  wanted_date date,
  service text check (service in ('crane_truck', 'mobile_crane', 'excavation', 'transport', 'machine_transport', 'snow_clearing', 'demolition', 'landscaping')),
  description text not null check (char_length(description) between 1 and 2000),
  -- The language the customer wrote in, for the answer in part 2.
  locale text not null default 'nb' check (locale in ('nb', 'en', 'lt')),
  created_at timestamptz not null default now(),
  handled_by uuid references auth.users (id) on delete set null,
  handled_at timestamptz,
  check (phone is not null or email is not null)
);

comment on table public.job_requests is 'Requests sent by customers from the company page. Written by submit_job_request; read by the office.';

create index job_requests_organization_idx on public.job_requests (organization_id, status, created_at desc);

alter table public.job_requests enable row level security;
revoke all on public.job_requests from anon, authenticated;
grant select on public.job_requests to authenticated;

-- Owners, admins and dispatchers (and members with the planning right) read them.
create policy "The office can read the company's requests"
  on public.job_requests for select
  to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[])));

create trigger job_requests_read_only
  before insert or update or delete on public.job_requests
  for each row execute function private.guard_read_only();

-- Send a request to the company behind a published page. Returns the request
-- and where the company wants to be told (the page's public e-mail, if any).
create function public.submit_job_request(
  page_slug text,
  request_name text,
  request_place text,
  request_description text,
  request_phone text default null,
  request_email text default null,
  request_wanted_date date default null,
  request_service text default null,
  request_locale text default 'nb'
)
returns table (id uuid, company text, notify_email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  page public.company_pages;
  company_name text;
  clean_name text := nullif(regexp_replace(btrim(coalesce(request_name, '')), '\s+', ' ', 'g'), '');
  clean_place text := nullif(regexp_replace(btrim(coalesce(request_place, '')), '\s+', ' ', 'g'), '');
  clean_description text := nullif(btrim(regexp_replace(coalesce(request_description, ''), '\r\n?', E'\n', 'g')), '');
  clean_phone text := nullif(regexp_replace(coalesce(request_phone, ''), '[\s().-]', '', 'g'), '');
  clean_email text := nullif(lower(btrim(coalesce(request_email, ''))), '');
  new_id uuid;
begin
  select p.* into page from public.company_pages p where p.slug = lower(btrim(coalesce(page_slug, '')));
  if not found or not page.published or private.is_read_only(page.organization_id) then
    raise exception 'The page does not take requests' using errcode = 'P0002', hint = 'not_found';
  end if;

  if clean_name is null or char_length(clean_name) > 100 then
    raise exception 'Invalid name' using errcode = '22023', hint = 'invalid_name';
  end if;
  if clean_place is null or char_length(clean_place) > 200 then
    raise exception 'Invalid place' using errcode = '22023', hint = 'invalid_place';
  end if;
  if clean_description is null or char_length(clean_description) > 2000 then
    raise exception 'Invalid description' using errcode = '22023', hint = 'invalid_description';
  end if;
  if clean_phone is not null and clean_phone !~ '^\+?[0-9]{5,15}$' then
    raise exception 'Invalid phone' using errcode = '22023', hint = 'invalid_phone';
  end if;
  if clean_email is not null and (char_length(clean_email) > 254 or clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Invalid e-mail' using errcode = '22023', hint = 'invalid_email';
  end if;
  if clean_phone is null and clean_email is null then
    raise exception 'A phone or e-mail is needed' using errcode = '22023', hint = 'contact_required';
  end if;
  if request_wanted_date is not null and (request_wanted_date < current_date - 1 or request_wanted_date > current_date + 730) then
    raise exception 'Invalid date' using errcode = '22023', hint = 'invalid_date';
  end if;
  if request_service is not null and request_service not in ('crane_truck', 'mobile_crane', 'excavation', 'transport', 'machine_transport', 'snow_clearing', 'demolition', 'landscaping') then
    raise exception 'Invalid service' using errcode = '22023', hint = 'invalid_service';
  end if;

  -- Against floods: at most 20 new requests an hour per company, and 3 an hour
  -- from the same phone or e-mail. One at a time per company, so the count holds.
  perform 1 from public.organizations o where o.id = page.organization_id for update;
  if (select count(*) from public.job_requests r
      where r.organization_id = page.organization_id and r.created_at > now() - interval '1 hour') >= 20
    or (select count(*) from public.job_requests r
      where r.organization_id = page.organization_id and r.created_at > now() - interval '1 hour'
        and (r.phone = clean_phone or r.email = clean_email)) >= 3 then
    raise exception 'Too many requests, try again later' using errcode = '54000', hint = 'too_many';
  end if;

  insert into public.job_requests (organization_id, name, phone, email, place, wanted_date, service, description, locale)
  values (
    page.organization_id, clean_name, clean_phone, clean_email, clean_place, request_wanted_date, request_service,
    clean_description, case when request_locale in ('nb', 'en', 'lt') then request_locale else 'nb' end
  )
  returning job_requests.id into new_id;

  select o.name into company_name from public.organizations o where o.id = page.organization_id;
  return query select new_id, company_name, page.email;
end;
$$;

revoke all on function public.submit_job_request(text, text, text, text, text, text, date, text, text) from public;
grant execute on function public.submit_job_request(text, text, text, text, text, text, date, text, text) to anon, authenticated;
