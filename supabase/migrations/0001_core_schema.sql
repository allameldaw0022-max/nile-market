-- Nile Market -- Phase 1 core schema
-- Profiles, stores, products, cart/favorites, orders, notifications,
-- subscription plans/requests. RLS enabled on every table.

-- ---------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create type public.user_role as enum ('customer', 'seller', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'customer',
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create policy "profiles: self read" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles: self update" on public.profiles
  for update using (auth.uid() = id);

create policy "profiles: admin read all" on public.profiles
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- stores
-- ---------------------------------------------------------------------
create type public.store_status as enum ('pending', 'active', 'suspended');

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  logo_url text,
  status public.store_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- store name/slug must be unique app-wide, enforced at the DB level
create unique index stores_name_unique on public.stores (lower(name));
create unique index stores_slug_unique on public.stores (lower(slug));

alter table public.stores enable row level security;

create trigger stores_set_updated_at
  before update on public.stores
  for each row execute function public.set_updated_at();

create policy "stores: public read active" on public.stores
  for select using (status = 'active' or owner_id = auth.uid());

create policy "stores: owner insert" on public.stores
  for insert with check (owner_id = auth.uid());

create policy "stores: owner update" on public.stores
  for update using (owner_id = auth.uid());

create policy "stores: admin full access" on public.stores
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ---------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------
create type public.product_status as enum ('active', 'hidden', 'out_of_stock');

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null,
  description text,
  price numeric(12, 2) not null check (price >= 0),
  currency text not null default 'SDG',
  images jsonb not null default '[]'::jsonb,
  stock integer not null default 0,
  category text,
  status public.product_status not null default 'active',
  views_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_store_id_idx on public.products (store_id);

alter table public.products enable row level security;

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create policy "products: public read active" on public.products
  for select using (
    status = 'active'
    or exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  );

create policy "products: owner manage" on public.products
  for all using (
    exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  );

create policy "products: admin full access" on public.products
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ---------------------------------------------------------------------
-- product reviews
-- ---------------------------------------------------------------------
create table public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  seller_reply text,
  created_at timestamptz not null default now(),
  unique (product_id, customer_id)
);

alter table public.product_reviews enable row level security;

create policy "reviews: public read" on public.product_reviews
  for select using (true);

create policy "reviews: customer insert own" on public.product_reviews
  for insert with check (customer_id = auth.uid());

create policy "reviews: customer update own" on public.product_reviews
  for update using (customer_id = auth.uid());

create policy "reviews: store owner reply" on public.product_reviews
  for update using (
    exists (
      select 1 from public.products pr
      join public.stores s on s.id = pr.store_id
      where pr.id = product_id and s.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- cart & favorites (private per customer)
-- ---------------------------------------------------------------------
create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  options jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (customer_id, product_id, options)
);

alter table public.cart_items enable row level security;

create policy "cart: owner full access" on public.cart_items
  for all using (customer_id = auth.uid());

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (customer_id, product_id)
);

alter table public.favorites enable row level security;

create policy "favorites: owner full access" on public.favorites
  for all using (customer_id = auth.uid());

-- ---------------------------------------------------------------------
-- orders (one checkout, may span multiple stores) & order_items
-- ---------------------------------------------------------------------
create type public.order_status as enum (
  'pending', 'processing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete restrict,
  delivery_address jsonb not null default '{}'::jsonb,
  delivery_fee numeric(12, 2) not null default 0,
  subtotal numeric(12, 2) not null default 0,
  discount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders enable row level security;

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create policy "orders: customer read own" on public.orders
  for select using (customer_id = auth.uid());

create policy "orders: customer insert own" on public.orders
  for insert with check (customer_id = auth.uid());

create policy "orders: admin full access" on public.orders
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null,
  options jsonb not null default '{}'::jsonb,
  status public.order_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_store_id_idx on public.order_items (store_id);

alter table public.order_items enable row level security;

create trigger order_items_set_updated_at
  before update on public.order_items
  for each row execute function public.set_updated_at();

create policy "order_items: customer read own" on public.order_items
  for select using (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
  );

create policy "order_items: customer insert own" on public.order_items
  for insert with check (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
  );

create policy "order_items: store owner manage" on public.order_items
  for all using (
    exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  );

create policy "order_items: admin full access" on public.order_items
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ---------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_id_idx on public.notifications (user_id);

alter table public.notifications enable row level security;

create policy "notifications: owner read" on public.notifications
  for select using (user_id = auth.uid());

create policy "notifications: owner mark read" on public.notifications
  for update using (user_id = auth.uid());

create policy "notifications: admin full access" on public.notifications
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ---------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------
create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  duration_days integer not null check (duration_days > 0),
  price numeric(12, 2) not null default 0,
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.subscription_plans enable row level security;

create policy "plans: public read active" on public.subscription_plans
  for select using (is_active = true);

create policy "plans: admin full access" on public.subscription_plans
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create type public.subscription_status as enum ('active', 'expired', 'cancelled');

create table public.seller_subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  plan_id uuid not null references public.subscription_plans (id) on delete restrict,
  status public.subscription_status not null default 'active',
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index seller_subscriptions_store_id_idx on public.seller_subscriptions (store_id);

alter table public.seller_subscriptions enable row level security;

create policy "seller_subscriptions: owner read" on public.seller_subscriptions
  for select using (
    exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  );

create policy "seller_subscriptions: admin full access" on public.seller_subscriptions
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create type public.subscription_request_status as enum ('pending', 'approved', 'rejected');

create table public.subscription_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  plan_id uuid not null references public.subscription_plans (id) on delete restrict,
  amount numeric(12, 2) not null,
  payment_proof_url text,
  status public.subscription_request_status not null default 'pending',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index subscription_requests_store_id_idx on public.subscription_requests (store_id);

alter table public.subscription_requests enable row level security;

create policy "subscription_requests: owner read own" on public.subscription_requests
  for select using (
    exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  );

create policy "subscription_requests: owner insert own" on public.subscription_requests
  for insert with check (
    exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  );

create policy "subscription_requests: admin full access" on public.subscription_requests
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
