-- =====================================================================
-- 0059 القالب الرقمي — الطلبات والمحتوى (إضافية · لا تمسّ ما سبق)
--
-- كل دالّة هنا **غلاف** على منطق قائم لا نسخةٌ منه:
--   · الطلب الرقمي ينادي `create_order_with_proof` نفسها ⇒ نفس حساب
--     المال، ونفس فحص المخزون، ونفس مفتاح عدم التكرار، ونفس قيد
--     «تحويلٌ بلا إيصال لا يُكتب».
--   · «تم الشحن» ينادي `transition_order` ثلاثًا ⇒ آلة الحالة وسجلّها
--     والصلاحيات كما هي، بلا آلةٍ ثانية وبلا حالةٍ جديدة في الـenum.
--   · التنبيهات تنادي `app.notify` / `app.notify_store_team` القائمتين.
-- =====================================================================

-- =====================================================================
-- ١) إدارة حقول المنتج الرقمي
-- =====================================================================
create or replace function public.save_digital_field(
  p_store_id   uuid,
  p_product_id uuid,
  p_label      text,
  p_field_id   uuid default null,
  p_hint       text default null,
  p_sort_order integer default null,
  p_is_active  boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid := p_field_id;
  v_label text := trim(coalesce(p_label, ''));
  v_count integer;
begin
  if not app.has_store_permission(p_store_id, 'products:update') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if length(v_label) < 1 or length(v_label) > 60 then
    raise exception 'VALIDATION: اسم الحقل مطلوب وبطول ٦٠ حرفًا على الأكثر'
      using errcode = 'P0001';
  end if;
  if length(coalesce(p_hint, '')) > 200 then
    raise exception 'VALIDATION: التعليمة طويلة جدًا' using errcode = 'P0001';
  end if;
  -- المنتج في هذا المتجر تحديدًا — لا يُقبل معرّف من متجر آخر
  if not exists (select 1 from public.products
                 where id = p_product_id and store_id = p_store_id
                   and deleted_at is null) then
    raise exception 'NOT_FOUND: المنتج غير موجود في هذا المتجر' using errcode = 'P0002';
  end if;

  if v_id is null then
    -- سقفٌ يمنع استنزاف نموذج الشراء بحقول لا نهائية
    select count(*) into v_count from public.product_digital_fields
     where product_id = p_product_id and deleted_at is null;
    if v_count >= 8 then
      raise exception 'VALIDATION: أقصى عدد حقول للمنتج ثمانية' using errcode = 'P0001';
    end if;

    insert into public.product_digital_fields
      (store_id, product_id, label, hint, sort_order, is_active)
    values (p_store_id, p_product_id, v_label, nullif(trim(p_hint), ''),
            coalesce(p_sort_order, v_count), coalesce(p_is_active, true))
    returning id into v_id;
  else
    update public.product_digital_fields
       set label      = v_label,
           hint       = nullif(trim(p_hint), ''),
           sort_order = coalesce(p_sort_order, sort_order),
           is_active  = coalesce(p_is_active, is_active)
     where id = v_id and store_id = p_store_id and deleted_at is null;
    if not found then
      raise exception 'NOT_FOUND: الحقل غير موجود' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_digital_field(uuid, uuid, text, uuid, text, integer, boolean)
  from public, anon;
grant execute on function public.save_digital_field(uuid, uuid, text, uuid, text, integer, boolean)
  to authenticated;

create or replace function public.delete_digital_field(
  p_store_id uuid, p_field_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.has_store_permission(p_store_id, 'products:update') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  -- حذف ناعم: لقطة الطلبات السابقة في `order_digital_values` لا تُمسّ
  update public.product_digital_fields set deleted_at = now()
   where id = p_field_id and store_id = p_store_id and deleted_at is null;
end;
$$;

revoke execute on function public.delete_digital_field(uuid, uuid) from public, anon;
grant   execute on function public.delete_digital_field(uuid, uuid) to authenticated;

-- =====================================================================
-- ٢) إدارة التصنيفات — أوّل إدارة حقيقية لها في المنصّة
--
-- كانت التصنيفات تُنشأ inline من نموذج المنتج بالاسم وحده، بلا تعديل
-- ولا حذف ولا صورة. و`categories.image_id` موجود ولم يُستعمل.
--
-- ★ `image_id` مفتاحٌ خارجي إلى `media_files` أصلًا ⇒ صورة المتجر
--   الخاصة وصورة المكتبة المشتركة تسكنان نفس العمود بلا تغيير مخطّط.
-- =====================================================================

/** الأصل صالح لهذا المتجر: ملفه الجاهز، أو أصلٌ مشترك نشط في المكتبة. */
create or replace function app.media_usable_by_store(p_store_id uuid, p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.media_files m
    where m.id = p_media_id and m.deleted_at is null
      and (
        (m.store_id = p_store_id and m.status = 'ready')
        or (m.store_id is null and m.bucket = 'theme-library'
            and exists (select 1 from public.platform_media pm
                        where pm.media_file_id = m.id and pm.is_active))
      )
  );
$$;

grant execute on function app.media_usable_by_store(uuid, uuid) to authenticated;

create or replace function public.save_category(
  p_store_id   uuid,
  p_name       text,
  p_category_id uuid default null,
  p_image_media_id uuid default null,
  p_clear_image boolean default false,
  p_sort_order integer default null,
  p_is_active  boolean default null
)
returns table (category_id uuid, slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   uuid := p_category_id;
  v_name text := trim(coalesce(p_name, ''));
  v_slug text;
  v_base text;
  v_n    integer := 0;
begin
  if not app.has_store_permission(p_store_id, 'categories:manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if length(v_name) < 1 or length(v_name) > 80 then
    raise exception 'VALIDATION: اسم التصنيف مطلوب' using errcode = 'P0001';
  end if;
  if p_image_media_id is not null
     and not app.media_usable_by_store(p_store_id, p_image_media_id) then
    raise exception 'INVALID_MEDIA: الصورة غير متاحة لهذا المتجر' using errcode = 'P0001';
  end if;

  -- slug من الاسم مع دعم العربية، وفريد داخل المتجر
  v_base := nullif(regexp_replace(lower(v_name), '[^a-z0-9؀-ۿ]+', '-', 'g'), '');
  v_base := trim(both '-' from coalesce(v_base, ''));
  if v_base = '' then v_base := 'c'; end if;
  v_base := left(v_base, 40);
  v_slug := v_base;
  while exists (select 1 from public.categories c
                where c.store_id = p_store_id and lower(c.slug) = lower(v_slug)
                  and c.deleted_at is null
                  and (v_id is null or c.id <> v_id)) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n::text;
  end loop;

  if v_id is null then
    insert into public.categories
      (store_id, name, slug, image_id, sort_order, is_active)
    values (p_store_id, v_name, v_slug, p_image_media_id,
            coalesce(p_sort_order,
                     (select coalesce(max(sort_order), -1) + 1 from public.categories
                       where store_id = p_store_id and deleted_at is null)),
            coalesce(p_is_active, true))
    returning id into v_id;
  else
    update public.categories
       set name       = v_name,
           slug       = v_slug,
           image_id   = case when p_clear_image then null
                             when p_image_media_id is not null then p_image_media_id
                             else image_id end,
           sort_order = coalesce(p_sort_order, sort_order),
           is_active  = coalesce(p_is_active, is_active)
     where id = v_id and store_id = p_store_id and deleted_at is null;
    if not found then
      raise exception 'NOT_FOUND: التصنيف غير موجود' using errcode = 'P0002';
    end if;
  end if;

  return query select v_id, v_slug;
end;
$$;

revoke execute on function public.save_category(uuid, text, uuid, uuid, boolean, integer, boolean)
  from public, anon;
grant execute on function public.save_category(uuid, text, uuid, uuid, boolean, integer, boolean)
  to authenticated;

/**
 * حذف تصنيف — ناعمٌ، ومنتجاته تُفكّ عنه ولا تُحذف.
 * ★ `categories.parent_id` بـ`on delete set null` أصلًا، والمنتجات
 *   بـ`on delete set null` — لكنّ الحذف هنا ناعم فلا يُشغَّل أيّهما،
 *   فنفصل المنتجات صراحةً وإلا بقيت معلَّقة على تصنيف محذوف.
 */
create or replace function public.delete_category(p_store_id uuid, p_category_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.has_store_permission(p_store_id, 'categories:manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.products set category_id = null
   where store_id = p_store_id and category_id = p_category_id;

  update public.categories set deleted_at = now(), is_active = false
   where id = p_category_id and store_id = p_store_id and deleted_at is null;
end;
$$;

revoke execute on function public.delete_category(uuid, uuid) from public, anon;
grant   execute on function public.delete_category(uuid, uuid) to authenticated;

-- =====================================================================
-- ٣) البنرات
-- =====================================================================
create or replace function public.save_theme_banner(
  p_store_id      uuid,
  p_banner_id     uuid default null,
  p_slot          text default 'hero',
  p_media_file_id uuid default null,
  p_title         text default null,
  p_description   text default null,
  p_cta_label     text default null,
  p_cta_href      text default null,
  p_is_visible    boolean default null,
  p_sort_order    integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   uuid := p_banner_id;
  v_href text := nullif(trim(coalesce(p_cta_href, '')), '');
  v_count integer;
begin
  if not app.has_store_permission(p_store_id, 'settings:update') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_slot not in ('hero', 'promo') then
    raise exception 'VALIDATION: خانة البنر غير معروفة' using errcode = 'P0001';
  end if;

  -- ★ رابط الزرّ يُتحقَّق خادميًّا: مسار داخلي أو https فقط.
  --   `javascript:` و`data:` و`vbscript:` نواقل تنفيذ في سياق المتجر.
  if v_href is not null then
    if not (v_href ~ '^/[A-Za-z0-9؀-ۿ/_%.\-?=&]*$'
            or v_href ~* '^https://[A-Za-z0-9.\-]+(:[0-9]+)?(/[^\s]*)?$') then
      raise exception 'VALIDATION: رابط الزرّ يجب أن يكون مسارًا داخليًا أو https'
        using errcode = 'P0001';
    end if;
  end if;

  if p_media_file_id is not null
     and not app.media_usable_by_store(p_store_id, p_media_file_id) then
    raise exception 'INVALID_MEDIA: الصورة غير متاحة لهذا المتجر' using errcode = 'P0001';
  end if;

  if v_id is null then
    select count(*) into v_count from public.store_theme_banners
     where store_id = p_store_id and deleted_at is null;
    if v_count >= 12 then
      raise exception 'VALIDATION: أقصى عدد بنرات اثنا عشر' using errcode = 'P0001';
    end if;

    insert into public.store_theme_banners
      (store_id, slot, media_file_id, title, description, cta_label, cta_href,
       is_visible, sort_order)
    values (p_store_id, p_slot, p_media_file_id,
            nullif(trim(p_title), ''), nullif(trim(p_description), ''),
            nullif(trim(p_cta_label), ''), v_href,
            coalesce(p_is_visible, true), coalesce(p_sort_order, v_count))
    returning id into v_id;
  else
    update public.store_theme_banners
       set slot          = p_slot,
           media_file_id = coalesce(p_media_file_id, media_file_id),
           title         = nullif(trim(p_title), ''),
           description   = nullif(trim(p_description), ''),
           cta_label     = nullif(trim(p_cta_label), ''),
           cta_href      = v_href,
           is_visible    = coalesce(p_is_visible, is_visible),
           sort_order    = coalesce(p_sort_order, sort_order)
     where id = v_id and store_id = p_store_id and deleted_at is null;
    if not found then
      raise exception 'NOT_FOUND: البنر غير موجود' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_theme_banner(
  uuid, uuid, text, uuid, text, text, text, text, boolean, integer) from public, anon;
grant execute on function public.save_theme_banner(
  uuid, uuid, text, uuid, text, text, text, text, boolean, integer) to authenticated;

create or replace function public.delete_theme_banner(p_store_id uuid, p_banner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.has_store_permission(p_store_id, 'settings:update') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.store_theme_banners set deleted_at = now(), is_visible = false
   where id = p_banner_id and store_id = p_store_id and deleted_at is null;
end;
$$;

revoke execute on function public.delete_theme_banner(uuid, uuid) from public, anon;
grant   execute on function public.delete_theme_banner(uuid, uuid) to authenticated;

-- =====================================================================
-- ٤) الطلب الرقمي
--
-- ★ غلافٌ لا نسخة: ينادي `create_order_with_proof` القائمة، فيرث منها
--   حساب المال خادميًّا، ومفتاح عدم التكرار، وربط الإيصال بالسلة،
--   وقيد «تحويلٌ بلا إيصال لا يُكتب»، وبوّابة `store_can_checkout`
--   (وفيها الآن الشرط الرقمي).
--
-- ★ وما يضيفه ثلاثة: باقةٌ واحدة، وحقولٌ مكتملة، ولقطةٌ للقيم — كلّها
--   في **نفس المعاملة**، فطلبٌ بحقول ناقصة لا يُكتب أصلًا.
-- =====================================================================
create or replace function public.create_digital_order(
  p_store_id        uuid,
  p_product_id      uuid,
  p_variant_id      uuid,
  p_quantity        integer,
  p_contact         jsonb,
  p_payment_method  public.payment_method,
  p_proof_media_id  uuid,
  p_fields          jsonb default '[]'::jsonb,   -- [{label, value}]
  p_idempotency_key text default null,
  p_note            text default null,
  p_reference       text default null,
  p_anon_token      text default null
)
returns table (order_id uuid, order_number text, total numeric, guest_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_number   text;
  v_total    numeric(14,2);
  v_guest    text;
  v_qty      integer := greatest(coalesce(p_quantity, 1), 1);
  v_field    record;
  v_given    jsonb;
  v_value    text;
  v_i        integer := 0;
begin
  if app.store_template(p_store_id) <> 'digital' then
    raise exception 'VALIDATION: هذا المسار للمتجر الرقمي فقط' using errcode = 'P0001';
  end if;

  -- ★ باقةٌ واحدة لا أكثر (§١٦): الطلب الرقمي سطرٌ واحد بحكم التوقيع
  --   نفسه — لا قائمة أسطر تُمرَّر، فلا سبيل لدسّ باقةٍ ثانية عبر REST.
  if p_variant_id is not null and not exists (
    select 1 from public.product_variants v
    where v.id = p_variant_id and v.product_id = p_product_id
      and v.store_id = p_store_id and v.is_active and v.deleted_at is null
  ) then
    raise exception 'VARIANT_UNAVAILABLE: الباقة غير متاحة' using errcode = 'P0002';
  end if;

  -- الطلب نفسه بالمسار القائم (وفيه فحص المتجر والبوّابة والمال)
  select c.order_id, c.order_number, c.total, c.guest_token
    into v_order_id, v_number, v_total, v_guest
    from public.create_order_with_proof(
      p_store_id,
      jsonb_build_array(jsonb_build_object(
        'product_id', p_product_id,
        'variant_id', p_variant_id,
        'quantity',   v_qty)),
      null,                      -- لا منطقة توصيل: منتج رقمي
      p_contact,
      '{}'::jsonb,               -- لا عنوان
      p_payment_method,
      p_proof_media_id,
      null,                      -- لا كوبون في المسار الرقمي
      p_idempotency_key,
      p_note,
      p_reference,
      p_anon_token
    ) c;

  -- إعادة إرسال بنفس المفتاح ⇒ الطلب نفسه؛ ولا تُضاعف اللقطة
  if exists (select 1 from public.order_digital_values where order_id = v_order_id) then
    return query select v_order_id, v_number, v_total, v_guest;
    return;
  end if;

  -- ★ كل حقل فعّال إلزامي، ويُقرأ تعريفه من القاعدة لا من العميل:
  --   العميل يرسل قيمًا، والقاعدة تقرّر أيّ الحقول مطلوبة وبأيّ ترتيب.
  for v_field in
    select f.id, f.label, f.sort_order
      from public.product_digital_fields f
     where f.product_id = p_product_id and f.store_id = p_store_id
       and f.is_active and f.deleted_at is null
     order by f.sort_order, f.created_at
  loop
    v_given := null;
    select e into v_given
      from jsonb_array_elements(coalesce(p_fields, '[]'::jsonb)) e
     where lower(trim(e ->> 'label')) = lower(trim(v_field.label))
     limit 1;

    v_value := trim(coalesce(v_given ->> 'value', ''));
    if v_value = '' then
      raise exception 'FIELD_REQUIRED: «%» مطلوب', v_field.label using errcode = 'P0001';
    end if;
    if length(v_value) > 120 then
      raise exception 'VALIDATION: «%» أطول من المسموح', v_field.label using errcode = 'P0001';
    end if;

    insert into public.order_digital_values
      (order_id, store_id, field_label, value, sort_order)
    values (v_order_id, p_store_id, v_field.label, v_value, v_i);
    v_i := v_i + 1;
  end loop;

  return query select v_order_id, v_number, v_total, v_guest;
end;
$$;

revoke execute on function public.create_digital_order(
  uuid, uuid, uuid, integer, jsonb, public.payment_method, uuid, jsonb,
  text, text, text, text) from public;
grant execute on function public.create_digital_order(
  uuid, uuid, uuid, integer, jsonb, public.payment_method, uuid, jsonb,
  text, text, text, text) to anon, authenticated;

-- =====================================================================
-- ٥) «تم الشحن» ⇒ مكتمل، بضغطة واحدة
--
-- آلة الحالة القائمة لا تسمح بـ`preparing → completed`، والمطلوب
-- إكمالٌ بضغطة. فالغلاف يمرّ بالانتقالات **الشرعية** الثلاث داخل
-- معاملة واحدة: سجلّ `order_status_history` يبقى كاملًا للتدقيق،
-- وصلاحية `orders:update` تُفحص في كل خطوة، ولا يُمسّ حرفٌ من
-- `can_transition_order` — فلا أثر على المتجر العادي.
--
-- ★ والشرط غير القابل للتفاوض: لا شحن بلا دفعٍ مؤكَّد، مفروضًا **في
--   القاعدة** لا في الواجهة.
-- =====================================================================
create or replace function public.mark_digital_order_shipped(p_order_id uuid)
returns public.order_status
language plpgsql
security definer
set search_path = ''
as $$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not app.has_store_permission(v_order.store_id, 'orders:update')
     and not app.has_platform_permission('orders', 'manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_order.payment_status <> 'paid' then
    raise exception 'PAYMENT_NOT_CONFIRMED: لا يمكن التنفيذ قبل تأكيد الدفع'
      using errcode = 'P0001';
  end if;
  if v_order.status = 'completed' then
    return v_order.status;   -- مكتمل أصلًا: لا فعل ولا خطأ
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'VALIDATION: الطلب ملغى' using errcode = 'P0001';
  end if;

  if v_order.status = 'new' then
    perform public.transition_order(p_order_id, 'confirmed', 'تأكيد قبل التنفيذ');
    v_order.status := 'confirmed';
  end if;
  if v_order.status = 'confirmed' then
    perform public.transition_order(p_order_id, 'preparing', 'بدء التنفيذ');
    v_order.status := 'preparing';
  end if;
  if v_order.status = 'preparing' then
    perform public.transition_order(p_order_id, 'shipped', 'تم الشحن');
    v_order.status := 'shipped';
  end if;
  if v_order.status = 'shipped' then
    perform public.transition_order(p_order_id, 'completed', 'اكتمل التنفيذ');
  end if;

  return 'completed'::public.order_status;
end;
$$;

revoke execute on function public.mark_digital_order_shipped(uuid) from public, anon;
grant   execute on function public.mark_digital_order_shipped(uuid) to authenticated;

-- =====================================================================
-- ٦) ربط طلب الزائر بحسابه بعد الدخول
--
-- ★ البوّابة توكن الطلب: عشوائي ١٦ بايت يولّده `create_order`. ورقم
--   الطلب متسلسل وقابل للتخمين، فلا يُقبل وحده — ومعه حدٌّ على المعدّل
--   يجعل التخمين بالجملة مكلفًا.
-- ★ ولا يُنتزع طلبٌ من صاحبه: طلبٌ مربوط بعميل آخر يُرفض بنفس رسالة
--   «غير صالح» — فلا يُفرَّق بين «غير موجود» و«ليس لك».
-- =====================================================================
create or replace function public.claim_guest_order(
  p_store_id     uuid,
  p_order_number text,
  p_guest_token  text
)
returns table (order_id uuid, order_number text)
language plpgsql
security definer
set search_path = ''
as $$
-- أسماء أعمدة المخرَج (order_id · order_number) تطابق أعمدة `orders`،
-- فالقاعدة هنا كما في `order_details`: العمود يفوز، والمتغيّرات كلها
-- بأسماء o./v_/p_ فلا يلتبس شيء.
#variable_conflict use_column
declare
  o        public.orders%rowtype;
  v_user   uuid := (select auth.uid());
  v_cust   uuid;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if coalesce(trim(p_order_number), '') = '' or coalesce(trim(p_guest_token), '') = '' then
    raise exception 'VALIDATION: بيانات الطلب ناقصة' using errcode = 'P0001';
  end if;
  -- حدٌّ على المحاولات بالهويّة الثابتة (`check_rate_limit` من 0056):
  -- يمنع تخمين أرقام الطلبات بالجملة، ودلوٌ لكل مستخدم لا لكل IP.
  if not public.check_rate_limit('claim_order:' || v_user::text, 10, 3600) then
    raise exception 'RATE_LIMITED: محاولات كثيرة — حاول بعد قليل' using errcode = 'P0001';
  end if;

  select * into o from public.orders
   where store_id = p_store_id
     and upper(trim(order_number)) = upper(trim(p_order_number))
   for update;

  -- رسالة واحدة لكل حالات الفشل: لا نكشف وجود الطلب لمن لا يملك توكنه
  if not found
     or o.guest_token is null
     or o.guest_token <> p_guest_token then
    raise exception 'INVALID_CLAIM: تعذّر ربط الطلب' using errcode = 'P0001';
  end if;

  -- مربوط بعميل آخر ⇒ نفس الرسالة. مربوط بي ⇒ لا فعل.
  if o.customer_id is not null then
    if o.customer_id = app.current_customer_id(p_store_id) then
      return query select o.id, o.order_number;
      return;
    end if;
    raise exception 'INVALID_CLAIM: تعذّر ربط الطلب' using errcode = 'P0001';
  end if;

  -- سجلّ العميل في هذا المتجر (D22) — يُنشأ أو يُستكمل، ولا يُكرَّر
  insert into public.customers (store_id, profile_id, name, phone, email)
  values (p_store_id, v_user, o.contact_name, o.contact_phone, o.contact_email)
  on conflict (store_id, profile_id) where profile_id is not null and deleted_at is null
  do update set name  = coalesce(public.customers.name,  excluded.name),
                phone = coalesce(public.customers.phone, excluded.phone),
                email = coalesce(public.customers.email, excluded.email),
                updated_at = now()
  returning id into v_cust;

  if v_cust is null then
    v_cust := app.current_customer_id(p_store_id);
  end if;

  update public.orders set customer_id = v_cust where id = o.id;

  perform app.audit('order.claimed', 'orders', o.id, p_store_id, null,
                    jsonb_build_object('customer_id', v_cust));

  return query select o.id, o.order_number;
end;
$$;

revoke execute on function public.claim_guest_order(uuid, text, text) from public, anon;
grant   execute on function public.claim_guest_order(uuid, text, text) to authenticated;

-- =====================================================================
-- ٧) تفاصيل الطلب: الحقول الرقمية وسبب رفض الدفع
--
-- ★ إضافةٌ إلى مخرَج الدالّة القائمة لا دالّة ثانية. وسبب الرفض يبقى
--   في `payments` (مصدرٌ واحد للحقيقة المالية) ولا يُنسَخ إلى `orders`،
--   ولا تُوسَّع enum يقرؤه كل النظام.
-- ★ والحاجز كما هو: توكن الطلب، أو رقم+هاتف، أو العميل صاحبه، أو عضو
--   بصلاحية `orders:view`.
-- =====================================================================
create or replace function public.order_digital_detail(
  p_store_id     uuid,
  p_order_number text,
  p_guest_token  text default null,
  p_phone        text default null
)
returns table (
  order_id        uuid,
  digital_values  jsonb,
  payment_state   text,
  rejection_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  o public.orders%rowtype;
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_pay public.payments%rowtype;
begin
  if coalesce(trim(p_order_number), '') = '' then return; end if;

  select * into o from public.orders
   where store_id = p_store_id
     and upper(trim(order_number)) = upper(trim(p_order_number));
  if not found then return; end if;

  if not (
    (coalesce(trim(p_guest_token), '') <> '' and o.guest_token = p_guest_token)
    or (length(v_digits) >= 7
        and right(regexp_replace(coalesce(o.contact_phone, ''), '\D', '', 'g'), 9)
          = right(v_digits, 9))
    or (o.customer_id is not null
        and o.customer_id = app.current_customer_id(p_store_id))
    or app.has_store_permission(p_store_id, 'orders:view')
  ) then
    return;
  end if;

  select * into v_pay from public.payments
   where order_id = o.id and kind = 'order'
   order by created_at desc limit 1;

  return query select
    o.id,
    coalesce((select jsonb_agg(jsonb_build_object('label', d.field_label,
                                                 'value', d.value)
                               order by d.sort_order)
                from public.order_digital_values d where d.order_id = o.id),
             '[]'::jsonb),
    coalesce(v_pay.status::text, 'none'),
    case when v_pay.status = 'failed' then v_pay.failed_reason else null end;
end;
$$;

revoke execute on function public.order_digital_detail(uuid, text, text, text) from public;
grant   execute on function public.order_digital_detail(uuid, text, text, text)
  to anon, authenticated;

-- =====================================================================
-- ٨) تنبيهات القالب الرقمي — بالمحرّك القائم
-- =====================================================================

/**
 * قرار الدفع ⇒ تنبيه.
 *
 * `review_order_payment` تكتب القرار وتُصعّد الطلب، لكنّها لا تُنبّه:
 *   · القبول: يجب أن يعرف **منفّذ** الطلب (صلاحية `orders:update`) أنّه
 *     صار جاهزًا — وقد لا يكون هو من راجع الدفعة (`orders:payment`).
 *   · الرفض: يجب أن يعرف الزبون **بالسبب**.
 *
 * ★ مشغّلٌ على `payment_events` لا تعديلٌ في `review_order_payment`:
 *   السجلّ الإلحاقي هو المصدر الموثوق للقرار، وأيّ مسار يكتب القرار
 *   يكتب حدثه — فلا قرارٌ بلا تنبيه ولو أُضيف مسار غدًا.
 * ★ والزبون الزائر بلا حساب لا `profile` له، و`app.notify` تتجاهل
 *   المستخدم الفارغ ⇒ يُوضَع بريدٌ في الصندوق إن أعطى بريدًا.
 */
create or replace function app.notify_order_payment_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay   public.payments%rowtype;
  v_order public.orders%rowtype;
  v_cust  uuid;
begin
  if new.event not in ('store_confirmed_transfer', 'store_rejected_transfer') then
    return new;
  end if;

  select * into v_pay from public.payments where id = new.payment_id;
  if v_pay.order_id is null then return new; end if;
  select * into v_order from public.orders where id = v_pay.order_id;
  if not found then return new; end if;

  if new.event = 'store_confirmed_transfer' then
    perform app.notify_store_team(
      v_order.store_id, 'orders:update', 'order.ready',
      'طلب جاهز للتنفيذ ' || v_order.order_number,
      'تم تأكيد الدفع — يمكن تنفيذ الطلب الآن.',
      '/dashboard/orders/' || v_order.id::text,
      'order.ready:' || v_order.id::text);
  else
    select c.profile_id into v_cust from public.customers c
     where c.id = v_order.customer_id;

    perform app.notify(
      v_cust, 'order.payment_rejected', 'لم يُقبل إثبات الدفع',
      coalesce(v_pay.failed_reason, 'راجع تفاصيل الطلب.'),
      null, v_order.store_id,
      'order.payment_rejected:' || v_pay.id::text);

    perform app.queue_email(
      v_order.contact_email, 'order_payment_rejected',
      jsonb_build_object('order_number', v_order.order_number,
                         'reason', coalesce(v_pay.failed_reason, '')),
      'order_payment_rejected:' || v_pay.id::text);
  end if;

  return new;
end;
$$;

drop trigger if exists payment_events_notify_decision on public.payment_events;
create trigger payment_events_notify_decision
  after insert on public.payment_events
  for each row execute function app.notify_order_payment_decision();

-- =====================================================================
-- ٩) المحتوى الابتدائي
--
-- ★ idempotent بشرطٍ لا بعلَم: يُزرع **فقط** حين يكون المتجر خاليًا
--   فعلًا (٠ منتجات و٠ تصنيفات). فإعادة النداء بعد الزرع لا تفعل شيئًا،
--   وحذفُ التاجر لعنصرٍ لا يُعيده أبدًا — ولا يوجد «استعادة الافتراضي».
-- ★ ولا يُزرع فوق متجر عامر: بيانات التاجر لا تُخلَط ببيانات قالب.
-- ★ وحدود الباقة تسري كما هي: `save_product` تنادي `assert_within_limit`،
--   ولذلك المحتوى الابتدائي **خمسة منتجات** — نصف حصّة المجانية —
--   فيبقى للتاجر متّسع. ولا يُرفع حدّ ولا يُتخطّى.
-- ★ ولا شعار علامةٍ تجارية: الأسماء إشارةٌ وصفية إلى المنتج المُشحَن،
--   والصور تبقى فارغة فيرسم القالب نائبًا محيَّدًا بهوية سوق النيل.
--   وحين تتوفّر أصول مرخَّصة تُسجَّل في المكتبة وتُختار يدويًّا.
-- =====================================================================
create or replace function public.seed_digital_starter(p_store_id uuid)
returns table (categories_added integer, products_added integer, banners_added integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cat   uuid;
  v_prod  uuid;
  v_c     integer := 0;
  v_p     integer := 0;
  v_b     integer := 0;
  v_cats  text[] := array['شحن الألعاب', 'بطاقات الشحن', 'الاشتراكات الرقمية',
                          'الأكواد', 'الخدمات الرقمية'];
  v_name  text;
  v_slug  text;
  v_map   jsonb := jsonb_build_array(
    jsonb_build_object('name', 'Free Fire',      'cat', 'شحن الألعاب',
      'packages', jsonb_build_array('110 جوهرة','210 جوهرة','530 جوهرة','1180 جوهرة',
                                    'عضوية أسبوعية','عضوية شهرية'),
      'fields', jsonb_build_array(
        jsonb_build_object('label','رقم اللاعب',
          'hint','أدخل رقم اللاعب كما يظهر داخل اللعبة وتأكّد من صحّته.'))),
    jsonb_build_object('name', 'PUBG Mobile',    'cat', 'شحن الألعاب',
      'packages', jsonb_build_array('60 UC','325 UC','660 UC','1800 UC'),
      'fields', jsonb_build_array(
        jsonb_build_object('label','رقم اللاعب','hint','رقم الحساب داخل اللعبة.'))),
    jsonb_build_object('name', 'Mobile Legends', 'cat', 'شحن الألعاب',
      'packages', jsonb_build_array('86 ماسة','172 ماسة','257 ماسة','706 ماسة'),
      'fields', jsonb_build_array(
        jsonb_build_object('label','رقم اللاعب','hint','معرّف الحساب داخل اللعبة.'),
        jsonb_build_object('label','رقم السيرفر','hint','يظهر بين قوسين بعد رقم اللاعب.'))),
    jsonb_build_object('name', 'بطاقة Google Play', 'cat', 'بطاقات الشحن',
      'packages', jsonb_build_array('10 دولار','25 دولار','50 دولار'),
      'fields', jsonb_build_array(
        jsonb_build_object('label','البريد الإلكتروني','hint','البريد المرتبط بحسابك.'))),
    jsonb_build_object('name', 'بطاقة Steam',    'cat', 'بطاقات الشحن',
      'packages', jsonb_build_array('10 دولار','20 دولار','50 دولار'),
      'fields', jsonb_build_array(
        jsonb_build_object('label','اسم المستخدم','hint','اسم حسابك على المنصّة.')))
  );
  v_item  jsonb;
  v_pkg   jsonb;
  v_fld   jsonb;
  v_i     integer;
begin
  if not app.has_store_permission(p_store_id, 'products:create')
     or not app.has_store_permission(p_store_id, 'categories:manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- ★ الشرط هو ما يجعلها idempotent: متجرٌ فيه شيءٌ لا يُزرع.
  if exists (select 1 from public.products where store_id = p_store_id
              and deleted_at is null)
     or exists (select 1 from public.categories where store_id = p_store_id
                 and deleted_at is null) then
    return query select 0, 0, 0;
    return;
  end if;

  -- التصنيفات
  v_i := 0;
  foreach v_name in array v_cats loop
    perform public.save_category(p_store_id, v_name, null, null, false, v_i, true);
    v_c := v_c + 1;
    v_i := v_i + 1;
  end loop;

  -- المنتجات وباقاتها وحقولها
  for v_item in select * from jsonb_array_elements(v_map) loop
    select id into v_cat from public.categories
     where store_id = p_store_id and name = (v_item ->> 'cat')
       and deleted_at is null limit 1;

    -- ★ عبر `save_product` القائمة ⇒ حدّ الباقة يسري، والـslug يُولَّد
    --   بنفس الدالّة، ولا منطق إنشاء ثانٍ.
    select p.product_id into v_prod from public.save_product(
      p_store_id      => p_store_id,
      p_name          => v_item ->> 'name',
      p_price         => 0,
      p_category_id   => v_cat,
      p_status        => 'active'::public.product_status,
      p_track_inventory => false,          -- منتج رقمي: لا مخزون
      p_description   => 'اختر الباقة المناسبة ثم أدخل بيانات الشحن.'
    ) p;
    v_p := v_p + 1;

    v_i := 0;
    for v_pkg in select * from jsonb_array_elements(v_item -> 'packages') loop
      -- ★ `options` يجب أن يكون مميَّزًا: الفهرس
      --   `product_variants_options_unique` على (product_id, options)،
      --   فترك الافتراضي `{}` يجعل الباقة الثانية تصادم الأولى.
      --   واسم الباقة هو خيارها فعلًا، فلا قيمة مُخترَعة.
      insert into public.product_variants
        (product_id, store_id, name, price, options, is_active, sort_order)
      values (v_prod, p_store_id, v_pkg #>> '{}', 0,
              jsonb_build_object('package', v_pkg #>> '{}'), true, v_i);
      v_i := v_i + 1;
    end loop;

    update public.products set has_variants = true where id = v_prod;

    v_i := 0;
    for v_fld in select * from jsonb_array_elements(v_item -> 'fields') loop
      perform public.save_digital_field(
        p_store_id, v_prod, v_fld ->> 'label', null, v_fld ->> 'hint', v_i, true);
      v_i := v_i + 1;
    end loop;
  end loop;

  -- بنر واحد بلا صورة: القالب يرسم خلفيةً بهوية سوق النيل
  perform public.save_theme_banner(
    p_store_id, null, 'hero', null,
    'شحن رقمي فوري', 'اختر منتجك وباقتك وأكمل طلبك في دقيقة.',
    'تسوّق الآن', '/products', true, 0);
  v_b := v_b + 1;

  perform app.audit('store.digital_starter_seeded', 'stores', p_store_id, p_store_id,
                    null, jsonb_build_object('categories', v_c, 'products', v_p));

  return query select v_c, v_p, v_b;
end;
$$;

revoke execute on function public.seed_digital_starter(uuid) from public, anon;
grant   execute on function public.seed_digital_starter(uuid) to authenticated;
