-- =====================================================================
-- 0004 Catalog & Inventory — media · categories · products · variants
--                            · inventory · inventory_movements
--
-- §12: المخزون لا يُعدَّل مباشرة أبدًا — عبر الحركات فقط.
-- =====================================================================

create type public.product_status as enum ('draft','active','hidden','archived');

create type public.media_purpose as enum (
  'product_image','store_logo','store_banner','category_image',
  'payment_proof','support_attachment','import_file','export_file','avatar'
);

create type public.media_status as enum ('pending','ready','quarantined','deleted');

create type public.inventory_reason as enum (
  'manual_adjust','order_placed','order_cancelled','order_returned',
  'import','correction','initial'
);

-- ---------------------------------------------------------------------
-- media_files — سجل موحّد لكل ملف مرفوع
-- ---------------------------------------------------------------------
create table public.media_files (
  id               uuid primary key default gen_random_uuid(),
  bucket           text not null,
  path             text not null unique,
  owner_profile_id uuid references public.profiles (id) on delete set null,
  store_id         uuid references public.stores (id) on delete cascade,
  purpose          public.media_purpose not null,
  mime_type        text not null,
  size_bytes       bigint not null check (size_bytes > 0),
  width            integer,
  height           integer,
  checksum         text,
  blur_data_url    text,
  variants         jsonb not null default '{}'::jsonb,  -- {thumb,card,detail,og}
  status           public.media_status not null default 'pending',
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index media_files_store_idx on public.media_files (store_id)
  where deleted_at is null;
create index media_files_purpose_idx on public.media_files (store_id, purpose)
  where status = 'ready' and deleted_at is null;

alter table public.media_files enable row level security;

-- حصة التخزين المستهلكة لمتجر (بالميغابايت) — تستعملها حدود الباقة
create or replace function app.store_storage_mb(p_store_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(size_bytes), 0)::numeric / 1048576
  from public.media_files
  where store_id = p_store_id and deleted_at is null and status <> 'quarantined';
$$;

grant execute on function app.store_storage_mb(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores (id) on delete cascade,
  parent_id  uuid references public.categories (id) on delete set null,
  name       text not null check (length(trim(name)) between 1 and 80),
  slug       text not null,
  image_id   uuid references public.media_files (id) on delete set null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index categories_slug_unique
  on public.categories (store_id, lower(slug)) where deleted_at is null;
create index categories_store_idx on public.categories (store_id, parent_id)
  where deleted_at is null;

create trigger categories_set_updated_at before update on public.categories
  for each row execute function app.set_updated_at();
create trigger categories_freeze_store before update on public.categories
  for each row execute function app.freeze_store_id();

alter table public.categories enable row level security;

-- ---------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------
create table public.products (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null references public.stores (id) on delete cascade,
  category_id        uuid references public.categories (id) on delete set null,
  name               text not null check (length(trim(name)) between 1 and 200),
  slug               text not null,
  description        text,
  price              numeric(14,2) not null check (price >= 0),
  compare_at_price   numeric(14,2) check (compare_at_price >= 0),
  cost_price         numeric(14,2) check (cost_price >= 0),   -- 🔒 لا يخرج للمتجر
  sku                text,
  status             public.product_status not null default 'draft',
  has_variants       boolean not null default false,
  track_inventory    boolean not null default true,
  weight_grams       integer check (weight_grams >= 0),
  seo                jsonb not null default '{}'::jsonb,
  attributes         jsonb not null default '{}'::jsonb,
  views_count        integer not null default 0,
  sold_count         integer not null default 0,
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  constraint products_compare_price_gt check
    (compare_at_price is null or compare_at_price >= price)
);

create unique index products_slug_unique
  on public.products (store_id, lower(slug)) where deleted_at is null;
create unique index products_sku_unique
  on public.products (store_id, lower(sku)) where sku is not null and deleted_at is null;
create index products_store_status_idx
  on public.products (store_id, status, created_at desc) where deleted_at is null;
create index products_category_idx on public.products (store_id, category_id)
  where deleted_at is null;
create index products_search_idx on public.products
  using gin (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(description,'')));

create trigger products_set_updated_at before update on public.products
  for each row execute function app.set_updated_at();
create trigger products_freeze_store before update on public.products
  for each row execute function app.freeze_store_id();

alter table public.products enable row level security;

-- ---------------------------------------------------------------------
-- product_images
-- ---------------------------------------------------------------------
create table public.product_images (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products (id) on delete cascade,
  store_id      uuid not null references public.stores (id) on delete cascade,
  media_file_id uuid not null references public.media_files (id) on delete cascade,
  alt_text      text,
  sort_order    integer not null default 0,
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now()
);

create index product_images_product_idx on public.product_images (product_id, sort_order);
create unique index product_images_one_primary
  on public.product_images (product_id) where is_primary;

create trigger product_images_freeze_store before update on public.product_images
  for each row execute function app.freeze_store_id();

alter table public.product_images enable row level security;

-- ---------------------------------------------------------------------
-- product_variants
-- ---------------------------------------------------------------------
create table public.product_variants (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products (id) on delete cascade,
  store_id         uuid not null references public.stores (id) on delete cascade,
  name             text not null,
  sku              text,
  price            numeric(14,2) check (price >= 0),           -- null ⇒ سعر المنتج
  compare_at_price numeric(14,2) check (compare_at_price >= 0),
  options          jsonb not null default '{}'::jsonb,
  image_id         uuid references public.media_files (id) on delete set null,
  is_active        boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create unique index product_variants_options_unique
  on public.product_variants (product_id, options) where deleted_at is null;
create unique index product_variants_sku_unique
  on public.product_variants (store_id, lower(sku))
  where sku is not null and deleted_at is null;
create index product_variants_product_idx on public.product_variants (product_id)
  where deleted_at is null;

create trigger product_variants_set_updated_at before update on public.product_variants
  for each row execute function app.set_updated_at();
create trigger product_variants_freeze_store before update on public.product_variants
  for each row execute function app.freeze_store_id();

alter table public.product_variants enable row level security;

-- ---------------------------------------------------------------------
-- inventory — الكمية الحالية. لا تُعدَّل مباشرة (§12).
-- ---------------------------------------------------------------------
create table public.inventory (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores (id) on delete cascade,
  product_id          uuid not null references public.products (id) on delete cascade,
  variant_id          uuid references public.product_variants (id) on delete cascade,
  quantity            integer not null default 0,
  reserved            integer not null default 0 check (reserved >= 0),
  low_stock_threshold integer,
  updated_at          timestamptz not null default now(),
  constraint inventory_non_negative check (quantity >= 0),
  constraint inventory_reserved_le_qty check (reserved <= quantity)
);

create unique index inventory_unique_item
  on public.inventory (product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index inventory_store_idx on public.inventory (store_id);
create index inventory_low_stock_idx on public.inventory (store_id)
  where quantity <= 5;

create trigger inventory_freeze_store before update on public.inventory
  for each row execute function app.freeze_store_id();

alter table public.inventory enable row level security;

-- ---------------------------------------------------------------------
-- inventory_movements — إلحاقي. المصدر الوحيد لتغيّر المخزون.
-- ---------------------------------------------------------------------
create table public.inventory_movements (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete cascade,
  delta      integer not null check (delta <> 0),
  reason     public.inventory_reason not null,
  order_id   uuid,                                   -- FK يُضاف في 0006
  actor_id   uuid references public.profiles (id) on delete set null,
  note       text,
  created_at timestamptz not null default now()
);

create index inventory_movements_store_idx
  on public.inventory_movements (store_id, created_at desc);
create index inventory_movements_product_idx
  on public.inventory_movements (product_id, created_at desc);

create trigger inventory_movements_no_update before update on public.inventory_movements
  for each row execute function app.block_mutation();
create trigger inventory_movements_no_delete before delete on public.inventory_movements
  for each row execute function app.block_mutation();

alter table public.inventory_movements enable row level security;

-- تطبيق الحركة على الرصيد — المسار الوحيد لتغيير inventory.quantity
create or replace function app.apply_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory (store_id, product_id, variant_id, quantity)
  values (new.store_id, new.product_id, new.variant_id, greatest(new.delta, 0))
  on conflict (product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set quantity = public.inventory.quantity + new.delta,
                updated_at = now();
  return new;
end;
$$;

create trigger inventory_movements_apply
  after insert on public.inventory_movements
  for each row execute function app.apply_inventory_movement();

-- يمنع أي تعديل مباشر على الكمية من خارج مسار الحركات.
-- علم الجلسة يضعه app.apply_inventory_movement فقط (SECURITY DEFINER)،
-- ولا يستطيع مستخدم PostgREST ضبطه لأن لا RPC يكشفه.
create or replace function app.guard_inventory_quantity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.quantity is distinct from old.quantity
     and coalesce(current_setting('app.inventory_movement', true), '') <> 'on' then
    raise exception 'INVENTORY_DIRECT_WRITE: الكمية تتغير عبر inventory_movements فقط'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger inventory_guard_quantity before update on public.inventory
  for each row execute function app.guard_inventory_quantity();

-- إعادة تعريف الدالة لتضع العلم داخل نطاق المعاملة
create or replace function app.apply_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.inventory_movement', 'on', true);
  insert into public.inventory (store_id, product_id, variant_id, quantity)
  values (new.store_id, new.product_id, new.variant_id, greatest(new.delta, 0))
  on conflict (product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set quantity = public.inventory.quantity + new.delta,
                updated_at = now();
  perform set_config('app.inventory_movement', 'off', true);
  return new;
end;
$$;

-- =====================================================================
-- RLS
-- =====================================================================

-- media_files: العام يقرأ ملفات المتاجر النشطة ذات الغرض العام فقط
create policy media_public_read on public.media_files
  for select to anon, authenticated
  using (
    status = 'ready' and deleted_at is null
    and purpose in ('product_image','store_logo','store_banner','category_image')
    and store_id is not null and app.is_store_public(store_id)
  );

create policy media_member_read on public.media_files
  for select to authenticated
  using (store_id is not null and app.is_store_member(store_id));

create policy media_owner_read on public.media_files
  for select to authenticated
  using (owner_profile_id = (select auth.uid()));

create policy media_member_write on public.media_files
  for all to authenticated
  using (store_id is not null and app.has_store_permission(store_id, 'products:update'))
  with check (store_id is not null and app.has_store_permission(store_id, 'products:update'));

create policy media_platform_read on public.media_files
  for select to authenticated
  using (app.has_platform_permission('stores', 'view'));

-- categories
create policy categories_public_read on public.categories
  for select to anon, authenticated
  using (is_active and deleted_at is null and app.is_store_public(store_id));

create policy categories_member_read on public.categories
  for select to authenticated
  using (app.has_store_permission(store_id, 'products:view'));

create policy categories_manage on public.categories
  for all to authenticated
  using (app.has_store_permission(store_id, 'categories:manage'))
  with check (app.has_store_permission(store_id, 'categories:manage'));

create policy categories_platform_read on public.categories
  for select to authenticated
  using (app.has_platform_permission('products', 'view'));

-- products
create policy products_public_read on public.products
  for select to anon, authenticated
  using (status = 'active' and deleted_at is null and app.is_store_public(store_id));

create policy products_member_read on public.products
  for select to authenticated
  using (app.has_store_permission(store_id, 'products:view'));

create policy products_member_insert on public.products
  for insert to authenticated
  with check (app.has_store_permission(store_id, 'products:create'));

create policy products_member_update on public.products
  for update to authenticated
  using (app.has_store_permission(store_id, 'products:update'))
  with check (app.has_store_permission(store_id, 'products:update'));

create policy products_member_delete on public.products
  for delete to authenticated
  using (app.has_store_permission(store_id, 'products:delete'));

create policy products_platform_read on public.products
  for select to authenticated
  using (app.has_platform_permission('products', 'view'));

-- product_images
create policy product_images_public_read on public.product_images
  for select to anon, authenticated
  using (app.is_store_public(store_id));

create policy product_images_member_read on public.product_images
  for select to authenticated
  using (app.has_store_permission(store_id, 'products:view'));

create policy product_images_manage on public.product_images
  for all to authenticated
  using (app.has_store_permission(store_id, 'products:update'))
  with check (app.has_store_permission(store_id, 'products:update'));

-- product_variants
create policy product_variants_public_read on public.product_variants
  for select to anon, authenticated
  using (is_active and deleted_at is null and app.is_store_public(store_id));

create policy product_variants_member_read on public.product_variants
  for select to authenticated
  using (app.has_store_permission(store_id, 'products:view'));

create policy product_variants_manage on public.product_variants
  for all to authenticated
  using (app.has_store_permission(store_id, 'products:update'))
  with check (app.has_store_permission(store_id, 'products:update'));

-- inventory: العام لا يقرأ الأرقام — التوفر يُشتق في الاستعلام الخادمي
create policy inventory_member_read on public.inventory
  for select to authenticated
  using (app.has_store_permission(store_id, 'inventory:view'));

create policy inventory_platform_read on public.inventory
  for select to authenticated
  using (app.has_platform_permission('products', 'view'));
-- لا INSERT/UPDATE/DELETE لأي دور: الرصيد يتغير عبر الحركات فقط.

-- inventory_movements
create policy inventory_movements_read on public.inventory_movements
  for select to authenticated
  using (app.has_store_permission(store_id, 'inventory:view'));

create policy inventory_movements_insert on public.inventory_movements
  for insert to authenticated
  with check (app.has_store_permission(store_id, 'inventory:update'));

create policy inventory_movements_platform_read on public.inventory_movements
  for select to authenticated
  using (app.has_platform_permission('products', 'view'));

-- =====================================================================
-- المنح
-- =====================================================================
grant select on public.media_files      to anon, authenticated;
grant insert, update, delete on public.media_files to authenticated;
grant select on public.categories       to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;
grant select on public.products         to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant select on public.product_images   to anon, authenticated;
grant insert, update, delete on public.product_images to authenticated;
grant select on public.product_variants to anon, authenticated;
grant insert, update, delete on public.product_variants to authenticated;
grant select on public.inventory        to authenticated;
grant select, insert on public.inventory_movements to authenticated;
