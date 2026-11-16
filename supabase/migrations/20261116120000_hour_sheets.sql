-- Stage 13a: the employee's own hours sheet for the pay.
--
-- An employee (usually a driver) picks a period, writes each working day's
-- start, end and break, and presses "Confirm and send". The sheet is then
-- locked, each day is split into normal hours and overtime by the company's
-- rules (from which hour of the day overtime starts, and how much more it
-- pays; a second, higher level can be added), and the app e-mails a PDF to the
-- company's accountant. These are pay hours, not the hours billed to customers.
--
-- Who may do what:
--   every member:                        own sheets: make, fill in, confirm; read the overtime rules
--   owner, admin (second step):          change the overtime rules and the accountant's e-mail
--   owner, admin, accountant:            read everyone's sheets (stage 13b shows them)
--   another company:                     nothing

create table public.hour_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  -- Overtime starts after this many minutes of work in a day, and pays this much more.
  overtime_after integer not null default 480 check (overtime_after between 60 and 1440),
  overtime_percent integer not null default 50 check (overtime_percent between 1 and 300),
  -- An optional higher level, later in the day.
  overtime2_after integer check (overtime2_after between 60 and 1440),
  overtime2_percent integer check (overtime2_percent between 1 and 300),
  -- Where the confirmed sheets are e-mailed; optional.
  accountant_email text check (char_length(accountant_email) <= 254 and accountant_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  check ((overtime2_after is null) = (overtime2_percent is null)),
  check (overtime2_after is null or (overtime2_after > overtime_after and overtime2_percent > overtime_percent))
);

comment on table public.hour_settings is 'The company''s overtime rules for the hours sheets, and where confirmed sheets are e-mailed.';

alter table public.hour_settings enable row level security;
revoke all on public.hour_settings from anon, authenticated;
-- Written only through save_hour_settings.
grant select on public.hour_settings to authenticated;

create policy "Members can read the overtime rules"
  on public.hour_settings for select
  to authenticated
  using ((select private.is_member(organization_id)));

create table public.hour_sheets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  period_from date not null,
  period_to date not null,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  -- Filled in when confirmed: the name and rules it was confirmed with, and the totals.
  employee_name text,
  overtime_after integer,
  overtime_percent integer,
  overtime2_after integer,
  overtime2_percent integer,
  worked_minutes integer,
  normal_minutes integer,
  overtime_minutes integer,
  overtime2_minutes integer,
  submitted_at timestamptz,
  -- The e-mail to the accountant: to whom, and whether the e-mail service took it.
  email_to text check (char_length(email_to) <= 254),
  email_status text check (email_status in ('sent', 'failed', 'none')),
  email_provider_id text check (char_length(email_provider_id) <= 200),
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  check (period_to >= period_from and period_to - period_from < 62),
  check ((status = 'submitted') = (submitted_at is not null)),
  foreign key (organization_id, user_id) references public.memberships (organization_id, user_id) on delete cascade
);

comment on table public.hour_sheets is 'An employee''s hours for a period, for the pay. Locked once confirmed.';

create index hour_sheets_user on public.hour_sheets (organization_id, user_id, period_from);
create index hour_sheets_organization on public.hour_sheets (organization_id, submitted_at);

create table public.hour_sheet_days (
  sheet_id uuid not null references public.hour_sheets (id) on delete cascade,
  organization_id uuid not null,
  day date not null,
  starts time not null check (starts = date_trunc('minute', starts)),
  -- An end at or before the start is the next morning.
  ends time not null check (ends = date_trunc('minute', ends)),
  break_minutes integer not null default 0 check (break_minutes between 0 and 600),
  note text check (char_length(note) between 1 and 200),
  worked_minutes integer not null check (worked_minutes between 1 and 1440),
  -- Filled in when the sheet is confirmed.
  normal_minutes integer,
  overtime_minutes integer,
  overtime2_minutes integer,
  primary key (sheet_id, day)
);

comment on table public.hour_sheet_days is 'One working day of an hours sheet.';

alter table public.hour_sheets enable row level security;
alter table public.hour_sheet_days enable row level security;
revoke all on public.hour_sheets, public.hour_sheet_days from anon, authenticated;
-- Written only through the functions below.
grant select on public.hour_sheets, public.hour_sheet_days to authenticated;

create policy "Employees read their own sheets; the owner, admins and the accountant read all"
  on public.hour_sheets for select
  to authenticated
  using (
    (user_id = (select auth.uid()) and (select private.is_member(organization_id)))
    or (select private.has_role(organization_id, array['accountant']::public.member_role[]))
    or ((select private.has_role(organization_id, array['owner', 'admin']::public.member_role[])) and (select private.second_step_done()))
  );

create policy "Days are read with their sheet"
  on public.hour_sheet_days for select
  to authenticated
  using (exists (select 1 from public.hour_sheets s where s.id = sheet_id));

-- The minutes of one day between start and end (past midnight when the end is
-- not after the start), less the break.
create function private.day_minutes(starts time, ends time, break_minutes integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (extract(epoch from (ends - starts + case when ends <= starts then interval '24 hours' else interval '0' end)) / 60)::integer - break_minutes;
$$;

-- A sheet of one's own that is still being filled in, locked for the change.
create function private.own_draft(sheet uuid)
returns public.hour_sheets
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.hour_sheets;
begin
  select * into s from public.hour_sheets where id = sheet and user_id = auth.uid() for update;
  if not found or not private.is_member(s.organization_id) then
    raise exception 'Only your own sheet' using errcode = '42501', hint = 'not_allowed';
  end if;
  if s.status <> 'draft' then
    raise exception 'The sheet is confirmed' using errcode = '55006', hint = 'sheet_locked';
  end if;
  return s;
end;
$$;

revoke all on function private.own_draft(uuid) from public;

-- Save the overtime rules and the accountant's e-mail. Owners and admins, with the second step.
create function public.save_hour_settings(
  org uuid,
  overtime_after integer,
  overtime_percent integer,
  overtime2_after integer default null,
  overtime2_percent integer default null,
  accountant_email text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  address text := nullif(lower(btrim(coalesce(accountant_email, ''))), '');
begin
  if not (private.has_role(org, array['owner', 'admin']::public.member_role[]) and private.second_step_done()) then
    raise exception 'Only the owner and admins change the overtime rules' using errcode = '42501', hint = 'not_allowed';
  end if;
  if overtime_after is null or overtime_after not between 60 and 1440 or overtime_percent is null or overtime_percent not between 1 and 300 then
    raise exception 'Overtime: from 1 to 24 hours, 1 to 300 %%' using errcode = '22023', hint = 'invalid_overtime';
  end if;
  if (overtime2_after is null) <> (overtime2_percent is null)
     or (overtime2_after is not null and (overtime2_after not between 60 and 1440 or overtime2_percent not between 1 and 300
         or overtime2_after <= overtime_after or overtime2_percent <= overtime_percent)) then
    raise exception 'The second level starts later and pays more' using errcode = '22023', hint = 'invalid_overtime2';
  end if;
  if address is not null and (char_length(address) > 254 or address !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'The e-mail address is not valid' using errcode = '22023', hint = 'invalid_email';
  end if;

  insert into public.hour_settings as h (organization_id, overtime_after, overtime_percent, overtime2_after, overtime2_percent, accountant_email)
  values (org, save_hour_settings.overtime_after, save_hour_settings.overtime_percent, save_hour_settings.overtime2_after,
          save_hour_settings.overtime2_percent, address)
  on conflict (organization_id) do update
  set overtime_after = excluded.overtime_after,
      overtime_percent = excluded.overtime_percent,
      overtime2_after = excluded.overtime2_after,
      overtime2_percent = excluded.overtime2_percent,
      accountant_email = excluded.accountant_email,
      updated_by = auth.uid(),
      updated_at = now();
end;
$$;

-- Start a sheet for a period of one's own (at most 62 days, not overlapping another).
create function public.create_hour_sheet(org uuid, period_from date, period_to date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not private.is_member(org) then
    raise exception 'Only members keep hours sheets' using errcode = '42501', hint = 'not_allowed';
  end if;
  if period_from is null or period_to is null or period_to < period_from or period_to - period_from >= 62 then
    raise exception 'Choose a period of at most 62 days' using errcode = '22023', hint = 'invalid_period';
  end if;
  -- One at a time per person, so two sheets never cover the same day.
  perform 1 from public.memberships m where m.organization_id = org and m.user_id = auth.uid() for update;
  if exists (
    select 1 from public.hour_sheets s
    where s.organization_id = org and s.user_id = auth.uid()
      and s.period_from <= create_hour_sheet.period_to and s.period_to >= create_hour_sheet.period_from
  ) then
    raise exception 'Another sheet covers these days' using errcode = '23P01', hint = 'overlap';
  end if;
  insert into public.hour_sheets (organization_id, user_id, period_from, period_to)
  values (org, auth.uid(), create_hour_sheet.period_from, create_hour_sheet.period_to)
  returning id into new_id;
  return new_id;
end;
$$;

-- Write one day (again, if it is there). Only on one's own sheet, before it is confirmed.
create function public.save_hour_sheet_day(sheet uuid, day date, starts time, ends time, break_minutes integer default 0, note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.hour_sheets := private.own_draft(sheet);
  clean_note text := nullif(btrim(regexp_replace(coalesce(note, ''), '\s+', ' ', 'g')), '');
  minutes integer;
begin
  if day is null or day not between s.period_from and s.period_to then
    raise exception 'The day is not in the sheet''s period' using errcode = '22023', hint = 'invalid_day';
  end if;
  if starts is null or ends is null or starts <> date_trunc('minute', starts) or ends <> date_trunc('minute', ends) or starts = ends then
    raise exception 'Write when the work started and ended' using errcode = '22023', hint = 'invalid_time';
  end if;
  if break_minutes is null or break_minutes < 0 then
    raise exception 'The break is not valid' using errcode = '22023', hint = 'invalid_break';
  end if;
  minutes := private.day_minutes(starts, ends, break_minutes);
  if minutes < 1 or break_minutes > 600 then
    raise exception 'The break is longer than the work' using errcode = '22023', hint = 'invalid_break';
  end if;
  if char_length(clean_note) > 200 then
    raise exception 'The note is too long' using errcode = '22023', hint = 'invalid_note';
  end if;

  insert into public.hour_sheet_days as d (sheet_id, organization_id, day, starts, ends, break_minutes, note, worked_minutes)
  values (s.id, s.organization_id, save_hour_sheet_day.day, save_hour_sheet_day.starts, save_hour_sheet_day.ends,
          save_hour_sheet_day.break_minutes, clean_note, minutes)
  on conflict on constraint hour_sheet_days_pkey do update
  set starts = excluded.starts, ends = excluded.ends, break_minutes = excluded.break_minutes,
      note = excluded.note, worked_minutes = excluded.worked_minutes;
end;
$$;

create function public.remove_hour_sheet_day(sheet uuid, day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.hour_sheets := private.own_draft(sheet);
begin
  delete from public.hour_sheet_days d where d.sheet_id = s.id and d.day = remove_hour_sheet_day.day;
end;
$$;

-- A sheet started for the wrong period can be thrown away before it is confirmed.
create function public.delete_hour_sheet(sheet uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.hour_sheets := private.own_draft(sheet);
begin
  delete from public.hour_sheets where id = s.id;
end;
$$;

-- Confirm a sheet: each day is split by the company's overtime rules (the
-- defaults when none are saved), and the sheet is locked. Returns the
-- accountant's e-mail address, or null when none is saved.
create function public.submit_hour_sheet(sheet uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.hour_sheets := private.own_draft(sheet);
  rules public.hour_settings;
  after1 integer;
  after2 integer;
  name text;
begin
  if not exists (select 1 from public.hour_sheet_days d where d.sheet_id = s.id) then
    raise exception 'Write at least one day' using errcode = '22023', hint = 'empty_sheet';
  end if;
  select * into rules from public.hour_settings h where h.organization_id = s.organization_id;
  after1 := coalesce(rules.overtime_after, 480);
  after2 := rules.overtime2_after;
  select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') into name from public.profiles p where p.id = s.user_id;
  if name is null then
    select u.email into name from auth.users u where u.id = s.user_id;
  end if;

  update public.hour_sheet_days d
  set normal_minutes = least(d.worked_minutes, after1),
      overtime_minutes = greatest(0, least(d.worked_minutes, coalesce(after2, d.worked_minutes)) - after1),
      overtime2_minutes = case when after2 is null then 0 else greatest(0, d.worked_minutes - after2) end
  where d.sheet_id = s.id;

  update public.hour_sheets h
  set status = 'submitted',
      submitted_at = now(),
      employee_name = name,
      overtime_after = after1,
      overtime_percent = coalesce(rules.overtime_percent, 50),
      overtime2_after = after2,
      overtime2_percent = rules.overtime2_percent,
      (worked_minutes, normal_minutes, overtime_minutes, overtime2_minutes) = (
        select sum(d.worked_minutes), sum(d.normal_minutes), sum(d.overtime_minutes), sum(d.overtime2_minutes)
        from public.hour_sheet_days d where d.sheet_id = s.id
      )
  where h.id = s.id;

  return rules.accountant_email;
end;
$$;

-- Record the e-mail of a confirmed sheet to the accountant: sent (with the
-- e-mail service's id), failed, or none (no address). A failed one can be tried again.
create function public.record_hour_sheet_email(sheet uuid, to_email text, status text, provider_id text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if status is null or status not in ('sent', 'failed', 'none') then
    raise exception 'Unknown e-mail status' using errcode = '22023', hint = 'invalid_status';
  end if;
  update public.hour_sheets h
  set email_to = to_email,
      email_status = record_hour_sheet_email.status,
      email_provider_id = case when record_hour_sheet_email.status = 'sent' then left(provider_id, 200) end,
      emailed_at = now()
  where h.id = sheet and h.user_id = auth.uid() and h.status = 'submitted'
    and (h.email_status is distinct from 'sent');
  if not found then
    raise exception 'Only your own confirmed sheet, once sent' using errcode = '42501', hint = 'not_allowed';
  end if;
end;
$$;

revoke all on function public.save_hour_settings(uuid, integer, integer, integer, integer, text) from public, anon;
revoke all on function public.create_hour_sheet(uuid, date, date) from public, anon;
revoke all on function public.save_hour_sheet_day(uuid, date, time, time, integer, text) from public, anon;
revoke all on function public.remove_hour_sheet_day(uuid, date) from public, anon;
revoke all on function public.delete_hour_sheet(uuid) from public, anon;
revoke all on function public.submit_hour_sheet(uuid) from public, anon;
revoke all on function public.record_hour_sheet_email(uuid, text, text, text) from public, anon;
grant execute on function public.save_hour_settings(uuid, integer, integer, integer, integer, text) to authenticated;
grant execute on function public.create_hour_sheet(uuid, date, date) to authenticated;
grant execute on function public.save_hour_sheet_day(uuid, date, time, time, integer, text) to authenticated;
grant execute on function public.remove_hour_sheet_day(uuid, date) to authenticated;
grant execute on function public.delete_hour_sheet(uuid) to authenticated;
grant execute on function public.submit_hour_sheet(uuid) to authenticated;
grant execute on function public.record_hour_sheet_email(uuid, text, text, text) to authenticated;
