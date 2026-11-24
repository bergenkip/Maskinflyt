-- Stage 15b, part 2: the office answers a request from the company page.
-- Accepting adds the customer (or finds the one already there by phone or
-- e-mail) so the job can be planned; declining closes it. Either way the
-- customer may get a short message. Nothing is planned or confirmed by itself:
-- the job is still made by a person, in the job form.

alter table public.job_requests
  add column answer text check (char_length(answer) between 1 and 1000),
  add column customer_id uuid references public.customers (id) on delete set null;

-- Answer a request once. Returns what the e-mail to the customer needs.
create function public.answer_job_request(request uuid, accept boolean, answer_text text default null)
returns table (customer_id uuid, email text, locale text, name text, place text, wanted_date date, company text, page_email text, page_phone text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.job_requests;
  clean_answer text := nullif(btrim(regexp_replace(coalesce(answer_text, ''), '\r\n?', E'\n', 'g')), '');
  found_customer uuid;
begin
  select * into r from public.job_requests jr where jr.id = request for update;
  -- The same answer for a request that does not exist and one of another company.
  if not found or not private.has_role(r.organization_id, array['owner', 'admin', 'dispatcher']::public.member_role[]) then
    raise exception 'Request not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  -- As for adding customers: owners and admins with the second step, dispatchers by their role.
  if not private.has_role(r.organization_id, array['dispatcher']::public.member_role[]) then
    perform private.require_mfa();
  end if;
  if r.status <> 'new' then
    raise exception 'The request is already answered' using errcode = '55000', hint = 'already_answered';
  end if;
  if clean_answer is not null and char_length(clean_answer) > 1000 then
    raise exception 'The message is too long' using errcode = '22023', hint = 'answer_too_long';
  end if;

  if accept then
    -- A customer the company already has, by phone or e-mail; otherwise a new private customer.
    select c.id into found_customer
    from public.customers c
    where c.organization_id = r.organization_id
      and c.active
      and ((r.phone is not null and c.phone = r.phone) or (r.email is not null and c.email = r.email))
    order by c.created_at
    limit 1;
    if found_customer is null then
      insert into public.customers (organization_id, kind, name, phone, email)
      values (r.organization_id, 'private', r.name, r.phone, r.email)
      returning id into found_customer;
    end if;
  end if;

  update public.job_requests jr
  set status = case when accept then 'accepted' else 'declined' end,
      answer = clean_answer,
      customer_id = found_customer,
      handled_by = (select auth.uid()),
      handled_at = now()
  where jr.id = r.id;

  return query
    select found_customer, r.email, r.locale, r.name, r.place, r.wanted_date, o.name, p.email, p.phone
    from public.organizations o
    left join public.company_pages p on p.organization_id = o.id
    where o.id = r.organization_id;
end;
$$;

revoke all on function public.answer_job_request(uuid, boolean, text) from public;
grant execute on function public.answer_job_request(uuid, boolean, text) to authenticated;
