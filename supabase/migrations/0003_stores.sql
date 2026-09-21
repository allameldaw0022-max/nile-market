-- =====================================================================
-- 0003 Stores — المستأجر (Tenant) وكل ما يتعلق به
--
-- D1: stores هو المستأجر · D22: عزل إلزامي
-- D33: slug قديم محجوز 12 شهرًا ثم يُحرَّر
-- S9 (الفحص): لا قيد فريد على اسم المتجر — الـslug فقط
-- =====================================================================

-- ---------------------------------------------------------------------
-- reserved_slugs — أسماء النظام + الأسماء المحجوزة بعد تغيير slug (D33)
-- ---------------------------------------------------------------------
create table public.reserved_slugs (
  slug          text primary key,
  reserved_until timestamptz,              -- null = محجوز دائمًا (أسماء النظام)
  reason        text not null default 'system',
  store_id      uuid,
  created_at    timestamptz not null default now()
);

insert into public.reserved_slugs (slug, reason) values
  ('admin','system'),('app','system'),('api','system'),('www','system'),
  ('mail','system'),('support','system'),('help','system'),('blog','system'),
  ('cdn','system'),('static','system'),('assets','system'),('dashboard','system'),
  ('partner','system'),('partners','system'),('account','system'),('login','system'),
  ('signup','system'),('status','system'),('docs','system'),('store','system'),
  ('stores','system'),('checkout','system'),('cart','system'),('order','system'),
  ('orders','system'),('auth','system'),('billing','system'),('pay','system'),
  ('nile','system'),('nilemarket','system'),('ftp','system'),('smtp','system'),
  ('ns1','system'),('ns2','system'),('test','system'),('staging','system'),
  ('dev','system'),('preview','system'),('internal','system'),('system','system');

alter table public.reserved_slugs enable row level security;


-- ---------------------------------------------------------------------
-- stores
-- ---------------------------------------------------------------------
create table public.stores (
  id                      uuid primary key default gen_random_uuid(),
  owner_id                uuid not null references public.profiles (id) on delete restrict,
  name                    text not null check (length(trim(name)) between 2 and 100),
  slug                    text not null check (slug ~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])?$'),
  business_type           text,
  description             text,
  logo_url                text,
  banner_url              text,
  status                  public.store_status not null default 'draft',
  suspended_reason        text,
  suspended_at            timestamptz,
  published_at            timestamptz,
  referred_by_partner_id  uuid,                    -- FK يُضاف في 0009
  onboarding_step         text not null default 'store-info',
  onboarding_completed_at timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz
);

create unique index stores_slug_unique on public.stores (lower(slug));
create index stores_owner_idx   on public.stores (owner_id);
create index stores_status_idx  on public.stores (status) where deleted_at is null;
create index stores_partner_idx on public.stores (referred_by_partner_id)
  where referred_by_partner_id is not null;

create trigger stores_set_updated_at before update on public.stores
  for each row execute function app.set_updated_at();

alter table public.stores enable row level security;

-- هل الـslug متاح؟ (يحترم انتهاء الحجز)
create or replace function app.is_slug_available(p_slug text, p_store_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    not exists (
      select 1 from public.reserved_slugs r
      where r.slug = lower(p_slug)
        and (r.reserved_until is null or r.reserved_until > now())
        and (p_store_id is null or r.store_id is distinct from p_store_id)
    )
    and not exists (
      select 1 from public.stores s
      where lower(s.slug) = lower(p_slug)
        and (p_store_id is null or s.id <> p_store_id)
    );
$$;

grant execute on function app.is_slug_available(text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- store_members — الأدوار داخل المتجر (يستبدل store_employees القديم)
-- ---------------------------------------------------------------------
create table public.store_members (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores (id) on delete cascade,
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  role         public.store_role not null,
  permissions  text[] not null default '{}',   -- تجاوزات دقيقة فوق الدور
  status       public.member_status not null default 'invited',
  invited_by   uuid references public.profiles (id),
  invited_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (store_id, profile_id)
);

-- الفهرس الحرج: تستعمله كل سياسة RLS في النظام
create index store_members_lookup_idx
  on public.store_members (profile_id, store_id)
  where status = 'active' and deleted_at is null;
create index store_members_store_idx on public.store_members (store_id)
  where deleted_at is null;

-- مالك واحد لكل متجر
create unique index store_members_single_owner
  on public.store_members (store_id)
  where role = 'owner' and deleted_at is null;

create trigger store_members_set_updated_at before update on public.store_members
  for each row execute function app.set_updated_at();
create trigger store_members_freeze_store before update on public.store_members
  for each row execute function app.freeze_store_id();

alter table public.store_members enable row level security;

-- ---------------------------------------------------------------------
-- الصلاحيات الافتراضية لكل دور (مصدر الحقيقة داخل القاعدة).
-- نسخة مطابقة في TypeScript، ويُفحص التطابق باختبار آلي.
-- ---------------------------------------------------------------------
create or replace function app.role_default_permissions(p_role public.store_role)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_role
    when 'owner' then array[
      'products:view','products:create','products:update','products:delete',
      'categories:manage','inventory:view','inventory:update',
      'orders:view','orders:update','orders:cancel','orders:payment',
      'customers:view','customers:update',
      'coupons:manage','promotions:manage','delivery:manage',
      'members:view','members:manage',
      'settings:view','settings:update','settings:banking',
      'domain:manage','subscription:manage',
      'analytics:view','export:data','audit:view','support:manage'
    ]
    when 'manager' then array[
      'products:view','products:create','products:update','products:delete',
      'categories:manage','inventory:view','inventory:update',
      'orders:view','orders:update','orders:cancel','orders:payment',
      'customers:view','customers:update',
      'coupons:manage','promotions:manage','delivery:manage',
      'members:view','members:manage',
      'settings:view','settings:update',
      'analytics:view','export:data','audit:view','support:manage'
    ]
    when 'orders' then array[
      'products:view','inventory:view',
      'orders:view','orders:update','orders:cancel','orders:payment',
      'customers:view','export:data'
    ]
    when 'products' then array[
      'products:view','products:create','products:update',
      'categories:manage','inventory:view','inventory:update',
      'orders:view','export:data'
    ]
    when 'customer_service' then array[
      'products:view','inventory:view',
      'orders:view','customers:view','support:manage'
    ]
  end;
$$;

grant execute on function app.role_default_permissions(public.store_role) to authenticated;

-- ---------------------------------------------------------------------
-- ★ دالة السلطة المركزية — يعتمد عليها كل جدول مستأجَر
-- ---------------------------------------------------------------------
create or replace function app.has_store_permission(p_store_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.store_members m
    join public.profiles p on p.id = m.profile_id
    where m.store_id = p_store_id
      and m.profile_id = (select auth.uid())
      and m.status = 'active'
      and m.deleted_at is null
      and p.account_status = 'active'
      and (
        m.role = 'owner'
        or p_permission = any(m.permissions)
        or p_permission = any(app.role_default_permissions(m.role))
      )
  );
$$;

create or replace function app.is_store_member(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.store_members m
    where m.store_id = p_store_id
      and m.profile_id = (select auth.uid())
      and m.status = 'active' and m.deleted_at is null
  );
$$;

create or replace function app.is_store_owner(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.store_members m
    where m.store_id = p_store_id
      and m.profile_id = (select auth.uid())
      and m.role = 'owner'
      and m.status = 'active' and m.deleted_at is null
  );
$$;

-- هل المتجر منشور ومرئي للعامة؟
create or replace function app.is_store_public(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.stores s
    where s.id = p_store_id and s.status = 'active' and s.deleted_at is null
  );
$$;

grant execute on function app.has_store_permission(uuid, text) to authenticated;
grant execute on function app.is_store_member(uuid)  to authenticated;
grant execute on function app.is_store_owner(uuid)   to authenticated;
grant execute on function app.is_store_public(uuid)  to anon, authenticated;

-- ---------------------------------------------------------------------
-- store_settings (1:1)
-- ---------------------------------------------------------------------
create table public.store_settings (
  store_id              uuid primary key references public.stores (id) on delete cascade,
  whatsapp_number       text,
  contact_email         text,
  contact_phone         text,
  address               jsonb not null default '{}'::jsonb,
  social_links          jsonb not null default '{}'::jsonb,
  theme                 jsonb not null default '{}'::jsonb,
  cod_enabled           boolean not null default false,
  bank_transfer_enabled boolean not null default true,
  bankak_enabled        boolean not null default false,
  low_stock_threshold   integer not null default 5 check (low_stock_threshold >= 0),
  auto_hide_out_of_stock boolean not null default true,
  order_prefix          text,
  seo                   jsonb not null default '{}'::jsonb,
  policies              jsonb not null default '{}'::jsonb,
  notification_prefs    jsonb not null default '{}'::jsonb,
  maintenance_mode      boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger store_settings_set_updated_at before update on public.store_settings
  for each row execute function app.set_updated_at();

alter table public.store_settings enable row level security;

-- ---------------------------------------------------------------------
-- store_payment_settings — البيانات المالية الحساسة في جدول **منفصل**.
--
-- لماذا جدول منفصل ولا عمود داخل store_settings؟
-- لأن RLS تعمل على مستوى الصف لا العمود. store_settings يجب أن يكون
-- مقروءًا للعامة (الثيم، التواصل، السياسات) ليعمل المتجر، فلو بقيت
-- الحسابات البنكية في نفس الصف لقرأها أي زائر. الفصل يجعل التسريب
-- **مستحيلًا بنيويًا** لا معتمدًا على صحة استعلام.
-- (نفس المبدأ المطبَّق على support_internal_notes.)
-- ---------------------------------------------------------------------
create table public.store_payment_settings (
  store_id      uuid primary key references public.stores (id) on delete cascade,
  bank_accounts jsonb not null default '[]'::jsonb,
  bankak_number text,
  payout_notes  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger store_payment_settings_set_updated_at
  before update on public.store_payment_settings
  for each row execute function app.set_updated_at();

alter table public.store_payment_settings enable row level security;

-- لا سياسة لـanon إطلاقًا. القراءة والكتابة بصلاحية settings:banking
-- (المالك وحده) أو بموظف منصة بصلاحية settings:manage، ويُدقَّق كل وصول.
create policy store_payment_settings_owner_read on public.store_payment_settings
  for select to authenticated
  using (app.has_store_permission(store_id, 'settings:banking'));

create policy store_payment_settings_platform_read on public.store_payment_settings
  for select to authenticated
  using (app.has_platform_permission('settings', 'manage'));

create policy store_payment_settings_owner_write on public.store_payment_settings
  for all to authenticated
  using (app.has_store_permission(store_id, 'settings:banking'))
  with check (app.has_store_permission(store_id, 'settings:banking'));

-- ---------------------------------------------------------------------
-- store_invitations — يستبدل find_profile_id_by_email (إصلاح S5)
-- لا يكشف وجود الحساب من عدمه، ولا يُخزَّن التوكن الخام.
-- ---------------------------------------------------------------------
create table public.store_invitations (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores (id) on delete cascade,
  email       text not null,
  role        public.store_role not null,
  permissions text[] not null default '{}',
  token_hash  text not null unique,
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id),
  created_by  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now()
);

create unique index store_invitations_pending
  on public.store_invitations (store_id, lower(email))
  where accepted_at is null;

create trigger store_invitations_freeze_store before update on public.store_invitations
  for each row execute function app.freeze_store_id();

alter table public.store_invitations enable row level security;

-- ---------------------------------------------------------------------
-- delivery_zones — يُصلح ثغرة S2 (رسوم التوصيل من المتصفح)
-- ---------------------------------------------------------------------
create table public.delivery_zones (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores (id) on delete cascade,
  name           text not null,
  fee            numeric(14,2) not null default 0 check (fee >= 0),
  min_order_free numeric(14,2) check (min_order_free >= 0),
  est_days_min   integer check (est_days_min >= 0),
  est_days_max   integer check (est_days_max >= 0),
  is_active      boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create unique index delivery_zones_name_unique
  on public.delivery_zones (store_id, lower(name)) where deleted_at is null;
create index delivery_zones_store_idx on public.delivery_zones (store_id)
  where is_active and deleted_at is null;

create trigger delivery_zones_set_updated_at before update on public.delivery_zones
  for each row execute function app.set_updated_at();
create trigger delivery_zones_freeze_store before update on public.delivery_zones
  for each row execute function app.freeze_store_id();

alter table public.delivery_zones enable row level security;

-- =====================================================================
-- RLS — stores
-- =====================================================================
create policy stores_public_read on public.stores
  for select to anon, authenticated
  using (status = 'active' and deleted_at is null);

create policy stores_member_read on public.stores
  for select to authenticated
  using (app.is_store_member(id));

create policy stores_platform_read on public.stores
  for select to authenticated
  using (app.has_platform_permission('stores', 'view'));

create policy stores_owner_update on public.stores
  for update to authenticated
  using (app.has_store_permission(id, 'settings:update'))
  with check (app.has_store_permission(id, 'settings:update'));

create policy stores_platform_update on public.stores
  for update to authenticated
  using (app.has_platform_permission('stores', 'edit'))
  with check (app.has_platform_permission('stores', 'edit'));

-- الإنشاء عبر RPC فقط (app.create_store) — لا INSERT مباشر.
-- لا DELETE لأي دور: المتجر يُغلق ولا يُحذف (المواصفات §20).

-- حماية أعمدة المتجر الحساسة من التاجر
create or replace function app.protect_store_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not app.has_platform_permission('stores', 'edit') then
    new.status                 := old.status;
    new.suspended_reason       := old.suspended_reason;
    new.suspended_at           := old.suspended_at;
    new.referred_by_partner_id := old.referred_by_partner_id;  -- D19: لا يُعدَّل من واجهة التاجر
    new.owner_id               := old.owner_id;
    new.deleted_at             := old.deleted_at;
  end if;
  return new;
end;
$$;

create trigger stores_protect_columns before update on public.stores
  for each row execute function app.protect_store_columns();

-- =====================================================================
-- RLS — store_members
-- =====================================================================
create policy store_members_select_self on public.store_members
  for select to authenticated using (profile_id = (select auth.uid()));

create policy store_members_select_team on public.store_members
  for select to authenticated
  using (app.has_store_permission(store_id, 'members:view'));

create policy store_members_select_platform on public.store_members
  for select to authenticated
  using (app.has_platform_permission('employees', 'view'));

create policy store_members_manage on public.store_members
  for all to authenticated
  using (app.has_store_permission(store_id, 'members:manage'))
  with check (app.has_store_permission(store_id, 'members:manage'));

-- منع تصعيد الصلاحيات داخل المتجر
create or replace function app.protect_store_member()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  -- سياق خادمي موثوق (service_role / RPC بـsecurity definer / بذرة).
  -- آمن لأن RLS تمنع anon و authenticated من الوصول إلى هنا أصلًا بلا
  -- صلاحية members:manage، وهي تشترط جلسة مستخدم حقيقية.
  if v_actor is null then
    return coalesce(new, old);
  end if;

  -- لا يعدّل عضو صفَّه هو
  if tg_op in ('UPDATE','DELETE')
     and old.profile_id = v_actor
     and not app.has_platform_permission('employees','manage') then
    raise exception 'SELF_MODIFY: لا يمكنك تعديل عضويتك الخاصة'
      using errcode = '42501';
  end if;

  -- دور owner محجوز لمالك المتجر المسجَّل في stores.owner_id
  if tg_op in ('INSERT','UPDATE') and new.role = 'owner' then
    if not exists (select 1 from public.stores s
                   where s.id = new.store_id and s.owner_id = new.profile_id) then
      raise exception 'OWNER_MISMATCH: دور المالك محجوز لمالك المتجر'
        using errcode = '42501';
    end if;
  end if;

  -- دور manager لا يمنحه إلا مالك المتجر أو موظف منصة مخوّل
  if tg_op in ('INSERT','UPDATE')
     and new.role = 'manager'
     and not app.is_store_owner(new.store_id)
     and not app.has_platform_permission('employees','manage') then
    raise exception 'ROLE_ESCALATION: منح دور مدير محصور بمالك المتجر'
      using errcode = '42501';
  end if;

  -- صف المالك محمي من الحذف والخفض
  if tg_op = 'DELETE' and old.role = 'owner' then
    raise exception 'OWNER_PROTECTED: لا يمكن حذف مالك المتجر'
      using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner' then
    raise exception 'OWNER_PROTECTED: لا يمكن خفض دور مالك المتجر'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger store_members_protect
  before insert or update or delete on public.store_members
  for each row execute function app.protect_store_member();

-- =====================================================================
-- RLS — store_settings
-- =====================================================================
create policy store_settings_public_read on public.store_settings
  for select to anon, authenticated
  using (app.is_store_public(store_id));

create policy store_settings_member_read on public.store_settings
  for select to authenticated
  using (app.has_store_permission(store_id, 'settings:view'));

create policy store_settings_platform_read on public.store_settings
  for select to authenticated
  using (app.has_platform_permission('stores', 'view'));

create policy store_settings_update on public.store_settings
  for update to authenticated
  using (app.has_store_permission(store_id, 'settings:update'))
  with check (app.has_store_permission(store_id, 'settings:update'));

-- =====================================================================
-- RLS — store_invitations · delivery_zones · reserved_slugs
-- =====================================================================
create policy store_invitations_manage on public.store_invitations
  for all to authenticated
  using (app.has_store_permission(store_id, 'members:manage'))
  with check (app.has_store_permission(store_id, 'members:manage'));

create policy store_invitations_platform_read on public.store_invitations
  for select to authenticated
  using (app.has_platform_permission('employees', 'view'));

create policy delivery_zones_public_read on public.delivery_zones
  for select to anon, authenticated
  using (is_active and deleted_at is null and app.is_store_public(store_id));

create policy delivery_zones_member_read on public.delivery_zones
  for select to authenticated
  using (app.has_store_permission(store_id, 'orders:view'));

create policy delivery_zones_manage on public.delivery_zones
  for all to authenticated
  using (app.has_store_permission(store_id, 'delivery:manage'))
  with check (app.has_store_permission(store_id, 'delivery:manage'));

create policy delivery_zones_platform_read on public.delivery_zones
  for select to authenticated
  using (app.has_platform_permission('stores', 'view'));

create policy reserved_slugs_platform on public.reserved_slugs
  for all to authenticated
  using (app.has_platform_permission('settings', 'manage'))
  with check (app.has_platform_permission('settings', 'manage'));

-- =====================================================================
-- صلاحيات الجداول (RLS تُرشّح الصفوف)
-- =====================================================================
grant select on public.stores                to anon, authenticated;
grant update on public.stores                to authenticated;
grant select on public.store_settings        to anon, authenticated;
grant update on public.store_settings        to authenticated;
grant select, insert, update, delete on public.store_members     to authenticated;
grant select, insert, update, delete on public.store_invitations to authenticated;
grant select, insert, update, delete on public.store_payment_settings to authenticated;
grant select on public.delivery_zones to anon, authenticated;
grant insert, update, delete on public.delivery_zones to authenticated;
grant select, insert, update, delete on public.reserved_slugs to authenticated;
