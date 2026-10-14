-- ═══════════════════════════════════════════════════════════════════
-- ألوان ومقاسات: الطرف الناقص من خاصّيةٍ مبنيّة بالكامل تحت الواجهة.
-- ═══════════════════════════════════════════════════════════════════
--
-- ★★★ الحال قبل هذه الهجرة: النظام يدعم خيارات المنتج **من أوّله إلى
-- آخره** — جدول `product_variants` منذ 0004، ومخزونٌ لكل خيار
-- (`inventory.variant_id`)، وسلّةٌ تحمل `variant_id`، وطلبٌ يحفظ لقطة
-- `variant_name` وحركةَ مخزونٍ لكل خيار، و`VariantPicker` في صفحة
-- المنتج يتبع سعرَ المختار ويعلن «نفد» للخيار وحده. وكلّ ذلك معطّل
-- فعليًّا لسببٍ واحد: **لا دالّة كتابة ولا شاشة**. فلا تاجرٌ أنشأ
-- خيارًا واحدًا منذ الإطلاق، ولا عنصر سلّةٍ واحد حمل `variant_id`.
-- (الأربعون خيارًا في الإنتاج كلّها من قالب تجريبيّ، لا من تاجر.)
--
-- وهذه الهجرة تضع المسار الناقص: دالّة كتابة واحدة، وحذفٌ ناعم،
-- ومحفّزٌ يصون الحقائق المشتقّة. وتُصلح ثلاث علل في الطريق.
--
-- ★★ العلّة ١ — «متوفّر» يكذب على منتجٍ بخيارات. `app.product_has_stock`
-- تسأل: هل لهذا المنتج **أيّ** صفّ مخزونٍ موجب؟ ومنتجٌ أُنشئ بكمّية ١٠
-- ثم أُضيفت له ألوان، يبقى صفّه الأساس (variant_id = null) بـ١٠ وإن
-- نفدت الألوان كلّها ⇒ البطاقة تقول «متوفّر» والمُختار يقول «نفد كل
-- خيار». الحقيقة بعد اليوم: منتجٌ له خيارات متوفّرٌ **إن توفّر خيارٌ
-- نشطٌ منه** — لا صفُّه الأساس.
--
-- ★★ العلّة ٢ — خيارٌ جديد يُعلَن متوفّرًا وهو بلا مخزون. محفّز
-- `product_variants_sync_in_stock` كان `before update` وحده، والعمود
-- يولد `true` افتراضًا ⇒ كل خيار يُضاف يظهر للزبون متاحًا حتى أوّل
-- حركة مخزون. (يفشل مغلقًا عند الدفع بـ`OUT_OF_STOCK`، لكن الزبون
-- اختار ما لا يوجد.) صار `before insert or update`.
--
-- ★★ العلّة ٣ — منحةٌ مباشرة على الجدول تتخطّى كل حدٍّ (قاعدة ٤ج).
-- `grant insert, update, delete on public.product_variants to
-- authenticated` قائمة منذ 0004، فطلبٌ مباشر إلى PostgREST كان يكتب
-- خيارًا بلا سقفٍ ولا تحقّق. تُسحب، والكتابة تصير بالدالّة وحدها.
--
-- ★ ولا بيان قائم يُحذف ولا يُغيَّر: الأربعون خيارًا التجريبية
--   منتجاتها كلّها `track_inventory = false` فتُعلَن متوفّرة كما هي،
--   والتعبئة أدناه لا تمسّ إلا ما كانت قيمته خاطئة أصلًا.
--
-- ★ والمجموعة (`options` jsonb) مكتوبةٌ مفتاحًا باسمها من أوّل يوم
--   («اللون»: «أحمر») — والفهرس الفريد على `(product_id, options)`.
--   فشاشة المجموعة الواحدة اليوم ترقّى إلى «لون × مقاس» لاحقًا بلا
--   هجرة ولا لمس بيان: المرحلة الثانية تضيف مفتاحًا ثانيًا لا شكلًا
--   جديدًا.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════ ١) التوفّر يُحسب من الخيارات حين توجد ═══════════════

/**
 * هل للمنتج رصيدٌ قابل للبيع؟
 *
 * ★★ ثلاث حالات لا حالتان: بلا تتبّع مخزون ⇒ متوفّر دائمًا · له
 *    خيارات ⇒ يتوفّر بتوفّر خيارٍ نشطٍ منه · بلا خيارات ⇒ صفُّه الأساس.
 *    الحالة الوسطى هي الإصلاح: الصفّ الأساس لمنتجٍ بخيارات رصيدٌ
 *    لا يُشترى — لا يُباع إلا عبر خيار.
 */
create or replace function app.product_has_stock(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not p.track_inventory then true
    when exists (
      select 1 from public.product_variants pv
       where pv.product_id = p.id and pv.deleted_at is null and pv.is_active
    ) then exists (
      select 1
        from public.product_variants pv
        join public.inventory i on i.variant_id = pv.id
       where pv.product_id = p.id and pv.deleted_at is null and pv.is_active
         and (i.quantity - i.reserved) > 0
    )
    else exists (
      select 1 from public.inventory i
      where i.product_id = p.id and (i.quantity - i.reserved) > 0
    )
  end
  from public.products p
  where p.id = p_product_id;
$$;

revoke all on function app.product_has_stock(uuid) from public, anon, authenticated;

/**
 * العمود حقيقةٌ مشتقّة — يُحسب في كل كتابة ولا يُقبل من العميل.
 *
 * ★★ ويُحسب من `new` لا من الجدول (درس 0064): الصفّ لم يُكتب بعد،
 *    فقراءة `track_inventory` من الجدول تعطي القيمة القديمة — ومنتجٌ
 *    أُوقف تتبّعه للتوّ كان سيبقى «نافدًا». ولهذا تُكرَّر الصيغة هنا
 *    بدل نداء `product_has_stock` التي تقرأ الصفّ المكتوب.
 */
create or replace function app.enforce_in_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.in_stock := case
    when not new.track_inventory then true
    when exists (
      select 1 from public.product_variants pv
       where pv.product_id = new.id and pv.deleted_at is null and pv.is_active
    ) then exists (
      select 1
        from public.product_variants pv
        join public.inventory i on i.variant_id = pv.id
       where pv.product_id = new.id and pv.deleted_at is null and pv.is_active
         and (i.quantity - i.reserved) > 0
    )
    else exists (
      select 1 from public.inventory i
      where i.product_id = new.id and (i.quantity - i.reserved) > 0
    )
  end;
  return new;
end;
$$;

/**
 * توفّر الخيار حقيقةٌ مشتقّة — تُحسب من `new` لا من الجدول.
 *
 * ★★★ لماذا لا `app.variant_has_stock(new.id)`: على **الإدراج** لم
 * يُكتب الصفّ بعد، فاستعلامها `from product_variants v where v.id = …`
 * يعود بلا صفوف ⇒ `null` ⇒ `not null violation` على عمود `in_stock`،
 * فيسقط كل إدراج خيار. (التقطه اختبار القاعدة 117 فورًا.) وهو درس
 * 0064 حرفيًّا: الحقيقة المشتقّة في محفّز `before` تُحسب من `new`.
 *
 * ★ و`new.id` متاح: الافتراضات (`gen_random_uuid()`) تُطبَّق قبل
 *   محفّزات `before insert`.
 */
create or replace function app.enforce_variant_in_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.in_stock := case
    when not (select p.track_inventory from public.products p
               where p.id = new.product_id) then true
    else exists (
      select 1 from public.inventory i
       where i.variant_id = new.id and (i.quantity - i.reserved) > 0
    )
  end;
  return new;
end;
$$;

-- ★★ العلّة ٢: `before insert` أيضًا. كان `before update` وحده، والعمود
--    يولد `true` ⇒ خيارٌ جديد بلا مخزون يُعلَن متوفّرًا للزبون.
drop trigger if exists product_variants_sync_in_stock on public.product_variants;
create trigger product_variants_sync_in_stock
  before insert or update on public.product_variants
  for each row execute function app.enforce_variant_in_stock();

-- ★★★ العلّة ٤ — منتجٌ وُلد بلا صفّ مخزون يبقى «متوفّرًا» أبدًا.
--   `save_product` لا تُنشئ صفَّ `inventory` إن كانت الكمّية الابتدائية
--   صفرًا ولا حدَّ تنبيه، و`products.in_stock` يولد `true` افتراضًا،
--   والمحفّز كان `before update` وحده ⇒ لا شيء يصحّحه. فمنتجٌ متتبَّعٌ
--   بلا رصيد يُعلَن متوفّرًا، ويضغط الزبون «أضف للسلة»، ثم يسقط عند
--   الدفع بـ`OUT_OF_STOCK` بلا أن يفهم.
--   (مُثبَت على الإنتاج: ثلاثة منتجات، أحدها **منشور** في متجر تاجر.)
drop trigger if exists products_sync_in_stock on public.products;
create trigger products_sync_in_stock
  before insert or update on public.products
  for each row execute function app.enforce_in_stock();

-- ═══════════════ ٢) `has_variants` و`in_stock` يصونهما محفّز ═══════════

/**
 * خيارٌ أُضيف أو أُخفي أو حُذف ⟶ حقائق المنتج تُحدَّث.
 *
 * ★★★ لماذا محفّز لا كود تطبيق: `has_variants` كان يُكتب في موضعين
 * فقط (نسخ المنتج · قالب تجريبي)، فأيّ مسارٍ ثالث يتركه كاذبًا —
 * وهو ما تبني عليه بطاقة المنتج قرارَ إظهار «أضف للسلة». قيمةٌ كاذبة
 * هنا تعني زرَّ شراءٍ يتخطّى اختيار اللون.
 *
 * ★★ وكتابةٌ واحدة تصحّح العمودين: `enforce_in_stock` محفّزٌ
 *    `before update` على `products`، فأيّ تحديثٍ لهذا الصفّ يُعيد حساب
 *    `in_stock`. فالشرط يشمل العمودين والكتابة تمسّ واحدًا.
 *
 * ★ ولا كتابة بلا تغيّر (درس 0064): كل كتابة على `products` تُبطل
 *   تخزين صفحات المتجر بوسمها، فحفظُ خيارٍ لم يغيّر شيئًا لا يُبطل شيئًا.
 */
create or replace function app.sync_product_from_variants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product uuid := coalesce(new.product_id, old.product_id);
  v_has     boolean;
begin
  if v_product is null then return null; end if;

  v_has := exists (
    select 1 from public.product_variants pv
     where pv.product_id = v_product and pv.deleted_at is null
  );

  update public.products p
     set has_variants = v_has
   where p.id = v_product
     and (p.has_variants is distinct from v_has
          or p.in_stock is distinct from app.product_has_stock(v_product));

  return null;
end;
$$;

drop trigger if exists product_variants_sync_product on public.product_variants;
create trigger product_variants_sync_product
  after insert or update or delete on public.product_variants
  for each row execute function app.sync_product_from_variants();

-- ═══════════════ ٣) دالّة الكتابة — المسار الوحيد ═══════════════

/**
 * حفظ خيارٍ لمنتج (لون · مقاس · حجم). تُنشئ أو تُعدّل.
 *
 * ★★★ `returns uuid` لا `returns table (variant_id uuid)`: اسمُ عمود
 * الإخراج متغيّرٌ في PL/pgSQL، و`variant_id` اسمُ عمودٍ في `inventory`
 * التي تكتب فيها هذه الدالّة ⇒ `42702 ambiguous` في كتلةٍ شرطية لا
 * يمرّ بها إلا من ملأ الكمّية. هذا بالحرف عطل 0069 الذي أوقف حفظ
 * المنتجات منذ الإطلاق — فالقيمة قياسية، واللبس مستحيلٌ بالبناء.
 *
 * ★★ المجموعة مفتاحٌ في `options` من أوّل يوم: «اللون» ⟶ «أحمر».
 *    والفهرس الفريد `(product_id, options)` يمنع التكرار، والتحقّق
 *    أدناه يسبقه برسالةٍ مفهومة بدل خطأ قيدٍ خام.
 *
 * ★ والسعر `null` ⇒ يرث سعر المنتج. وهذا مقصود: متجرٌ ألوانه بسعرٍ
 *   واحد لا يكرّر الرقم أربع مرّات فينساه في واحدة.
 */
create or replace function public.save_variant(
  p_store_id            uuid,
  p_product_id          uuid,
  p_value               text,
  p_variant_id          uuid    default null,
  p_group               text    default null,
  p_price               numeric default null,
  p_compare_at_price    numeric default null,
  p_sku                 text    default null,
  p_image_media_id      uuid    default null,
  p_is_active           boolean default null,
  p_sort_order          integer default null,
  p_initial_quantity    integer default null,
  p_low_stock_threshold integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid := p_variant_id;
  v_old     public.product_variants%rowtype;
  v_product public.products%rowtype;
  v_value   text := trim(coalesce(p_value, ''));
  v_group   text := nullif(trim(coalesce(p_group, '')), '');
  v_sku     text := nullif(trim(coalesce(p_sku, '')), '');
  v_price   numeric := case when p_price is null then null else app.money(p_price) end;
  v_cmp     numeric := case when p_compare_at_price is null then null
                            else app.money(p_compare_at_price) end;
  v_options jsonb;
  v_active  boolean;
  -- نفس سقف 0068: سقفٌ تجاريّ لا فنّي.
  c_money_max constant numeric := 9999999999.99;
  -- ★ سقفٌ لكل منتج: حمايةٌ من طلبٍ مباشر يُنشئ آلاف الخيارات فيثقل
  --   صفحة المنتج على شبكة الهاتف. خمسون أوسع من أيّ متجر حقيقي.
  c_max_per_product constant integer := 50;
begin
  if not app.has_store_permission(p_store_id, 'products:update') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_product from public.products
   where id = p_product_id and store_id = p_store_id and deleted_at is null;
  if v_product.id is null then
    raise exception 'NOT_FOUND: المنتج غير موجود' using errcode = 'P0002';
  end if;

  if v_id is not null then
    select * into v_old from public.product_variants
     where id = v_id and product_id = p_product_id and store_id = p_store_id
       and deleted_at is null;
    if v_old.id is null then
      raise exception 'NOT_FOUND: الخيار غير موجود' using errcode = 'P0002';
    end if;
  end if;

  if length(v_value) = 0 then
    raise exception 'VALIDATION: اسم الخيار مطلوب (مثال: أحمر أو XL)'
      using errcode = 'P0001';
  end if;
  if length(v_value) > 60 then
    raise exception 'VALIDATION: اسم الخيار طويل جدًا' using errcode = 'P0001';
  end if;
  if v_group is not null and length(v_group) > 40 then
    raise exception 'VALIDATION: اسم المجموعة طويل جدًا' using errcode = 'P0001';
  end if;

  if v_price is not null and v_price < 0 then
    raise exception 'VALIDATION: سعر الخيار لا يكون سالبًا' using errcode = 'P0001';
  end if;
  if v_price is not null and v_price > c_money_max then
    raise exception 'VALIDATION: سعر الخيار كبير جدًا — راجع الرقم المُدخَل'
      using errcode = 'P0001';
  end if;
  if v_cmp is not null and v_cmp > c_money_max then
    raise exception 'VALIDATION: السعر قبل الخصم كبير جدًا — راجع الرقم المُدخَل'
      using errcode = 'P0001';
  end if;
  -- ★ يُقارَن بالسعر الفعليّ: خيارٌ يرث سعر المنتج كان سيقبل «سعرًا
  --   قبل الخصم» أقلّ منه فيظهر خصمٌ سالب.
  if v_cmp is not null and v_cmp < coalesce(v_price, v_product.price) then
    raise exception 'VALIDATION: السعر قبل الخصم يجب أن يكون أعلى من السعر'
      using errcode = 'P0001';
  end if;
  if p_initial_quantity is not null and abs(p_initial_quantity) > 10000000 then
    raise exception 'VALIDATION: الكمية كبيرة جدًا — راجع الرقم المُدخَل'
      using errcode = 'P0001';
  end if;
  if p_low_stock_threshold is not null
     and (p_low_stock_threshold < 0 or p_low_stock_threshold > 10000000) then
    raise exception 'VALIDATION: حدّ التنبيه كبير جدًا — راجع الرقم المُدخَل'
      using errcode = 'P0001';
  end if;

  -- المجموعة تثبت على ما اختاره التاجر أوّلًا لهذا المنتج: خياران في
  -- مجموعتين مختلفتين يصيران مُختارين لا قائمة واحدة (مرحلة ٢).
  v_group := coalesce(
    v_group,
    (select k
       from public.product_variants pv,
            lateral jsonb_object_keys(pv.options) k
      where pv.product_id = p_product_id and pv.deleted_at is null
      order by pv.sort_order
      limit 1),
    'الخيار');
  v_options := jsonb_build_object(v_group, v_value);

  -- ★ تكرارٌ يُرفض برسالة لا بخطأ قيد: الفهرس الفريد يحرس، والرسالة
  --   تُفهَم. (ولا يُقاس على المحذوفين: الفهرس جزئيّ على غير المحذوف.)
  if exists (
    select 1 from public.product_variants pv
     where pv.product_id = p_product_id and pv.deleted_at is null
       and pv.options = v_options
       and (v_id is null or pv.id <> v_id)
  ) then
    raise exception 'VALIDATION: هذا الخيار مضاف مسبقًا لهذا المنتج'
      using errcode = 'P0001';
  end if;

  if v_sku is not null and exists (
    select 1 from public.product_variants pv
     where pv.store_id = p_store_id and pv.deleted_at is null
       and lower(pv.sku) = lower(v_sku)
       and (v_id is null or pv.id <> v_id)
  ) then
    raise exception 'VALIDATION: رمز المنتج (SKU) مستعمل في خيار آخر'
      using errcode = 'P0001';
  end if;

  if p_image_media_id is not null and not exists (
    select 1 from public.media_files m
     where m.id = p_image_media_id and m.store_id = p_store_id
       and m.purpose = 'product_image' and m.status = 'ready'
       and m.deleted_at is null
  ) then
    raise exception 'INVALID_MEDIA: ملف صورة غير صالح لهذا المتجر'
      using errcode = 'P0001';
  end if;

  v_active := coalesce(p_is_active, v_old.is_active, true);

  if v_id is null then
    if (select count(*) from public.product_variants pv
         where pv.product_id = p_product_id and pv.deleted_at is null)
       >= c_max_per_product then
      raise exception 'VALIDATION: بلغت الحد الأقصى لخيارات المنتج الواحد (%)',
        c_max_per_product using errcode = 'P0001';
    end if;

    insert into public.product_variants
      (product_id, store_id, name, sku, price, compare_at_price, options,
       image_id, is_active, sort_order)
    values
      (p_product_id, p_store_id, v_value, v_sku, v_price, v_cmp, v_options,
       p_image_media_id, v_active,
       coalesce(p_sort_order,
                (select coalesce(max(pv.sort_order), -1) + 1
                   from public.product_variants pv
                  where pv.product_id = p_product_id and pv.deleted_at is null)))
    returning id into v_id;

    if coalesce(p_initial_quantity, 0) <> 0 then
      perform app.record_movement(p_store_id, p_product_id, v_id,
        p_initial_quantity, 'initial', 'مخزون ابتدائي للخيار');
    end if;
  else
    update public.product_variants set
      name             = v_value,
      sku              = v_sku,
      price            = v_price,
      compare_at_price = v_cmp,
      options          = v_options,
      image_id         = p_image_media_id,
      is_active        = v_active,
      sort_order       = coalesce(p_sort_order, v_old.sort_order),
      updated_at       = now()
    where id = v_id;
    -- ★ الكمّية لا تُكتب في التعديل: تغييرها حركةُ مخزونٍ تُسجَّل
    --   (قاعدة ٥)، ومكانها صفحة المخزون أو `adjust_inventory`.
  end if;

  if p_low_stock_threshold is not null then
    perform app.set_low_stock_threshold(
      p_store_id, p_product_id, v_id, p_low_stock_threshold);
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_variant(
  uuid, uuid, text, uuid, text, numeric, numeric, text, uuid, boolean,
  integer, integer, integer) from public, anon;
grant execute on function public.save_variant(
  uuid, uuid, text, uuid, text, numeric, numeric, text, uuid, boolean,
  integer, integer, integer) to authenticated;

comment on function public.save_variant(
  uuid, uuid, text, uuid, text, numeric, numeric, text, uuid, boolean,
  integer, integer, integer) is
  'حفظ خيار منتج (لون · مقاس). `returns uuid` قياسية عمدًا: اسم عمود '
  'إخراجٍ باسم variant_id يلتبس بعمود inventory ويرفع 42702 (0069).';

/**
 * حذف خيار — ناعمٌ لا فعليّ.
 *
 * ★★ لماذا ناعم: `order_items.variant_id` بـ`on delete restrict`،
 *    فحذفٌ فعليّ يسقط على طلبٍ قديم أو يقطع أثره. والصفّ المحذوف خارج
 *    الفهرس الفريد (جزئيّ) فيجوز إعادة إضافة الاسم نفسه لاحقًا.
 * ★ ويُرفع من كل سلّة مفتوحة: خيارٌ لم يبقَ لا يُشترى — وإلا سقط
 *   الزبون على «المنتج غير متاح» عند الدفع بلا سبب يراه.
 * ★ وصفوف المخزون تبقى: هي تاريخ الحركات، لا تُحذف. والتوفّر يتجاهل
 *   المحذوف بحكم `product_has_stock` أعلاه.
 */
create or replace function public.delete_variant(p_variant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_store uuid;
begin
  select pv.store_id into v_store from public.product_variants pv
   where pv.id = p_variant_id and pv.deleted_at is null;
  if v_store is null then
    raise exception 'NOT_FOUND: الخيار غير موجود' using errcode = 'P0002';
  end if;
  if not app.has_store_permission(v_store, 'products:update') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.product_variants
     set deleted_at = now(), is_active = false, updated_at = now()
   where id = p_variant_id;

  delete from public.cart_items where variant_id = p_variant_id;
end;
$$;

revoke execute on function public.delete_variant(uuid) from public, anon;
grant   execute on function public.delete_variant(uuid) to authenticated;

comment on function public.delete_variant(uuid) is
  'حذف ناعم لخيار منتج، ويُرفع من السلال المفتوحة. الحذف الفعليّ '
  'يسقط على order_items.variant_id (on delete restrict).';

-- ═══════════════ ٤) المنحة المباشرة تُسحب (قاعدة ٤ج) ═══════════════
--
-- ★★★ `grant insert, update, delete ... to authenticated` قائمة منذ
-- 0004، فطلبٌ مباشر إلى PostgREST كان يتخطّى السقف والتحقّق كلّه —
-- حدٌّ يُفحص في الدالّة وحدها ليس حدًّا ما بقيت المنحة. والقراءة تبقى
-- (`select`) فسياسات RLS للقراءة كما هي.
--
-- ★ ولا يُكسر هذا نسخَ المنتج ولا القالب: دوالّهما `security definer`
--   تعمل بصلاحية المالك، والمنحة لا تخصّها.
revoke insert, update, delete on public.product_variants from authenticated;

-- ═══════════════ ٥) تعبئة ما كانت قيمته خاطئة ═══════════════

-- ★ `has_variants` كان يُكتب في موضعين فقط ⇒ قد يكون كاذبًا على أي
--   منتجٍ وصل خياراته من مسارٍ ثالث. والشرط يمنع كتابةً بلا تغيّر.
update public.products p
   set has_variants = exists (
     select 1 from public.product_variants pv
      where pv.product_id = p.id and pv.deleted_at is null)
 where p.has_variants is distinct from exists (
     select 1 from public.product_variants pv
      where pv.product_id = p.id and pv.deleted_at is null);

-- ★ و`in_stock`: بعد تغيّر معناه للمنتجات ذات الخيارات (العلّة ١)،
--   وللمنتجات التي وُلدت بلا صفّ مخزون فبقيت «متوفّرة» (العلّة ٤).
--   والمحفّز `enforce_in_stock` يُعيد حسابه في الكتابة نفسها، فكتابةُ
--   عمودٍ بقيمته تكفي — ولا تلمس بيانًا آخر.
update public.products p
   set has_variants = p.has_variants
 where p.in_stock is distinct from app.product_has_stock(p.id);

-- ★ وتوفّر كل خيار: العمود يولد `true`، والمحفّز لم يكن يعمل على
--   الإدراج (العلّة ٢) ⇒ خياراتٌ قديمة قد تكون معلَنةً متوفّرة كاذبًا.
update public.product_variants v
   set in_stock = app.variant_has_stock(v.id)
 where v.deleted_at is null
   and v.in_stock is distinct from app.variant_has_stock(v.id);
