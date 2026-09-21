-- =====================================================================
-- 0006 Orders · Coupons · Order State Machine
--
-- D3:  الطلب ملك **متجر واحد**، والحالة على مستوى الطلب.
-- D5:  Guest Checkout مدعوم (customer_id قابل للإفراغ).
-- D10: رسوم التوصيل من delivery_zones خادميًا — لا من المتصفح (S2).
-- §13: منع الطلبات المكررة عبر idempotency_key فريد.
-- =====================================================================

create type public.order_status as enum (
  'new','confirmed','preparing','shipped','completed','cancelled'
);

create type public.order_payment_status as enum (
  'unpaid','pending','partially_paid','paid','refunded','partially_refunded'
);

create type public.payment_method as enum (
  'cash_on_delivery','bank_transfer','bankak'
);

create type public.order_channel as enum ('storefront','whatsapp','dashboard');

create type public.coupon_type as enum ('percentage','fixed');

-- ---------------------------------------------------------------------
-- coupons
-- ---------------------------------------------------------------------
create table public.coupons (
  id                      uuid primary key default gen_random_uuid(),
  store_id                uuid not null references public.stores (id) on delete cascade,
  code                    text not null,
  type                    public.coupon_type not null,
  value                   numeric(14,2) not null check (value > 0),
  min_order_amount        numeric(14,2) check (min_order_amount >= 0),
  max_discount_amount     numeric(14,2) check (max_discount_amount > 0),
  starts_at               timestamptz,
  ends_at                 timestamptz,
  usage_limit_total       integer check (usage_limit_total > 0),
  usage_limit_per_customer integer check (usage_limit_per_customer > 0),
  used_count              integer not null default 0,
  applies_to              jsonb not null default '{}'::jsonb,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz,
  constraint coupons_percentage_range check
    (type <> 'percentage' or value <= 100),
  constraint coupons_date_order check
    (starts_at is null or ends_at is null or ends_at > starts_at)
);

create unique index coupons_code_unique
  on public.coupons (store_id, lower(code)) where deleted_at is null;
create index coupons_store_active_idx on public.coupons (store_id)
  where is_active and deleted_at is null;

create trigger coupons_set_updated_at before update on public.coupons
  for each row execute function app.set_updated_at();
create trigger coupons_freeze_store before update on public.coupons
  for each row execute function app.freeze_store_id();

alter table public.coupons enable row level security;

-- ---------------------------------------------------------------------
-- store_order_sequences — أرقام طلبات متسلسلة لكل متجر بلا سباق
-- ---------------------------------------------------------------------
create table public.store_order_sequences (
  store_id    uuid primary key references public.stores (id) on delete cascade,
  next_number bigint not null default 1
);

alter table public.store_order_sequences enable row level security;

-- ---------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------
create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores (id) on delete restrict,
  order_number      text not null,
  customer_id       uuid references public.customers (id) on delete set null,
  contact_name      text not null,
  contact_phone     text not null,
  contact_email     text,
  delivery_zone_id  uuid references public.delivery_zones (id) on delete set null,
  delivery_zone_name text,
  delivery_address  jsonb not null default '{}'::jsonb,
  status            public.order_status not null default 'new',
  payment_status    public.order_payment_status not null default 'unpaid',
  payment_method    public.payment_method not null,
  subtotal          numeric(14,2) not null check (subtotal >= 0),
  delivery_fee      numeric(14,2) not null default 0 check (delivery_fee >= 0),
  discount_total    numeric(14,2) not null default 0 check (discount_total >= 0),
  total             numeric(14,2) not null check (total >= 0),
  paid_total        numeric(14,2) not null default 0 check (paid_total >= 0),
  refunded_total    numeric(14,2) not null default 0 check (refunded_total >= 0),
  currency          char(3) not null default 'SDG',
  coupon_id         uuid references public.coupons (id) on delete set null,
  coupon_code       text,
  note              text,
  internal_note     text,                                    -- 🔒
  cancelled_reason  text,
  cancelled_at      timestamptz,
  completed_at      timestamptz,
  placed_via        public.order_channel not null default 'storefront',
  idempotency_key   text not null,
  guest_token       text,                 -- متابعة طلب الزائر
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index orders_number_unique on public.orders (store_id, order_number);
create unique index orders_idempotency_unique
  on public.orders (store_id, idempotency_key);
create index orders_store_created_idx on public.orders (store_id, created_at desc);
create index orders_store_status_idx   on public.orders (store_id, status);
create index orders_store_payment_idx  on public.orders (store_id, payment_status);
create index orders_customer_idx       on public.orders (customer_id)
  where customer_id is not null;

create trigger orders_set_updated_at before update on public.orders
  for each row execute function app.set_updated_at();
create trigger orders_freeze_store before update on public.orders
  for each row execute function app.freeze_store_id();

alter table public.orders enable row level security;

-- ---------------------------------------------------------------------
-- order_items — لقطة نصية تبقى حتى لو حُذف المنتج
-- ---------------------------------------------------------------------
create table public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  store_id     uuid not null references public.stores (id) on delete restrict,
  product_id   uuid references public.products (id) on delete restrict,
  variant_id   uuid references public.product_variants (id) on delete restrict,
  product_name text not null,
  variant_name text,
  sku          text,
  unit_price   numeric(14,2) not null check (unit_price >= 0),
  quantity     integer not null check (quantity > 0),
  line_total   numeric(14,2) not null check (line_total >= 0),
  created_at   timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

create trigger order_items_freeze_store before update on public.order_items
  for each row execute function app.freeze_store_id();

alter table public.order_items enable row level security;

-- ---------------------------------------------------------------------
-- order_status_history — إلحاقي، يُكتب من الـtrigger لا من الواجهة
-- ---------------------------------------------------------------------
create table public.order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  store_id    uuid not null references public.stores (id) on delete cascade,
  from_status public.order_status,
  to_status   public.order_status not null,
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_kind  public.actor_kind not null default 'store',
  reason      text,
  created_at  timestamptz not null default now()
);

create index order_status_history_order_idx
  on public.order_status_history (order_id, created_at);

create trigger order_status_history_no_update before update on public.order_status_history
  for each row execute function app.block_mutation();
create trigger order_status_history_no_delete before delete on public.order_status_history
  for each row execute function app.block_mutation();

alter table public.order_status_history enable row level security;

-- ---------------------------------------------------------------------
-- coupon_redemptions — unique(order_id) يمنع الاستخدام المزدوج
-- ---------------------------------------------------------------------
create table public.coupon_redemptions (
  id              uuid primary key default gen_random_uuid(),
  coupon_id       uuid not null references public.coupons (id) on delete restrict,
  store_id        uuid not null references public.stores (id) on delete cascade,
  order_id        uuid not null unique references public.orders (id) on delete cascade,
  customer_id     uuid references public.customers (id) on delete set null,
  discount_amount numeric(14,2) not null check (discount_amount >= 0),
  created_at      timestamptz not null default now()
);

create index coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id);
create index coupon_redemptions_customer_idx on public.coupon_redemptions (customer_id);

alter table public.coupon_redemptions enable row level security;

-- ربط حركات المخزون بالطلب (FK مؤجّل من 0004)
alter table public.inventory_movements
  add constraint inventory_movements_order_fk
  foreign key (order_id) references public.orders (id) on delete set null;

-- =====================================================================
-- ★ آلة حالة الطلب — الانتقالات المسموحة (§13)
-- =====================================================================
create or replace function app.can_transition_order(
  p_from public.order_status, p_to public.order_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_from = 'new'       then p_to in ('confirmed','cancelled')
    when p_from = 'confirmed' then p_to in ('preparing','cancelled')
    when p_from = 'preparing' then p_to in ('shipped','confirmed','cancelled')
    when p_from = 'shipped'   then p_to in ('completed','preparing','cancelled')
    when p_from = 'completed' then false   -- حالة نهائية: التصحيح باسترداد
    when p_from = 'cancelled' then false
    else false
  end;
$$;

-- الصلاحية المطلوبة لكل انتقال
create or replace function app.order_transition_permission(
  p_from public.order_status, p_to public.order_status
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_to = 'cancelled' then 'orders:cancel'
    else 'orders:update'
  end;
$$;

grant execute on function app.can_transition_order(public.order_status, public.order_status) to authenticated;

-- ---------------------------------------------------------------------
-- حارس: الحالة تتغير عبر transition_order() فقط
-- ---------------------------------------------------------------------
create or replace function app.guard_order_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('app.order_transition', true), '') <> 'on' then
    raise exception 'ORDER_STATUS_DIRECT_WRITE: الحالة تتغير عبر transition_order() فقط'
      using errcode = '42501';
  end if;
  -- المبالغ لا تُعدَّل بعد الإنشاء إلا من المسارات المالية الموثوقة
  if coalesce(current_setting('app.financial_write', true), '') <> 'on' then
    new.subtotal       := old.subtotal;
    new.delivery_fee   := old.delivery_fee;
    new.discount_total := old.discount_total;
    new.total          := old.total;
    new.paid_total     := old.paid_total;
    new.refunded_total := old.refunded_total;
    new.payment_status := old.payment_status;
    new.order_number   := old.order_number;
    new.idempotency_key := old.idempotency_key;
  end if;
  return new;
end;
$$;

create trigger orders_guard before update on public.orders
  for each row execute function app.guard_order_status();

-- ---------------------------------------------------------------------
-- transition_order — المسار الوحيد لتغيير حالة الطلب
-- ---------------------------------------------------------------------
create or replace function public.transition_order(
  p_order_id uuid,
  p_to       public.order_status,
  p_reason   text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_perm  text;
  v_item  record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not app.can_transition_order(v_order.status, p_to) then
    raise exception 'ILLEGAL_TRANSITION: % ← %', p_to, v_order.status
      using errcode = 'P0001';
  end if;

  v_perm := app.order_transition_permission(v_order.status, p_to);
  if not app.has_store_permission(v_order.store_id, v_perm)
     and not app.has_platform_permission('orders', 'manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- الرجوع خطوة أو الإلغاء بعد الشحن: للمالك/المدير فقط وبسبب إلزامي
  if (p_to = 'cancelled' and v_order.status = 'shipped')
     or (v_order.status = 'preparing' and p_to = 'confirmed')
     or (v_order.status = 'shipped'   and p_to = 'preparing') then
    if not app.has_store_permission(v_order.store_id, 'settings:update')
       and not app.has_platform_permission('orders', 'manage') then
      raise exception 'FORBIDDEN_BACKWARD: الرجوع خطوة للمالك أو المدير فقط'
        using errcode = '42501';
    end if;
  end if;

  if p_to = 'cancelled' and (p_reason is null or trim(p_reason) = '') then
    raise exception 'REASON_REQUIRED: سبب الإلغاء إلزامي' using errcode = 'P0001';
  end if;

  -- أثر المخزون
  if p_to = 'shipped' then
    for v_item in select * from public.order_items where order_id = p_order_id loop
      if v_item.product_id is not null then
        perform set_config('app.inventory_movement_ctx', 'on', true);
        insert into public.inventory_movements
          (store_id, product_id, variant_id, delta, reason, order_id, actor_id)
        values (v_order.store_id, v_item.product_id, v_item.variant_id,
                -v_item.quantity, 'order_placed', p_order_id, (select auth.uid()));
        update public.inventory
           set reserved = greatest(reserved - v_item.quantity, 0)
         where product_id = v_item.product_id
           and coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
             = coalesce(v_item.variant_id, '00000000-0000-0000-0000-000000000000'::uuid);
      end if;
    end loop;
  elsif p_to = 'cancelled' then
    for v_item in select * from public.order_items where order_id = p_order_id loop
      if v_item.product_id is not null then
        if v_order.status = 'shipped' then
          -- أُرجع بعد الشحن ⇒ يعود للمخزون
          insert into public.inventory_movements
            (store_id, product_id, variant_id, delta, reason, order_id, actor_id)
          values (v_order.store_id, v_item.product_id, v_item.variant_id,
                  v_item.quantity, 'order_returned', p_order_id, (select auth.uid()));
        else
          -- لم يُشحن ⇒ يُفكّ الحجز فقط
          update public.inventory
             set reserved = greatest(reserved - v_item.quantity, 0)
           where product_id = v_item.product_id
             and coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
               = coalesce(v_item.variant_id, '00000000-0000-0000-0000-000000000000'::uuid);
        end if;
      end if;
    end loop;
  end if;

  perform set_config('app.order_transition', 'on', true);
  update public.orders
     set status       = p_to,
         cancelled_at = case when p_to = 'cancelled' then now() else cancelled_at end,
         cancelled_reason = case when p_to = 'cancelled' then p_reason else cancelled_reason end,
         completed_at = case when p_to = 'completed' then now() else completed_at end
   where id = p_order_id;
  perform set_config('app.order_transition', 'off', true);

  insert into public.order_status_history
    (order_id, store_id, from_status, to_status, actor_id, actor_kind, reason)
  values (p_order_id, v_order.store_id, v_order.status, p_to, (select auth.uid()),
          case when app.is_platform_staff() then 'platform'::public.actor_kind
               else 'store'::public.actor_kind end,
          p_reason);
end;
$$;

revoke execute on function public.transition_order(uuid, public.order_status, text) from public, anon;
grant   execute on function public.transition_order(uuid, public.order_status, text) to authenticated;

-- =====================================================================
-- RLS
-- =====================================================================
create policy coupons_member_read on public.coupons
  for select to authenticated
  using (app.has_store_permission(store_id, 'orders:view'));

create policy coupons_manage on public.coupons
  for all to authenticated
  using (app.has_store_permission(store_id, 'coupons:manage'))
  with check (app.has_store_permission(store_id, 'coupons:manage'));
-- لا قراءة عامة: التحقق عبر RPC يعيد مبلغ الخصم فقط ⇒ لا تعداد أكواد.

create policy orders_member_read on public.orders
  for select to authenticated
  using (app.has_store_permission(store_id, 'orders:view'));

create policy orders_customer_read on public.orders
  for select to authenticated
  using (customer_id is not null and customer_id = app.current_customer_id(store_id));

create policy orders_platform_read on public.orders
  for select to authenticated
  using (app.has_platform_permission('orders', 'view'));

create policy orders_member_update on public.orders
  for update to authenticated
  using (app.has_store_permission(store_id, 'orders:update'))
  with check (app.has_store_permission(store_id, 'orders:update'));
-- الإنشاء عبر create_order() فقط. لا DELETE لأي دور — الطلب سجل دائم.

create policy order_items_member_read on public.order_items
  for select to authenticated
  using (app.has_store_permission(store_id, 'orders:view'));

create policy order_items_customer_read on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o
                 where o.id = order_id
                   and o.customer_id = app.current_customer_id(o.store_id)));

create policy order_items_platform_read on public.order_items
  for select to authenticated
  using (app.has_platform_permission('orders', 'view'));

create policy order_status_history_read on public.order_status_history
  for select to authenticated
  using (app.has_store_permission(store_id, 'orders:view')
         or app.has_platform_permission('orders', 'view'));

create policy coupon_redemptions_read on public.coupon_redemptions
  for select to authenticated
  using (app.has_store_permission(store_id, 'orders:view')
         or app.has_platform_permission('orders', 'view'));

create policy order_sequences_read on public.store_order_sequences
  for select to authenticated
  using (app.is_store_member(store_id));

-- =====================================================================
-- المنح
-- =====================================================================
grant select, insert, update, delete on public.coupons to authenticated;
grant select, update on public.orders      to authenticated;
grant select on public.order_items         to authenticated;
grant select on public.order_status_history to authenticated;
grant select on public.coupon_redemptions  to authenticated;
grant select on public.store_order_sequences to authenticated;
