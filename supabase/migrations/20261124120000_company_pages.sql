-- Stage 15a: a public page for each company (Li's idea 2026-11-16, chosen 2026-11-24).
--
-- The company writes what its customers should see: what it does, where, and
-- how to reach it. Nothing is shown until an owner or admin turns on
-- "published". The page lives at maskingo.no/firma/<slug>.
-- Visitors (anon) never read this table: they get one page at a time through
-- public.company_page(), which returns only the public fields.

create table public.company_pages (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  -- The address: lower-case letters, digits and single dashes, e.g. "fjellkran-as".
  slug text not null unique check (char_length(slug) between 3 and 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  published boolean not null default false,
  description text check (char_length(description) between 1 and 2000),
  -- What the company does, from the fixed list in src/lib/company-page.ts (searchable in stage 15d).
  services text[] not null default '{}' check (
    cardinality(services) <= 8
    and services <@ array['crane_truck', 'mobile_crane', 'excavation', 'transport', 'machine_transport', 'snow_clearing', 'demolition', 'landscaping']::text[]
  ),
  city text check (char_length(city) between 1 and 100),
  -- Where the company works, in its own words ("Bergen og omegn").
  area text check (char_length(area) between 1 and 200),
  phone text check (phone ~ '^\+?[0-9]{5,15}$'),
  email text check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  website text check (char_length(website) <= 200 and website ~ '^https://[a-z0-9.-]+\.[a-z]{2,}(/[^\s]*)?$'),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  -- A published page says what, where and how to get in touch.
  check (not published or (description is not null and city is not null and cardinality(services) > 0 and (phone is not null or email is not null)))
);

comment on table public.company_pages is 'The company''s public page (maskingo.no/firma/<slug>). Written through save_company_page; visitors read it through company_page().';

alter table public.company_pages enable row level security;
revoke all on public.company_pages from anon, authenticated;
grant select on public.company_pages to authenticated;

create policy "Members can read their company's page"
  on public.company_pages for select
  to authenticated
  using ((select private.is_member(organization_id)));

-- A read-only company (stage 14b) cannot change its page either.
create trigger company_pages_read_only
  before insert or update or delete on public.company_pages
  for each row execute function private.guard_read_only();

-- Save the page. Owners and admins only, with the second step.
create function public.save_company_page(
  org uuid,
  page_slug text,
  page_published boolean,
  page_description text default null,
  page_services text[] default '{}',
  page_city text default null,
  page_area text default null,
  page_phone text default null,
  page_email text default null,
  page_website text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_slug text := lower(btrim(coalesce(page_slug, '')));
  clean_description text := nullif(btrim(regexp_replace(coalesce(page_description, ''), '\r\n?', E'\n', 'g')), '');
  clean_services text[] := coalesce((select array_agg(distinct s order by s) from unnest(coalesce(page_services, '{}')) s), '{}');
  clean_city text := nullif(regexp_replace(btrim(coalesce(page_city, '')), '\s+', ' ', 'g'), '');
  clean_area text := nullif(regexp_replace(btrim(coalesce(page_area, '')), '\s+', ' ', 'g'), '');
  clean_phone text := nullif(regexp_replace(coalesce(page_phone, ''), '[\s().-]', '', 'g'), '');
  clean_email text := nullif(lower(btrim(coalesce(page_email, ''))), '');
  clean_website text := nullif(btrim(coalesce(page_website, '')), '');
begin
  if not private.has_role(org, array['owner', 'admin']::public.member_role[]) then
    raise exception 'Only owners and admins change the company page' using errcode = '42501', hint = 'not_allowed';
  end if;
  perform private.require_mfa();

  if char_length(clean_slug) not between 3 and 60 or clean_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Invalid address' using errcode = '22023', hint = 'invalid_slug';
  end if;
  if clean_description is not null and char_length(clean_description) > 2000 then
    raise exception 'Invalid description' using errcode = '22023', hint = 'invalid_description';
  end if;
  if cardinality(clean_services) > 8 or not clean_services <@ array['crane_truck', 'mobile_crane', 'excavation', 'transport', 'machine_transport', 'snow_clearing', 'demolition', 'landscaping']::text[] then
    raise exception 'Invalid services' using errcode = '22023', hint = 'invalid_services';
  end if;
  if clean_city is not null and char_length(clean_city) > 100 then
    raise exception 'Invalid city' using errcode = '22023', hint = 'invalid_city';
  end if;
  if clean_area is not null and char_length(clean_area) > 200 then
    raise exception 'Invalid area' using errcode = '22023', hint = 'invalid_area';
  end if;
  if clean_phone is not null and clean_phone !~ '^\+?[0-9]{5,15}$' then
    raise exception 'Invalid phone' using errcode = '22023', hint = 'invalid_phone';
  end if;
  if clean_email is not null and (char_length(clean_email) > 254 or clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Invalid e-mail' using errcode = '22023', hint = 'invalid_email';
  end if;
  if clean_website is not null and (char_length(clean_website) > 200 or clean_website !~ '^https://[a-z0-9.-]+\.[a-z]{2,}(/[^\s]*)?$') then
    raise exception 'Invalid website' using errcode = '22023', hint = 'invalid_website';
  end if;
  if coalesce(page_published, false) and (
    clean_description is null or clean_city is null or cardinality(clean_services) = 0 or (clean_phone is null and clean_email is null)
  ) then
    raise exception 'A published page needs a description, a city, a service and a phone or e-mail'
      using errcode = '22023', hint = 'incomplete';
  end if;

  begin
    insert into public.company_pages as p (
      organization_id, slug, published, description, services, city, area, phone, email, website
    ) values (
      org, clean_slug, coalesce(page_published, false), clean_description, clean_services, clean_city, clean_area,
      clean_phone, clean_email, clean_website
    )
    on conflict (organization_id) do update set
      slug = excluded.slug,
      published = excluded.published,
      description = excluded.description,
      services = excluded.services,
      city = excluded.city,
      area = excluded.area,
      phone = excluded.phone,
      email = excluded.email,
      website = excluded.website,
      updated_by = auth.uid(),
      updated_at = now();
  exception when unique_violation then
    raise exception 'The address is taken' using errcode = '23505', hint = 'slug_taken';
  end;
end;
$$;

revoke all on function public.save_company_page(uuid, text, boolean, text, text[], text, text, text, text, text) from public, anon;
grant execute on function public.save_company_page(uuid, text, boolean, text, text[], text, text, text, text, text) to authenticated;

-- One page for a visitor: only the public fields. Shown when published and the
-- company's subscription is running (stage 14b); its own members also see it
-- before it is published, as a preview.
create function public.company_page(page_slug text)
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
      (p.published and not private.is_read_only(p.organization_id))
      or private.is_member(p.organization_id)
    );
$$;

-- The published pages, for the sitemap.
create function public.published_company_pages()
returns table (slug text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.slug, p.updated_at
  from public.company_pages p
  where p.published and not private.is_read_only(p.organization_id)
  order by p.slug;
$$;

revoke all on function public.company_page(text), public.published_company_pages() from public;
grant execute on function public.company_page(text), public.published_company_pages() to anon, authenticated;
