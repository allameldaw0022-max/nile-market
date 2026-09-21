-- =====================================================================
-- 0011 Custom Domains & Tenant Routing
--
-- المواصفات: Hostname → Domain → Store ID → Store Data
-- unique(hostname) عالميًا ⇒ مستحيل ربط دومين بمتجرين
-- D21: مزوّد الاستضافة معزول — لا شيء هنا خاص بمنصة بعينها
-- D27/D33: الـslug القديم 301 وحجز 12 شهرًا ثم يُحرَّر
-- =====================================================================

create type public.domain_kind as enum ('subdomain','custom');

create type public.domain_status as enum (
  'pending','verification_required','verifying','active',
  'ssl_pending','ssl_active','failed','suspended','removed'
);

create table public.store_domains (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores (id) on delete cascade,
  hostname            text not null,
  kind                public.domain_kind not null,
  status              public.domain_status not null default 'pending',
  is_primary          boolean not null default false,
  verification_token  text,
  verification_method text not null default 'dns_txt',
  verified_at         timestamptz,
  last_checked_at     timestamptz,
  failure_reason      text,
  redirect_www        boolean not null default true,
  redirect_to_primary boolean not null default false,
  released_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint hostname_format check (hostname ~ '^[a-z0-9]([a-z0-9.-]{1,251}[a-z0-9])?$')
);

-- ★ الحاجز ضد ربط دومين بمتجرين، وضد الاختطاف بعد الإزالة
create unique index store_domains_hostname_unique on public.store_domains (lower(hostname));
create unique index store_domains_one_primary
  on public.store_domains (store_id) where is_primary;
create index store_domains_store_idx  on public.store_domains (store_id);
create index store_domains_status_idx on public.store_domains (status);
create index store_domains_lookup_idx on public.store_domains (lower(hostname))
  where status in ('active','ssl_active');

create trigger store_domains_set_updated_at before update on public.store_domains
  for each row execute function app.set_updated_at();
create trigger store_domains_freeze_store before update on public.store_domains
  for each row execute function app.freeze_store_id();

alter table public.store_domains enable row level security;

-- ★ حل المستأجر: المسار الوحيد المسموح لاشتقاق المتجر من الـHost.
-- SECURITY DEFINER ليعمل للزائر المجهول أيضًا، ويعيد الحد الأدنى فقط.
create or replace function public.resolve_store_by_host(p_host text)
returns table (
  store_id      uuid,
  slug          text,
  name          text,
  status        public.store_status,
  primary_host  text,
  can_checkout  boolean,
  is_redirect   boolean,
  domain_status public.domain_status
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id, s.slug, s.name, s.status,
    coalesce(
      (select d2.hostname from public.store_domains d2
        where d2.store_id = s.id and d2.is_primary
          and d2.status in ('active','ssl_active') limit 1),
      d.hostname
    ),
    app.store_can_checkout(s.id),
    d.redirect_to_primary,
    d.status
  from public.store_domains d
  join public.stores s on s.id = d.store_id
  where lower(d.hostname) = lower(trim(p_host))
    and d.status in ('active','ssl_active')
    and s.deleted_at is null
  limit 1;
$$;

revoke execute on function public.resolve_store_by_host(text) from public;
grant   execute on function public.resolve_store_by_host(text) to anon, authenticated;

-- إنشاء النطاق الفرعي المجاني تلقائيًا لكل متجر (جزء أساسي من المتجر)
create or replace function app.create_default_subdomain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_root text;
begin
  v_root := coalesce(current_setting('app.root_domain', true), 'nilemarket.online');
  insert into public.store_domains
    (store_id, hostname, kind, status, is_primary, verified_at)
  values (new.id, lower(new.slug) || '.' || v_root, 'subdomain', 'active', true, now())
  on conflict do nothing;
  return new;
end;
$$;

create trigger stores_create_subdomain
  after insert on public.stores
  for each row execute function app.create_default_subdomain();

-- تغيير الـslug: نطاق فرعي جديد + حجز القديم 12 شهرًا مع 301 (D33)
create or replace function app.handle_slug_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_root   text;
  v_months integer;
begin
  if new.slug is distinct from old.slug then
    v_root := coalesce(current_setting('app.root_domain', true), 'nilemarket.online');
    select slug_reservation_months into v_months from public.platform_settings where id = true;

    -- القديم: يبقى يعمل بإعادة توجيه دائمة طوال مدة الحجز
    update public.store_domains
       set is_primary = false, redirect_to_primary = true
     where store_id = new.id
       and hostname = lower(old.slug) || '.' || v_root;

    insert into public.reserved_slugs (slug, reserved_until, reason, store_id)
    values (lower(old.slug), now() + make_interval(months => coalesce(v_months, 12)),
            'slug_change', new.id)
    on conflict (slug) do update
      set reserved_until = excluded.reserved_until,
          reason = 'slug_change', store_id = excluded.store_id;

    insert into public.store_domains
      (store_id, hostname, kind, status, is_primary, verified_at)
    values (new.id, lower(new.slug) || '.' || v_root, 'subdomain', 'active', true, now())
    on conflict (lower(hostname)) do update
      set store_id = excluded.store_id, is_primary = true,
          redirect_to_primary = false, status = 'active';
  end if;
  return new;
end;
$$;

create trigger stores_slug_change after update on public.stores
  for each row execute function app.handle_slug_change();

-- تحرير الأسماء المحجوزة المنتهية + إيقاف إعادة التوجيه (Job ليلي)
create or replace function public.release_expired_slugs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  update public.store_domains d
     set status = 'removed', released_at = now()
    from public.reserved_slugs r
   where r.reason = 'slug_change'
     and r.reserved_until is not null and r.reserved_until <= now()
     and d.redirect_to_primary
     and d.hostname like r.slug || '.%';
  delete from public.reserved_slugs
   where reason = 'slug_change'
     and reserved_until is not null and reserved_until <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.release_expired_slugs() from public, anon, authenticated;

-- إضافة دومين مخصص — يحترم entitlement الباقة
create or replace function public.add_custom_domain(p_store_id uuid, p_hostname text)
returns table (domain_id uuid, verification_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_token text; v_host text := lower(trim(p_hostname));
begin
  if not app.has_store_permission(p_store_id, 'domain:manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not app.has_feature(p_store_id, 'custom_domain.enabled') then
    raise exception 'FEATURE_DISABLED: الدومين المخصص غير متاح في باقتك الحالية'
      using errcode = 'P0001';
  end if;
  if v_host !~ '^[a-z0-9]([a-z0-9.-]{1,251}[a-z0-9])?$' then
    raise exception 'INVALID_HOSTNAME' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.store_domains where lower(hostname) = v_host) then
    raise exception 'DOMAIN_TAKEN: هذا الدومين مرتبط بمتجر آخر' using errcode = 'P0001';
  end if;

  v_token := app.random_token(16);
  insert into public.store_domains
    (store_id, hostname, kind, status, verification_token)
  values (p_store_id, v_host, 'custom', 'verification_required', v_token)
  returning id into v_id;

  return query select v_id, v_token;
end;
$$;

revoke execute on function public.add_custom_domain(uuid, text) from public, anon;
grant   execute on function public.add_custom_domain(uuid, text) to authenticated;

-- إعادة الربط بعد الإزالة تتطلب دورة تحقق جديدة بتوكن جديد
create or replace function app.rotate_domain_token()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'removed' and new.status <> 'removed' then
    new.verification_token := app.random_token(16);
    new.verified_at := null;
    new.status := 'verification_required';
  end if;
  return new;
end;
$$;

create trigger store_domains_rotate_token before update on public.store_domains
  for each row execute function app.rotate_domain_token();

-- =====================================================================
-- RLS
-- =====================================================================
create policy store_domains_member_read on public.store_domains
  for select to authenticated using (app.is_store_member(store_id));

create policy store_domains_manage on public.store_domains
  for all to authenticated
  using (app.has_store_permission(store_id, 'domain:manage'))
  with check (app.has_store_permission(store_id, 'domain:manage'));

create policy store_domains_platform_read on public.store_domains
  for select to authenticated
  using (app.has_platform_permission('domains', 'view'));

create policy store_domains_platform_write on public.store_domains
  for all to authenticated
  using (app.has_platform_permission('domains', 'edit'))
  with check (app.has_platform_permission('domains', 'edit'));

grant select, insert, update, delete on public.store_domains to authenticated;
