-- =====================================================================
-- 0038 إحكام الأعمدة المكشوفة عبر السياسات العامة (إضافية)
--
-- ★ الثغرة: RLS تعمل على مستوى **الصف** لا العمود. وسياسة
-- `products_public_read` تكشف صفّ المنتج كاملًا لأي زائر — بما فيه
-- `cost_price`، أي **سعر تكلفة كل منتج في المنصة**. مفتاح `anon`
-- منشور في كل متصفح، فالاستعلام التالي كان يعمل للجميع:
--
--     GET /rest/v1/products?select=name,cost_price
--
-- هامش ربح كل تاجر مكشوف لمنافسيه. والخطأ ليس في السياسة — الصفحة
-- العامة تحتاج الصف — بل في وجود عمود سرّي داخل صفّ عام.
--
-- ★ وكذلك `store_settings_public_read` تكشف الصف كاملًا: حدّ تنبيه
-- المخزون وتفضيلات الإشعارات وبادئة أرقام الطلبات إعدادات تشغيلية
-- داخلية لا يحتاجها الزبون.
--
-- الإصلاح: منح على مستوى العمود (`revoke select (col)`) — تحترمه
-- PostgREST — مع دوال مُحكمة تعيد ما يحتاجه صاحب الحق.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ١) سعر التكلفة يخرج من المسار العام تمامًا
-- ---------------------------------------------------------------------
-- ★ المنح على مستوى العمود لا يعمل بالحذف وحده: من يملك SELECT على
-- الجدول كلّه يتجاوزه. فالمسار الصحيح سحبُ منح الجدول ثم منح الأعمدة
-- المسموحة صراحةً — وقائمة صريحة تعني أن أي عمود جديد يبقى محجوبًا
-- حتى يُضاف هنا عن قصد.
revoke select on public.products from anon, authenticated;
grant select (
  id, store_id, category_id, name, slug, description, price,
  compare_at_price, sku, status, has_variants, track_inventory,
  weight_grams, seo, attributes, views_count, sold_count, published_at,
  created_at, updated_at, deleted_at
) on public.products to anon, authenticated;

-- التاجر يقرأ تكاليفه من هنا: الدالة تفحص `products:view` على المتجر
-- نفسه، فلا يقرأ أحد تكاليف متجر غيره.
create or replace function public.product_costs(p_store_id uuid)
returns table (product_id uuid, cost_price numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not app.has_store_permission(p_store_id, 'products:view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select p.id, p.cost_price
    from public.products p
   where p.store_id = p_store_id and p.deleted_at is null;
end;
$$;

revoke execute on function public.product_costs(uuid) from public, anon;
grant   execute on function public.product_costs(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- ٢) الإعدادات التشغيلية الداخلية تخرج من المسار العام
--
-- ما يبقى عامًّا هو ما تحتاجه واجهة المتجر فعلًا: واتساب · وسائل
-- التواصل · العنوان · السمة · السياسات · طرق الدفع المفعّلة.
-- ---------------------------------------------------------------------
revoke select on public.store_settings from anon, authenticated;
grant select (
  store_id, whatsapp_number, contact_email, contact_phone, address,
  social_links, theme, cod_enabled, bank_transfer_enabled, bankak_enabled,
  seo, policies, created_at, updated_at
) on public.store_settings to anon, authenticated;

create or replace function public.store_operational_settings(p_store_id uuid)
returns table (
  low_stock_threshold     integer,
  auto_hide_out_of_stock  boolean,
  order_prefix            text,
  notification_prefs      jsonb,
  maintenance_mode        boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not app.has_store_permission(p_store_id, 'settings:view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select s.low_stock_threshold, s.auto_hide_out_of_stock, s.order_prefix,
         s.notification_prefs, s.maintenance_mode
    from public.store_settings s
   where s.store_id = p_store_id;
end;
$$;

revoke execute on function public.store_operational_settings(uuid)
  from public, anon;
grant   execute on function public.store_operational_settings(uuid)
  to authenticated;

-- ---------------------------------------------------------------------
-- ٣) `save_product` تكتب التكلفة — والكتابة غير مقيَّدة بالمنح أعلاه
-- لأنها `security definer`. نتأكد فقط أن القراءة داخلها ما زالت تعمل.
-- ---------------------------------------------------------------------
comment on column public.products.cost_price is
  'سرّ تجاري: محجوب عن anon وauthenticated على مستوى العمود. '
  'يُقرأ عبر public.product_costs() بصلاحية products:view، ويُكتب عبر save_product().';

comment on column public.store_settings.notification_prefs is
  'إعداد تشغيلي داخلي: محجوب عن المسار العام، يُقرأ عبر '
  'public.store_operational_settings() بصلاحية settings:view.';
