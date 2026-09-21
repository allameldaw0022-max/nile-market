-- Approving a subscription request marks it approved AND grants/extends the
-- store's subscription atomically, so a request can never be left
-- "approved" with no matching subscription (or vice versa) if something
-- fails partway. security invoker: relies on the caller already holding
-- admin RLS access to both tables (enforced independently, so this adds no
-- privilege beyond what an admin already has).
create or replace function public.approve_subscription_request(p_request_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_request public.subscription_requests%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_existing public.seller_subscriptions%rowtype;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'admin only';
  end if;

  select * into v_request from public.subscription_requests where id = p_request_id for update;
  if not found then
    raise exception 'subscription request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'subscription request already reviewed';
  end if;

  select * into v_plan from public.subscription_plans where id = v_request.plan_id;

  select * into v_existing from public.seller_subscriptions where store_id = v_request.store_id;

  if found then
    update public.seller_subscriptions
    set plan_id = v_request.plan_id,
        status = 'active',
        started_at = now(),
        expires_at = greatest(v_existing.expires_at, now()) + make_interval(days => v_plan.duration_days)
    where store_id = v_request.store_id;
  else
    insert into public.seller_subscriptions (store_id, plan_id, status, started_at, expires_at)
    values (v_request.store_id, v_request.plan_id, 'active', now(), now() + make_interval(days => v_plan.duration_days));
  end if;

  update public.subscription_requests
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request_id;
end;
$$;

revoke execute on function public.approve_subscription_request(uuid) from public, anon;
grant execute on function public.approve_subscription_request(uuid) to authenticated;
