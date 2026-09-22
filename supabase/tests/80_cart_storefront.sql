\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set B b0000000-0000-0000-0000-00000000000b
\set custA  77777777-7777-7777-7777-777777777777
\set ownerA 11111111-1111-1111-1111-111111111111
\set P1 d1000000-0000-0000-0000-000000000001
\set P2 d1000000-0000-0000-0000-000000000002
\set PB d2000000-0000-0000-0000-000000000001
\set ZONE_A_NAME 'الخرطوم'
\set TOKEN guest-token-0123456789abcdef
\set TOKEN2 other-guest-token-9876543210

\echo '── سلة الزائر: التوكن هو الملكية ──'
begin;
select t.logout();
select t.ok((select count(*) = 1 from cart_add_item(:'A', :'P1', 2, null, :'TOKEN')),
            'الزائر يضيف إلى السلة بتوكنه');
select t.ok((select quantity = 2 from get_cart(:'A', :'TOKEN')),
            'السلة تُقرأ بنفس التوكن');
select t.ok((select unit_price = 20000 from get_cart(:'A', :'TOKEN')),
            '★ السعر يُقرأ من المنتج لا من السلة');
select t.ok((select line_total = 40000 from get_cart(:'A', :'TOKEN')),
            'مجموع السطر يُحسب في القاعدة');
select t.empty('select 1 from get_cart(' || quote_literal(:'A') || ', '
               || quote_literal(:'TOKEN2') || ')',
               '★ توكن آخر لا يرى سلة غيره');
select t.empty('select 1 from get_cart(' || quote_literal(:'A') || ', null)',
               '★ بلا توكن لا سلة');
rollback;

\echo '── الإضافة تُجمَع ولا تُكرَّر ──'
begin;
select t.logout();
\o /dev/null
select cart_add_item(:'A', :'P1', 2, null, :'TOKEN');
select cart_add_item(:'A', :'P1', 3, null, :'TOKEN');
\o
select t.ok((select count(*) = 1 from get_cart(:'A', :'TOKEN')),
            'عنصر واحد لا عنصران');
select t.ok((select quantity = 5 from get_cart(:'A', :'TOKEN')),
            'الكميات تُجمَع');
rollback;

\echo '── عزل المستأجر في السلة (D4) ──'
begin;
select t.logout();
select t.throws('select cart_add_item(' || quote_literal(:'A') || ', '
                || quote_literal(:'PB') || ', 1, null, ' || quote_literal(:'TOKEN') || ')',
                '★ منتج متجر ب لا يُضاف إلى سلة متجر أ');
\o /dev/null
select cart_add_item(:'A', :'P1', 1, null, :'TOKEN');
\o
select t.empty('select 1 from get_cart(' || quote_literal(:'B') || ', '
               || quote_literal(:'TOKEN') || ')',
               '★ نفس التوكن في متجر آخر ⇒ سلة فارغة (سلة لكل متجر)');
rollback;

\echo '── تعديل الكمية والحذف ──'
begin;
select t.logout();
\o /dev/null
select cart_add_item(:'A', :'P1', 2, null, :'TOKEN');
\o
select cart_set_quantity(:'A', (select item_id from get_cart(:'A', :'TOKEN')), 7, :'TOKEN');
select t.ok((select quantity = 7 from get_cart(:'A', :'TOKEN')), 'الكمية تُحدَّث');
select cart_set_quantity(:'A', (select item_id from get_cart(:'A', :'TOKEN')), 0, :'TOKEN');
select t.empty('select 1 from get_cart(' || quote_literal(:'A') || ', '
               || quote_literal(:'TOKEN') || ')',
               'الكمية صفر تحذف العنصر');
rollback;

-- ★ الملكية: توكن آخر لا يعدّل عنصرًا ليس له
begin;
select t.logout();
\o /dev/null
select cart_add_item(:'A', :'P1', 2, null, :'TOKEN');
\o
select t.throws('select cart_set_quantity(' || quote_literal(:'A') || ', '
                || quote_literal((select item_id from get_cart(:'A', :'TOKEN'))::text)
                || ', 99, ' || quote_literal(:'TOKEN2') || ')',
                '★ توكن آخر لا يعدّل عنصر سلة غيره');
select t.ok((select quantity = 2 from get_cart(:'A', :'TOKEN')),
            'والكمية الأصلية لم تتغير');
rollback;

begin;
select t.logout();
select t.throws('select cart_set_quantity(' || quote_literal(:'A')
                || ', gen_random_uuid(), -5, ' || quote_literal(:'TOKEN') || ')',
                'كمية سالبة مرفوضة');
select t.throws('select cart_add_item(' || quote_literal(:'A') || ', '
                || quote_literal(:'P1') || ', 0, null, ' || quote_literal(:'TOKEN') || ')',
                'إضافة كمية صفر مرفوضة');
select t.throws('select cart_add_item(' || quote_literal(:'A') || ', '
                || quote_literal(:'P1') || ', 1000, null, ' || quote_literal(:'TOKEN') || ')',
                'كمية فوق 999 مرفوضة');
rollback;

\echo '── دمج سلة الزائر عند تسجيل الدخول (البند 6) ──'
begin;
select t.logout();
\o /dev/null
select cart_add_item(:'A', :'P1', 2, null, :'TOKEN');
select cart_add_item(:'A', :'P2', 1, null, :'TOKEN');
\o

select t.login(:'custA');
\o /dev/null
select cart_add_item(:'A', :'P1', 3, null, null);   -- سلته المسجَّلة
\o
select t.ok((select merged = 2 from cart_merge_guest(:'A', :'TOKEN')),
            'الدمج ينقل عنصري الزائر');
select t.ok((select count(*) = 2 from get_cart(:'A', null)),
            '★ لا عنصر مكرر بعد الدمج');
select t.ok((select quantity = 5 from get_cart(:'A', null) where product_id = :'P1'),
            '★ الكميات تُجمَع عند الدمج (3 + 2)');
rollback;

-- سلة الزائر تُوسم مهجورة لا تُحذف
begin;
select t.logout();
\o /dev/null
select cart_add_item(:'A', :'P1', 1, null, :'TOKEN');
select t.login(:'custA');
select cart_merge_guest(:'A', :'TOKEN');
\o
select t.reset();
select t.ok((select status = 'abandoned' from carts where anon_token = :'TOKEN'),
            '★ سلة الزائر تبقى موسومة مهجورة (بيانات تحليل)');
rollback;

begin;
select t.logout();
select t.throws('select cart_merge_guest(' || quote_literal(:'A') || ', '
                || quote_literal(:'TOKEN') || ')',
                '★ الزائر لا ينادي الدمج');
rollback;

\echo '── معاينة الحساب: كل مبلغ من القاعدة (D10) ──'
begin;
select t.logout();
\o /dev/null
select cart_add_item(:'A', :'P1', 1, null, :'TOKEN');   -- 20000
\o
select t.ok((select subtotal = 20000 from quote_checkout(:'A', :'TOKEN')),
            'المجموع الجزئي من أسعار القاعدة');
select t.ok((select delivery_fee = 0 from quote_checkout(:'A', :'TOKEN')),
            'بلا منطقة ⇒ بلا أجرة توصيل');
select t.ok((select delivery_fee = 2000 from quote_checkout(:'A', :'TOKEN',
               (select id from delivery_zones where store_id = :'A'
                and name = 'الخرطوم'))),
            '★ أجرة التوصيل تُقرأ من منطقة القاعدة');
select t.ok((select total = 22000 from quote_checkout(:'A', :'TOKEN',
               (select id from delivery_zones where store_id = :'A'
                and name = 'الخرطوم'))),
            'الإجمالي = المجموع + التوصيل');

-- مثال المواصفات: 20,000 − 5,000 = 15,000
select t.ok((select discount_total = 5000 and total = 15000
             from quote_checkout(:'A', :'TOKEN', null, 'SAVE5000')),
            '★ الكوبون يُحسب في القاعدة: 20,000 − 5,000 = 15,000');
select t.ok((select not coupon_valid from quote_checkout(:'A', :'TOKEN', null, 'NOPE')),
            'كود غير موجود ⇒ غير صالح بلا كشف سبب');
select t.throws('select quote_checkout(' || quote_literal(:'A') || ', '
                || quote_literal(:'TOKEN') || ', gen_random_uuid())',
                '★ منطقة توصيل ليست لهذا المتجر مرفوضة');
rollback;

-- منطقة متجر آخر لا تُقبل ولو كانت موجودة
begin;
select t.logout();
\o /dev/null
select cart_add_item(:'A', :'P1', 1, null, :'TOKEN');
\o
select t.throws('select quote_checkout(' || quote_literal(:'A') || ', '
                || quote_literal(:'TOKEN') || ', '
                || quote_literal((select id from delivery_zones
                                  where store_id = :'B' limit 1)::text) || ')',
                '★ منطقة توصيل من متجر آخر مرفوضة');
rollback;

\echo '── D14: الاشتراك المنتهي يوقف الشراء لا المتجر ──'
begin;
select t.reset();
update subscriptions set status = 'expired'
 where store_id = 'a0000000-0000-0000-0000-00000000000a';
select t.logout();
\o /dev/null
select cart_add_item(:'A', :'P1', 1, null, :'TOKEN');
\o
select t.ok((select not can_checkout from quote_checkout(:'A', :'TOKEN')),
            '★ المعاينة تقول الشراء متوقف');
select t.ok((select subtotal = 20000 from quote_checkout(:'A', :'TOKEN')),
            '★ والمنتجات تبقى مرئية بأسعارها');
rollback;
select t.reset();

\echo '── تتبّع الطلب: رقم الطلب وحده لا يكفي ──'
begin;
select t.logout();
select t.ok((select count(*) = 1 from create_order(
               :'A',
               ('[{"product_id":"' || :'P1' || '","quantity":1}]')::jsonb,
               (select id from delivery_zones where store_id = :'A' and name = 'الخرطوم'),
               '{"name":"زبون","phone":"0912345678"}'::jsonb,
               '{"line":"الخرطوم - العمارات"}'::jsonb,
               'cash_on_delivery')),
            'إنشاء طلب زائر للتتبّع');

-- رقم الطلب يُقرأ بصلاحية النظام: الزائر لا يقرأ جدول orders، وهذا
-- بحد ذاته جزء من التصميم (التتبّع عبر الدالة وحدها).
select t.reset();
select order_number as ordnum from orders
 where store_id = :'A' order by created_at desc limit 1
\gset

select t.logout();
select t.ok((select count(*) = 1 from track_order(:'A', :'ordnum', '0912345678')),
            'الرقم مع الهاتف الصحيح ⇒ الطلب يظهر');
select t.ok((select item_count = 1 from track_order(:'A', :'ordnum', '0912345678')),
            'ويظهر معه عدد القطع');
select t.empty('select 1 from track_order(' || quote_literal(:'A') || ', '
               || quote_literal(:'ordnum') || ', ''0999999999'')',
               '★ رقم الطلب مع هاتف خاطئ ⇒ لا شيء');
select t.empty('select 1 from track_order(' || quote_literal(:'B') || ', '
               || quote_literal(:'ordnum') || ', ''0912345678'')',
               '★ نفس الرقم من متجر آخر ⇒ لا شيء');
select t.throws('select track_order(' || quote_literal(:'A') || ', '''', ''0912345678'')',
                'رقم طلب فارغ مرفوض');
select t.empty('select 1 from orders', '★ الزائر لا يقرأ جدول الطلبات إطلاقًا');
rollback;
select t.reset();


\echo '── تفاصيل الطلب: التوكن أو الهاتف، لا الرقم وحده ──'
begin;
select t.logout();
\o /dev/null
select create_order(
  :'A',
  ('[{"product_id":"' || :'P1' || '","quantity":2}]')::jsonb,
  (select id from delivery_zones where store_id = :'A' and name = 'الخرطوم'),
  '{"name":"زبون التفاصيل","phone":"0911111111"}'::jsonb,
  '{"line":"بحري"}'::jsonb, 'cash_on_delivery', 'SAVE5000');
\o

select t.reset();
select order_number as onum, guest_token as gtok from orders
 where store_id = :'A' order by created_at desc limit 1
\gset

select t.logout();
select t.ok((select count(*) = 1 from order_details(:'A', :'onum', :'gtok')),
            'التوكن يفتح تفاصيل الطلب');
select t.ok((select jsonb_array_length(items) = 1 from order_details(:'A', :'onum', :'gtok')),
            'والسطور تعود معه');
select t.ok((select total = 37000 from order_details(:'A', :'onum', :'gtok')),
            '★ الإجمالي محسوب خادميًا: 40,000 + 2,000 − 5,000');
select t.ok((select count(*) = 1 from order_details(:'A', :'onum', null, '0911111111')),
            'الهاتف الصحيح يفتح التفاصيل');
select t.empty('select 1 from order_details(' || quote_literal(:'A') || ', '
               || quote_literal(:'onum') || ')',
               '★ رقم الطلب وحده لا يفتح شيئًا');
select t.empty('select 1 from order_details(' || quote_literal(:'A') || ', '
               || quote_literal(:'onum') || ', ''توكن-خاطئ'')',
               '★ توكن خاطئ لا يفتح شيئًا');
select t.empty('select 1 from order_details(' || quote_literal(:'A') || ', '
               || quote_literal(:'onum') || ', null, ''0999999999'')',
               '★ هاتف خاطئ لا يفتح شيئًا');
select t.empty('select 1 from order_details(' || quote_literal(:'B') || ', '
               || quote_literal(:'onum') || ', ' || quote_literal(:'gtok') || ')',
               '★ التوكن الصحيح من متجر آخر لا يفتح شيئًا');
rollback;
select t.reset();

\echo '── طلباتي: لكل متجر على حدة (D22) ──'
begin;
select t.login(:'custA');
\o /dev/null
select create_order(
  :'A',
  ('[{"product_id":"' || :'P1' || '","quantity":1}]')::jsonb,
  null, '{"name":"عميل مسجّل","phone":"0922222222"}'::jsonb,
  '{}'::jsonb, 'cash_on_delivery');
\o
select t.ok((select count(*) = 1 from my_orders(:'A')), 'العميل يرى طلبه في متجر أ');
select t.empty('select 1 from my_orders(' || quote_literal(:'B') || ')',
               '★ ولا يرى شيئًا في متجر ب (سجل عميل لكل متجر)');
rollback;

begin;
select t.login(:'ownerA');
select t.empty('select 1 from my_orders(' || quote_literal(:'A') || ')',
               'المالك ليس عميلًا ⇒ لا طلبات شخصية');
rollback;
select t.reset();


\echo '── بيانات التحويل: لمن طلب بتحويل وأثبت صلته ──'
begin;
select t.reset();
update store_settings set bank_transfer_enabled = true
 where store_id = 'a0000000-0000-0000-0000-00000000000a';

select t.logout();
\o /dev/null
select create_order(
  :'A', ('[{"product_id":"' || :'P1' || '","quantity":1}]')::jsonb,
  null, '{"name":"محوِّل","phone":"0913333333"}'::jsonb,
  '{}'::jsonb, 'bank_transfer');
\o

select t.reset();
select order_number as bnum, guest_token as btok from orders
 where store_id = :'A' order by created_at desc limit 1
\gset

select t.logout();
select t.ok((select jsonb_array_length(bank_accounts) = 1
             from order_payment_instructions(:'A', :'bnum', :'btok')),
            'صاحب الطلب يرى حساب التحويل');
select t.ok((select amount_due = 20000
             from order_payment_instructions(:'A', :'bnum', :'btok')),
            'والمبلغ المتبقي معه');
select t.empty('select 1 from order_payment_instructions(' || quote_literal(:'A')
               || ', ' || quote_literal(:'bnum') || ')',
               '★ رقم الطلب وحده لا يكشف الحساب البنكي');
select t.empty('select 1 from order_payment_instructions(' || quote_literal(:'A')
               || ', ' || quote_literal(:'bnum') || ', ''توكن-خاطئ'')',
               '★ توكن خاطئ لا يكشف الحساب البنكي');
select t.empty('select 1 from store_payment_settings',
               '★ الزائر لا يقرأ جدول الإعدادات البنكية إطلاقًا');
rollback;

-- طلب بالدفع عند الاستلام لا يكشف حسابًا بنكيًا ولو بتوكن صحيح
begin;
select t.logout();
\o /dev/null
select create_order(
  :'A', ('[{"product_id":"' || :'P1' || '","quantity":1}]')::jsonb,
  null, '{"name":"نقدي","phone":"0914444444"}'::jsonb,
  '{}'::jsonb, 'cash_on_delivery');
\o
select t.reset();
select order_number as cnum, guest_token as ctok from orders
 where store_id = :'A' order by created_at desc limit 1
\gset
select t.logout();
select t.empty('select 1 from order_payment_instructions(' || quote_literal(:'A')
               || ', ' || quote_literal(:'cnum') || ', ' || quote_literal(:'ctok') || ')',
               '★ طلب نقدي لا يكشف حسابًا بنكيًا');
rollback;
select t.reset();

\echo '✓ اختبارات السلة والمتجر مرّت'
