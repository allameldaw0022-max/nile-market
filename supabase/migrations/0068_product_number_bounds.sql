-- ═══════════════════════════════════════════════════════════════════
-- رقمٌ أكبر من عموده: رسالةٌ تقول أيّ حقل، لا «خطأ غير متوقع».
-- ═══════════════════════════════════════════════════════════════════
--
-- ★★★ العطل كما رآه التاجر: يملأ نموذج المنتج ويضغط «إضافة المنتج»
-- فيظهر شريط أحمر: «حدث خطأ غير متوقع، تم إبلاغ الفريق». لا يعرف أي
-- حقلٍ أخطأ فيه، فيُعيد المحاولة بالقيمة نفسها فيفشل ثانيةً وثالثة.
-- (أربع محاولات في خمس ساعات، مُثبَتة في سجلّ رفع الصور.)
--
-- ★★ السبب: `price` و`compare_at_price` و`cost_price` من النوع
-- `numeric(14,2)`، و`weight_grams` و`quantity` أعداد صحيحة. وقيمةٌ
-- تتجاوز سعة العمود يرفضها Postgres بـ`22003 numeric field overflow`
-- — وهو رمزٌ **غير مترجَم** في `fromPostgres`، فيسقط إلى
-- `errors.internal()` ⇒ الرسالة العامّة. أي أن خطأ إدخالٍ بسيطًا
-- يُعرض كعطلٍ في المنصّة.
--
-- ★ والحدود هنا **أضيق** من سعة العمود عمدًا: السعة الفنّية
-- (٩٩٩ مليار) ليست رقمًا تجاريًّا، وقبولُها يعني طلبًا بمجموعٍ لا
-- يُدفع. الحدّ التجاري يُرفَض برسالةٍ مفهومة قبل أن يصير بيانًا.
--
-- ★ ولا يمسّ هذا بيانًا قائمًا: أعلى سعر في المنصّة اليوم ٢٫٦ مليون،
--   وأعلى كمّية ٥٠. الحدود أدناه أوسع من ذلك بمراتب.
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

  if p_low_stock_threshold is not null then
    insert into public.inventory (store_id, product_id, variant_id, quantity,
                                  low_stock_threshold)
    values (p_store_id, v_id, null, 0, p_low_stock_threshold)
    on conflict (product_id,
                 coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do update set low_stock_threshold = p_low_stock_threshold;
  end if;

  perform app.sync_product_images(p_store_id, v_id, p_image_media_ids);

  return query select v_id, v_slug;
end;
$$;

comment on function public.save_product(
  uuid, text, numeric, uuid, text, text, numeric, numeric, text, uuid,
  public.product_status, boolean, integer, integer, integer, uuid[], jsonb) is
  'حفظ منتج. الحدود العليا للأرقام تُفحص هنا برسائل تسمّي الحقل — '
  'وإلا رفع Postgres 22003 وظهر للتاجر «حدث خطأ غير متوقع».';
