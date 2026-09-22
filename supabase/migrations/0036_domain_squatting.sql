-- =====================================================================
-- 0036 منع احتكار نطاق المنصة (إضافية · لا تمسّ ما سبق)
--
-- ★ الثغرة: `add_custom_domain` كانت تفحص التكرار وحده، فتاجر يستطيع
-- تسجيل:
--
--     nilemarket.online            ← جذر المنصة
--     www.nilemarket.online
--     store-b.nilemarket.online    ← نطاق متجر آخر لم يُنشأ بعد
--
-- كدومين «مخصص» لمتجره. لا يستطيع إثبات الملكية عبر DNS، فلا يُوجَّه
-- إليه شيء — لكن الصفّ يبقى محجوزًا، و`DOMAIN_TAKEN` يمنع صاحب الحق
-- من تسجيله لاحقًا.
--
-- ★ الأثر الأخطر: `app.create_default_subdomain` تُدرج نطاق المتجر
-- بـ`on conflict do nothing`. فلو احتُكر `store-b.nilemarket.online`
-- قبل إنشاء «store-b»، يُنشأ المتجر **بلا نطاق أساسي إطلاقًا** —
-- فلا يُحلّ من الـHost ولا يفتحه أحد، بصمت وبلا رسالة خطأ.
--
-- الإصلاح: الجذر وكل ما تحته محجوز على المنصة، والنطاق الفرعي يُنشأ
-- من مسار واحد هو `create_default_subdomain` لا غير.
-- =====================================================================

create or replace function app.is_platform_domain(p_host text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce(trim(p_host), '') = '' then false
    else lower(trim(p_host)) = v.root
         or lower(trim(p_host)) like '%.' || v.root
  end
  from (select coalesce(
          nullif(current_setting('app.root_domain', true), ''),
          'nilemarket.online') as root) v;
$$;

create or replace function public.add_custom_domain(
  p_store_id uuid,
  p_hostname text
)
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

  -- ★ نطاق حقيقي يحتاج نقطة: اسم بلا نقطة (localhost) لا يُشترى ولا
  -- يُثبَت بـDNS، وتسجيله يحجز صفًّا بلا فائدة.
  if position('.' in v_host) = 0 then
    raise exception 'INVALID_HOSTNAME: أدخل نطاقًا كاملًا' using errcode = 'P0001';
  end if;
  if v_host like '%..%' then
    raise exception 'INVALID_HOSTNAME' using errcode = 'P0001';
  end if;

  -- ★ نطاق المنصة وكل ما تحته محجوز: النطاق الفرعي للمتجر يُنشأ
  -- تلقائيًا من `app.create_default_subdomain` وحدها.
  if app.is_platform_domain(v_host) then
    raise exception 'RESERVED_DOMAIN: نطاق المنصة محجوز — نطاق متجرك الفرعي يُنشأ تلقائيًا'
      using errcode = 'P0001';
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

-- ---------------------------------------------------------------------
-- ★ إنشاء المتجر لا يمرّ بصمت حين يتعذّر إنشاء نطاقه الفرعي.
--
-- `on conflict do nothing` كانت تترك المتجر بلا نطاق أساسي — يُنشأ
-- «بنجاح» ثم لا يفتحه أحد. الآن التعارض يُرفع كخطأ صريح فتفشل
-- المعاملة كلّها بدل إنشاء متجر معطوب.
-- ---------------------------------------------------------------------
create or replace function app.create_default_subdomain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_root text;
  v_host text;
begin
  v_root := coalesce(nullif(current_setting('app.root_domain', true), ''),
                     'nilemarket.online');
  v_host := lower(new.slug) || '.' || v_root;

  if exists (select 1 from public.store_domains where lower(hostname) = v_host) then
    raise exception 'SUBDOMAIN_TAKEN: النطاق الفرعي % محجوز', v_host
      using errcode = 'P0001';
  end if;

  insert into public.store_domains
    (store_id, hostname, kind, status, is_primary, verified_at)
  values (new.id, v_host, 'subdomain', 'active', true, now());

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- ★ إحكام المنح: `app.notify` و`app.queue_email` كانتا ممنوحتين
-- لـPUBLIC. مخطط `app` ليس ضمن المخططات التي تكشفها PostgREST، فلا
-- مسار استدعاء اليوم — لكن دالة `security definer` تكتب في صندوق
-- تنبيهات أي مستخدم برابط عشوائي لا تُترك مفتوحة على احتمال.
-- ---------------------------------------------------------------------
revoke execute on function app.notify(uuid, text, text, text, text, uuid, text)
  from public, anon, authenticated;
revoke execute on function app.queue_email(text, text, jsonb, text)
  from public, anon, authenticated;

-- ★ ورابط التنبيه مسار داخلي دائمًا: الواجهة تصيّره في `<Link href>`،
-- فقيمة مثل `javascript:` كانت ستصير XSS لو وُجد مسار كتابة.
-- القيد يجعل ذلك مستحيلًا في التخزين لا في العرض.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.notifications'::regclass
                    and conname = 'notifications_link_internal') then
    alter table public.notifications
      add constraint notifications_link_internal
      check (link is null or link ~ '^/[^/\\]');
  end if;
end $$;
