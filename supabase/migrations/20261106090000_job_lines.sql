-- Stage 6: extra lines on a job and the invoice draft.
--
-- After the work, the office adds what the approved working time does not
-- cover: materials, travel, a ferry, extra services. Each line has a quantity,
-- a price per unit and the VAT rate (MVA). The invoice draft is the approved
-- working time plus these lines; it is only a draft: nothing is numbered,
-- sent or locked here, and the lines can be changed or removed freely.
--
-- Money is in øre (whole numbers, never floating point). A line's amount is
-- counted here, rounded to whole øre; the VAT is counted from the line amounts
-- per rate (see src/lib/invoice.ts).
--
-- Who may do what:
--   owner, admin (with the second step), dispatcher: read, add, change, remove
--   driver and everyone else:                        nothing (prices are the office's)

create table public.job_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  job_id uuid not null,
  description text not null check (char_length(btrim(description)) between 1 and 200),
  -- An exact decimal (numeric is not floating point): 2.5 tonnes, 0.75 hours.
  quantity numeric(9, 2) not null check (quantity > 0 and quantity <= 100000),
  -- "t", "km", "stk"; written as the office likes.
  unit text check (char_length(btrim(unit)) between 1 and 20),
  unit_price integer not null check (unit_price >= 0 and unit_price <= 10000000),
  vat_rate smallint not null default 25 check (vat_rate in (0, 12, 15, 25)),
  amount integer generated always as (round(quantity * unit_price)::integer) stored,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- At most 1 000 000 kr per line, so sums stay far from integer limits.
  check (quantity * unit_price <= 100000000),
  foreign key (job_id, organization_id) references public.jobs (id, organization_id) on delete cascade
);

comment on table public.job_lines is 'Extra lines of a job for the invoice draft: materials, travel, services. Amounts in øre.';

create index job_lines_job_created_idx on public.job_lines (job_id, created_at);
create index job_lines_organization_idx on public.job_lines (organization_id);

create trigger job_lines_touch_updated_at
  before update on public.job_lines
  for each row execute function private.touch_updated_at();

-- A cancelled job is not invoiced: its lines stay as they are.
create function private.check_job_line()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target uuid := case when tg_op = 'DELETE' then old.job_id else new.job_id end;
begin
  if exists (select 1 from public.jobs j where j.id = target and j.status = 'cancelled') then
    raise exception 'A cancelled job has no invoice lines' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger job_lines_check
  before insert or update or delete on public.job_lines
  for each row execute function private.check_job_line();

alter table public.job_lines enable row level security;
revoke all on public.job_lines from anon, authenticated;
-- The amount, the company, the job and the timestamps are never set from the browser after adding.
grant select, delete on public.job_lines to authenticated;
grant insert (organization_id, job_id, description, quantity, unit, unit_price, vat_rate) on public.job_lines to authenticated;
grant update (description, quantity, unit, unit_price, vat_rate) on public.job_lines to authenticated;

create policy "The office can read job lines"
  on public.job_lines for select
  to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[])));

create policy "The office can add job lines"
  on public.job_lines for insert
  to authenticated
  with check ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[])));

create policy "The office can change job lines"
  on public.job_lines for update
  to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[])))
  with check ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[])));

create policy "The office can remove job lines"
  on public.job_lines for delete
  to authenticated
  using ((select private.has_role(organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[])));

-- As for jobs: owners and admins confirm their sign-in with the second step.
create policy "Adding job lines needs two-step sign-in for owners and admins"
  on public.job_lines as restrictive for insert
  to authenticated
  with check ((select private.second_step_done()) or (select private.has_role(organization_id, array['dispatcher']::public.member_role[])));

create policy "Changing job lines needs two-step sign-in for owners and admins"
  on public.job_lines as restrictive for update
  to authenticated
  using ((select private.second_step_done()) or (select private.has_role(organization_id, array['dispatcher']::public.member_role[])));

create policy "Removing job lines needs two-step sign-in for owners and admins"
  on public.job_lines as restrictive for delete
  to authenticated
  using ((select private.second_step_done()) or (select private.has_role(organization_id, array['dispatcher']::public.member_role[])));

-- The invoice draft's lines: the latest approved working time (at the usual
-- rate, and at the higher rate when there is one), then the extra lines in the
-- order they were added. Runs with the caller's rights, so RLS decides what is
-- seen: for anyone but the office it returns nothing.
-- The time lines add up to the approved amount exactly: the higher-rate line is
-- rounded, the usual line takes the rest.
create function public.invoice_draft(job uuid)
returns table (
  kind text, line_id uuid, description text, quantity numeric, unit text, unit_price integer, vat_rate smallint, amount integer
)
language sql
stable
set search_path = ''
as $$
  with t as (
    select jt.* from public.job_times jt
    where jt.job_id = invoice_draft.job
    order by jt.created_at desc
    limit 1
  ),
  priced as (
    select t.*,
      case when t.evening_minutes > 0 then round(t.evening_minutes::numeric * t.evening_rate / 60)::integer else 0 end as evening_amount
    from t
    where t.amount is not null
  )
  select kind, line_id, description, quantity, unit, unit_price, vat_rate, amount from (
    select 'time'::text, null::uuid, null::text, round((p.billed_minutes - p.evening_minutes)::numeric / 60, 2), null::text,
           p.hourly_rate, 25::smallint, p.amount - p.evening_amount, 1 as sort, null::timestamptz as added
    from priced p
    where p.billed_minutes > p.evening_minutes
    union all
    select 'evening', null, null, round(p.evening_minutes::numeric / 60, 2), null, p.evening_rate, 25::smallint, p.evening_amount, 2, null
    from priced p
    where p.evening_minutes > 0
    union all
    select 'line', l.id, l.description, l.quantity, l.unit, l.unit_price, l.vat_rate, l.amount, 3, l.created_at
    from public.job_lines l
    where l.job_id = invoice_draft.job
  ) lines (kind, line_id, description, quantity, unit, unit_price, vat_rate, amount, sort, added)
  order by sort, added;
$$;

revoke all on function public.invoice_draft(uuid) from public, anon;
grant execute on function public.invoice_draft(uuid) to authenticated;
