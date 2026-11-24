-- Stage 15a+: the company's logo and photos on its public page (Li 2026-11-24).
--
-- Files live in a private Storage bucket, company-photos, at
-- <organization id>/<random id>.jpg|png. company_photos lists them with their
-- order and a short description for screen readers.
--
-- Who may do what:
--   owner/admin (with the second step):  add, describe, reorder and remove
--   the company's members:               see them, also before the page is published
--   visitors:                            see the files of a published page whose
--                                        company is not read-only (stage 14b), through
--                                        a short-lived signed link
-- A file not listed in company_photos is never shown to a visitor.

create table public.company_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('logo', 'photo')),
  path text not null unique,
  -- What the photo shows, for screen readers ("Kranbil løfter takstein i Bergen").
  alt text check (char_length(alt) between 1 and 200),
  width int not null check (width between 1 and 4000),
  height int not null check (height between 1 and 4000),
  position int not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (path ~ ('^' || organization_id::text || '/[0-9a-f-]{36}\.(jpg|png)$'))
);

comment on table public.company_photos is 'The logo and photos on the company''s public page, stored in the private company-photos bucket. Written through add/update/move/remove_company_photo.';

create index company_photos_organization_idx on public.company_photos (organization_id, kind, position);
-- One logo per company.
create unique index company_photos_one_logo_key on public.company_photos (organization_id) where kind = 'logo';

alter table public.company_photos enable row level security;
revoke all on public.company_photos from anon, authenticated;
grant select on public.company_photos to authenticated;

create policy "Members can read their company's photos"
  on public.company_photos for select
  to authenticated
  using ((select private.is_member(organization_id)));

create trigger company_photos_read_only
  before insert or update or delete on public.company_photos
  for each row execute function private.guard_read_only();

-- The company a file path belongs to: <organization id>/<file>.
create function private.company_of_photo_path(path text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
              then split_part(path, '/', 1)::uuid end;
$$;

-- Owners and admins with the second step, of a company that can still write.
create function private.may_edit_company_photos(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select org is not null
    and private.has_role(org, array['owner', 'admin']::public.member_role[])
    and private.second_step_done()
    and not private.is_read_only(org);
$$;

revoke all on function private.company_of_photo_path(text), private.may_edit_company_photos(uuid) from public;
grant execute on function private.company_of_photo_path(text), private.may_edit_company_photos(uuid) to authenticated;

-- Whether a stored file may be read: by the company's own members (also a file
-- not listed yet, so it can be removed), and by everyone when it is listed on a
-- published page of a company that is not read-only.
-- In the public schema so the bucket's policy works for visitors too.
create function public.company_photo_visible(file_path text)
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
      where f.path = file_path and p.published and not private.is_read_only(f.organization_id)
    );
$$;

revoke all on function public.company_photo_visible(text) from public;
grant execute on function public.company_photo_visible(text) to anon, authenticated;

-- The private bucket: JPEG photos and PNG logos, at most 2 MB each
-- (the browser makes them smaller first, which also drops the GPS position).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-photos', 'company-photos', false, 2097152, array['image/jpeg', 'image/png']);

create policy "Listed company photos can be read where the page may be seen"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'company-photos' and (select public.company_photo_visible(name)));

create policy "Owners and admins can add company photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'company-photos' and (select private.may_edit_company_photos(private.company_of_photo_path(name))));

create policy "Owners and admins can remove company photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'company-photos' and (select private.may_edit_company_photos(private.company_of_photo_path(name))));

-- Checks shared by the functions below: owner or admin, with the second step.
create function private.require_company_photo_editor(org uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if org is null or not private.has_role(org, array['owner', 'admin']::public.member_role[]) then
    raise exception 'Only owners and admins change the company page' using errcode = '42501', hint = 'not_allowed';
  end if;
  perform private.require_mfa();
end;
$$;

revoke all on function private.require_company_photo_editor(uuid) from public;
grant execute on function private.require_company_photo_editor(uuid) to authenticated;

-- List an uploaded file. A new logo replaces the old one: its path is returned
-- so the old file can be removed from the bucket.
create function public.add_company_photo(
  org uuid,
  photo_kind text,
  photo_path text,
  photo_width int,
  photo_height int,
  photo_alt text default null
)
returns table (id uuid, replaced_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  old_path text;
begin
  perform private.require_company_photo_editor(org);
  if photo_kind not in ('logo', 'photo') then
    raise exception 'Invalid kind' using errcode = '22023', hint = 'invalid_kind';
  end if;
  if private.company_of_photo_path(photo_path) is distinct from org then
    raise exception 'The file is not the company''s' using errcode = '42501', hint = 'not_allowed';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'company-photos' and o.name = photo_path) then
    raise exception 'The file was not uploaded' using errcode = 'P0002', hint = 'not_uploaded';
  end if;
  -- One at a time per company, so the count and the order stay right.
  perform 1 from public.organizations o where o.id = org for update;
  if photo_kind = 'photo' and (select count(*) from public.company_photos f where f.organization_id = org and f.kind = 'photo') >= 8 then
    raise exception 'At most 8 photos' using errcode = '54000', hint = 'too_many';
  end if;
  if photo_kind = 'logo' then
    delete from public.company_photos f where f.organization_id = org and f.kind = 'logo' returning f.path into old_path;
  end if;

  insert into public.company_photos (organization_id, kind, path, alt, width, height, position)
  values (
    org, photo_kind, photo_path, nullif(btrim(regexp_replace(coalesce(photo_alt, ''), '\s+', ' ', 'g')), ''),
    photo_width, photo_height,
    coalesce((select max(f.position) + 1 from public.company_photos f where f.organization_id = org and f.kind = photo_kind), 0)
  )
  returning company_photos.id into new_id;
  return query select new_id, old_path;
end;
$$;

-- Change what a photo is described as.
create function public.update_company_photo(photo uuid, photo_alt text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid := (select f.organization_id from public.company_photos f where f.id = photo);
  clean_alt text := nullif(btrim(regexp_replace(coalesce(photo_alt, ''), '\s+', ' ', 'g')), '');
begin
  perform private.require_company_photo_editor(org);
  if clean_alt is not null and char_length(clean_alt) > 200 then
    raise exception 'Invalid description' using errcode = '22023', hint = 'invalid_alt';
  end if;
  update public.company_photos set alt = clean_alt where id = photo;
end;
$$;

-- Move a photo one place earlier or later.
create function public.move_company_photo(photo uuid, earlier boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  this public.company_photos;
  other public.company_photos;
begin
  select * into this from public.company_photos f where f.id = photo;
  perform private.require_company_photo_editor(this.organization_id);
  perform 1 from public.organizations o where o.id = this.organization_id for update;
  if earlier then
    select * into other from public.company_photos f
    where f.organization_id = this.organization_id and f.kind = this.kind and f.position < this.position
    order by f.position desc limit 1;
  else
    select * into other from public.company_photos f
    where f.organization_id = this.organization_id and f.kind = this.kind and f.position > this.position
    order by f.position limit 1;
  end if;
  if other.id is null then
    return;
  end if;
  update public.company_photos set position = other.position where id = this.id;
  update public.company_photos set position = this.position where id = other.id;
end;
$$;

-- Take a photo off the page. Its path is returned so the file can be removed too.
create function public.remove_company_photo(photo uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid := (select f.organization_id from public.company_photos f where f.id = photo);
  removed text;
begin
  perform private.require_company_photo_editor(org);
  delete from public.company_photos where id = photo returning path into removed;
  return removed;
end;
$$;

revoke all on function
  public.add_company_photo(uuid, text, text, int, int, text),
  public.update_company_photo(uuid, text),
  public.move_company_photo(uuid, boolean),
  public.remove_company_photo(uuid)
from public, anon;
grant execute on function
  public.add_company_photo(uuid, text, text, int, int, text),
  public.update_company_photo(uuid, text),
  public.move_company_photo(uuid, boolean),
  public.remove_company_photo(uuid)
to authenticated;

-- The logo and photos of one page, for whoever may see the page (as company_page()).
create function public.company_page_photos(page_slug text)
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
      (p.published and not private.is_read_only(p.organization_id))
      or private.is_member(p.organization_id)
    )
  order by f.kind, f.position;
$$;

revoke all on function public.company_page_photos(text) from public;
grant execute on function public.company_page_photos(text) to anon, authenticated;
