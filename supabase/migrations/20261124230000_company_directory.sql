-- Stage 15d: the free MaskinGo catalog (/finn). Visitors find published company
-- pages by service and place. Only what the company page itself shows is listed,
-- and only while the page is published and the company is not read-only.

-- Text a visitor typed, made safe for ILIKE: \, % and _ match only themselves.
create function private.like_pattern(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '%' || replace(replace(replace(value, '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;

-- The catalog: published pages, optionally only those offering one service
-- and/or working in a place (city or area, case-insensitive, part of the word).
create function public.company_directory(wanted_service text default null, wanted_place text default null)
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
  select p.slug, o.name, left(p.description, 300), p.services, p.city, p.area, coalesce(p.free_times, false),
         l.path, l.width, l.height
  from public.company_pages p
  join public.organizations o on o.id = p.organization_id
  cross join wanted w
  left join public.company_photos l on l.organization_id = p.organization_id and l.kind = 'logo'
  where p.published
    and not private.is_read_only(p.organization_id)
    and (w.service is null or w.service = any (p.services))
    and (
      w.place is null
      or p.city ilike private.like_pattern(w.place)
      or p.area ilike private.like_pattern(w.place)
    )
  order by lower(o.name), p.slug
  limit 200;
$$;

-- The places with listed companies, most companies first, for quick links.
create function public.company_directory_places()
returns table (city text, companies int)
language sql
stable
security definer
set search_path = ''
as $$
  select min(p.city), count(*)::int
  from public.company_pages p
  where p.published and not private.is_read_only(p.organization_id) and p.city is not null
  group by lower(p.city)
  order by count(*) desc, lower(p.city)
  limit 30;
$$;

revoke all on function private.like_pattern(text) from public;
revoke all on function public.company_directory(text, text), public.company_directory_places() from public;
grant execute on function public.company_directory(text, text), public.company_directory_places() to anon, authenticated;
