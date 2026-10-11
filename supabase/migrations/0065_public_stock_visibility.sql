-- ═══════════════════════════════════════════════════════════════════
-- التوفّر يراه الزائر: عمودٌ منشور بدل مخزونٍ لا يملك قراءته.
-- ═══════════════════════════════════════════════════════════════════
--
-- ★★★ العطل: واجهة المتجر تقرأ التوفّر من `inventory(quantity, reserved)`
-- بمفتاح anon. و`inventory` عليها RLS بلا أيّ سياسة لـanon (عمدًا:
-- أرصدة التاجر ليست بيانًا عامًّا) — فالزائر يحصل على **صفر صفوف**،
-- لا على خطأ. والنتيجة عطلان متعاكسان من جذرٍ واحد:
--
--   • صفحة المنتج: `stock = 0` ⇒ «نفدت الكمّية» لكلّ منتج متتبَّع،
--     ولا زرّ شراء. أي أنّ كل رابط منتج يُشارَك على واتساب يصل
--     الزبون معطّلًا. (تُحقّق على الإنتاج: ٢٤ منتجًا متتبَّعًا نشطًا،
--     ٢٣ منها متوفّرة فعلًا، وصفر صفوف مخزون مرئية لـanon.)
--   • بطاقة المنتج في الشبكة: `inv == null` ⇒ `tracked = false` ⇒
--     تُظهر «أضف للسلة» حتى لمنتجٍ نفد فعلًا — تفشل مفتوحةً.
--
-- ★★ والعلاج ليس فتح `inventory` لـanon: الأرصدة تبقى خاصّة. بل
-- نشرُ **الخلاصة** وحدها — منطقيّة `in_stock` التي يصونها المحفّز
-- منذ 0064 — للمنتج ولخياراته. الزائر يعرف «متوفّر أو لا»، ولا يعرف
-- «كم بقي».
--
-- ★ ولا خطر إفراط بيع: `place_order` تقفل صفّ المخزون `for update`
-- وترفع `OUT_OF_STOCK` — فالقيمة في الواجهة تجربةُ استخدام لا حارس.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════ ١) `products.in_stock` يُقرأ من الواجهة العامّة ═══════════
--
-- ★★ `products` لا منحة جدولٍ لها لـanon — بل قائمة أعمدة صريحة. وعمودٌ
--    جديد لا يدخلها تلقائيًا. ولهذا كان `.eq('in_stock', true)` في
--    مرشّح «المتوفّر فقط» يسقط بـ«permission denied for table products».
grant select (in_stock) on public.products to anon, authenticated;

-- ═══════════ ٢) التوفّر لكلّ خيار ═══════════
--
-- ★ جمع مخزون المقاسات كلّها يَعِد بتوفّر مقاسٍ نفد. والعمود هنا
--   لكل خيار على حدة — وهو ما كان `qtyOf` يحسبه من صفوفٍ لا تصل.
alter table public.product_variants
  add column if not exists in_stock boolean not null default true;

/** هل للخيار رصيدٌ قابل للبيع؟ خيارٌ لمنتجٍ بلا تتبّع متوفّرٌ دائمًا. */
create or replace function app.variant_has_stock(p_variant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not p.track_inventory then true
    else exists (
      select 1 from public.inventory i
      where i.variant_id = v.id and (i.quantity - i.reserved) > 0
    )
  end
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where v.id = p_variant_id;
$$;

revoke all on function app.variant_has_stock(uuid) from public, anon, authenticated;

/**
 * مزامنة توفّر الخيار من حركة المخزون.
 *
 * ★ لا كتابة بلا تغيّر — نفس سبب 0064: كلّ حجزٍ وإفراج كان سيصير
 *   كتابةً تُبطل تخزين صفحات المتجر.
 */
create or replace function app.sync_variant_in_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant uuid := coalesce(new.variant_id, old.variant_id);
  v_now     boolean;
begin
  if v_variant is null then return null; end if;
  v_now := app.variant_has_stock(v_variant);

  update public.product_variants
  set in_stock = v_now
  where id = v_variant and in_stock is distinct from v_now;

  return null;
end;
$$;

drop trigger if exists inventory_sync_variant_in_stock on public.inventory;
create trigger inventory_sync_variant_in_stock
  after insert or update of quantity, reserved, variant_id or delete
  on public.inventory
  for each row execute function app.sync_variant_in_stock();

/**
 * العمود حقيقةٌ مشتقّة لا تُقبل من العميل.
 *
 * ★★ محفّز لا منحة عمودية: `authenticated` يملك `update` على **مستوى
 *    الجدول** على `product_variants`، و`revoke update (col)` لا يُنقص
 *    من منحةٍ على مستوى الجدول — وهو الدرس نفسه الذي أسقط اختبار 0064.
 */
create or replace function app.enforce_variant_in_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.in_stock := app.variant_has_stock(new.id);
  return new;
end;
$$;

drop trigger if exists product_variants_sync_in_stock on public.product_variants;
create trigger product_variants_sync_in_stock
  before update on public.product_variants
  for each row execute function app.enforce_variant_in_stock();

-- ★ تعبئة ما هو قائم: العمود يولد `true` افتراضًا، فخيارٌ نافدٌ اليوم
--   كان سيُعلَن متوفّرًا حتى أوّل حركة مخزون.
update public.product_variants v
set in_stock = app.variant_has_stock(v.id)
where v.in_stock is distinct from app.variant_has_stock(v.id);

-- ★ ومنحة `product_variants` لـanon على مستوى الجدول، فالعمود الجديد
--   مشمولٌ بها تلقائيًا — لا منحة عمودية لازمة هنا.
