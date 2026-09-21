-- =====================================================================
-- 0005 Customers & Cart
--
-- D22: هوية Auth واحدة، وسجل عميل **منفصل لكل متجر**.
--      متجر A لا يعلم شيئًا عن نشاط العميل في متجر B.
-- D4:  سلة لكل متجر — لا سلة عابرة للمتاجر.
-- =====================================================================

create type public.cart_status as enum ('active','converted','abandoned');

-- ---------------------------------------------------------------------
-- customers — سجل العميل داخل متجر واحد
-- ---------------------------------------------------------------------
create table public.customers (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null references public.stores (id) on delete cascade,
  profile_id         uuid references public.profiles (id) on delete set null,
  name               text,
  phone              text,
  email              text,
  notes              text,                       -- 🔒 ملاحظات التاجر
  orders_count       integer not null default 0,
  total_spent        numeric(14,2) not null default 0,
  first_order_at     timestamptz,
  last_order_at      timestamptz,
  marketing_consent  boolean not null default false,
  anonymized_at      timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create unique index customers_profile_unique
  on public.customers (store_id, profile_id)
  where profile_id is not null and deleted_at is null;
create unique index customers_phone_unique
  on public.customers (store_id, phone)
  where phone is not null and deleted_at is null;
create index customers_store_idx on public.customers (store_id, last_order_at desc)
  where deleted_at is null;

create trigger customers_set_updated_at before update on public.customers
  for each row execute function app.set_updated_at();
create trigger customers_freeze_store before update on public.customers
  for each row execute function app.freeze_store_id();

alter table public.customers enable row level security;

-- سجل العميل الحالي داخل متجر معيّن (للـStorefront)
create or replace function app.current_customer_id(p_store_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.customers c
  where c.store_id = p_store_id
    and c.profile_id = (select auth.uid())
    and c.deleted_at is null;
$$;

grant execute on function app.current_customer_id(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- customer_addresses
-- ---------------------------------------------------------------------
create table public.customer_addresses (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.customers (id) on delete cascade,
  store_id       uuid not null references public.stores (id) on delete cascade,
  label          text,
  recipient_name text not null,
  phone          text not null,
  zone_id        uuid references public.delivery_zones (id) on delete set null,
  address_line   text not null,
  landmark       text,
  is_default     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create index customer_addresses_customer_idx
  on public.customer_addresses (customer_id) where deleted_at is null;
create unique index customer_addresses_one_default
  on public.customer_addresses (customer_id) where is_default and deleted_at is null;

create trigger customer_addresses_set_updated_at before update on public.customer_addresses
  for each row execute function app.set_updated_at();
create trigger customer_addresses_freeze_store before update on public.customer_addresses
  for each row execute function app.freeze_store_id();

alter table public.customer_addresses enable row level security;

-- ---------------------------------------------------------------------
-- carts — سلة لكل متجر، للزائر (anon_token) أو للمسجّل (profile_id)
-- ---------------------------------------------------------------------
create table public.carts (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete cascade,
  anon_token text,
  status     public.cart_status not null default 'active',
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint carts_owner_required check (profile_id is not null or anon_token is not null)
);

create unique index carts_profile_active
  on public.carts (store_id, profile_id) where status = 'active' and profile_id is not null;
create unique index carts_anon_active
  on public.carts (store_id, anon_token) where status = 'active' and anon_token is not null;

create trigger carts_set_updated_at before update on public.carts
  for each row execute function app.set_updated_at();
create trigger carts_freeze_store before update on public.carts
  for each row execute function app.freeze_store_id();

alter table public.carts enable row level security;

create table public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  cart_id    uuid not null references public.carts (id) on delete cascade,
  store_id   uuid not null references public.stores (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete cascade,
  quantity   integer not null check (quantity > 0 and quantity <= 999),
  added_at   timestamptz not null default now()
);

-- المفتاح الفريد يجعل الدمج عند تسجيل الدخول UPSERT ⇒ لا تكرار عناصر
create unique index cart_items_unique
  on public.cart_items (cart_id, product_id,
      coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index cart_items_cart_idx on public.cart_items (cart_id);

create trigger cart_items_freeze_store before update on public.cart_items
  for each row execute function app.freeze_store_id();

alter table public.cart_items enable row level security;

-- ---------------------------------------------------------------------
-- wishlists
-- ---------------------------------------------------------------------
create table public.wishlists (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (store_id, profile_id, product_id)
);

create index wishlists_profile_idx on public.wishlists (profile_id, store_id);

alter table public.wishlists enable row level security;

-- =====================================================================
-- RLS
-- =====================================================================

-- customers: التاجر يرى عملاء متجره · العميل يرى سجله هو فقط
create policy customers_member_read on public.customers
  for select to authenticated
  using (app.has_store_permission(store_id, 'customers:view'));

create policy customers_self_read on public.customers
  for select to authenticated
  using (profile_id = (select auth.uid()));

create policy customers_member_write on public.customers
  for all to authenticated
  using (app.has_store_permission(store_id, 'customers:update'))
  with check (app.has_store_permission(store_id, 'customers:update'));

create policy customers_platform_read on public.customers
  for select to authenticated
  using (app.has_platform_permission('customers', 'view'));

-- customer_addresses
create policy customer_addresses_self on public.customer_addresses
  for all to authenticated
  using (customer_id = app.current_customer_id(store_id))
  with check (customer_id = app.current_customer_id(store_id));

create policy customer_addresses_member_read on public.customer_addresses
  for select to authenticated
  using (app.has_store_permission(store_id, 'orders:view'));

-- carts: المسجّل يملك سلته. سلة الزائر تُدار خادميًا عبر RPC بالتوكن
-- (الكوكي HttpOnly) — لا سياسة anon هنا إطلاقًا.
create policy carts_self on public.carts
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy cart_items_self on public.cart_items
  for all to authenticated
  using (exists (select 1 from public.carts c
                 where c.id = cart_id and c.profile_id = (select auth.uid())))
  with check (exists (select 1 from public.carts c
                      where c.id = cart_id and c.profile_id = (select auth.uid())));

-- wishlists
create policy wishlists_self on public.wishlists
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- =====================================================================
-- المنح
-- =====================================================================
grant select, insert, update, delete on public.customers          to authenticated;
grant select, insert, update, delete on public.customer_addresses to authenticated;
grant select, insert, update, delete on public.carts              to authenticated;
grant select, insert, update, delete on public.cart_items         to authenticated;
grant select, insert, update, delete on public.wishlists          to authenticated;
