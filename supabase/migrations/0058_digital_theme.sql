-- =====================================================================
-- 0058 القالب الرقمي — البنية (إضافية · لا تمسّ بيانات قائمة)
--
-- قالبٌ داخل منصّة المتاجر نفسها لا منصّة ثانية: لا جدول منتجات ثانٍ،
-- ولا سلّة ثانية، ولا نظام دفع ثانٍ، ولا آلة حالة ثانية، ولا نظام
-- اشتراكات ثانٍ. الجديد ثلاثة أنواع فقط:
--   (١) علمٌ يقول أيّ واجهة تُعرض.
--   (٢) شرطٌ يُضاف إلى بوّابة الطلبات القائمة — لا بوّابة موازية.
--   (٣) جداول لما لا مكان له في المخطّط: حقول المنتج الرقمي، ولقطة
--       ما أدخله الزبون، ومكتبة أصول المنصّة، وبنرات المتجر.
--
-- ★★ القاعدة التجارية المحورية — التجهيز منفصل عن الاستقبال:
--   التاجر يهيّئ متجره الرقمي بالكامل على الباقة المجانية (المنتجات
--   والباقات والتصنيفات والحقول والبنرات والمعاينة)، ولا يستقبل
--   **طلبًا** إلا باشتراك مدفوع فعّال. فالحدود القائمة
--   (`assert_within_limit`) هي ما يحكم التجهيز، و`store_can_checkout`
--   هي ما يحكم الاستقبال — وهما مساران لا يتقاطعان.
--   ولذلك **لا يُرفع حدّ باقة ولا يُغيَّر سعر ولا تُمسّ صلاحية**.
--
-- ★ وإصلاح عطب مُثبَت في `transition_order` (انظر §٥ أدناه) — عطبٌ
--   قائم اليوم في المتجر العادي أيضًا، والقالب الرقمي يجعله المسار
--   الطبيعي فيجب إصلاحه قبل أوّل طلب رقمي.
-- =====================================================================

-- =====================================================================
-- ١) علم القالب
--
-- عمود مطبوع ومقيَّد لا مفتاح داخل `theme jsonb`: الـrenderer والدوال
-- الخادمية تفرّع عليه، وjsonb لا يمنع قيمة مكتوبة خطأً ولا يُفهرَس.
-- و`theme jsonb` يبقى كما هو لإظهار/إخفاء الأقسام — خريطة بوليانات
-- مسطّحة بلا مفاتيح خارجية ولا ترتيب، وهو ما يصلح له jsonb.
-- =====================================================================
alter table public.store_settings
  add column if not exists storefront_template text not null default 'classic';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'store_settings_template_check'
      and conrelid = 'public.store_settings'::regclass
  ) then
    alter table public.store_settings
      add constraint store_settings_template_check
      check (storefront_template in ('classic', 'digital'));
  end if;
end $$;

create index if not exists store_settings_digital_idx
  on public.store_settings (store_id) where storefront_template = 'digital';

-- ★ المنح على مستوى العمود (نمط 0038): `revoke select` العام سارٍ على
-- هذا الجدول، فعمودٌ جديد **لا يُقرأ** حتى يُمنح صراحةً. وبلا هذا
-- السطر يعمل القالب في اللوحة ولا يعمل في المتجر.
grant select (storefront_template) on public.store_settings to anon, authenticated;

-- =====================================================================
-- ٢) القالب وأهلية الطلبات
-- =====================================================================

/** قالب واجهة المتجر — `classic` لمن لا صفّ إعدادات له (لا نخترع رقميًّا). */
create or replace function app.store_template(p_store_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.storefront_template from public.store_settings s
      where s.store_id = p_store_id),
    'classic');
$$;

grant execute on function app.store_template(uuid) to anon, authenticated;

/**
 * هل يُسمح للمتجر الرقمي باستقبال الطلبات؟
 *
 * ★ الشرط: اشتراك تشغيلي على باقة **غير مجانية**. وهذا هو نصّ القاعدة
 * التجارية: «الباقة الأساسية مدفوعة/فعّالة». و`subscription_is_operational`
 * القائمة هي ما يستثني `expired` و`suspended` و`cancelled` — فانتهاء
 * الاشتراك يُغلق الاستقبال بالقواعد القائمة بلا منطق جديد.
 *
 * ★ ولماذا لا مفتاح entitlement كمصدر أوّلي: `app.has_feature` تعيد
 * **true** للمفتاح غير المضبوط (D18 — «لا نخترع منعًا»)، فمفتاحٌ جديد
 * يولد غير مضبوط على الباقات الثلاث ⇒ يفتح الطلبات على المجانية بصمت.
 * فالأساس `plans.is_free = false`، ويُستشار المفتاح **فقط إن ضُبط
 * صراحةً** — فيبقى للإدارة تجاوزٌ مستقبلي بلا فتحةٍ افتراضية.
 */
create or replace function app.digital_orders_allowed(p_store_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  v_paid boolean;
begin
  select exists (
    select 1
    from public.subscriptions sub
    join public.plans p on p.id = sub.plan_id
    where sub.store_id = p_store_id
      and sub.status <> 'cancelled'
      and app.subscription_is_operational(sub.status)
      and p.is_free = false
  ) into v_paid;

  -- تجاوز إداري صريح إن ضُبط المفتاح؛ وإلا القاعدة أعلاه
  select * into r from app.entitlement_limit(p_store_id, 'digital_store.orders');
  if found and r.configured and r.bool_value is not null then
    return r.bool_value;
  end if;

  return v_paid;
end;
$$;

grant execute on function app.digital_orders_allowed(uuid) to anon, authenticated;

/**
 * ★★ D14 موسَّعة: البوّابة نفسها لا بوّابة موازية.
 *
 * `store_can_checkout` منادَاة من **سبعة** مواضع في المخطّط:
 * `create_order` (0008 · 0034 · 0039)، `prepare_order_proof_upload`
 * (0045)، `quote_checkout` (0018)، `resolve_store_by_host` (0011)،
 * وتفصيل المتجر في الإدارة (0050). وإضافة الشرط هنا تغطّيها كلّها
 * دفعةً واحدة، فلا موضع منسيّ — وموضعٌ واحد منسيّ يكفي لثقب الشرط.
 * ويسري تلقائيًّا على `store.canCheckout` الذي يعطّل زرّ الشراء
 * ويُظهر شريط «غير متاح للشراء» في المتجر.
 *
 * ★ وأثره على المتجر العادي **صفر** بحكم `template <> 'digital'`:
 *   عادي + مجانية يبقى كما هو بالضبط. واختبار صريح يثبته.
 *
 * ★ ولا يمسّ التجهيز: الحدود (`assert_within_limit`) مسار آخر تمامًا،
 *   فالتاجر يضيف ويعدّل ويعاين وطلباته مقفلة.
 */
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
      -- ★ الشرط الرقمي الجديد — no-op على `classic`
      and (app.store_template(s.id) <> 'digital'
           or app.digital_orders_allowed(s.id))
  );
$$;

grant execute on function app.store_can_checkout(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- تبديل القالب — فعلٌ خادميّ بصلاحية وسجلّ تدقيق
--
-- ★ لا يُحذف صفٌّ واحد ولا يُغيَّر معرّف: المنتجات والتصنيفات والباقات
-- والطلبات وإعدادات المتجر تبقى كما هي. والعودة إلى `classic` تُبقي
-- الحقول الرقمية والبنرات محفوظةً غير مستخدمة — فالرجوع للرقمي
-- يستعيد كل شيء كما كان.
-- ---------------------------------------------------------------------
create or replace function public.set_storefront_template(
  p_store_id uuid,
  p_template text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_old text;
begin
  if p_template not in ('classic', 'digital') then
    raise exception 'VALIDATION: قالب غير معروف' using errcode = 'P0001';
  end if;
  if not app.has_store_permission(p_store_id, 'settings:update') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  v_old := app.store_template(p_store_id);
  if v_old = p_template then return p_template; end if;

  update public.store_settings
     set storefront_template = p_template
   where store_id = p_store_id;

  perform app.audit('store.template_changed', 'store_settings', p_store_id, p_store_id,
                    jsonb_build_object('storefront_template', v_old),
                    jsonb_build_object('storefront_template', p_template));
  return p_template;
end;
$$;

revoke execute on function public.set_storefront_template(uuid, text) from public, anon;
grant   execute on function public.set_storefront_template(uuid, text) to authenticated;

-- =====================================================================
-- ٣) حقول المنتج الرقمي
--
-- جدولٌ لا `products.attributes jsonb`: الحقول مرتَّبة، تُحرَّر فرديًّا،
-- وتحتاج قيود طول وتفرّدًا — وjsonb لا يفرض شيئًا منها. و`save_product`
-- لا تقبل `attributes` أصلًا.
--
-- ★ ميزة رقمية بحتة: المنتج العادي لا حقول له، فلا يُطلب من زبونه شيء.
-- =====================================================================
create table if not exists public.product_digital_fields (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  label      text not null check (length(trim(label)) between 1 and 60),
  hint       text check (length(hint) <= 200),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists product_digital_fields_label_unique
  on public.product_digital_fields (product_id, lower(trim(label)))
  where deleted_at is null;
create index if not exists product_digital_fields_product_idx
  on public.product_digital_fields (product_id, sort_order)
  where deleted_at is null and is_active;
create index if not exists product_digital_fields_store_idx
  on public.product_digital_fields (store_id) where deleted_at is null;

drop trigger if exists product_digital_fields_set_updated_at on public.product_digital_fields;
create trigger product_digital_fields_set_updated_at
  before update on public.product_digital_fields
  for each row execute function app.set_updated_at();

drop trigger if exists product_digital_fields_freeze_store on public.product_digital_fields;
create trigger product_digital_fields_freeze_store
  before update on public.product_digital_fields
  for each row execute function app.freeze_store_id();

alter table public.product_digital_fields enable row level security;

-- الزبون يقرأ حقول متجر عامّ ليعرف ما يُدخل؛ لا أكثر.
drop policy if exists product_digital_fields_public_read on public.product_digital_fields;
create policy product_digital_fields_public_read on public.product_digital_fields
  for select to anon, authenticated
  using (is_active and deleted_at is null and app.is_store_public(store_id));

drop policy if exists product_digital_fields_member_read on public.product_digital_fields;
create policy product_digital_fields_member_read on public.product_digital_fields
  for select to authenticated
  using (app.has_store_permission(store_id, 'products:view'));

drop policy if exists product_digital_fields_member_write on public.product_digital_fields;
create policy product_digital_fields_member_write on public.product_digital_fields
  for all to authenticated
  using (app.has_store_permission(store_id, 'products:update'))
  with check (app.has_store_permission(store_id, 'products:update'));

-- =====================================================================
-- ٤) لقطة ما أدخله الزبون
--
-- لقطة نصية لا مفتاح خارجي إلى التعريف: حذف التاجر لحقلٍ بعد الطلب
-- لا يجوز أن يمحو ما أدخله الزبون — نفس السبب الذي يجعل `order_items`
-- تحفظ `product_name` نصًّا.
--
-- ★ إلحاقيّ: لا تعديل ولا حذف لأيّ دور. سجلّ طلبٍ لا مسوّدة.
-- ★ ولا سياسة anon إطلاقًا: قراءة الزائر تمرّ بـ`order_details` وحدها
--   (بتوكن الطلب) — وهو الحاجز القائم نفسه.
-- =====================================================================
create table if not exists public.order_digital_values (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  store_id    uuid not null references public.stores (id) on delete cascade,
  field_label text not null,
  value       text not null check (length(trim(value)) between 1 and 120),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists order_digital_values_order_idx
  on public.order_digital_values (order_id, sort_order);

drop trigger if exists order_digital_values_freeze_store on public.order_digital_values;
create trigger order_digital_values_freeze_store
  before update on public.order_digital_values
  for each row execute function app.freeze_store_id();

drop trigger if exists order_digital_values_no_update on public.order_digital_values;
create trigger order_digital_values_no_update
  before update on public.order_digital_values
  for each row execute function app.block_mutation();

drop trigger if exists order_digital_values_no_delete on public.order_digital_values;
create trigger order_digital_values_no_delete
  before delete on public.order_digital_values
  for each row execute function app.block_mutation();

alter table public.order_digital_values enable row level security;

drop policy if exists order_digital_values_member_read on public.order_digital_values;
create policy order_digital_values_member_read on public.order_digital_values
  for select to authenticated
  using (app.has_store_permission(store_id, 'orders:view'));

drop policy if exists order_digital_values_customer_read on public.order_digital_values;
create policy order_digital_values_customer_read on public.order_digital_values
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id
      and o.customer_id is not null
      and o.customer_id = app.current_customer_id(o.store_id)
  ));

drop policy if exists order_digital_values_platform_read on public.order_digital_values;
create policy order_digital_values_platform_read on public.order_digital_values
  for select to authenticated
  using (app.has_platform_permission('orders', 'view'));

-- لا INSERT لأيّ دور: تُكتب داخل دالّة الطلب الرقمي (security definer).

-- =====================================================================
-- ٥) ★ إصلاح عطب مُثبَت: الشحن الثاني لمنتج بلا تتبّع مخزون
--
-- `transition_order` كانت تُدرج حركة مخزون سالبة **لكل سطر بلا شرط**،
-- بخلاف `create_order` و`cart_add_item` اللتين تفحصان
-- `products.track_inventory`. فمنتجٌ بلا تتبّع:
--   · أوّل شحن ⇒ `insert ... greatest(-1, 0)` ⇒ صفٌّ بكمية ٠.
--   · ثاني شحن ⇒ `0 + (-1) = -1` ⇒ خرق `inventory_non_negative`.
--
-- مُثبَت بالتشغيل لا باستنتاج:
--   مخزون بعد أوّل شحن: quantity=0 · ثاني شحن:
--   ERROR: new row for relation "inventory" violates check constraint
--   "inventory_non_negative" — Failing row contains (..., -1, 0, ...)
--
-- وهو عطبٌ قائم اليوم لأيّ منتج عادي بلا تتبّع، لكنّ القالب الرقمي
-- يحوّله من حالة نادرة إلى المسار الطبيعي (كل منتج رقمي بلا تتبّع).
--
-- الإصلاح: احترام `track_inventory` — نفس ما تفعله `create_order`.
-- ولا يُرخى `inventory_non_negative` (هو الحاجز الذي أثبتَت اختبارات
-- التزامن أنّه يمنع البيع الزائد)، ولا تُخترَع كمية وهمية.
--
-- ما عدا ذلك الدالّة **حرفيًّا** كما كانت: آلة الحالة، والصلاحيات،
-- وحارس الرجوع خطوةً، وإلزام سبب الإلغاء، والسجلّ — بلا حرف.
-- =====================================================================
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
  v_track boolean;
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

  -- أثر المخزون — لمنتج متتبَّع فقط (★ الإصلاح)
  if p_to = 'shipped' then
    for v_item in select * from public.order_items where order_id = p_order_id loop
      if v_item.product_id is not null then
        select track_inventory into v_track from public.products
         where id = v_item.product_id;
        if coalesce(v_track, false) then
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
      end if;
    end loop;
  elsif p_to = 'cancelled' then
    for v_item in select * from public.order_items where order_id = p_order_id loop
      if v_item.product_id is not null then
        select track_inventory into v_track from public.products
         where id = v_item.product_id;
        if coalesce(v_track, false) then
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

revoke execute on function public.transition_order(uuid, public.order_status, text)
  from public, anon;
grant   execute on function public.transition_order(uuid, public.order_status, text)
  to authenticated;

-- =====================================================================
-- ٦) مكتبة أصول المنصّة
--
-- جدولٌ ودلوٌ منفصلان لا `media_files` بـ`store_id = null`، لسببين
-- قاسهما الكود:
--   · `media_public_read` تشترط `store_id is not null and
--     app.is_store_public(store_id)` ⇒ صفٌّ بلا متجر غير مرئي لـanon.
--   · `media_member_write` تمنح `for all` لكل من يملك `products:update`
--     على متجره ⇒ لو حُمِّل الأصل المشترك على متجر لأمكن لذلك التاجر
--     تعديلَه — وهو ما يجب أن يكون **مستحيلًا بنيويًّا** لا مستبعَدًا.
--
-- ومكسبٌ جانبيّ: `app.store_storage_mb` تجمع بـ`store_id`، فأصول
-- المكتبة لا تُحمَّل على حصّة تخزين التاجر.
--
-- ★ الحقوق: `license_note` إلزامي لكل أصل نشط. لا يُنشَر أصلٌ بلا
--   مصدر موثَّق، ولا يُفترض ترخيصٌ لعلامةٍ تجارية لا نملكه.
-- =====================================================================
create table if not exists public.platform_media (
  id            uuid primary key default gen_random_uuid(),
  -- ★ الأصل نفسه صفٌّ في `media_files` بـ`store_id = null` ⇒ المفاتيح
  -- الخارجية القائمة (`categories.image_id` · `product_images.media_file_id`)
  -- تشير إليه بلا أيّ تغيير في جدول قائم، ولا نظام صور موازٍ.
  media_file_id uuid not null unique
                  references public.media_files (id) on delete restrict,
  kind          text not null check (kind in ('category', 'product', 'banner')),
  slug          text not null unique
                  check (slug ~ '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$'),
  label         text not null check (length(trim(label)) between 1 and 80),
  source_note   text,
  license_note  text,
  is_active     boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- ★ لا تنشيط بلا ترخيص موثَّق
  constraint platform_media_license_required
    check (not is_active or coalesce(trim(license_note), '') <> '')
);

create index if not exists platform_media_kind_idx
  on public.platform_media (kind, sort_order) where is_active;

drop trigger if exists platform_media_set_updated_at on public.platform_media;
create trigger platform_media_set_updated_at before update on public.platform_media
  for each row execute function app.set_updated_at();

alter table public.platform_media enable row level security;

drop policy if exists platform_media_public_read on public.platform_media;
create policy platform_media_public_read on public.platform_media
  for select to anon, authenticated
  using (is_active);

drop policy if exists platform_media_admin_all on public.platform_media;
create policy platform_media_admin_all on public.platform_media
  for all to authenticated
  using (app.has_platform_permission('settings', 'manage'))
  with check (app.has_platform_permission('settings', 'manage'));

-- الدلو: عامّ للقراءة، وبلا أيّ سياسة كتابة لدور عميل.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('theme-library', 'theme-library', true, 5242880,
        array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "theme_library_read" on storage.objects;
create policy "theme_library_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'theme-library');

-- ★ لا insert/update/delete لـanon ولا authenticated على هذا الدلو:
--   الرفع من الإدارة بدور الخدمة وحده. فتاجرٌ لا يستطيع تعديل أصلٍ
--   مشترك ولا حذفه ولا تغييره على بقيّة التجّار — بنيويًّا لا بسياسة.

-- ---------------------------------------------------------------------
-- ★ توسيع قراءة الوسائط لتشمل أصل المكتبة المشترك.
--
-- `media_public_read` كانت تشترط `store_id is not null` ⇒ أصلٌ لا يملكه
-- متجر **غير مرئي للزائر**، فلا تظهر صورة المكتبة في أيّ متجر. والشرط
-- يُوسَّع لا يُرخى: الأصل المشترك مقصور على دلو `theme-library`.
--
-- ★ و`media_member_write` تبقى كما هي حرفيًّا — وهي تشترط
--   `store_id is not null` ⇒ التاجر **لا يستطيع** كتابة صفّ المكتبة
--   ولا تعديله ولا حذفه. وهذا هو الحاجز المطلوب.
-- ★ و`app.store_storage_mb` تجمع بـ`store_id` ⇒ أصول المكتبة لا
--   تُحمَّل على حصّة تخزين أيّ تاجر.
-- ---------------------------------------------------------------------
drop policy if exists media_public_read on public.media_files;
create policy media_public_read on public.media_files
  for select to anon, authenticated
  using (
    status = 'ready' and deleted_at is null
    and purpose in ('product_image','store_logo','store_banner','category_image')
    and (
      (store_id is not null and app.is_store_public(store_id))
      or (store_id is null and bucket = 'theme-library')
    )
  );

/**
 * تسجيل أصل في المكتبة — للإدارة وحدها.
 *
 * ★ البايتات تُرفع بدور الخدمة إلى دلو `theme-library` (لا سياسة كتابة
 * لأيّ دور عميل)، وهذه الدالّة تُسجّل الأصل وتربطه. ولا يُنشَّط أصل
 * بلا `license_note` — القيد يفرضه لا التعليمات.
 */
create or replace function public.register_platform_media(
  p_slug         text,
  p_kind         text,
  p_label        text,
  p_path         text,
  p_mime         text,
  p_size         bigint,
  p_width        integer default null,
  p_height       integer default null,
  p_blur         text default null,
  p_source_note  text default null,
  p_license_note text default null,
  p_is_active    boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media uuid;
  v_id    uuid;
begin
  if not app.has_platform_permission('settings', 'manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_kind not in ('category', 'product', 'banner') then
    raise exception 'VALIDATION: نوع الأصل غير معروف' using errcode = 'P0001';
  end if;

  select pm.media_file_id into v_media
    from public.platform_media pm where pm.slug = lower(trim(p_slug));

  if v_media is null then
    insert into public.media_files
      (bucket, path, owner_profile_id, store_id, purpose, mime_type, size_bytes,
       width, height, blur_data_url, status)
    values ('theme-library', p_path, (select auth.uid()), null,
            case p_kind when 'category' then 'category_image'::public.media_purpose
                        when 'banner'   then 'store_banner'::public.media_purpose
                        else 'product_image'::public.media_purpose end,
            p_mime, greatest(coalesce(p_size, 1), 1), p_width, p_height, p_blur, 'ready')
    returning id into v_media;
  end if;

  insert into public.platform_media
    (media_file_id, kind, slug, label, source_note, license_note, is_active)
  values (v_media, p_kind, lower(trim(p_slug)), trim(p_label),
          nullif(trim(p_source_note), ''), nullif(trim(p_license_note), ''),
          coalesce(p_is_active, false))
  on conflict (slug) do update
    set label = excluded.label,
        source_note = excluded.source_note,
        license_note = excluded.license_note,
        is_active = excluded.is_active
  returning id into v_id;

  perform app.audit('platform_media.registered', 'platform_media', v_id, null,
                    null, jsonb_build_object('slug', lower(trim(p_slug))));
  return v_id;
end;
$$;

revoke execute on function public.register_platform_media(
  text, text, text, text, text, bigint, integer, integer, text, text, text, boolean)
  from public, anon;
grant execute on function public.register_platform_media(
  text, text, text, text, text, bigint, integer, integer, text, text, text, boolean)
  to authenticated;

-- =====================================================================
-- ٧) بنرات المتجر
-- =====================================================================
create table if not exists public.store_theme_banners (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores (id) on delete cascade,
  -- ★ عمودٌ واحد لا عمودان: أصل المكتبة **هو** صفّ في `media_files`
  -- (بـ`store_id = null`)، فاختيارٌ من المكتبة ورفعٌ خاص يسكنان نفس
  -- العمود ولا يحتاجان جمعًا. والدالّة هي ما يتحقّق من مِلكيّة الأصل.
  media_file_id    uuid references public.media_files (id) on delete set null,
  slot             text not null default 'hero' check (slot in ('hero', 'promo')),
  title            text check (length(title) <= 80),
  description      text check (length(description) <= 160),
  cta_label        text check (length(cta_label) <= 40),
  cta_href         text check (length(cta_href) <= 300),
  is_visible       boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index if not exists store_theme_banners_store_idx
  on public.store_theme_banners (store_id, slot, sort_order)
  where deleted_at is null and is_visible;

drop trigger if exists store_theme_banners_set_updated_at on public.store_theme_banners;
create trigger store_theme_banners_set_updated_at
  before update on public.store_theme_banners
  for each row execute function app.set_updated_at();

drop trigger if exists store_theme_banners_freeze_store on public.store_theme_banners;
create trigger store_theme_banners_freeze_store
  before update on public.store_theme_banners
  for each row execute function app.freeze_store_id();

alter table public.store_theme_banners enable row level security;

drop policy if exists store_theme_banners_public_read on public.store_theme_banners;
create policy store_theme_banners_public_read on public.store_theme_banners
  for select to anon, authenticated
  using (is_visible and deleted_at is null and app.is_store_public(store_id));

drop policy if exists store_theme_banners_member_read on public.store_theme_banners;
create policy store_theme_banners_member_read on public.store_theme_banners
  for select to authenticated
  using (app.has_store_permission(store_id, 'settings:view'));

-- الكتابة عبر الدوال المدقَّقة وحدها: `cta_href` يجب أن يُتحقَّق منه،
-- و`media_file_id` يجب أن يكون ملفًا لهذا المتجر. سياسة صفٍّ لا تفرض
-- أيًّا منهما، فلا تُمنح كتابة مباشرة.

-- =====================================================================
-- ٨) مفتاح ميزة للتجاوز الإداري (غير مضبوط — فلا يُنفَّذ بذاته)
--
-- D18: يولد `configured_at = null` لكل باقة ⇒ `digital_orders_allowed`
-- تتجاهله وتعتمد `plans.is_free = false`. ولا يُضبط من migration:
-- ضبطُه قرارٌ إداريّ لا قرار كود.
-- =====================================================================
insert into public.plan_entitlements (plan_id, feature_key)
select p.id, 'digital_store.orders' from public.plans p
on conflict (plan_id, feature_key) do nothing;

-- =====================================================================
-- ٩) المنح — قائمة بيضاء صريحة لا منحٌ شامل
--
-- ★ الجدول الجديد لا يُقرأ حتى يُمنح: لا منح شامل في هذا المخطّط،
--   وهذا مقصود (الدرس نفسه في 0038 و0051). والمنح هنا أضيق ما يكفي.
-- =====================================================================

-- حقول المنتج الرقمي: عامّة القراءة (الزبون يجب أن يعرف ما يُدخل)،
-- والكتابة بـRLS على صلاحية `products:update`.
grant select on public.product_digital_fields to anon, authenticated;
grant insert, update, delete on public.product_digital_fields to authenticated;

-- ★★ لقطة قيم الزبون: **لا منح لـanon إطلاقًا**. الزائر يقرؤها عبر
--    دالّة مُحكمة بتوكن طلبه وحدها. وانعدام المنح ضمانٌ أقوى من
--    ترشيح RLS: لا سياسةَ خاطئةٌ تفتحه لأنّ الدور لا يملك الجدول.
-- ★★ ولا insert/update/delete لأيّ دور: تُكتب داخل دالّة الطلب الرقمي.
grant select on public.order_digital_values to authenticated;

-- مكتبة المنصّة: قراءة عامّة (الأصل النشط)، وكتابة بـRLS للإدارة.
grant select on public.platform_media to anon, authenticated;
grant insert, update, delete on public.platform_media to authenticated;

-- ★★ بنرات المتجر: قراءة عامّة، و**لا كتابة مباشرة لأيّ دور**.
--    سياسة صفٍّ لا تستطيع التحقّق من `cta_href` ولا من مِلكيّة الصورة،
--    فالكتابة عبر `save_theme_banner` / `delete_theme_banner` حصرًا.
grant select on public.store_theme_banners to anon, authenticated;
