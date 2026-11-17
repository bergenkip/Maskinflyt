-- Stage 13a, part 2: overtime by the time of day.
--
-- Until now overtime started after a number of hours worked in a day. Many
-- companies count it by the clock instead: say from 15:00 to 19:00 +50 %, and
-- from 19:00 to 06:00 +100 %. A company now chooses one of the two ways:
--   daily:  after N hours a day (+ an optional, later and higher level), as before
--   clock:  the minutes inside a time window (+ an optional second window that
--           pays more; where the two overlap, the second wins)
-- With the clock, the break is taken from the normal minutes first, then from
-- the first level, then from the second. A confirmed sheet keeps the rules it
-- was confirmed with, so the PDF and the screens can tell them.

alter table public.hour_settings
  add column overtime_mode text not null default 'daily' check (overtime_mode in ('daily', 'clock')),
  add column overtime_from time check (overtime_from = date_trunc('minute', overtime_from)),
  add column overtime_to time check (overtime_to = date_trunc('minute', overtime_to)),
  add column overtime2_from time check (overtime2_from = date_trunc('minute', overtime2_from)),
  add column overtime2_to time check (overtime2_to = date_trunc('minute', overtime2_to)),
  drop constraint hour_settings_check,
  drop constraint hour_settings_check1,
  add constraint hour_settings_daily_levels check (
    overtime_mode <> 'daily' or (
      overtime_from is null and overtime_to is null and overtime2_from is null and overtime2_to is null
      and (overtime2_after is null) = (overtime2_percent is null)
      and (overtime2_after is null or (overtime2_after > overtime_after and overtime2_percent > overtime_percent))
    )
  ),
  add constraint hour_settings_clock_windows check (
    overtime_mode <> 'clock' or (
      overtime_from is not null and overtime_to is not null and overtime_from <> overtime_to
      and overtime2_after is null
      and (overtime2_from is null) = (overtime2_to is null)
      and (overtime2_from is null) = (overtime2_percent is null)
      and (overtime2_from is null or (overtime2_from <> overtime2_to and overtime2_percent > overtime_percent))
    )
  );

alter table public.hour_sheets
  add column overtime_mode text check (overtime_mode in ('daily', 'clock')),
  add column overtime_from time,
  add column overtime_to time,
  add column overtime2_from time,
  add column overtime2_to time;

-- Sheets confirmed before this change were counted per day.
update public.hour_sheets set overtime_mode = 'daily' where status = 'submitted';

-- Whether a minute of the day (0–1439) is inside a window; a window whose end
-- is not after its start runs past midnight.
create function private.in_window(minute integer, starts time, ends time)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when starts is null or ends is null then false
    when starts < ends then minute >= extract(hour from starts) * 60 + extract(minute from starts)
                        and minute < extract(hour from ends) * 60 + extract(minute from ends)
    else minute >= extract(hour from starts) * 60 + extract(minute from starts)
      or minute < extract(hour from ends) * 60 + extract(minute from ends)
  end;
$$;

-- One day's worked minutes split into normal, the first and the second level
-- (the same as splitDay in src/lib/hours.ts).
create function private.split_day(
  mode text, starts time, ends time, break_minutes integer, worked integer,
  after1 integer, after2 integer, from1 time, to1 time, from2 time, to2 time,
  out normal integer, out overtime integer, out overtime2 integer
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  s integer;
  e integer;
  rest integer := break_minutes;
  take integer;
begin
  if mode = 'clock' then
    s := extract(hour from starts) * 60 + extract(minute from starts);
    e := extract(hour from ends) * 60 + extract(minute from ends);
    if e <= s then
      e := e + 1440;
    end if;
    select count(*) filter (where level = 0), count(*) filter (where level = 1), count(*) filter (where level = 2)
    into normal, overtime, overtime2
    from (
      select case
        when private.in_window(m % 1440, from2, to2) then 2
        when private.in_window(m % 1440, from1, to1) then 1
        else 0
      end as level
      from generate_series(s, e - 1) as m
    ) minutes;
    take := least(rest, normal);
    normal := normal - take;
    rest := rest - take;
    take := least(rest, overtime);
    overtime := overtime - take;
    rest := rest - take;
    overtime2 := overtime2 - rest;
  else
    normal := least(worked, after1);
    overtime := greatest(0, least(worked, coalesce(after2, worked)) - after1);
    overtime2 := case when after2 is null then 0 else greatest(0, worked - after2) end;
  end if;
end;
$$;

drop function public.save_hour_settings(uuid, integer, integer, integer, integer, text);

-- Save the overtime rules and the accountant's e-mail. Owners and admins, with the second step.
create function public.save_hour_settings(
  org uuid,
  overtime_percent integer,
  overtime_mode text default 'daily',
  overtime_after integer default null,
  overtime2_after integer default null,
  overtime2_percent integer default null,
  overtime_from time default null,
  overtime_to time default null,
  overtime2_from time default null,
  overtime2_to time default null,
  accountant_email text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  address text := nullif(lower(btrim(coalesce(accountant_email, ''))), '');
  clock boolean := overtime_mode = 'clock';
  after1 integer := overtime_after;
begin
  if not (private.has_role(org, array['owner', 'admin']::public.member_role[]) and private.second_step_done()) then
    raise exception 'Only the owner and admins change the overtime rules' using errcode = '42501', hint = 'not_allowed';
  end if;
  if overtime_mode is null or overtime_mode not in ('daily', 'clock') then
    raise exception 'Choose how overtime is counted' using errcode = '22023', hint = 'invalid_mode';
  end if;
  if overtime_percent is null or overtime_percent not between 1 and 300 then
    raise exception 'Overtime pays 1 to 300 %% more' using errcode = '22023', hint = 'invalid_overtime';
  end if;
  if clock then
    -- The hours a day are kept for when the company switches back.
    select coalesce(h.overtime_after, 480) into after1 from public.hour_settings h where h.organization_id = org;
    after1 := coalesce(after1, 480);
    if overtime_from is null or overtime_to is null or overtime_from = overtime_to
       or overtime_from <> date_trunc('minute', overtime_from) or overtime_to <> date_trunc('minute', overtime_to) then
      raise exception 'Write when overtime starts and ends' using errcode = '22023', hint = 'invalid_window';
    end if;
    if (overtime2_from is null) <> (overtime2_to is null) or (overtime2_from is null) <> (overtime2_percent is null)
       or (overtime2_from is not null and (overtime2_from = overtime2_to or overtime2_percent not between 1 and 300
           or overtime2_percent <= overtime_percent
           or overtime2_from <> date_trunc('minute', overtime2_from) or overtime2_to <> date_trunc('minute', overtime2_to))) then
      raise exception 'The second window pays more' using errcode = '22023', hint = 'invalid_window2';
    end if;
  else
    if after1 is null or after1 not between 60 and 1440 then
      raise exception 'Overtime: from 1 to 24 hours' using errcode = '22023', hint = 'invalid_overtime';
    end if;
    if (overtime2_after is null) <> (overtime2_percent is null)
       or (overtime2_after is not null and (overtime2_after not between 60 and 1440 or overtime2_percent not between 1 and 300
           or overtime2_after <= after1 or overtime2_percent <= overtime_percent)) then
      raise exception 'The second level starts later and pays more' using errcode = '22023', hint = 'invalid_overtime2';
    end if;
  end if;
  if address is not null and (char_length(address) > 254 or address !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'The e-mail address is not valid' using errcode = '22023', hint = 'invalid_email';
  end if;

  insert into public.hour_settings as h (
    organization_id, overtime_mode, overtime_after, overtime_percent, overtime2_after, overtime2_percent,
    overtime_from, overtime_to, overtime2_from, overtime2_to, accountant_email
  )
  values (
    org, save_hour_settings.overtime_mode, after1, save_hour_settings.overtime_percent,
    case when clock then null else save_hour_settings.overtime2_after end,
    save_hour_settings.overtime2_percent,
    case when clock then save_hour_settings.overtime_from end,
    case when clock then save_hour_settings.overtime_to end,
    case when clock then save_hour_settings.overtime2_from end,
    case when clock then save_hour_settings.overtime2_to end,
    address
  )
  on conflict (organization_id) do update
  set overtime_mode = excluded.overtime_mode,
      overtime_after = excluded.overtime_after,
      overtime_percent = excluded.overtime_percent,
      overtime2_after = excluded.overtime2_after,
      overtime2_percent = excluded.overtime2_percent,
      overtime_from = excluded.overtime_from,
      overtime_to = excluded.overtime_to,
      overtime2_from = excluded.overtime2_from,
      overtime2_to = excluded.overtime2_to,
      accountant_email = excluded.accountant_email,
      updated_by = auth.uid(),
      updated_at = now();
end;
$$;

-- Confirm a sheet: each day is split by the company's overtime rules (the
-- defaults when none are saved), and the sheet is locked. Returns the
-- accountant's e-mail address, or null when none is saved.
create or replace function public.submit_hour_sheet(sheet uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.hour_sheets := private.own_draft(sheet);
  rules public.hour_settings;
  mode text;
  after1 integer;
  name text;
begin
  if not exists (select 1 from public.hour_sheet_days d where d.sheet_id = s.id) then
    raise exception 'Write at least one day' using errcode = '22023', hint = 'empty_sheet';
  end if;
  select * into rules from public.hour_settings h where h.organization_id = s.organization_id;
  mode := coalesce(rules.overtime_mode, 'daily');
  after1 := coalesce(rules.overtime_after, 480);
  select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') into name from public.profiles p where p.id = s.user_id;
  if name is null then
    select u.email into name from auth.users u where u.id = s.user_id;
  end if;

  update public.hour_sheet_days d
  set (normal_minutes, overtime_minutes, overtime2_minutes) = (
    select x.normal, x.overtime, x.overtime2
    from private.split_day(mode, d.starts, d.ends, d.break_minutes, d.worked_minutes, after1, rules.overtime2_after,
                           rules.overtime_from, rules.overtime_to, rules.overtime2_from, rules.overtime2_to) x
  )
  where d.sheet_id = s.id;

  update public.hour_sheets h
  set status = 'submitted',
      submitted_at = now(),
      employee_name = name,
      overtime_mode = mode,
      overtime_after = after1,
      overtime_percent = coalesce(rules.overtime_percent, 50),
      overtime2_after = rules.overtime2_after,
      overtime2_percent = rules.overtime2_percent,
      overtime_from = rules.overtime_from,
      overtime_to = rules.overtime_to,
      overtime2_from = rules.overtime2_from,
      overtime2_to = rules.overtime2_to,
      (worked_minutes, normal_minutes, overtime_minutes, overtime2_minutes) = (
        select sum(d.worked_minutes), sum(d.normal_minutes), sum(d.overtime_minutes), sum(d.overtime2_minutes)
        from public.hour_sheet_days d where d.sheet_id = s.id
      )
  where h.id = s.id;

  return rules.accountant_email;
end;
$$;

revoke all on function private.in_window(integer, time, time) from public;
revoke all on function private.split_day(text, time, time, integer, integer, integer, integer, time, time, time, time) from public;
revoke all on function public.save_hour_settings(uuid, integer, text, integer, integer, integer, time, time, time, time, text) from public, anon;
grant execute on function public.save_hour_settings(uuid, integer, text, integer, integer, integer, time, time, time, time, text) to authenticated;
