-- More booking lengths (Li, 2026-11-25: "let them choose more varied lengths").
-- Before: 1, 2, 4 or 8 hours. Now: 30 min, 1, 1.5, 2, 3, 4, 5, 6, 8 (a full day) or 10 hours.

alter table public.company_pages drop constraint company_pages_slot_minutes_check;
alter table public.company_pages add constraint company_pages_slot_minutes_check
  check (slot_minutes in (30, 60, 90, 120, 180, 240, 300, 360, 480, 600));

create or replace function public.save_company_hours(org uuid, show_free_times boolean, booking_minutes integer, week jsonb, step_minutes integer default 30)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  day jsonb;
begin
  perform private.require_company_page_editor(org);
  if booking_minutes is null or booking_minutes not in (30, 60, 90, 120, 180, 240, 300, 360, 480, 600) then
    raise exception 'Invalid booking length' using errcode = '22023', hint = 'invalid_length';
  end if;
  if step_minutes is null or step_minutes not in (15, 30, 60) then
    raise exception 'Invalid time step' using errcode = '22023', hint = 'invalid_step';
  end if;
  if jsonb_typeof(coalesce(week, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(week, '[]'::jsonb)) > 7 then
    raise exception 'Invalid hours' using errcode = '22023', hint = 'invalid_hours';
  end if;

  delete from public.company_hours h where h.organization_id = org;
  begin
    for day in select * from jsonb_array_elements(coalesce(week, '[]'::jsonb)) loop
      insert into public.company_hours (organization_id, weekday, opens, closes)
      values (org, (day ->> 'weekday')::smallint, (day ->> 'opens')::time, (day ->> 'closes')::time);
    end loop;
  exception when check_violation or unique_violation or not_null_violation or invalid_datetime_format
    or datetime_field_overflow or invalid_text_representation then
    raise exception 'Invalid hours' using errcode = '22023', hint = 'invalid_hours';
  end;

  -- Free times need at least one open day.
  if show_free_times and not exists (select 1 from public.company_hours h where h.organization_id = org) then
    raise exception 'Open at least one day to show free times' using errcode = '22023', hint = 'no_hours';
  end if;

  update public.company_pages p
  set free_times = show_free_times, slot_minutes = booking_minutes, slot_step_minutes = step_minutes, updated_by = auth.uid(), updated_at = now()
  where p.organization_id = org;
end;
$$;
