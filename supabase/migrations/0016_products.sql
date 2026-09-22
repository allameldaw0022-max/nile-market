-- =====================================================================
-- 0016 Products & Inventory — دوال الإدارة (إضافية · لا تمسّ ما سبق)
--
-- لماذا دوال لا كتابة مباشرة على الجداول؟ إنشاء منتج عملية مركّبة:
-- منتج + مخزون ابتدائي + صور + متغيّرات + حد الباقة. تنفيذها من
-- الواجهة في عدة نداءات يترك صفوفًا يتيمة عند أول فشل، ويجعل حد
-- الباقة قابلًا للتجاوز بترتيب النداءات. الدالة تجعلها ذرّية ومدقَّقة.
--
-- المخزون لا يُكتب مباشرة هنا أيضًا — كل تغيير يمر بـinventory_movements
-- (§12) ليبقى للرصيد أثر كامل.
-- =====================================================================

-- ---------------------------------------------------------------------
-- غلاف عام لفحص توفر الـslug: سكيمة app غير مكشوفة عبر PostgREST،
-- والواجهة تحتاج الفحص أثناء الكتابة في الـWizard.
-- ---------------------------------------------------------------------
create or replace function public.is_slug_available(
  p_slug     text,
  p_store_id uuid default null
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select app.is_slug_available(p_slug, p_store_id);
$$;

revoke execute on function public.is_slug_available(text, uuid) from public, anon;
grant   execute on function public.is_slug_available(text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- slug فريد للمنتج داخل المتجر. يلحق -2 · -3 … عند التصادم.
-- ---------------------------------------------------------------------
create or replace function app.unique_product_slug(
  p_store_id   uuid,
  p_base       text,
  p_product_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base text := app.slugify(p_base);
  v_try  text;
  v_n    integer := 1;
begin
  if v_base is null or v_base = '' then
    v_base := 'product';
  end if;
  v_base := left(v_base, 80);
  v_try  := v_base;

  while exists (
    select 1 from public.products
    where store_id = p_store_id
      and lower(slug) = lower(v_try)
      and deleted_at is null
      and (p_product_id is null or id <> p_product_id)
  ) loop
    v_n := v_n + 1;
    v_try := v_base || '-' || v_n::text;
    if v_n > 200 then
      v_try := v_base || '-' || substr(gen_random_uuid()::text, 1, 8);
      exit;
    end if;
  end loop;

  return v_try;
end;
$$;

grant execute on function app.unique_product_slug(uuid, text, uuid) to authenticated;

-- نفس الفكرة للتصنيفات (فهرس slug فريد داخل المتجر)
create or replace function app.unique_category_slug(p_store_id uuid, p_base text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base text := coalesce(nullif(app.slugify(p_base), ''), 'category');
  v_try  text;
  v_n    integer := 1;
begin
  v_base := left(v_base, 60);
  v_try  := v_base;
  while exists (
    select 1 from public.categories
    where store_id = p_store_id and lower(slug) = lower(v_try) and deleted_at is null
  ) loop
    v_n := v_n + 1;
    v_try := v_base || '-' || v_n::text;
    if v_n > 200 then
      v_try := v_base || '-' || substr(gen_random_uuid()::text, 1, 8);
      exit;
    end if;
  end loop;
  return v_try;
end;
$$;

grant execute on function app.unique_category_slug(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- ربط صور المنتج. الصور تُطابَق على المتجر والغرض قبل الربط ⇒
-- لا يربط تاجر ملفًا لمتجر آخر ولا ملفًا لم يكتمل رفعه.
-- ---------------------------------------------------------------------
create or replace function app.sync_product_images(
  p_store_id   uuid,
  p_product_id uuid,
  p_media_ids  uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_i  integer := 0;
begin
  -- null ⇒ «لم تُرسل الصور» فلا تُلمس. مصفوفة فارغة ⇒ «أزل كل الصور».
  if p_media_ids is null then
    return;
  end if;

  -- تحقق أولًا من كل الملفات قبل أي كتابة: فشل نصف الطريق يتركه
  -- المنتج بصور ناقصة.
  foreach v_id in array p_media_ids loop
    if not exists (
      select 1 from public.media_files m
      where m.id = v_id
        and m.store_id = p_store_id
        and m.purpose = 'product_image'
        and m.status = 'ready'
        and m.deleted_at is null
    ) then
      raise exception 'INVALID_MEDIA: ملف صورة غير صالح لهذا المتجر'
        using errcode = 'P0001';
    end if;
  end loop;

  -- الجدول رابط لا سجل تاريخي: إعادة البناء أبسط وأسلم من المزامنة
  -- الجزئية مع فهرس «أساسية واحدة» الفريد.
  delete from public.product_images where product_id = p_product_id;

  foreach v_id in array p_media_ids loop
    insert into public.product_images
      (product_id, store_id, media_file_id, sort_order, is_primary)
    values (p_product_id, p_store_id, v_id, v_i, v_i = 0);
    v_i := v_i + 1;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- حركة مخزون واحدة (تُستخدم داخليًا وعبر adjust_inventory)
-- ---------------------------------------------------------------------
create or replace function app.record_movement(
  p_store_id   uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_delta      integer,
  p_reason     public.inventory_reason,
  p_note       text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_qty integer;
begin
  if p_delta = 0 then
    select quantity into v_qty from public.inventory
     where product_id = p_product_id
       and coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = coalesce(p_variant_id, '00000000-0000-0000-0000-000000000000'::uuid);
    return coalesce(v_qty, 0);
  end if;

  insert into public.inventory_movements
    (store_id, product_id, variant_id, delta, reason, actor_id, note)
  values (p_store_id, p_product_id, p_variant_id, p_delta, p_reason,
          (select auth.uid()), nullif(trim(p_note), ''));

  select quantity into v_qty from public.inventory
   where product_id = p_product_id
     and coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = coalesce(p_variant_id, '00000000-0000-0000-0000-000000000000'::uuid);

  return coalesce(v_qty, 0);
end;
$$;

-- =====================================================================
-- ★ حفظ منتج — إنشاء أو تحديث، ذرّيًا
-- =====================================================================
create or replace function public.save_product(
  p_store_id            uuid,
  p_name                text,
  p_price               numeric,
  p_product_id          uuid default null,
  p_slug                text default null,
  p_description         text default null,
  p_compare_at_price    numeric default null,
  p_cost_price          numeric default null,
  p_sku                 text default null,
  p_category_id         uuid default null,
  p_status              public.product_status default null,
  p_track_inventory     boolean default null,
  p_weight_grams        integer default null,
  p_initial_quantity    integer default null,
  p_low_stock_threshold integer default null,
  p_image_media_ids     uuid[] default null,
  p_seo                 jsonb default null
)
returns table (product_id uuid, slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid := p_product_id;
  v_slug   text;
  v_old    public.products%rowtype;
  v_price  numeric := app.money(p_price);
  v_cmp    numeric := case when p_compare_at_price is null then null
                           else app.money(p_compare_at_price) end;
  v_status public.product_status;
begin
  -- 1) الصلاحية: إنشاء أم تحديث
  if v_id is null then
    if not app.has_store_permission(p_store_id, 'products:create') then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    perform app.assert_within_limit(p_store_id, 'products.max');
  else
    select * into v_old from public.products
     where id = v_id and store_id = p_store_id and deleted_at is null;
    if v_old.id is null then
      raise exception 'NOT_FOUND: المنتج غير موجود' using errcode = 'P0002';
    end if;
    if not app.has_store_permission(p_store_id, 'products:update') then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  -- 2) تحقق من المدخلات (خادميًا — لا اعتماد على الواجهة)
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'VALIDATION: اسم المنتج مطلوب' using errcode = 'P0001';
  end if;
  if length(trim(p_name)) > 200 then
    raise exception 'VALIDATION: اسم المنتج طويل جدًا' using errcode = 'P0001';
  end if;
  if v_price is null or v_price < 0 then
    raise exception 'VALIDATION: السعر مطلوب ولا يكون سالبًا' using errcode = 'P0001';
  end if;
  if v_cmp is not null and v_cmp < v_price then
    raise exception 'VALIDATION: السعر قبل الخصم يجب أن يكون أعلى من السعر'
      using errcode = 'P0001';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.categories
    where id = p_category_id and store_id = p_store_id and deleted_at is null
  ) then
    raise exception 'VALIDATION: التصنيف غير موجود في هذا المتجر' using errcode = 'P0001';
  end if;

  v_slug := app.unique_product_slug(
    p_store_id, coalesce(nullif(trim(p_slug), ''), p_name), v_id);

  v_status := coalesce(p_status, v_old.status, 'draft');

  -- 3) الكتابة
  if v_id is null then
    insert into public.products (
      store_id, category_id, name, slug, description, price, compare_at_price,
      cost_price, sku, status, track_inventory, weight_grams, seo, published_at
    ) values (
      p_store_id, p_category_id, trim(p_name), v_slug,
      nullif(trim(p_description), ''), v_price, v_cmp,
      case when p_cost_price is null then null else app.money(p_cost_price) end,
      nullif(trim(p_sku), ''), v_status,
      coalesce(p_track_inventory, true), p_weight_grams,
      coalesce(p_seo, '{}'::jsonb),
      case when v_status = 'active' then now() else null end
    )
    returning id into v_id;

    -- مخزون ابتدائي عبر حركة ⇒ للرصيد أثر من أول لحظة
    if coalesce(p_initial_quantity, 0) <> 0 then
      perform app.record_movement(p_store_id, v_id, null,
        p_initial_quantity, 'initial', 'مخزون ابتدائي');
    end if;
  else
    update public.products set
      category_id      = p_category_id,
      name             = trim(p_name),
      slug             = v_slug,
      description      = nullif(trim(p_description), ''),
      price            = v_price,
      compare_at_price = v_cmp,
      cost_price       = case when p_cost_price is null then null
                              else app.money(p_cost_price) end,
      sku              = nullif(trim(p_sku), ''),
      status           = v_status,
      track_inventory  = coalesce(p_track_inventory, v_old.track_inventory),
      weight_grams     = p_weight_grams,
      seo              = coalesce(p_seo, v_old.seo),
      published_at     = case
                           when v_status = 'active' then coalesce(v_old.published_at, now())
                           else v_old.published_at
                         end
    where id = v_id;
  end if;

  -- 4) حدّ التنبيه يُحفظ على صف المخزون (لا يمسّ الكمية)
  if p_low_stock_threshold is not null then
    insert into public.inventory (store_id, product_id, variant_id, quantity,
                                  low_stock_threshold)
    values (p_store_id, v_id, null, 0, p_low_stock_threshold)
    on conflict (product_id,
                 coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do update set low_stock_threshold = p_low_stock_threshold;
  end if;

  -- 5) الصور
  perform app.sync_product_images(p_store_id, v_id, p_image_media_ids);

  return query select v_id, v_slug;
end;
$$;

revoke execute on function public.save_product(
  uuid, text, numeric, uuid, text, text, numeric, numeric, text, uuid,
  public.product_status, boolean, integer, integer, integer, uuid[], jsonb
) from public, anon;
grant execute on function public.save_product(
  uuid, text, numeric, uuid, text, text, numeric, numeric, text, uuid,
  public.product_status, boolean, integer, integer, integer, uuid[], jsonb
) to authenticated;

-- =====================================================================
-- نسخ منتج — النسخة تبدأ مسودة بلا مخزون (المخزون ليس قابلًا للنسخ)
-- =====================================================================
create or replace function public.duplicate_product(p_product_id uuid)
returns table (product_id uuid, slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src public.products%rowtype;
  v_id  uuid;
  v_slug text;
begin
  select * into v_src from public.products
   where id = p_product_id and deleted_at is null;
  if v_src.id is null then
    raise exception 'NOT_FOUND: المنتج غير موجود' using errcode = 'P0002';
  end if;
  if not app.has_store_permission(v_src.store_id, 'products:create') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  perform app.assert_within_limit(v_src.store_id, 'products.max');

  v_slug := app.unique_product_slug(v_src.store_id, v_src.slug || '-copy', null);

  insert into public.products (
    store_id, category_id, name, slug, description, price, compare_at_price,
    cost_price, status, track_inventory, weight_grams, seo, attributes
  ) values (
    v_src.store_id, v_src.category_id, v_src.name || ' (نسخة)', v_slug,
    v_src.description, v_src.price, v_src.compare_at_price, v_src.cost_price,
    'draft', v_src.track_inventory, v_src.weight_grams, v_src.seo, v_src.attributes
  )
  returning id into v_id;
  -- sku لا يُنسخ: فريد داخل المتجر بحكم الفهرس.

  -- الأسماء المستعارة ضرورية: product_id هو أيضًا اسم عمود مُخرَج
  insert into public.product_images
    (product_id, store_id, media_file_id, alt_text, sort_order, is_primary)
  select v_id, pi.store_id, pi.media_file_id, pi.alt_text, pi.sort_order, pi.is_primary
    from public.product_images pi where pi.product_id = p_product_id;

  insert into public.product_variants
    (product_id, store_id, name, price, compare_at_price, options,
     image_id, is_active, sort_order)
  select v_id, pv.store_id, pv.name, pv.price, pv.compare_at_price, pv.options,
         pv.image_id, pv.is_active, pv.sort_order
    from public.product_variants pv
   where pv.product_id = p_product_id and pv.deleted_at is null;

  update public.products p set has_variants = exists (
    select 1 from public.product_variants pv
     where pv.product_id = v_id and pv.deleted_at is null
  ) where p.id = v_id;

  return query select v_id, v_slug;
end;
$$;

revoke execute on function public.duplicate_product(uuid) from public, anon;
grant   execute on function public.duplicate_product(uuid) to authenticated;

-- =====================================================================
-- حذف منتج (ناعم) — الطلبات تحتفظ بلقطة نصية فلا يتأثر تاريخها
-- =====================================================================
create or replace function public.delete_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_store uuid;
begin
  select store_id into v_store from public.products
   where id = p_product_id and deleted_at is null;
  if v_store is null then
    raise exception 'NOT_FOUND: المنتج غير موجود' using errcode = 'P0002';
  end if;
  if not app.has_store_permission(v_store, 'products:delete') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.products
     set deleted_at = now(), status = 'archived'
   where id = p_product_id;

  update public.product_variants set deleted_at = now()
   where product_id = p_product_id and deleted_at is null;

  -- يُرفع من كل سلة مفتوحة: منتج محذوف لا يُشترى
  delete from public.cart_items where product_id = p_product_id;
end;
$$;

revoke execute on function public.delete_product(uuid) from public, anon;
grant   execute on function public.delete_product(uuid) to authenticated;

-- =====================================================================
-- تعديل المخزون — الواجهة الوحيدة المسموحة للتاجر
-- =====================================================================
create or replace function public.adjust_inventory(
  p_store_id   uuid,
  p_product_id uuid,
  p_delta      integer,
  p_reason     text default 'manual_adjust',
  p_variant_id uuid default null,
  p_note       text default null
)
returns table (quantity integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason public.inventory_reason;
  v_qty integer;
begin
  if not app.has_store_permission(p_store_id, 'inventory:update') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.products
    where id = p_product_id and store_id = p_store_id and deleted_at is null
  ) then
    raise exception 'NOT_FOUND: المنتج غير موجود' using errcode = 'P0002';
  end if;
  if p_variant_id is not null and not exists (
    select 1 from public.product_variants
    where id = p_variant_id and product_id = p_product_id and deleted_at is null
  ) then
    raise exception 'NOT_FOUND: المتغيّر غير موجود' using errcode = 'P0002';
  end if;

  -- التاجر يملك التعديل اليدوي والتصحيح فقط؛ أسباب الطلبات يكتبها النظام.
  if p_reason not in ('manual_adjust', 'correction', 'initial', 'import') then
    raise exception 'VALIDATION: سبب غير مسموح' using errcode = 'P0001';
  end if;
  v_reason := p_reason::public.inventory_reason;

  v_qty := app.record_movement(p_store_id, p_product_id, p_variant_id,
                               p_delta, v_reason, p_note);
  return query select v_qty;
end;
$$;

revoke execute on function public.adjust_inventory(uuid, uuid, integer, text, uuid, text)
  from public, anon;
grant execute on function public.adjust_inventory(uuid, uuid, integer, text, uuid, text)
  to authenticated;

-- =====================================================================
-- ★ استيراد المنتجات — Validate ثم Import، بنفس الدالة
--
-- p_dry_run = true  ⇒ تحقق فقط، لا كتابة (مرحلة Preview)
-- p_dry_run = false ⇒ الصفوف الصالحة تُكتب، والفاشلة تُعاد في errors
--
-- الحدّ والصلاحية والأسعار كلها تُحسب هنا: ملف الاستيراد مُدخَل
-- مستخدم، لا مصدر ثقة.
-- =====================================================================
create or replace function public.import_products(
  p_store_id uuid,
  p_rows     jsonb,
  p_dry_run  boolean default true
)
returns table (imported integer, failed integer, errors jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row      jsonb;
  v_i        integer := 0;
  v_ok       integer := 0;
  v_bad      integer := 0;
  v_errors   jsonb := '[]'::jsonb;
  v_name     text;
  v_price    numeric;
  v_cmp      numeric;
  v_qty      integer;
  v_sku      text;
  v_cat      uuid;
  v_msg      text;
  v_limit    record;
  v_used     integer;
  v_capacity integer;
begin
  if not app.has_store_permission(p_store_id, 'products:create') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not app.has_feature(p_store_id, 'import_export.enabled') then
    raise exception 'FEATURE_UNAVAILABLE: الاستيراد غير متاح في باقتك'
      using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'VALIDATION: صيغة الملف غير صحيحة' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'VALIDATION: الحد الأقصى 2000 صف لكل ملف' using errcode = 'P0001';
  end if;

  -- السعة المتبقية في الباقة (D18: غير مضبوط ⇒ لا إنفاذ)
  select * into v_limit from app.entitlement_limit(p_store_id, 'products.max');
  if found and v_limit.configured and v_limit.limit_value is not null then
    v_used := app.count_usage(p_store_id, 'products.max');
    v_capacity := greatest(v_limit.limit_value - v_used, 0);
  else
    v_capacity := null;   -- بلا حد
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    v_msg := null;

    v_name  := nullif(trim(coalesce(v_row ->> 'name', '')), '');
    v_sku   := nullif(trim(coalesce(v_row ->> 'sku', '')), '');

    begin
      v_price := case when nullif(trim(coalesce(v_row ->> 'price', '')), '') is null
                      then null else (v_row ->> 'price')::numeric end;
      v_cmp   := case when nullif(trim(coalesce(v_row ->> 'compare_at_price', '')), '') is null
                      then null else (v_row ->> 'compare_at_price')::numeric end;
      v_qty   := case when nullif(trim(coalesce(v_row ->> 'quantity', '')), '') is null
                      then 0 else (v_row ->> 'quantity')::integer end;
    exception when others then
      v_price := null; v_cmp := null; v_qty := 0;
      v_msg := 'قيمة رقمية غير صحيحة (السعر أو الكمية)';
    end;

    -- التصنيف بالاسم: يُنشأ إن لم يوجد (وضع الكتابة فقط)
    v_cat := null;
    if v_msg is null and nullif(trim(coalesce(v_row ->> 'category', '')), '') is not null then
      select id into v_cat from public.categories
       where store_id = p_store_id
         and lower(name) = lower(trim(v_row ->> 'category'))
         and deleted_at is null
       limit 1;
      if v_cat is null and not p_dry_run then
        insert into public.categories (store_id, name, slug)
        values (p_store_id, trim(v_row ->> 'category'),
                app.unique_category_slug(p_store_id, v_row ->> 'category'))
        returning id into v_cat;
      end if;
    end if;

    if v_msg is null then
      if v_name is null then
        v_msg := 'اسم المنتج مطلوب';
      elsif length(v_name) > 200 then
        v_msg := 'اسم المنتج أطول من 200 حرف';
      elsif v_price is null then
        v_msg := 'السعر مطلوب';
      elsif v_price < 0 then
        v_msg := 'السعر لا يكون سالبًا';
      elsif v_cmp is not null and v_cmp < v_price then
        v_msg := 'السعر قبل الخصم أقل من السعر';
      elsif v_qty < 0 then
        v_msg := 'الكمية لا تكون سالبة';
      elsif v_sku is not null and exists (
        select 1 from public.products
        where store_id = p_store_id and lower(sku) = lower(v_sku) and deleted_at is null
      ) then
        v_msg := 'رمز المنتج (SKU) مستخدم بالفعل';
      elsif v_capacity is not null and v_ok >= v_capacity then
        v_msg := 'تجاوزت حد عدد المنتجات في باقتك';
      end if;
    end if;

    if v_msg is not null then
      v_bad := v_bad + 1;
      v_errors := v_errors || jsonb_build_object(
        'row', coalesce((v_row ->> 'row')::integer, v_i),
        'name', coalesce(v_name, ''),
        'message', v_msg);
    else
      v_ok := v_ok + 1;
      if not p_dry_run then
        perform public.save_product(
          p_store_id         => p_store_id,
          p_name             => v_name,
          p_price            => v_price,
          p_slug             => nullif(trim(coalesce(v_row ->> 'slug', '')), ''),
          p_description      => nullif(trim(coalesce(v_row ->> 'description', '')), ''),
          p_compare_at_price => v_cmp,
          p_sku              => v_sku,
          p_category_id      => v_cat,
          p_status           => 'draft',
          p_initial_quantity => nullif(v_qty, 0)
        );
      end if;
    end if;
  end loop;

  return query select v_ok, v_bad, v_errors;
end;
$$;

revoke execute on function public.import_products(uuid, jsonb, boolean) from public, anon;
grant   execute on function public.import_products(uuid, jsonb, boolean) to authenticated;
