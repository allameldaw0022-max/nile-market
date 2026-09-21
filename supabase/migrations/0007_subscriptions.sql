-- =====================================================================
-- 0007 Subscriptions & Entitlements Engine
--
-- D15: لا Trial · Free باقة دائمة
-- D16: Grace = 7 أيام · تنبيه Expiring قبل 7 أيام
-- D17: تجديد يدوي بإثبات دفع · لا Auto-renewal
-- D18: لا أسعار ولا حدود مخترعة — configured_at يميّز «بلا حد بقرار»
--      عن «لم يُضبط بعد»
-- D31: بوابة الإطلاق التجاري
-- D14: انتهاء الاشتراك ⇒ المتجر مرئي والشراء معطّل، بلا حذف أي بيانات
-- =====================================================================

create type public.subscription_status as enum (
  'trialing','active','expiring','grace','expired','suspended','cancelled'
);

create type public.billing_period as enum ('monthly','yearly');

create type public.subscription_event_kind as enum (
  'created','activated','renewed','upgraded','downgraded','expiring_warned',
  'entered_grace','expired','suspended','reactivated','cancelled'
);

create type public.request_status as enum ('pending','approved','rejected');

-- ---------------------------------------------------------------------
-- platform_settings — صف واحد
-- ---------------------------------------------------------------------
create table public.platform_settings (
  id                        boolean primary key default true check (id),
  maintenance_mode          boolean not null default false,
  maintenance_message       text,
  commercial_launch_enabled boolean not null default false,   -- D31
  default_partner_rate      numeric(5,2) not null default 50.00
                              check (default_partner_rate between 0 and 100),
  grace_period_days         integer not null default 7  check (grace_period_days >= 0),
  expiring_warning_days     integer not null default 7  check (expiring_warning_days >= 0),
  auto_renew_enabled        boolean not null default false,   -- D17
  min_payout_amount         numeric(14,2),                    -- D25: null = لا حد
  slug_reservation_months   integer not null default 12,      -- D27/D33
  sod_enabled               jsonb not null default '{}'::jsonb, -- D23
  retention_days_personal   integer not null default 30,      -- D26
  retention_months_tickets  integer not null default 24,      -- D26
  support_email             text,
  updated_by                uuid references public.profiles (id),
  updated_at                timestamptz not null default now()
);

insert into public.platform_settings (id) values (true);

alter table public.platform_settings enable row level security;

create policy platform_settings_read on public.platform_settings
  for select to authenticated using (app.is_platform_staff());

create policy platform_settings_write on public.platform_settings
  for update to authenticated
  using (app.has_platform_permission('settings','manage'))
  with check (app.has_platform_permission('settings','manage'));

-- ---------------------------------------------------------------------
-- plans — D18: تُنشأ بأسمائها فقط، والأسعار تُضبط من Admin
-- ---------------------------------------------------------------------
create table public.plans (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name           text not null,
  description    text,
  price          numeric(14,2) not null default 0 check (price >= 0),
  currency       char(3) not null default 'SDG',
  billing_period public.billing_period not null default 'monthly',
  duration_days  integer not null default 30 check (duration_days > 0),
  is_public      boolean not null default true,
  is_active      boolean not null default true,
  is_free        boolean not null default false,
  price_configured_at timestamptz,        -- D31: هل ضُبط السعر صراحةً؟
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger plans_set_updated_at before update on public.plans
  for each row execute function app.set_updated_at();

alter table public.plans enable row level security;

-- الباقات الثلاث المعتمدة (D15). لا أسعار ولا حدود مخترعة (D18).
insert into public.plans (code, name, is_free, sort_order, price_configured_at) values
  ('free',  'مجانية',   true,  1, now()),   -- السعر 0 بحكم كونها مجانية
  ('basic', 'أساسية',   false, 2, null),    -- بانتظار ضبط Admin
  ('pro',   'احترافية', false, 3, null);

-- ---------------------------------------------------------------------
-- plan_entitlements — configured_at يميّز القرار عن الإهمال (D18/D31)
-- ---------------------------------------------------------------------
create table public.plan_entitlements (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.plans (id) on delete cascade,
  feature_key   text not null,
  limit_value   integer check (limit_value >= 0),  -- null + configured ⇒ بلا حد
  bool_value    boolean,
  configured_at timestamptz,                        -- null ⇒ لم يُضبط بعد
  updated_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (plan_id, feature_key)
);

create trigger plan_entitlements_set_updated_at before update on public.plan_entitlements
  for each row execute function app.set_updated_at();

alter table public.plan_entitlements enable row level security;

-- مفاتيح الميزات المعتمدة — تُنشأ لكل باقة بحالة «غير مضبوطة»
insert into public.plan_entitlements (plan_id, feature_key)
select p.id, k.key
from public.plans p
cross join (values
  ('products.max'),('employees.max'),('storage.mb'),
  ('coupons.max_active'),('promotions.max_active'),('orders.monthly_max'),
  ('custom_domain.enabled'),('analytics.advanced'),
  ('import_export.enabled'),('variants.enabled'),('whatsapp.enabled')
) as k(key);

-- ---------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------
create table public.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null references public.stores (id) on delete cascade,
  plan_id            uuid not null references public.plans (id) on delete restrict,
  status             public.subscription_status not null default 'active',
  started_at         timestamptz not null default now(),
  current_period_end timestamptz,        -- null للباقة المجانية الدائمة
  grace_ends_at      timestamptz,
  expiring_warned_at timestamptz,
  cancel_requested_at timestamptz,
  previous_plan_id   uuid references public.plans (id),
  auto_renew         boolean not null default false,   -- D17
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index subscriptions_active_per_store
  on public.subscriptions (store_id) where status <> 'cancelled';
create index subscriptions_status_idx on public.subscriptions (status, current_period_end);

create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function app.set_updated_at();
create trigger subscriptions_freeze_store before update on public.subscriptions
  for each row execute function app.freeze_store_id();

alter table public.subscriptions enable row level security;

-- ---------------------------------------------------------------------
-- subscription_events — إلحاقي
-- ---------------------------------------------------------------------
create table public.subscription_events (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  store_id        uuid not null references public.stores (id) on delete cascade,
  event           public.subscription_event_kind not null,
  from_plan_id    uuid references public.plans (id),
  to_plan_id      uuid references public.plans (id),
  payment_id      uuid,                       -- FK في 0009
  actor_id        uuid references public.profiles (id) on delete set null,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index subscription_events_sub_idx
  on public.subscription_events (subscription_id, created_at desc);

create trigger subscription_events_no_update before update on public.subscription_events
  for each row execute function app.block_mutation();
create trigger subscription_events_no_delete before delete on public.subscription_events
  for each row execute function app.block_mutation();

alter table public.subscription_events enable row level security;

-- ---------------------------------------------------------------------
-- subscription_requests — تدفق التجديد اليدوي (D17)
-- ---------------------------------------------------------------------
create table public.subscription_requests (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores (id) on delete cascade,
  plan_id          uuid not null references public.plans (id) on delete restrict,
  amount           numeric(14,2) not null check (amount >= 0),
  discount_amount  numeric(14,2) not null default 0 check (discount_amount >= 0),
  net_amount       numeric(14,2) not null check (net_amount >= 0),
  coupon_code      text,
  reference        text,
  proof_media_id   uuid references public.media_files (id) on delete set null,
  status           public.request_status not null default 'pending',
  reviewed_by      uuid references public.profiles (id),
  reviewed_at      timestamptz,
  rejection_reason text,
  idempotency_key  text not null unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index subscription_requests_store_idx
  on public.subscription_requests (store_id, created_at desc);
create index subscription_requests_pending_idx
  on public.subscription_requests (status) where status = 'pending';

create trigger subscription_requests_set_updated_at
  before update on public.subscription_requests
  for each row execute function app.set_updated_at();
create trigger subscription_requests_freeze_store
  before update on public.subscription_requests
  for each row execute function app.freeze_store_id();

alter table public.subscription_requests enable row level security;

-- =====================================================================
-- محرك الـEntitlements
-- =====================================================================

-- الاشتراك الفعّال للمتجر
create or replace function app.store_subscription(p_store_id uuid)
returns public.subscriptions
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.subscriptions
  where store_id = p_store_id and status <> 'cancelled'
  limit 1;
$$;

-- هل الاشتراك يسمح بالعمل الكامل (لوحة + شراء)؟
create or replace function app.subscription_is_operational(p_status public.subscription_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('trialing','active','expiring','grace');
$$;

-- ★ D14: هل يُسمح بالشراء من هذا المتجر الآن؟
create or replace function app.store_can_checkout(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.stores s
    join public.subscriptions sub on sub.store_id = s.id and sub.status <> 'cancelled'
    where s.id = p_store_id
      and s.status = 'active'
      and s.deleted_at is null
      and app.subscription_is_operational(sub.status)
      and coalesce((select not maintenance_mode from public.store_settings
                    where store_id = s.id), true)
  );
$$;

-- قيمة حد لميزة معيّنة
create or replace function app.entitlement_limit(p_store_id uuid, p_key text)
returns table (configured boolean, limit_value integer, bool_value boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select (pe.configured_at is not null), pe.limit_value, pe.bool_value
  from public.subscriptions sub
  join public.plan_entitlements pe
    on pe.plan_id = sub.plan_id and pe.feature_key = p_key
  where sub.store_id = p_store_id and sub.status <> 'cancelled';
$$;

-- هل الميزة المنطقية مفعّلة؟ غير مضبوطة ⇒ مسموحة (لا نخترع منعًا)
create or replace function app.has_feature(p_store_id uuid, p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare r record;
begin
  select * into r from app.entitlement_limit(p_store_id, p_key);
  if not found then return true; end if;
  if not r.configured then return true; end if;
  return coalesce(r.bool_value, true);
end;
$$;

-- الاستهلاك الحالي لمفتاح حدّي
create or replace function app.count_usage(p_store_id uuid, p_key text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return case p_key
    when 'products.max' then
      (select count(*)::integer from public.products
        where store_id = p_store_id and deleted_at is null and status <> 'archived')
    when 'employees.max' then
      (select count(*)::integer from public.store_members
        where store_id = p_store_id and deleted_at is null and role <> 'owner')
    when 'storage.mb' then
      (select ceil(app.store_storage_mb(p_store_id))::integer)
    when 'coupons.max_active' then
      (select count(*)::integer from public.coupons
        where store_id = p_store_id and is_active and deleted_at is null)
    when 'orders.monthly_max' then
      (select count(*)::integer from public.orders
        where store_id = p_store_id and created_at >= date_trunc('month', now()))
    else 0
  end;
end;
$$;

-- ★ الإنفاذ في القاعدة — الجدار الثالث
create or replace function app.assert_within_limit(p_store_id uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_sub public.subscriptions%rowtype;
  v_used integer;
begin
  v_sub := app.store_subscription(p_store_id);
  if v_sub.id is null then
    raise exception 'SUBSCRIPTION_MISSING: لا يوجد اشتراك لهذا المتجر' using errcode = 'P0002';
  end if;
  if not app.subscription_is_operational(v_sub.status) then
    raise exception 'SUBSCRIPTION_INACTIVE: اشتراك المتجر غير نشط' using errcode = 'P0001';
  end if;

  select * into r from app.entitlement_limit(p_store_id, p_key);
  -- D18: غير مضبوط ⇒ لا إنفاذ (ولا رقم مفترض)
  if not found or not r.configured or r.limit_value is null then
    return;
  end if;

  v_used := app.count_usage(p_store_id, p_key);
  if v_used >= r.limit_value then
    raise exception 'LIMIT_EXCEEDED:%:%:%', p_key, v_used, r.limit_value
      using errcode = 'P0001';
  end if;
end;
$$;

-- ★ D31: حالة اكتمال إعداد الباقات — بوابة الإطلاق التجاري
create or replace function public.plan_configuration_status()
returns table (
  complete               boolean,
  unconfigured_prices    text[],
  unconfigured_features  text[],
  active_admins          integer,
  admins_sufficient      boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with prices as (
    select array_agg(code order by sort_order) as codes
    from public.plans
    where is_active and not is_free and price_configured_at is null
  ),
  feats as (
    select array_agg(p.code || ':' || pe.feature_key order by p.code, pe.feature_key) as keys
    from public.plan_entitlements pe
    join public.plans p on p.id = pe.plan_id
    where p.is_active and pe.configured_at is null
  ),
  adm as (select app.active_admin_count() as n)
  select
    coalesce(prices.codes, '{}') = '{}'
      and coalesce(feats.keys, '{}') = '{}'
      and adm.n >= 2,
    coalesce(prices.codes, '{}'),
    coalesce(feats.keys, '{}'),
    adm.n,
    adm.n >= 2
  from prices, feats, adm;
$$;

grant execute on function public.plan_configuration_status() to authenticated;

-- يمنع تفعيل الإطلاق التجاري والإعداد ناقص (D29 + D31)
create or replace function app.guard_commercial_launch()
returns trigger
language plpgsql
set search_path = ''
as $$
declare st record;
begin
  if new.commercial_launch_enabled and not old.commercial_launch_enabled then
    select * into st from public.plan_configuration_status();
    if not st.complete then
      raise exception
        'LAUNCH_BLOCKED: إعداد الباقات غير مكتمل — أسعار ناقصة: % · ميزات غير مضبوطة: % · حسابات Admin النشطة: % (المطلوب 2)',
        coalesce(array_length(st.unconfigured_prices,1),0),
        coalesce(array_length(st.unconfigured_features,1),0),
        st.active_admins
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger platform_settings_guard_launch before update on public.platform_settings
  for each row execute function app.guard_commercial_launch();

-- ختم configured_at تلقائيًا عند ضبط قيمة فعلية
create or replace function app.stamp_entitlement_configured()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.limit_value is distinct from old.limit_value)
     or (new.bool_value is distinct from old.bool_value) then
    new.configured_at := now();
    new.updated_by := (select auth.uid());
  end if;
  return new;
end;
$$;

create trigger plan_entitlements_stamp before update on public.plan_entitlements
  for each row execute function app.stamp_entitlement_configured();

create or replace function app.stamp_plan_price_configured()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.price is distinct from old.price then
    new.price_configured_at := now();
  end if;
  return new;
end;
$$;

create trigger plans_stamp_price before update on public.plans
  for each row execute function app.stamp_plan_price_configured();

-- ---------------------------------------------------------------------
-- منح الباقة المجانية لكل متجر جديد (D15) — لا Trial
-- ---------------------------------------------------------------------
create or replace function app.grant_free_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_plan uuid;
begin
  select id into v_plan from public.plans where code = 'free' limit 1;
  if v_plan is not null then
    insert into public.subscriptions (store_id, plan_id, status, current_period_end)
    values (new.id, v_plan, 'active', null)     -- مجانية دائمة: بلا انتهاء
    on conflict do nothing;
    insert into public.subscription_events (subscription_id, store_id, event, to_plan_id)
    select s.id, new.id, 'created', v_plan
      from public.subscriptions s where s.store_id = new.id;
  end if;
  return new;
end;
$$;

create trigger stores_grant_free_plan
  after insert on public.stores
  for each row execute function app.grant_free_plan();

-- ---------------------------------------------------------------------
-- كنس الاشتراكات (pg_cron كل 5 دقائق) — D16
-- ---------------------------------------------------------------------
create or replace function public.sweep_subscriptions()
returns table (warned integer, graced integer, expired integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grace integer;
  v_warn  integer;
  w integer := 0; g integer := 0; e integer := 0;
begin
  select grace_period_days, expiring_warning_days into v_grace, v_warn
    from public.platform_settings where id = true;

  -- active → expiring (قبل 7 أيام)
  with upd as (
    update public.subscriptions
       set status = 'expiring', expiring_warned_at = now()
     where status = 'active'
       and current_period_end is not null
       and current_period_end <= now() + make_interval(days => v_warn)
       and current_period_end > now()
    returning id, store_id
  )
  insert into public.subscription_events (subscription_id, store_id, event)
  select id, store_id, 'expiring_warned' from upd;
  get diagnostics w = row_count;

  -- expiring/active → grace
  with upd as (
    update public.subscriptions
       set status = 'grace',
           grace_ends_at = current_period_end + make_interval(days => v_grace)
     where status in ('active','expiring')
       and current_period_end is not null
       and current_period_end <= now()
    returning id, store_id
  )
  insert into public.subscription_events (subscription_id, store_id, event)
  select id, store_id, 'entered_grace' from upd;
  get diagnostics g = row_count;

  -- grace → expired
  with upd as (
    update public.subscriptions
       set status = 'expired'
     where status = 'grace'
       and grace_ends_at is not null
       and grace_ends_at <= now()
    returning id, store_id
  )
  insert into public.subscription_events (subscription_id, store_id, event)
  select id, store_id, 'expired' from upd;
  get diagnostics e = row_count;

  return query select w, g, e;
end;
$$;

revoke execute on function public.sweep_subscriptions() from public, anon, authenticated;

-- =====================================================================
-- RLS
-- =====================================================================
create policy plans_public_read on public.plans
  for select to anon, authenticated using (is_active and is_public);

create policy plans_platform_read on public.plans
  for select to authenticated using (app.has_platform_permission('plans','view'));

create policy plans_platform_write on public.plans
  for all to authenticated
  using (app.has_platform_permission('plans','edit'))
  with check (app.has_platform_permission('plans','edit'));

create policy plan_entitlements_public_read on public.plan_entitlements
  for select to anon, authenticated
  using (exists (select 1 from public.plans p
                 where p.id = plan_id and p.is_active and p.is_public));

create policy plan_entitlements_platform_write on public.plan_entitlements
  for all to authenticated
  using (app.has_platform_permission('plans','edit'))
  with check (app.has_platform_permission('plans','edit'));

create policy subscriptions_member_read on public.subscriptions
  for select to authenticated using (app.is_store_member(store_id));

create policy subscriptions_platform_read on public.subscriptions
  for select to authenticated
  using (app.has_platform_permission('subscriptions','view'));

create policy subscriptions_platform_write on public.subscriptions
  for all to authenticated
  using (app.has_platform_permission('subscriptions','approve'))
  with check (app.has_platform_permission('subscriptions','approve'));

create policy subscription_events_read on public.subscription_events
  for select to authenticated
  using (app.is_store_member(store_id)
         or app.has_platform_permission('subscriptions','view'));

create policy subscription_requests_owner_read on public.subscription_requests
  for select to authenticated
  using (app.has_store_permission(store_id, 'subscription:manage'));

create policy subscription_requests_owner_insert on public.subscription_requests
  for insert to authenticated
  with check (app.has_store_permission(store_id, 'subscription:manage'));

create policy subscription_requests_platform_read on public.subscription_requests
  for select to authenticated
  using (app.has_platform_permission('subscriptions','view'));

create policy subscription_requests_platform_write on public.subscription_requests
  for update to authenticated
  using (app.has_platform_permission('subscriptions','approve'))
  with check (app.has_platform_permission('subscriptions','approve'));

-- =====================================================================
-- المنح
-- =====================================================================
grant select on public.platform_settings to authenticated;
grant update on public.platform_settings to authenticated;
grant select on public.plans             to anon, authenticated;
grant insert, update, delete on public.plans to authenticated;
grant select on public.plan_entitlements to anon, authenticated;
grant insert, update, delete on public.plan_entitlements to authenticated;
grant select, insert, update on public.subscriptions to authenticated;
grant select on public.subscription_events to authenticated;
grant select, insert, update on public.subscription_requests to authenticated;

grant execute on function app.store_can_checkout(uuid) to anon, authenticated;
grant execute on function app.has_feature(uuid, text)  to authenticated;
grant execute on function app.entitlement_limit(uuid, text) to authenticated;
