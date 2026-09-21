-- New stores get a one-time 30-day free trial subscription automatically
-- (spec: "التاجر الجديد يحصل على شهر مجاني ترحيبي كامل"). The trial plan
-- is flagged is_trial so it never appears in the seller-facing "choose a
-- plan" list (is_active stays false -- it's granted, not purchasable) and
-- existing sellers' subscriptions are untouched (trigger only fires on
-- INSERT of a new store).

alter table public.subscription_plans add column is_trial boolean not null default false;

insert into public.subscription_plans (name, duration_days, price, is_active, is_trial)
values ('تجربة مجانية', 30, 0, false, true);

create or replace function public.grant_seller_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trial_plan_id uuid;
begin
  select id into v_trial_plan_id from public.subscription_plans where is_trial = true limit 1;
  if v_trial_plan_id is not null then
    insert into public.seller_subscriptions (store_id, plan_id, status, started_at, expires_at)
    values (new.id, v_trial_plan_id, 'active', now(), now() + interval '30 days');
  end if;
  return new;
end;
$$;

revoke execute on function public.grant_seller_trial() from public, anon, authenticated;

create trigger stores_grant_trial
  after insert on public.stores
  for each row execute function public.grant_seller_trial();
