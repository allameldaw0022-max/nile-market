\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set B b0000000-0000-0000-0000-00000000000b
\set ownerA 11111111-1111-1111-1111-111111111111
\set ownerB 22222222-2222-2222-2222-222222222222
\set prodA  55555555-5555-5555-5555-555555555555
\set csA    66666666-6666-6666-6666-666666666666
\set P1 d1000000-0000-0000-0000-000000000001
\set PB d2000000-0000-0000-0000-000000000001
\set CAT c1000000-0000-0000-0000-000000000001

\echo '── save_product: الإنشاء والتحقق الخادمي ──'
begin;
select t.login(:'ownerA');
select t.ok((select count(*) = 1 from save_product(:'A', 'حزام جلد', 7500)),
            'إنشاء منتج يعيد صفًا واحدًا');
select t.ok((select price = 7500 from products where name = 'حزام جلد'),
            'السعر يُحفظ كما أُرسل');
select t.ok((select status = 'draft' from products where name = 'حزام جلد'),
            'المنتج الجديد مسودة افتراضيًا');
select t.ok((select slug = 'حزام-جلد' from products where name = 'حزام جلد'),
            'slug يُولَّد من الاسم');

-- تصادم الـslug
select t.ok((select count(*) = 1 from save_product(:'A', 'حزام جلد', 8000)),
            'إنشاء منتج ثانٍ بنفس الاسم');
select t.ok((select count(*) = 2 from products
             where store_id = :'A' and name = 'حزام جلد'),
            'الاسم المكرر مسموح');
select t.ok((select count(distinct slug) = 2 from products
             where store_id = :'A' and name = 'حزام جلد'),
            '★ slug فريد يُولَّد تلقائيًا عند التصادم');

select t.throws('select save_product(' || quote_literal(:'A') || ', '''', 100)',
                'اسم فارغ مرفوض');
select t.throws('select save_product(' || quote_literal(:'A') || ', ''س'', -5)',
                '★ سعر سالب مرفوض خادميًا');
select t.throws('select save_product(' || quote_literal(:'A')
                || ', ''س'', 100, p_compare_at_price => 50)',
                '★ سعر قبل الخصم أقل من السعر مرفوض');
select t.throws('select save_product(' || quote_literal(:'A')
                || ', ''س'', 100, p_category_id => '
                || quote_literal('c1000000-0000-0000-0000-0000000000ff') || ')',
                'تصنيف غير موجود مرفوض');
rollback;

\echo '── عزل المستأجر في إدارة المنتجات ──'
begin;
select t.login(:'ownerB');
select t.throws('select save_product(' || quote_literal(:'A') || ', ''تسلل'', 100)',
                '★ مالك ب لا يُنشئ منتجًا في متجر أ');
select t.throws('select save_product(' || quote_literal(:'A') || ', ''تسلل'', 100, '
                || quote_literal(:'P1') || ')',
                '★ مالك ب لا يعدّل منتج متجر أ');
select t.throws('select delete_product(' || quote_literal(:'P1') || ')',
                '★ مالك ب لا يحذف منتج متجر أ');
select t.throws('select duplicate_product(' || quote_literal(:'P1') || ')',
                '★ مالك ب لا ينسخ منتج متجر أ');
select t.throws('select adjust_inventory(' || quote_literal(:'A') || ', '
                || quote_literal(:'P1') || ', 100)',
                '★ مالك ب لا يعدّل مخزون متجر أ');
rollback;

-- تمرير معرّف متجره مع منتج متجر آخر لا يفتح ثغرة
begin;
select t.login(:'ownerB');
select t.throws('select save_product(' || quote_literal(:'B') || ', ''خلط'', 100, '
                || quote_literal(:'P1') || ')',
                '★ خلط store_id الخاص بمنتج متجر آخر مرفوض');
select t.throws('select adjust_inventory(' || quote_literal(:'B') || ', '
                || quote_literal(:'P1') || ', 5)',
                '★ تعديل مخزون منتج ليس في المتجر المُمرَّر مرفوض');
rollback;

\echo '── الصلاحيات داخل المتجر ──'
begin;
select t.login(:'csA');
select t.throws('select save_product(' || quote_literal(:'A') || ', ''من الدعم'', 100)',
                'خدمة العملاء لا تُنشئ منتجًا');
select t.throws('select adjust_inventory(' || quote_literal(:'A') || ', '
                || quote_literal(:'P1') || ', 5)',
                'خدمة العملاء لا تعدّل المخزون');
rollback;

begin;
select t.login(:'prodA');
select t.ok((select count(*) = 1 from save_product(:'A', 'منتج من موظف المنتجات', 1000)),
            'موظف المنتجات يُنشئ منتجًا');
select t.throws('select delete_product(' || quote_literal(:'P1') || ')',
                '★ موظف المنتجات لا يحذف (لا يملك products:delete)');
rollback;

\echo '── المخزون يتغيّر عبر الحركات فقط ──'
begin;
select t.login(:'ownerA');
select t.ok((select quantity = 50 from inventory where product_id = :'P1'),
            'الرصيد الابتدائي من البذرة 50');
select t.ok((select quantity = 55 from adjust_inventory(:'A', :'P1', 5)),
            'زيادة 5 ⇒ 55');
select t.ok((select count(*) = 1 from inventory_movements
             where product_id = :'P1' and delta = 5 and reason = 'manual_adjust'),
            'الحركة مسجَّلة بأثر كامل');
select t.ok((select actor_id = :'ownerA' from inventory_movements
             where product_id = :'P1' and delta = 5),
            'الحركة تحمل هوية من نفّذها');
select t.ok((select quantity = 50 from adjust_inventory(:'A', :'P1', -5)),
            'إنقاص 5 ⇒ 50');
select t.throws('select adjust_inventory(' || quote_literal(:'A') || ', '
                || quote_literal(:'P1') || ', -1000)',
                '★ لا يهبط المخزون دون الصفر');
select t.throws('select adjust_inventory(' || quote_literal(:'A') || ', '
                || quote_literal(:'P1') || ', 5, ''order_placed'')',
                '★ التاجر لا يكتب أسباب الطلبات يدويًا');
rollback;

-- مستوى القيد: لا UPDATE مباشر على الكمية ولو من service_role
begin;
set local role service_role;
select t.throws('update inventory set quantity = 9999 where product_id = '
                || quote_literal(:'P1'),
                '★ service_role لا يعدّل الكمية مباشرة (حارس الحركات)');
rollback;
select t.reset();

\echo '── الصور: لا ربط لملف متجر آخر ولا لملف غير جاهز ──'
begin;
select t.reset();
-- الملفات تُزرع بصلاحية النظام (ملف متجر ب لا يستطيع مالك أ إنشاءه أصلًا)
insert into media_files (id, bucket, path, store_id, purpose, mime_type, size_bytes, status)
values
  ('f1000000-0000-0000-0000-000000000001','store-public',
   'stores/a/products/img1.webp', :'A', 'product_image','image/webp', 1000,'ready'),
  ('f1000000-0000-0000-0000-000000000002','store-public',
   'stores/a/products/img2.webp', :'A', 'product_image','image/webp', 1000,'pending'),
  ('f2000000-0000-0000-0000-000000000001','store-public',
   'stores/b/products/img1.webp', :'B', 'product_image','image/webp', 1000,'ready');

select t.login(:'ownerA');
select t.ok((select count(*) = 1 from save_product(:'A', 'منتج بصورة', 100, :'P1',
               p_image_media_ids => array['f1000000-0000-0000-0000-000000000001'::uuid])),
            'تحديث منتج مع صورة');
select t.ok((select count(*) = 1 from product_images where product_id = :'P1'),
            'الصورة تُربَط بالمنتج');
select t.ok((select is_primary from product_images where product_id = :'P1'),
            'أول صورة هي الأساسية');

select t.throws('select save_product(' || quote_literal(:'A') || ', ''س'', 100, '
                || quote_literal(:'P1')
                || ', p_image_media_ids => array[''f2000000-0000-0000-0000-000000000001''::uuid])',
                '★ ربط صورة من متجر آخر مرفوض');
select t.throws('select save_product(' || quote_literal(:'A') || ', ''س'', 100, '
                || quote_literal(:'P1')
                || ', p_image_media_ids => array[''f1000000-0000-0000-0000-000000000002''::uuid])',
                '★ ربط ملف لم يكتمل رفعه مرفوض');
select t.ok((select count(*) = 1 from product_images where product_id = :'P1'),
            '★ الرفض لم يُفسد الصور القائمة');
rollback;

\echo '── النسخ ──'
begin;
select t.login(:'ownerA');
select t.ok((select count(*) = 1 from duplicate_product(:'P1')), 'النسخ ينجح');
select t.ok((select status = 'draft' from products
             where store_id = :'A' and name like '%(نسخة)'),
            '★ النسخة مسودة لا منشورة');
select t.ok((select sku is null from products
             where store_id = :'A' and name like '%(نسخة)'),
            '★ الـSKU لا يُنسخ (فريد داخل المتجر)');
select t.ok((select count(*) = 0 from inventory i
             join products p on p.id = i.product_id
             where p.name like '%(نسخة)' and i.quantity > 0),
            '★ المخزون لا يُنسخ');
rollback;

\echo '── الحذف الناعم ──'
begin;
select t.login(:'ownerA');
select delete_product(:'P1');
select t.ok((select deleted_at is not null from products where id = :'P1'),
            'الحذف ناعم لا فعلي');
select t.ok((select status = 'archived' from products where id = :'P1'),
            'المنتج المحذوف يصبح مؤرشفًا');
select t.ok((select count(*) = 1 from inventory_movements where product_id = :'P1'),
            '★ حركات المخزون تبقى بعد الحذف (سجل)');
rollback;

-- المنتج المحذوف يختفي عن الزائر
begin;
select t.login(:'ownerA');
select delete_product(:'P1');
select t.logout();
select t.empty('select 1 from products where id = ' || quote_literal(:'P1'),
               '★ المنتج المحذوف لا يظهر للزائر');
rollback;
select t.reset();

\echo '── حد الباقة على عدد المنتجات ──'
begin;
select t.reset();
-- Admin هو من يضبط الحدود (D18) — نضبطها هنا كما يفعل في الإنتاج
update plan_entitlements set limit_value = 3, configured_at = now()
 where feature_key = 'products.max'
   and plan_id = (select plan_id from subscriptions
                  where store_id = 'a0000000-0000-0000-0000-00000000000a'
                  order by created_at desc limit 1);

select t.login(:'ownerA');
select t.ok((select count(*) = 1 from save_product(:'A', 'الثالث', 100)),
            'المنتج الثالث مسموح (الحد 3)');
select t.throws('select save_product(' || quote_literal(:'A') || ', ''الرابع'', 100)',
                '★ المنتج الرابع مرفوض — حد الباقة يُفرض في القاعدة');
rollback;
select t.reset();

\echo '── الاستيراد: تحقق ثم كتابة ──'
begin;
select t.reset();
update plan_entitlements set limit_value = null, configured_at = now()
 where feature_key = 'products.max';
update plan_entitlements set bool_value = true, configured_at = now()
 where feature_key = 'import_export.enabled';

select t.login(:'ownerA');
select t.ok((select failed = 2 and imported = 1 from import_products(:'A',
  '[{"row":2,"name":"سليم","price":"1500"},
    {"row":3,"name":"","price":"100"},
    {"row":4,"name":"بلا سعر","price":""}]'::jsonb, true)),
  '★ Dry-run يفرز الصفوف الصالحة من الفاشلة');
select t.ok((select count(*) = 0 from products
             where store_id = :'A' and name = 'سليم'),
            '★ Dry-run لا يكتب شيئًا في القاعدة');
select t.ok((select errors -> 0 ->> 'row' = '3' from import_products(:'A',
  '[{"row":2,"name":"سليم","price":"1500"},
    {"row":3,"name":"","price":"100"}]'::jsonb, true)),
  'تقرير الأخطاء يحمل رقم الصف');

select t.ok((select imported = 1 from import_products(:'A',
  '[{"row":2,"name":"مستورد","price":"1500","quantity":"7","category":"أحزمة"}]'::jsonb,
  false)),
  'الاستيراد الفعلي يكتب الصف الصالح');
select t.ok((select status = 'draft' from products
             where store_id = :'A' and name = 'مستورد'),
            '★ المستورد يبدأ مسودة — لا ينشر نفسه');
select t.ok((select quantity = 7 from inventory i
             join products p on p.id = i.product_id
             where p.name = 'مستورد'),
            'الكمية المستوردة تُسجَّل كحركة مخزون');
select t.ok((select count(*) = 1 from categories
             where store_id = :'A' and name = 'أحزمة'),
            'التصنيف الجديد يُنشأ من الملف');

select t.throws('select import_products(' || quote_literal(:'A')
                || ', ''{"a":1}''::jsonb, true)',
                'صيغة غير مصفوفة مرفوضة');
select t.throws('select import_products(' || quote_literal(:'B')
                || ', ''[]''::jsonb, true)',
                '★ الاستيراد لمتجر آخر مرفوض');
rollback;

-- الميزة مغلقة في الباقة ⇒ الاستيراد مرفوض
begin;
select t.reset();
update plan_entitlements set bool_value = false, configured_at = now()
 where feature_key = 'import_export.enabled';
select t.login(:'ownerA');
select t.throws('select import_products(' || quote_literal(:'A')
                || ', ''[]''::jsonb, true)',
                '★ الاستيراد مرفوض عندما تُغلقه الباقة');
rollback;
select t.reset();

\echo '── is_slug_available ──'
begin;
select t.login(:'ownerA');
select t.ok((select not is_slug_available('store-a')), 'slug مستخدم ⇒ غير متاح');
select t.ok((select is_slug_available('slug-حر-تمامًا')), 'slug جديد ⇒ متاح');
rollback;
select t.reset();

\echo '✓ 70_products'
