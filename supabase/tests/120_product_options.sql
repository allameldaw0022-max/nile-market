\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set B b0000000-0000-0000-0000-00000000000b
\set ownerA 11111111-1111-1111-1111-111111111111
\set ownerB 22222222-2222-2222-2222-222222222222
\set csA    66666666-6666-6666-6666-666666666666
\set P1 d1000000-0000-0000-0000-000000000001
\set PB d2000000-0000-0000-0000-000000000001

\echo '── خيارات المنتج: مسار الكتابة (0070) ──'

begin;
select t.login(:'ownerA');
select t.ok((select public.save_variant(:'A', :'P1', 'أحمر') is not null),
            '★★★ التاجر يُنشئ خيارًا — لم يكن له مسارٌ أصلًا');
select t.ok((select name = 'أحمر' and options = '{"الخيار":"أحمر"}'::jsonb
             from public.product_variants
             where product_id = :'P1' and deleted_at is null),
            '★★ والمجموعة مفتاحٌ في options — شكلٌ يرقّى إلى لون×مقاس بلا هجرة');
select t.ok((select has_variants from public.products where id = :'P1'),
            '★★★ و`has_variants` يُرفع آليًّا — عليه تُبنى إخفاء «أضف للسلة»');
rollback;

begin;
select t.login(:'ownerA');
-- ★★★ العلّة ٢: خيارٌ بلا مخزون كان يُعلَن متوفّرًا للزبون، لأن المحفّز
--   كان `before update` وحده والعمود يولد `true`.
select t.ok((select public.save_variant(:'A', :'P1', 'أحمر') is not null), 'خيار بلا كمّية');
select t.ok((select not in_stock from public.product_variants
             where product_id = :'P1' and name = 'أحمر' and deleted_at is null),
            '★★★ خيارٌ بلا مخزون لا يُعلَن متوفّرًا');

-- ★★★ العلّة ١: المنتج له رصيدٌ أساس ٥٠ من البذرة، وخيارٌ نافد ⇒
--   البطاقة كانت تقول «متوفّر» والمُختار يقول «نفد كل خيار».
select t.ok((select not in_stock from public.products where id = :'P1'),
            '★★★ ومنتجٌ كلّ خياراته نافدة ليس متوفّرًا — ولو بقي رصيده الأساس');

select t.ok((select public.save_variant(:'A', :'P1', 'أزرق',
               p_initial_quantity => 4) is not null), 'خيار بكمّية ابتدائية');
select t.ok((select in_stock from public.product_variants
             where product_id = :'P1' and name = 'أزرق' and deleted_at is null),
            '★★ وخيارٌ له كمّية متوفّر');
select t.ok((select in_stock from public.products where id = :'P1'),
            '★★★ ويتوفّر المنتج بتوفّر خيارٍ واحد منه');
select t.ok((select quantity = 4 from public.inventory i
             join public.product_variants v on v.id = i.variant_id
             where v.product_id = :'P1' and v.name = 'أزرق'),
            '★ والكمّية على صفّ الخيار لا على الصفّ الأساس');
select t.ok((select quantity = 50 from public.inventory
             where product_id = :'P1' and variant_id is null),
            '★★ والرصيد الأساس لم يُمَسّ — لا بيان يُحرّك خلف ظهر التاجر');
rollback;

begin;
select t.login(:'ownerA');
-- المجموعة تثبت على ما اختاره التاجر أوّلًا: خياران في مجموعتين
-- مختلفتين يصيران مُختارين لا قائمة واحدة (مرحلة ٢).
select t.ok((select public.save_variant(:'A', :'P1', 'L', p_group => 'المقاس')
             is not null), 'خيار بمجموعة صريحة');
select t.ok((select public.save_variant(:'A', :'P1', 'XL') is not null),
            'وخيار ثانٍ بلا مجموعة');
select t.ok((select count(*) = 2 from public.product_variants
             where product_id = :'P1' and deleted_at is null
               and options ? 'المقاس'),
            '★★ الثاني يرث مجموعة الأوّل — لا «الخيار» بجوار «المقاس»');
rollback;

begin;
select t.login(:'ownerA');
-- ★★★ الحالة التي لا يمسّها `has_variants`: خيارٌ يُعطَّل. لا عمودَ
--   مشتقًّا يتغيّر في `product_variants`، فشرطُ المحفّز يعتمد على
--   `app.product_has_stock` وحدها — وهي الواعية بالخيارات. بلا هذا
--   يبقى المنتج «متوفّرًا» وكلّ خيارٍ مُتاحٍ منه معطّل.
select t.ok((select public.save_variant(:'A', :'P1', 'أحمر',
               p_initial_quantity => 2) is not null), 'خيار بمخزون');
select t.ok((select public.save_variant(:'A', :'P1', 'أزرق') is not null),
            'وخيار بلا مخزون');
select t.ok((select in_stock from public.products where id = :'P1'),
            'المنتج متوفّر بالخيار الأوّل');
select t.ok((select public.save_variant(:'A', :'P1', 'أحمر',
               p_variant_id => (select id from public.product_variants
                 where product_id = :'P1' and name = 'أحمر' and deleted_at is null),
               p_is_active => false) is not null),
            'التاجر يعطّل الخيار المتوفّر');
select t.ok((select not in_stock from public.products where id = :'P1'),
            '★★★ ويصير المنتج نافدًا — تعطيلُ خيارٍ لا يمسّ has_variants');
select t.ok((select public.save_variant(:'A', :'P1', 'أحمر',
               p_variant_id => (select id from public.product_variants
                 where product_id = :'P1' and name = 'أحمر' and deleted_at is null),
               p_is_active => true) is not null),
            'ثم يُعيد تفعيله');
select t.ok((select in_stock from public.products where id = :'P1'),
            '★★ ويعود متوفّرًا');

-- ★★★ عقد `save_variant`: تكتب **كل** عمودٍ مما يصلها — كما
--   `save_product` حرفيًّا. فنداءٌ جزئيّ يمحو ما لم يُرسَل، ولهذا
--   تُرسل شاشة التاجر الحقول كلّها عند التعطيل (وحارسٌ في
--   tests/product-options.test.ts يمنع نداءً ناقصًا).
select t.ok((select public.save_variant(:'A', :'P1', 'أصفر',
               p_price => 7000, p_sku => 'YL-1') is not null), 'خيار بسعر وSKU');
select t.ok((select price = 7000 and sku = 'YL-1' from public.product_variants
             where product_id = :'P1' and name = 'أصفر' and deleted_at is null),
            'السعر وSKU محفوظان');
select t.ok((select public.save_variant(:'A', :'P1', 'أصفر',
               p_variant_id => (select id from public.product_variants
                 where product_id = :'P1' and name = 'أصفر' and deleted_at is null),
               p_price => 7000, p_sku => 'YL-1', p_is_active => false)
             is not null), 'تعطيلٌ بإرسال الحقول كلّها');
select t.ok((select price = 7000 and sku = 'YL-1' and not is_active
             from public.product_variants
             where product_id = :'P1' and name = 'أصفر' and deleted_at is null),
            '★★★ يُبقيهما — وهذا ما تفعله الشاشة');
select t.ok((select public.save_variant(:'A', :'P1', 'أصفر',
               p_variant_id => (select id from public.product_variants
                 where product_id = :'P1' and name = 'أصفر' and deleted_at is null),
               p_is_active => true) is not null), 'ونداءٌ جزئيّ');
select t.ok((select price is null and sku is null from public.product_variants
             where product_id = :'P1' and name = 'أصفر' and deleted_at is null),
            '★★ يمحوهما — العقد صريحٌ لا مفاجأة');
rollback;

\echo '── ما يُرفض، وبرسالةٍ تُفهَم ──'
begin;
select t.login(:'ownerA');
select t.ok((select public.save_variant(:'A', :'P1', 'أحمر') is not null), 'خيار أوّل');
select t.ok((select t.catch('select public.save_variant(' || quote_literal(:'A')
               || ', ' || quote_literal(:'P1') || ', ''أحمر'')')
             like 'VALIDATION:%مضاف مسبقًا%'),
            '★★ تكرار الخيار يُرفض برسالة — لا بخطأ قيدٍ خام');
select t.throws('select public.save_variant(' || quote_literal(:'A')
  || ', ' || quote_literal(:'P1') || ', '''')',
  '★ واسمٌ فارغ');
select t.throws('select public.save_variant(' || quote_literal(:'A')
  || ', ' || quote_literal(:'P1') || ', ''أسود'', p_price => -1)',
  '★ وسعرٌ سالب');
select t.throws('select public.save_variant(' || quote_literal(:'A')
  || ', ' || quote_literal(:'P1') || ', ''أسود'', p_price => 99999999999999)',
  '★★ وسعرٌ فوق الحدّ (وإلا رفع Postgres 22003 كعطل نظام)');
-- ★ السعر قبل الخصم يُقارَن بالسعر **الفعليّ**: خيارٌ يرث سعر المنتج
--   (٢٠٠٠٠) كان سيقبل «قبل الخصم = ١٠٠٠» فيظهر خصمٌ سالب.
select t.throws('select public.save_variant(' || quote_literal(:'A')
  || ', ' || quote_literal(:'P1') || ', ''أسود'', p_compare_at_price => 1000)',
  '★★ وسعرٌ قبل الخصم أقلّ من السعر الموروث');
select t.throws('select public.save_variant(' || quote_literal(:'A')
  || ', ' || quote_literal(:'P1') || ', ''أسود'', p_low_stock_threshold => 99999999)',
  '★ وحدّ تنبيهٍ ضخم');
select t.ok((select public.save_variant(:'A', :'P1', 'أخضر', p_sku => 'CLR-1')
             is not null), 'خيار بـSKU');
select t.ok((select t.catch('select public.save_variant(' || quote_literal(:'A')
               || ', ' || quote_literal(:'P1') || ', ''أصفر'', p_sku => ''clr-1'')')
             like 'VALIDATION:%SKU%'),
            '★★ وSKU مكرّر (بلا حساسية حالة) يُرفض برسالة تسمّيه');
select t.throws('select public.save_variant(' || quote_literal(:'A')
  || ', ' || quote_literal(:'P1') || ', ''وهمي'', p_image_media_id => '
  || quote_literal('f0000000-0000-0000-0000-00000000ffff') || ')',
  '★★ وصورةٌ ليست من ملفات هذا المتجر');
rollback;

\echo '── السقف لكل منتج: حدٌّ في الدالّة لأن المنحة سُحبت ──'
begin;
select t.login(:'ownerA');
do $$
begin
  for i in 1..50 loop
    perform public.save_variant('a0000000-0000-0000-0000-00000000000a',
      'd1000000-0000-0000-0000-000000000001', 'خيار ' || i);
  end loop;
end $$;
select t.ok((select count(*) = 50 from public.product_variants
             where product_id = :'P1' and deleted_at is null), 'خمسون خيارًا');
select t.throws('select public.save_variant(' || quote_literal(:'A')
  || ', ' || quote_literal(:'P1') || ', ''الحادي والخمسون'')',
  '★★ والحادي والخمسون يُرفض — صفحة منتجٍ بآلاف الخيارات تثقل الهاتف');
rollback;

\echo '── الصلاحية والعزل ──'
begin;
select t.login(:'ownerB');
select t.throws('select public.save_variant(' || quote_literal(:'A')
  || ', ' || quote_literal(:'P1') || ', ''أحمر'')',
  '★★★ مالك متجر آخر لا يضيف خيارًا لمنتجي');
rollback;

begin;
select t.login(:'csA');
select t.throws('select public.save_variant(' || quote_literal(:'A')
  || ', ' || quote_literal(:'P1') || ', ''أحمر'')',
  '★★ ومن لا يملك products:update من الفريق');
rollback;

begin;
select t.login(:'ownerA');
select t.throws('select public.save_variant(' || quote_literal(:'A')
  || ', ' || quote_literal(:'PB') || ', ''أحمر'')',
  '★★ ومنتجُ متجرٍ آخر يُعاد NOT_FOUND لا FORBIDDEN');
rollback;

begin;
select t.logout();
select t.throws('select public.save_variant(' || quote_literal(:'A')
  || ', ' || quote_literal(:'P1') || ', ''أحمر'')',
  '★★★ والزائر ممنوع من التنفيذ أصلًا');
rollback;

-- ★★★ العلّة ٣ (قاعدة ٤ج): منحةٌ مباشرة على الجدول تتخطّى السقف
--   والتحقّق كلّه بطلبٍ واحد إلى PostgREST.
select t.ok((select not has_table_privilege('authenticated',
               'public.product_variants', 'insert')),
            '★★★ لا منحة إدراجٍ مباشرة — الحدّ في الدالّة يبقى حدًّا');
select t.ok((select not has_table_privilege('authenticated',
               'public.product_variants', 'update')),
            '★★ ولا تحديث مباشر');
select t.ok((select not has_table_privilege('authenticated',
               'public.product_variants', 'delete')),
            '★★ ولا حذف مباشر');
select t.ok((select has_table_privilege('authenticated',
               'public.product_variants', 'select')),
            '★ والقراءة باقية — سياسات RLS كما هي');

\echo '── الحذف ناعمٌ ويُنظّف السلال ──'
begin;
select t.login(:'ownerA');
select t.ok((select public.save_variant(:'A', :'P1', 'أحمر',
               p_initial_quantity => 3) is not null), 'خيار بمخزون');
select t.logout();
select t.ok((select count(*) = 1 from public.cart_add_item(:'A', :'P1', 1,
               (select id from public.product_variants
                 where product_id = :'P1' and name = 'أحمر' and deleted_at is null),
               'tok-opt-1')),
            'زائرٌ يضع الخيار في سلّته');
select t.login(:'ownerA');
select t.ok((select t.catch('select public.delete_variant('
               || quote_literal((select id from public.product_variants
                    where product_id = :'P1' and name = 'أحمر'
                      and deleted_at is null)) || ')') = '(لم يُرفض)'),
            'التاجر يحذف الخيار');
select t.ok((select deleted_at is not null and not is_active
             from public.product_variants
             where product_id = :'P1' and name = 'أحمر'),
            '★★ حذفٌ ناعم — order_items.variant_id بـon delete restrict');
select t.empty('select 1 from public.cart_items ci
                 join public.product_variants v on v.id = ci.variant_id
                where v.name = ''أحمر''',
               '★★★ ويُرفع من السلال المفتوحة — وإلا سقط الزبون عند الدفع');
select t.ok((select not has_variants from public.products where id = :'P1'),
            '★★ و`has_variants` يعود false آليًّا');
select t.ok((select in_stock from public.products where id = :'P1'),
            '★★ والتوفّر يعود إلى الرصيد الأساس (٥٠) بعد زوال الخيارات');
select t.ok((select public.save_variant(:'A', :'P1', 'أحمر') is not null),
            '★ والاسم المحذوف يجوز إعادته — الفهرس الفريد جزئيّ');
rollback;

begin;
select t.login(:'ownerB');
select t.ok((select public.save_variant(:'B', :'PB', 'أحمر') is not null),
            'خيار في متجر ب');
rollback;


\echo '✓ اختبارات خيارات المنتج مرّت'
