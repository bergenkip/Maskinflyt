-- Stage 8: the accountant role. Only the value here: it is used from the next
-- migration on (a new enum value cannot be used in the transaction that adds it).
alter type public.member_role add value if not exists 'accountant';
