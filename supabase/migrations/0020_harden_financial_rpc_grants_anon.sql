-- Follow-up to 0019: this project's default privileges auto-grant EXECUTE
-- directly to the anon role on function creation (not just via PUBLIC),
-- so "revoke ... from public" alone didn't strip it. Revoke from anon
-- explicitly.
revoke execute on function public.request_withdrawal(public.wallet_owner_type, uuid, numeric, uuid, text) from anon;
revoke execute on function public.reject_withdrawal_request(uuid) from anon;
revoke execute on function public.mark_withdrawal_paid(uuid, text) from anon;
