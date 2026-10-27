-- The session created by the sign-up confirmation link counts as a passed
-- second step (decided with Li 2026-10-27).
--
-- Opening that e-mailed link proves the person controls the address, exactly
-- like the second-step sign-in link. So a new owner who confirms the e-mail
-- and creates the company is not asked for another link straight away; the
-- next sign-in with a password asks again. Supabase Auth marks such a session
-- with the method "email/signup" in the JWT's amr list.

create or replace function private.second_step_done()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.jwt_claims() ->> 'aal' = 'aal2'
    or private.is_link_session()
    or exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(private.jwt_claims() -> 'amr') = 'array' then private.jwt_claims() -> 'amr' else '[]'::jsonb end
      ) as m
      where m ->> 'method' = 'email/signup'
    )
    or exists (
      select 1 from private.second_step_requests r
      where r.session_id = private.session_id()
        and r.user_id = (select auth.uid())
        and r.approved_at is not null
    ),
    false
  );
$$;
