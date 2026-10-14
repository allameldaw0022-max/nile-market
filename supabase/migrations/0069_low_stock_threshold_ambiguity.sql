-- ═══════════════════════════════════════════════════════════════════
-- حدّ التنبيه: الحقل الذي كان يُفشل حفظ المنتج كلّه.
-- ═══════════════════════════════════════════════════════════════════
--
-- ★★★ العطل كما رآه التاجر — وقاله بنفسه: «بتظهر في حالة واحدة، عند
-- اضافة حد التنبيه». يملأ نموذج المنتج ويكتب رقمًا في «حد التنبيه»
-- فيظهر «حدث خطأ غير متوقع» ولا يُحفظ المنتج. ويتركه فارغًا فيُحفظ.
-- (أُعيد إنتاجه على الإنتاج ثلاث مرّات في معاملة مُلغاة: بلا الحقل
-- ينجح، ومعه يفشل — بوجود كمّية ابتدائية وبدونها.)
--
-- ★★ السبب: `save_product` تُعلن `returns table (product_id uuid, …)`،
-- وأسماء أعمدة الإخراج في PL/pgSQL **متغيّرات**. وكتلة حدّ التنبيه
-- وحدها تحتوي مرجعًا مجرّدًا لعمودٍ بالاسم نفسه:
--
--     on conflict (product_id, coalesce(variant_id, '000…'::uuid))
--
-- فالاسم عمودٌ ومتغيّرٌ معًا، والسلوك الافتراضي `#variable_conflict
-- error` ⇒ `42702: column reference "product_id" is ambiguous`. وهي
-- نفس علّة 0061 حرفيًّا، في موضعٍ لم يُفحص: الكتلة شرطية
-- (`if p_low_stock_threshold is not null`) فلا يمرّ بها إلا من كتب
-- الرقم — ولهذا نجا منها كل اختبار وكل تاجرٍ تركه فارغًا.
--
-- ★★ وقائم **منذ 0016، أي منذ الإطلاق**: لا تاجرٌ في المنصّة كلّها
-- استطاع حفظ منتج بحدّ تنبيه. وهو العطل الذي أوقف رفع منتجات تذكرة
-- الدعم (رمز الارتباط c6608d06) — والرمز هو ما دلّ عليه، فحتى ظهوره
-- كان الفشل بلا أثر.
--
-- ★ ولماذا لا تأهيلٌ صريح كما في 0061؟ لأنّ `on conflict` **لا تقبل**
-- اسمًا مؤهَّلًا نحويًّا: `on conflict (inventory.product_id, …)` ترفع
-- `42601 syntax error` (مُجرَّب على الإنتاج). ولا `#variable_conflict
-- use_column` — 0061 رفضها بحجّة صحيحة: تُخفي اللبس بدل إظهاره، فأيّ
-- مرجعٍ مستقبلي يقصد متغيّرًا يُقرأ عمودًا بصمت.
--
-- ★ فالمخرج: نقل الكتابة إلى دالّة لا أسماء إخراج فيها. اللبس يزول
-- بالبناء لا بتعطيل الحارس، و`save_product` تبقى على
-- `#variable_conflict error` فيظلّ الحارس شغّالًا لما يأتي.
--
-- ★ ولا بيان يُمسّ: الدالّة المساعدة تفعل ما كانت تفعله الكتلة حرفيًّا
--   (نفس الجملة، نفس الفهرس الحاكم)، والمنطق والتوقيع والمنح كما هي.
-- ═══════════════════════════════════════════════════════════════════

/**
 * حدّ تنبيه المخزون لمنتجٍ أو خيار — المسار الوحيد لكتابته.
 *
 * ★★ لا أسماء إخراج هنا (`returns void`)، فمرجع `product_id` في
 *    `on conflict` عمودٌ لا لبس فيه. هذا سببُ وجودها، لا أكثر.
 * ★ و`quantity => 0` للصفّ الجديد: الكمّية لا تُكتب من هنا أبدًا —
 *   صفٌّ جديد يبدأ صفرًا، والقائم لا يُمَسّ (§12 و`guard_inventory_quantity`).
 */
create or replace function app.set_low_stock_threshold(
  p_store_id   uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_threshold  integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory (store_id, product_id, variant_id, quantity,
                                low_stock_threshold)
  values (p_store_id, p_product_id, p_variant_id, 0, p_threshold)
  on conflict (product_id,
               coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set low_stock_threshold = p_threshold;
end;
$$;

-- ★ سكيمة `app` لا يكشفها PostgREST، والمنحة تُسحب فوقها: لا يناديها
--   إلا دوالّ القاعدة. (قاعدة ٤ب في CLAUDE.md)
revoke all on function app.set_low_stock_threshold(uuid, uuid, uuid, integer)
  from public, anon, authenticated;

comment on function app.set_low_stock_threshold(uuid, uuid, uuid, integer) is
  'كتابة حدّ تنبيه المخزون. دالّة منفصلة لأن `on conflict (product_id…)` '
  'داخل دالّة تُعلن `returns table (product_id …)` تلتبس وترفع 42702.';

-- ═══════════════════════════════════════════════════════════════════
-- و`save_product` تنادي المساعدة بدل الكتابة الملتبسة — لا تغيير آخر.
-- ═══════════════════════════════════════════════════════════════════

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
  v_cost   numeric := case when p_cost_price is null then null
                           else app.money(p_cost_price) end;
  v_status public.product_status;
  -- سقفٌ تجاريّ لا فنّي: عشرة مليارات جنيه لمنتجٍ واحد رقمٌ لا يقع.
  c_money_max constant numeric := 9999999999.99;
begin
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

  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'VALIDATION: اسم المنتج مطلوب' using errcode = 'P0001';
  end if;
  if length(trim(p_name)) > 200 then
    raise exception 'VALIDATION: اسم المنتج طويل جدًا' using errcode = 'P0001';
  end if;
  if v_price is null or v_price < 0 then
    raise exception 'VALIDATION: السعر مطلوب ولا يكون سالبًا' using errcode = 'P0001';
  end if;

  -- ★★★ الحدود العليا: تُفحص **قبل** أي كتابة، وكلٌّ برسالةٍ تسمّي حقلها.
  if v_price > c_money_max then
    raise exception 'VALIDATION: السعر كبير جدًا — راجع الرقم المُدخَل'
      using errcode = 'P0001';
  end if;
  if v_cmp is not null and v_cmp > c_money_max then
    raise exception 'VALIDATION: السعر قبل الخصم كبير جدًا — راجع الرقم المُدخَل'
      using errcode = 'P0001';
  end if;
  if v_cost is not null and v_cost > c_money_max then
    raise exception 'VALIDATION: سعر التكلفة كبير جدًا — راجع الرقم المُدخَل'
      using errcode = 'P0001';
  end if;
  if p_weight_grams is not null and (p_weight_grams < 0 or p_weight_grams > 10000000) then
    raise exception 'VALIDATION: الوزن غير معقول — أدخله بالجرام'
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

  if v_id is null then
    insert into public.products (
      store_id, category_id, name, slug, description, price, compare_at_price,
      cost_price, sku, status, track_inventory, weight_grams, seo, published_at
    ) values (
      p_store_id, p_category_id, trim(p_name), v_slug,
      nullif(trim(p_description), ''), v_price, v_cmp,
      v_cost, nullif(trim(p_sku), ''), v_status,
      coalesce(p_track_inventory, true), p_weight_grams,
      coalesce(p_seo, '{}'::jsonb),
      case when v_status = 'active' then now() else null end
    )
    returning id into v_id;

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
      cost_price       = v_cost,
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

  -- ★★★ عبر الدالّة المساعدة: الكتابة المباشرة هنا كانت ترفع 42702
  --     لأنّ `product_id` اسمُ عمودٍ ومتغيّرِ إخراجٍ معًا (انظر أعلى الملف).
  if p_low_stock_threshold is not null then
    perform app.set_low_stock_threshold(p_store_id, v_id, null, p_low_stock_threshold);
  end if;

  perform app.sync_product_images(p_store_id, v_id, p_image_media_ids);

  return query select v_id, v_slug;
end;
$$;

comment on function public.save_product(
  uuid, text, numeric, uuid, text, text, numeric, numeric, text, uuid,
  public.product_status, boolean, integer, integer, integer, uuid[], jsonb) is
  'حفظ منتج. حدّ التنبيه يُكتب عبر app.set_low_stock_threshold — كتابته '
  'هنا تلتبس بمتغيّر الإخراج product_id وترفع 42702. والحدود العليا '
  'للأرقام تُفحص هنا برسائل تسمّي الحقل (وإلا ظهر 22003 كعطل نظام).';
