-- The free plan "Katalog" (Li, 2026-11-25: "a free plan, only to be in the catalog";
-- chosen: "only the page with contact details").
--
-- A company without a running subscription (trial over, or Stripe ended it) is on
-- the free plan. Before, it disappeared from the catalog; now its published page
-- stays listed and visible with the contact details, logo and photos, and the
-- company can still edit the page (and unpublish it). Everything else stays
-- read-only (stage 14b): no requests, no free times, no jobs or invoices.
-- Companies with a running subscription come first in the catalog.

-- The page and its photos can be changed on the free plan.
drop trigger company_pages_read_only on public.company_pages;
drop trigger company_photos_read_only on public.company_photos;
-- (save_company_hours still stops at company_hours' read-only guard before it touches the page.)

create or replace function private.may_edit_company_photos(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select org is not null
    and private.has_role(org, array['owner', 'admin']::public.member_role[])
    and private.second_step_done();
$$;

create or replace function public.company_photo_visible(file_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.is_member(private.company_of_photo_path(file_path)), false)
    or exists (
      select 1
      from public.company_photos f
      join public.company_pages p on p.organization_id = f.organization_id
      where f.path = file_path and p.published
    );
$$;

create or replace function public.company_page(page_slug text)
returns table (
  name text,
  org_number text,
  country text,
  slug text,
  published boolean,
  description text,
  services text[],
  city text,
  area text,
  phone text,
  email text,
  website text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, o.org_number, o.country, p.slug, p.published, p.description, p.services, p.city, p.area,
         p.phone, p.email, p.website, p.updated_at
  from public.company_pages p
  join public.organizations o on o.id = p.organization_id
  where p.slug = lower(page_slug)
    and (
      p.published
      or private.is_member(p.organization_id)
    );
$$;

create or replace function public.published_company_pages()
returns table (slug text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.slug, p.updated_at
  from public.company_pages p
  where p.published
  order by p.slug;
$$;

create or replace function public.company_page_photos(page_slug text)
returns table (id uuid, kind text, path text, alt text, width int, height int)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.kind, f.path, f.alt, f.width, f.height
  from public.company_pages p
  join public.company_photos f on f.organization_id = p.organization_id
  where p.slug = lower(page_slug)
    and (
      p.published
      or private.is_member(p.organization_id)
    )
  order by f.kind, f.position;
$$;

create or replace function public.company_directory(wanted_service text default null, wanted_place text default null)
returns table (
  slug text,
  name text,
  description text,
  services text[],
  city text,
  area text,
  free_times boolean,
  logo_path text,
  logo_width int,
  logo_height int
)
language sql
stable
security definer
set search_path = ''
as $$
  with wanted as (
    select nullif(trim(wanted_service), '') as service,
           nullif(left(regexp_replace(trim(coalesce(wanted_place, '')), '\s+', ' ', 'g'), 100), '') as place
  )
  select p.slug, o.name, left(p.description, 300), p.services, p.city, p.area, coalesce(p.free_times, false) and not private.is_read_only(p.organization_id),
         l.path, l.width, l.height
  from public.company_pages p
  join public.organizations o on o.id = p.organization_id
  cross join wanted w
  left join public.company_photos l on l.organization_id = p.organization_id and l.kind = 'logo'
  where p.published
    and (w.service is null or w.service = any (p.services))
    and (
      w.place is null
      or p.city ilike private.like_pattern(w.place)
      or p.area ilike private.like_pattern(w.place)
    )
  -- Companies with a running subscription first; the free plan after them.
  order by private.is_read_only(p.organization_id), lower(o.name), p.slug
  limit 200;
$$;

create or replace function public.company_directory_places()
returns table (city text, companies int)
language sql
stable
security definer
set search_path = ''
as $$
  select min(p.city), count(*)::int
  from public.company_pages p
  where p.published and p.city is not null
  group by lower(p.city)
  order by count(*) desc, lower(p.city)
  limit 30;
$$;

-- Whether the page takes requests and shows free times: only with a running subscription.
create function public.company_takes_requests(page_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select not private.is_read_only(p.organization_id)
    from public.company_pages p
    where p.slug = lower(page_slug) and (p.published or private.is_member(p.organization_id))
  ), false);
$$;

revoke all on function public.company_takes_requests(text) from public;
grant execute on function public.company_takes_requests(text) to anon, authenticated;
