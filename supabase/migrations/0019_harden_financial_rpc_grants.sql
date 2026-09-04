-- These RPCs already refuse unauthorized callers internally (ownership /
-- admin-role checks raise an exception), but Postgres grants EXECUTE to
-- PUBLIC by default on function creation, which includes the anonymous
-- role. Anonymous users have no legitimate reason to call any of these,
-- so tighten the grant to authenticated only -- reduces attack surface
-- and noise, doesn't change behavior for real users.
revoke execute on function public.request_withdrawal(public.wallet_owner_type, uuid, numeric, uuid, text) from public;
revoke execute on function public.reject_withdrawal_request(uuid) from public;
revoke execute on function public.mark_withdrawal_paid(uuid, text) from public;

grant execute on function public.request_withdrawal(public.wallet_owner_type, uuid, numeric, uuid, text) to authenticated;
grant execute on function public.reject_withdrawal_request(uuid) to authenticated;
grant execute on function public.mark_withdrawal_paid(uuid, text) to authenticated;
