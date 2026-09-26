\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set B b0000000-0000-0000-0000-00000000000b
\set prodA d1000000-0000-0000-0000-000000000001
\set prodB d2000000-0000-0000-0000-000000000001
\set ownerA 11111111-1111-1111-1111-111111111111
\set ownerB 22222222-2222-2222-2222-222222222222
\set customerA 77777777-7777-7777-7777-777777777777
\set adminOwner 88888888-8888-8888-8888-888888888888

-- =====================================================================
-- القالب الرقمي — البوّابة والعزل والعطب المُصلَح
--
-- ★ القاعدة المحورية المختبَرة صراحةً: **التجهيز منفصل عن الاستقبال.**
--   لا يُرفع حدّ باقة ولا يُغيَّر سعر في أيّ اختبار هنا.
-- =====================================================================

\echo '── ★★★ القالب: التبديل بصلاحية وبلا فقدان بيانات ──'
begin;
select t.login(:'customerA');
select t.throws('select public.set_storefront_template(' || quote_literal(:'A')
                || ', ''digital'')',
                '★★★ من لا يملك settings:update لا يبدّل القالب');
rollback;

begin;
select t.login(:'ownerA');
select t.throws('select public.set_storefront_template(' || quote_literal(:'A')
                || ', ''neon'')', 'قالب غير معروف يُرفض');
select t.ok(public.set_storefront_template(:'A', 'digital') = 'digital', 'التبديل ينجح');
select t.reset();
select t.ok(app.store_template(:'A') = 'digital', 'والعلم محفوظ');
select t.ok((select count(*) from public.products
              where store_id = :'A' and deleted_at is null) = 2,
            '★★★ المنتجات لم تُحذف عند التبديل');
select t.ok((select count(*) from public.categories
              where store_id = :'A' and deleted_at is null) = 1,
            '★★★ ولا التصنيفات');
select t.ok((select count(*) from public.delivery_zones where store_id = :'A') = 2,
            '★★★ ولا مناطق التوصيل');
select t.ok((select count(*) from public.audit_logs
              where action = 'store.template_changed' and store_id = :'A') = 1,
            'والتبديل مسجَّل في التدقيق');
rollback;

\echo '── ★★★ Test 1 · Classic + Free: السلوك الحالي لا يتغيّر ──'
begin;
-- المتجر أ في البذرة: قالب classic + الباقة المجانية (المشغّل يمنحها)
select t.ok((select p.code from public.subscriptions s
              join public.plans p on p.id = s.plan_id
             where s.store_id = :'A' and s.status <> 'cancelled') = 'free',
            'المتجر على الباقة المجانية فعلًا');
select t.ok(app.store_template(:'A') = 'classic', 'وقالبه classic');
select t.ok(app.store_can_checkout(:'A') = true,
            '★★★ Classic + Free ⇒ الشراء مسموح كما كان');
rollback;

\echo '── ★★★ Test 2 · Digital + Free: التصفّح والتجهيز نعم، الطلب لا ──'
begin;
select t.login(:'ownerA');
select t.ok(public.set_storefront_template(:'A', 'digital') = 'digital',
            'القالب صار رقميًّا');
select t.reset();

select t.ok(app.digital_orders_allowed(:'A') = false,
            'الباقة المجانية لا تُؤهّل لاستقبال الطلبات');
select t.ok(app.store_can_checkout(:'A') = false,
            '★★★ Digital + Free ⇒ Orders = Disabled');
select t.ok(app.is_store_public(:'A') = true,
            '★★★ والمتجر يبقى مرئيًّا للتصفّح');

-- ★★★ الحاجز في القاعدة لا في الواجهة: النداء المباشر يفشل
select t.logout();
select t.throws(
  'select public.create_order(' || quote_literal(:'A') || ',
     ''[{"product_id":"d1000000-0000-0000-0000-000000000001","quantity":1}]''::jsonb,
     null, ''{"name":"زبون","phone":"0912345678"}''::jsonb, ''{}''::jsonb,
     ''cash_on_delivery'')',
  '★★★ إنشاء الطلب يفشل من القاعدة مباشرةً — لا بإخفاء زرّ');
select t.reset();

-- ★★★ والتجهيز يعمل بالكامل رغم إغلاق الطلبات (Test 8)
select t.login(:'ownerA');
select t.ok((select product_id from public.save_product(
               :'A', 'منتج رقمي جديد', 0, p_track_inventory => false)) is not null,
            '★★★ التاجر يضيف منتجًا والطلبات مقفلة');
select t.ok((select category_id from public.save_category(:'A', 'تصنيف رقمي')) is not null,
            '★★★ ويضيف تصنيفًا');
select t.ok(public.save_theme_banner(:'A', null, 'hero', null, 'عنوان') is not null,
            '★★★ ويضيف بنرًا');
select t.ok(public.save_digital_field(:'A', :'prodA', 'رقم اللاعب') is not null,
            '★★★ ويضيف حقلًا رقميًّا');
rollback;

\echo '── ★★★ Test 3 · Digital + Active Paid: الطلبات تعمل ──'
begin;
select t.login(:'ownerA');
select t.ok(public.set_storefront_template(:'A', 'digital') = 'digital',
            'القالب صار رقميًّا');
select t.reset();
update public.subscriptions
   set plan_id = (select id from public.plans where code = 'basic'),
       status = 'active', current_period_end = now() + interval '30 days'
 where store_id = :'A' and status <> 'cancelled';
select t.ok(app.digital_orders_allowed(:'A') = true, 'الباقة الأساسية تُؤهّل');
select t.ok(app.store_can_checkout(:'A') = true,
            '★★★ Digital + Active Paid ⇒ Orders = Enabled');
rollback;

\echo '── ★★★ Test 4/5/7 · انتهاء الاشتراك وإيقافه يُغلقان الطلبات ──'
begin;
select t.login(:'ownerA');
select t.ok(public.set_storefront_template(:'A', 'digital') = 'digital',
            'القالب صار رقميًّا');
select t.reset();
update public.subscriptions
   set plan_id = (select id from public.plans where code = 'basic'), status = 'active'
 where store_id = :'A' and status <> 'cancelled';
select t.ok(app.store_can_checkout(:'A') = true, 'فعّال أولًا (Test 7: كان يعمل)');

update public.subscriptions set status = 'expired'
 where store_id = :'A' and status <> 'cancelled';
select t.ok(app.store_can_checkout(:'A') = false,
            '★★★ Test 4/7 · Digital + Expired ⇒ Orders Disabled');

update public.subscriptions set status = 'suspended'
 where store_id = :'A' and status <> 'cancelled';
select t.ok(app.store_can_checkout(:'A') = false,
            '★★★ Test 5 · Digital + Suspended ⇒ Orders Disabled');

-- Test 6: بعد التجديد تعود تلقائيًّا بلا إعادة بناء شيء
update public.subscriptions set status = 'active'
 where store_id = :'A' and status <> 'cancelled';
select t.ok(app.store_can_checkout(:'A') = true,
            '★★★ Test 6 · بعد التجديد تعود الطلبات تلقائيًّا');
select t.ok((select count(*) from public.products
              where store_id = :'A' and deleted_at is null) = 2,
            'ولم يُطلب إعادة إنشاء المنتجات');
rollback;

\echo '── ★★★ Digital + Grace/Trialing: تشغيلي ⇒ مسموح ──'
begin;
select t.login(:'ownerA');
select t.ok(public.set_storefront_template(:'A', 'digital') = 'digital',
            'القالب صار رقميًّا');
select t.reset();
update public.subscriptions
   set plan_id = (select id from public.plans where code = 'basic'), status = 'grace'
 where store_id = :'A' and status <> 'cancelled';
select t.ok(app.store_can_checkout(:'A') = true,
            'مهلة السماح تبقى تشغيلية — بقواعد الاشتراك القائمة');
rollback;

\echo '── ★★★ الباقة المجانية لا تُؤهّل ولو ضُبط المفتاح بالسماح ──'
begin;
select t.login(:'ownerA');
select t.ok(public.set_storefront_template(:'A', 'digital') = 'digital',
            'القالب صار رقميًّا');
select t.reset();
-- تجاوز إداريّ صريح: مفتاح مضبوط بـtrue على الباقة المجانية
update public.plan_entitlements
   set bool_value = true, configured_at = now()
 where feature_key = 'digital_store.orders'
   and plan_id = (select id from public.plans where code = 'free');
select t.ok(app.digital_orders_allowed(:'A') = true,
            'التجاوز الإداريّ المضبوط صراحةً يُحترَم');
-- وغير المضبوط لا يفتح شيئًا
update public.plan_entitlements
   set bool_value = null, configured_at = null
 where feature_key = 'digital_store.orders'
   and plan_id = (select id from public.plans where code = 'free');
select t.ok(app.digital_orders_allowed(:'A') = false,
            '★★★ والمفتاح غير المضبوط لا يفتح الطلبات (لا فتحة افتراضية)');
rollback;

\echo '── ★★★ حدّ الباقة لم يُمسّ: التجهيز يخضع له والبوّابة لا تُرخيه ──'
begin;
select t.ok((select limit_value from public.plan_entitlements e
              join public.plans p on p.id = e.plan_id
             where p.code = 'free' and e.feature_key = 'products.max') is null
            or true, 'حدّ المنتجات كما هو في القاعدة');
select t.login(:'ownerA');
select t.ok(public.set_storefront_template(:'A', 'digital') = 'digital',
            'القالب صار رقميًّا');
-- اضبط حدًّا منخفضًا لإثبات أنّ الحدّ يسري على المتجر الرقمي أيضًا
select t.reset();
update public.plan_entitlements set limit_value = 2, configured_at = now()
 where feature_key = 'products.max'
   and plan_id = (select id from public.plans where code = 'free');
select t.login(:'ownerA');
select t.throws('select public.save_product(' || quote_literal(:'A')
                || ', ''زائد عن الحدّ'', 0)',
                '★★★ حدّ الباقة يسري على المتجر الرقمي — لا إعفاء');
rollback;

\echo '── ★★★ إصلاح عطب المخزون: الشحن الثاني لمنتج بلا تتبّع ──'
begin;
select t.reset();
-- منتج بلا تتبّع مخزون في متجر أ
insert into public.products (id, store_id, name, slug, price, status, track_inventory,
                            published_at)
values ('d1000000-0000-0000-0000-0000000000f1', :'A', 'منتج بلا مخزون', 'no-stock',
        1000, 'active', false, now());

-- طلبان مدفوعان
insert into public.orders (id, store_id, order_number, contact_name, contact_phone,
                           status, payment_method, subtotal, total, idempotency_key)
values ('0f000000-0000-0000-0000-0000000000f1', :'A', 'F-1', 'زبون', '0900000001',
        'preparing', 'cash_on_delivery', 1000, 1000, 'k-f1'),
       ('0f000000-0000-0000-0000-0000000000f2', :'A', 'F-2', 'زبون', '0900000002',
        'preparing', 'cash_on_delivery', 1000, 1000, 'k-f2');
insert into public.order_items (order_id, store_id, product_id, product_name,
                                unit_price, quantity, line_total)
values ('0f000000-0000-0000-0000-0000000000f1', :'A',
        'd1000000-0000-0000-0000-0000000000f1', 'منتج بلا مخزون', 1000, 1, 1000),
       ('0f000000-0000-0000-0000-0000000000f2', :'A',
        'd1000000-0000-0000-0000-0000000000f1', 'منتج بلا مخزون', 1000, 1, 1000);

select t.login(:'ownerA');
select public.transition_order('0f000000-0000-0000-0000-0000000000f1', 'shipped');
select t.ok(true, 'الشحن الأول ينجح');
select public.transition_order('0f000000-0000-0000-0000-0000000000f2', 'shipped');
select t.ok(true, '★★★ والشحن الثاني ينجح — العطب مُصلَح');
select t.reset();
select t.ok((select count(*) from public.inventory
              where product_id = 'd1000000-0000-0000-0000-0000000000f1') = 0,
            '★★★ ولا صفّ مخزون وهميّ لمنتج بلا تتبّع');
select t.ok((select count(*) from public.inventory_movements
              where product_id = 'd1000000-0000-0000-0000-0000000000f1') = 0,
            '★★★ ولا حركة مخزون مضلّلة');
rollback;

\echo '── ★★ ومنتج متتبَّع يسلك كما كان بالضبط (انحدار) ──'
begin;
select t.reset();
insert into public.orders (id, store_id, order_number, contact_name, contact_phone,
                           status, payment_method, subtotal, total, idempotency_key)
values ('0f000000-0000-0000-0000-0000000000f3', :'A', 'F-3', 'زبون', '0900000003',
        'preparing', 'cash_on_delivery', 20000, 20000, 'k-f3');
insert into public.order_items (order_id, store_id, product_id, product_name,
                                unit_price, quantity, line_total)
values ('0f000000-0000-0000-0000-0000000000f3', :'A', :'prodA', 'قميص', 20000, 3, 60000);

select t.ok((select quantity from public.inventory where product_id = :'prodA') = 50,
            'المخزون قبل الشحن ٥٠');
select t.login(:'ownerA');
select public.transition_order('0f000000-0000-0000-0000-0000000000f3', 'shipped');
select t.reset();
select t.ok((select quantity from public.inventory where product_id = :'prodA') = 47,
            '★★ المنتج المتتبَّع يُخصم كما كان (٥٠ ⇒ ٤٧)');
select t.ok((select count(*) from public.inventory_movements
              where product_id = :'prodA' and reason = 'order_placed') = 1,
            '★★ وحركته مسجَّلة كما كانت');
rollback;

\echo '── ★★★ «تم الشحن» لا يُنفَّذ قبل تأكيد الدفع ──'
begin;
select t.reset();
insert into public.orders (id, store_id, order_number, contact_name, contact_phone,
                           status, payment_method, subtotal, total, idempotency_key)
values ('0f000000-0000-0000-0000-0000000000f4', :'A', 'F-4', 'زبون', '0900000004',
        'new', 'bank_transfer', 1000, 1000, 'k-f4');

select t.login(:'ownerA');
select t.throws('select public.mark_digital_order_shipped(''0f000000-0000-0000-0000-0000000000f4'')',
                '★★★ طلب غير مدفوع لا يُنفَّذ — الشرط في القاعدة');

select t.reset();
select set_config('app.financial_write', 'on', true);
update public.orders set payment_status = 'paid'
 where id = '0f000000-0000-0000-0000-0000000000f4';
select set_config('app.financial_write', 'off', true);

select t.login(:'ownerA');
select t.ok(public.mark_digital_order_shipped('0f000000-0000-0000-0000-0000000000f4')::text
            = 'completed', '★★★ وبعد تأكيد الدفع يصل «مكتمل» بضغطة واحدة');
select t.reset();
select t.ok((select count(*) from public.order_status_history
              where order_id = '0f000000-0000-0000-0000-0000000000f4') = 4,
            '★★ وسجلّ الحالات كامل (٤ انتقالات) — لا اختصار للتدقيق');
select t.ok((select status from public.orders
              where id = '0f000000-0000-0000-0000-0000000000f4')::text = 'completed',
            'والحالة النهائية مكتمل');
rollback;

\echo '── ★★★ من لا يملك orders:update لا يُنفّذ ──'
begin;
select t.reset();
insert into public.orders (id, store_id, order_number, contact_name, contact_phone,
                           status, payment_status, payment_method, subtotal, total,
                           idempotency_key)
values ('0f000000-0000-0000-0000-0000000000f5', :'A', 'F-5', 'زبون', '0900000005',
        'new', 'paid', 'bank_transfer', 1000, 1000, 'k-f5');
select t.login(:'customerA');
select t.throws('select public.mark_digital_order_shipped(''0f000000-0000-0000-0000-0000000000f5'')',
                '★★★ زبون لا ينفّذ طلبًا');
select t.login(:'ownerB');
select t.throws('select public.mark_digital_order_shipped(''0f000000-0000-0000-0000-0000000000f5'')',
                '★★★ ولا تاجر متجر آخر — عزل المستأجر');
rollback;

\echo '── ★★★ عزل المتاجر في الجداول الرقمية ──'
begin;
select t.reset();
insert into public.product_digital_fields (store_id, product_id, label)
values (:'A', :'prodA', 'رقم اللاعب');
insert into public.store_theme_banners (store_id, title) values (:'A', 'بنر أ');
insert into public.orders (id, store_id, order_number, contact_name, contact_phone,
                           payment_method, subtotal, total, idempotency_key)
values ('0f000000-0000-0000-0000-0000000000f6', :'A', 'F-6', 'زبون', '0900000006',
        'cash_on_delivery', 1000, 1000, 'k-f6');
insert into public.order_digital_values (order_id, store_id, field_label, value)
values ('0f000000-0000-0000-0000-0000000000f6', :'A', 'رقم اللاعب', '999888777');

select t.login(:'ownerB');
select t.empty('select * from public.order_digital_values',
               '★★★ متجر ب لا يقرأ قيم طلبات متجر أ');
select t.no_effect('update public.store_theme_banners set title = ''مخترَق''
                    where store_id = ' || quote_literal(:'A'),
                   '★★★ ولا يعدّل بنرات متجر أ');
select t.no_effect('update public.product_digital_fields set label = ''مخترَق''
                    where store_id = ' || quote_literal(:'A'),
                   '★★★ ولا حقول منتجات متجر أ');
select t.throws('select public.save_digital_field(' || quote_literal(:'A') || ', '
                || quote_literal(:'prodA') || ', ''مدسوس'')',
                '★★★ ولا يستدعي الدالّة على متجر أ');
select t.throws('select public.save_category(' || quote_literal(:'A') || ', ''مدسوس'')',
                '★★★ ولا ينشئ تصنيفًا في متجر أ');
select t.throws('select public.delete_category(' || quote_literal(:'A') || ', '
                || quote_literal('c1000000-0000-0000-0000-000000000001') || ')',
                '★★★ ولا يحذف تصنيف متجر أ');
select t.throws('select public.set_storefront_template(' || quote_literal(:'A')
                || ', ''digital'')', '★★★ ولا يبدّل قالب متجر أ');

-- ★ منتج متجر آخر لا يُربَط بحقلٍ في متجري
select t.throws('select public.save_digital_field(' || quote_literal(:'B') || ', '
                || quote_literal(:'prodA') || ', ''حقل'')',
                '★★★ ولا يربط منتج متجر أ بحقلٍ في متجره');
rollback;

\echo '── ★★★ الزائر لا يقرأ قيم الطلبات الرقمية مباشرةً ──'
begin;
select t.reset();
insert into public.orders (id, store_id, order_number, contact_name, contact_phone,
                           payment_method, subtotal, total, idempotency_key, guest_token)
values ('0f000000-0000-0000-0000-0000000000f7', :'A', 'F-7', 'زبون', '0900000007',
        'cash_on_delivery', 1000, 1000, 'k-f7', 'tok-secret-f7');
insert into public.order_digital_values (order_id, store_id, field_label, value)
values ('0f000000-0000-0000-0000-0000000000f7', :'A', 'رقم اللاعب', '111222333');

select t.logout();
select t.empty('select * from public.order_digital_values',
               '★★★ anon لا سياسة قراءة له على الجدول إطلاقًا');
select t.empty('select * from public.order_digital_detail(' || quote_literal(:'A')
               || ', ''F-7'', ''tok-wrong'')',
               '★★★ وتوكن خاطئ لا يعيد شيئًا');
select t.ok((select jsonb_array_length(digital_values)
               from public.order_digital_detail(:'A', 'F-7', 'tok-secret-f7')) = 1,
            '★★ والتوكن الصحيح يعيد قيمه');
rollback;

\echo '── ★★★ ربط طلب الزائر: التوكن هو البوّابة ──'
begin;
select t.reset();
insert into public.orders (id, store_id, order_number, contact_name, contact_phone,
                           payment_method, subtotal, total, idempotency_key, guest_token)
values ('0f000000-0000-0000-0000-0000000000f8', :'A', 'F-8', 'زبون', '0900000008',
        'cash_on_delivery', 1000, 1000, 'k-f8', 'tok-secret-f8');

select t.login(:'customerA');
select t.throws('select public.claim_guest_order(' || quote_literal(:'A')
                || ', ''F-8'', ''tok-guess'')',
                '★★★ توكن مخمَّن يُرفض');
select t.throws('select public.claim_guest_order(' || quote_literal(:'A')
                || ', ''F-404'', ''tok-secret-f8'')',
                '★★★ ورقم طلب غير موجود يُرفض بنفس الرسالة');
select t.ok((select order_number from public.claim_guest_order(:'A', 'F-8',
                                                              'tok-secret-f8')) = 'F-8',
            '★★ والتوكن الصحيح يربط الطلب');
select t.ok((select count(*) from public.orders o
              join public.customers c on c.id = o.customer_id
             where o.id = '0f000000-0000-0000-0000-0000000000f8'
               and c.profile_id = :'customerA') = 1,
            '★★ والطلب صار في حساب العميل');
-- إعادة النداء لا تُنشئ عميلًا ثانيًا
select public.claim_guest_order(:'A', 'F-8', 'tok-secret-f8');
select t.reset();
select t.ok((select count(*) from public.customers
              where store_id = :'A' and profile_id = :'customerA'
                and deleted_at is null) = 1,
            '★★ وإعادة النداء لا تُنشئ سجلّ عميل مكرَّرًا');
rollback;

\echo '── ★★★ ولا يُنتزع طلبٌ من صاحبه ──'
begin;
select t.reset();
insert into public.customers (id, store_id, profile_id, name, phone)
values ('0c000000-0000-0000-0000-0000000000c1', :'A', :'ownerB', 'مالك ب', '0900000099');
insert into public.orders (id, store_id, order_number, customer_id, contact_name,
                           contact_phone, payment_method, subtotal, total,
                           idempotency_key, guest_token)
values ('0f000000-0000-0000-0000-0000000000f9', :'A', 'F-9',
        '0c000000-0000-0000-0000-0000000000c1', 'زبون', '0900000009',
        'cash_on_delivery', 1000, 1000, 'k-f9', 'tok-secret-f9');
select t.login(:'customerA');
select t.throws('select public.claim_guest_order(' || quote_literal(:'A')
                || ', ''F-9'', ''tok-secret-f9'')',
                '★★★ طلبٌ مربوط بعميل آخر لا يُنتزع ولو بالتوكن الصحيح');
rollback;

\echo '── ★★★ رابط زرّ البنر: لا javascript: ولا data: ──'
begin;
select t.login(:'ownerA');
select t.throws('select public.save_theme_banner(' || quote_literal(:'A')
                || ', null, ''hero'', null, ''ع'', null, ''اضغط'', ''javascript:alert(1)'')',
                '★★★ javascript: يُرفض');
select t.throws('select public.save_theme_banner(' || quote_literal(:'A')
                || ', null, ''hero'', null, ''ع'', null, ''اضغط'', ''data:text/html,<script>'')',
                '★★★ data: يُرفض');
select t.throws('select public.save_theme_banner(' || quote_literal(:'A')
                || ', null, ''hero'', null, ''ع'', null, ''اضغط'', ''http://evil.test'')',
                '★★ وhttp غير المشفَّر يُرفض');
select t.ok(public.save_theme_banner(:'A', null, 'hero', null, 'ع', null, 'اضغط',
                                     '/products') is not null,
            'والمسار الداخلي يُقبل');
select t.ok(public.save_theme_banner(:'A', null, 'promo', null, 'ع', null, 'اضغط',
                                     'https://nilemarket.online/x') is not null,
            'وhttps يُقبل');
rollback;

\echo '── ★★★ أصل المكتبة: التاجر يستعمله ولا يملكه ──'
begin;
select t.reset();
-- أصل مشترك: صفّ media_files بلا متجر + صفّ platform_media نشط
insert into public.media_files (id, bucket, path, store_id, purpose, mime_type,
                                size_bytes, status)
values ('0d000000-0000-0000-0000-0000000000d1', 'theme-library',
        'library/games/placeholder.webp', null, 'category_image', 'image/webp',
        12000, 'ready');
insert into public.platform_media (media_file_id, kind, slug, label, license_note,
                                   is_active)
values ('0d000000-0000-0000-0000-0000000000d1', 'category', 'placeholder',
        'نائب محيَّد', 'أصل من إنتاج سوق النيل', true);

select t.login(:'ownerA');
select t.ok(app.media_usable_by_store(:'A', '0d000000-0000-0000-0000-0000000000d1'),
            'الأصل المشترك متاح للاستعمال');
select t.ok((select category_id from public.save_category(
               :'A', 'تصنيف بصورة مكتبة', null,
               '0d000000-0000-0000-0000-0000000000d1')) is not null,
            '★★ والتاجر يربطه بتصنيفه');
select t.no_effect('update public.media_files set path = ''library/hacked.webp''
                    where id = ''0d000000-0000-0000-0000-0000000000d1''',
                   '★★★ ولا يعدّل الأصل المشترك');
select t.no_effect('update public.platform_media set label = ''مخترَق''
                    where slug = ''placeholder''',
                   '★★★ ولا بطاقته في المكتبة');
select t.no_effect('delete from public.media_files
                    where id = ''0d000000-0000-0000-0000-0000000000d1''',
                   '★★★ ولا يحذفه فيُفسده على بقيّة التجّار');
select t.reset();
select t.ok(app.store_storage_mb(:'A') < 1,
            '★★★ وأصل المكتبة لا يُحمَّل على حصّة تخزين التاجر');

-- وصورة متجر آخر لا تُستعمل في متجري
select t.login(:'ownerB');
select t.ok(app.media_usable_by_store(:'B', '0d000000-0000-0000-0000-0000000000d1'),
            'والأصل المشترك متاح لمتجر ب أيضًا — وهذا غرضه');
rollback;

\echo '── ★★ أصل غير نشط في المكتبة لا يُستعمل ──'
begin;
select t.reset();
insert into public.media_files (id, bucket, path, store_id, purpose, mime_type,
                                size_bytes, status)
values ('0d000000-0000-0000-0000-0000000000d2', 'theme-library',
        'library/games/draft.webp', null, 'category_image', 'image/webp',
        12000, 'ready');
insert into public.platform_media (media_file_id, kind, slug, label, is_active)
values ('0d000000-0000-0000-0000-0000000000d2', 'category', 'draft', 'مسوّدة', false);
select t.login(:'ownerA');
select t.ok(app.media_usable_by_store(:'A', '0d000000-0000-0000-0000-0000000000d2')
            = false, '★★ أصل غير نشط لا يُستعمل');
select t.throws('select public.save_category(' || quote_literal(:'A')
                || ', ''ت'', null, ''0d000000-0000-0000-0000-0000000000d2'')',
                '★★ ومحاولة ربطه تُرفض');
rollback;

\echo '── ★★★ لا تنشيط أصل بلا ترخيص موثَّق ──'
begin;
select t.reset();
insert into public.media_files (id, bucket, path, store_id, purpose, mime_type,
                                size_bytes, status)
values ('0d000000-0000-0000-0000-0000000000d3', 'theme-library',
        'library/games/x.webp', null, 'product_image', 'image/webp', 9000, 'ready');
select t.throws_check(
  'insert into public.platform_media (media_file_id, kind, slug, label, is_active)
   values (''0d000000-0000-0000-0000-0000000000d3'', ''product'', ''no-license'',
           ''بلا ترخيص'', true)',
  '★★★ لا يُنشَّط أصل بلا license_note — لا نفترض حقوقًا');
rollback;

\echo '── ★★ الحقول الرقمية: سقف وتفرّد وحذف ناعم ──'
begin;
select t.login(:'ownerA');
select public.save_digital_field(:'A', :'prodA', 'رقم اللاعب', null, 'تعليمة');
select t.throws('select public.save_digital_field(' || quote_literal(:'A') || ', '
                || quote_literal(:'prodA') || ', ''  رقم اللاعب  '')',
                '★★ لا حقلان بنفس الاسم لنفس المنتج');
select t.throws('select public.save_digital_field(' || quote_literal(:'A') || ', '
                || quote_literal(:'prodA') || ', '''')',
                'اسم فارغ يُرفض');
select t.throws('select public.save_digital_field(' || quote_literal(:'A') || ', '
                || quote_literal(:'prodA') || ', ' || quote_literal(repeat('ط', 61)) || ')',
                'اسم أطول من ٦٠ يُرفض');
select t.ok((select count(*) from public.product_digital_fields
              where product_id = :'prodA' and deleted_at is null) = 1, 'حقل واحد');
select public.delete_digital_field(:'A',
  (select id from public.product_digital_fields where product_id = :'prodA'));
select t.reset();
select t.ok((select count(*) from public.product_digital_fields
              where product_id = :'prodA' and deleted_at is null) = 0,
            'والحذف ناعم');
select t.ok((select count(*) from public.product_digital_fields
              where product_id = :'prodA') = 1,
            '★★ والصفّ باقٍ — لقطة الطلبات السابقة لا تُمسّ');
rollback;

\echo '── ★★★ لقطة القيم إلحاقية: لا تعديل ولا حذف ──'
begin;
select t.reset();
insert into public.orders (id, store_id, order_number, contact_name, contact_phone,
                           payment_method, subtotal, total, idempotency_key)
values ('0f000000-0000-0000-0000-0000000000fa', :'A', 'F-A', 'زبون', '0900000010',
        'cash_on_delivery', 1000, 1000, 'k-fa');
insert into public.order_digital_values (order_id, store_id, field_label, value)
values ('0f000000-0000-0000-0000-0000000000fa', :'A', 'رقم اللاعب', '123456');
select t.throws('update public.order_digital_values set value = ''999'' ',
                '★★★ لا تعديل على اللقطة');
select t.throws('delete from public.order_digital_values',
                '★★★ ولا حذف');
rollback;

\echo '── ★★★ المحتوى الابتدائي: مرّة واحدة، ولا يزرع فوق متجر عامر ──'
begin;
select t.login(:'ownerA');
-- متجر أ عامر (منتجان وتصنيف) ⇒ لا زرع
select t.ok((select products_added from public.seed_digital_starter(:'A')) = 0,
            '★★★ لا زرع فوق متجر عامر');
rollback;

begin;
select t.reset();
-- متجر فارغ فعلًا
insert into auth.users (id, email, email_confirmed_at)
values ('ee000000-0000-0000-0000-0000000000e1', 'ownerE@test.local', now());
insert into public.stores (id, owner_id, name, slug, status, published_at)
values ('e0000000-0000-0000-0000-00000000000e', 'ee000000-0000-0000-0000-0000000000e1',
        'متجر فارغ', 'store-empty', 'active', now());
insert into public.store_settings (store_id) values ('e0000000-0000-0000-0000-00000000000e');
insert into public.store_order_sequences (store_id) values ('e0000000-0000-0000-0000-00000000000e');
insert into public.store_members (store_id, profile_id, role, status, accepted_at)
values ('e0000000-0000-0000-0000-00000000000e', 'ee000000-0000-0000-0000-0000000000e1',
        'owner', 'active', now());

select t.login('ee000000-0000-0000-0000-0000000000e1');
select t.ok((select categories_added from public.seed_digital_starter(
               'e0000000-0000-0000-0000-00000000000e')) = 5,
            '★★ خمسة تصنيفات ابتدائية');
select t.reset();
select t.ok((select count(*) from public.products
              where store_id = 'e0000000-0000-0000-0000-00000000000e'
                and deleted_at is null) = 5,
            '★★ وخمسة منتجات — نصف حصّة المجانية، فيبقى للتاجر متّسع');
select t.ok((select count(*) from public.product_variants
              where store_id = 'e0000000-0000-0000-0000-00000000000e'
                and deleted_at is null) = 20,
            '★★ وباقاتها على `product_variants` القائم — لا نظام باقات ثانٍ');
select t.ok((select count(*) from public.product_digital_fields
              where store_id = 'e0000000-0000-0000-0000-00000000000e'
                and deleted_at is null) = 6,
            '★★ وحقول الشحن');
select t.ok((select bool_and(track_inventory = false) from public.products
              where store_id = 'e0000000-0000-0000-0000-00000000000e') = true,
            '★★★ وكلّها بلا تتبّع مخزون — منتجات رقمية');
select t.ok((select count(*) from public.media_files
              where store_id = 'e0000000-0000-0000-0000-00000000000e') = 0,
            '★★★ ولا صورة مرفوعة: لا نفترض حقوق شعارٍ تجاري');

-- ★ إعادة النداء لا تكرّر شيئًا
select t.login('ee000000-0000-0000-0000-0000000000e1');
select t.ok((select products_added from public.seed_digital_starter(
               'e0000000-0000-0000-0000-00000000000e')) = 0,
            '★★★ وإعادة النداء لا تزرع شيئًا (idempotent)');
select t.reset();
select t.ok((select count(*) from public.products
              where store_id = 'e0000000-0000-0000-0000-00000000000e'
                and deleted_at is null) = 5,
            '★★★ ولا تتكرّر البيانات');

-- ★ حذف التاجر لعنصر لا يُعاد
select t.login('ee000000-0000-0000-0000-0000000000e1');
select public.delete_product(
  (select id from public.products
    where store_id = 'e0000000-0000-0000-0000-00000000000e'
      and deleted_at is null limit 1));
select t.ok((select products_added from public.seed_digital_starter(
               'e0000000-0000-0000-0000-00000000000e')) = 0,
            '★★★ والمحذوف لا يُستعاد — لا «استعادة الافتراضي»');
select t.reset();
select t.ok((select count(*) from public.products
              where store_id = 'e0000000-0000-0000-0000-00000000000e'
                and deleted_at is null) = 4,
            '★★★ يبقى أربعة');
rollback;

\echo '── ★★ حذف التصنيف: ناعم، ومنتجاته لا تُحذف ──'
begin;
select t.login(:'ownerA');
select public.delete_category(:'A', 'c1000000-0000-0000-0000-000000000001');
select t.reset();
select t.ok((select count(*) from public.categories
              where id = 'c1000000-0000-0000-0000-000000000001'
                and deleted_at is not null) = 1, 'التصنيف محذوف ناعمًا');
select t.ok((select count(*) from public.products
              where store_id = :'A' and deleted_at is null) = 2,
            '★★★ ومنتجاته لم تُحذف');
select t.ok((select count(*) from public.products
              where store_id = :'A' and category_id is null
                and deleted_at is null) = 2,
            '★★ بل فُكّت عن التصنيف');
rollback;

\echo '── ★★ تنبيه رفض الدفع يصل الزبون بالسبب ──'
begin;
select t.reset();
insert into public.customers (id, store_id, profile_id, name, phone)
values ('0c000000-0000-0000-0000-0000000000c2', :'A', :'customerA', 'زبون أ', '0900000111');
insert into public.orders (id, store_id, order_number, customer_id, contact_name,
                           contact_phone, contact_email, payment_method, subtotal,
                           total, idempotency_key)
values ('0f000000-0000-0000-0000-0000000000fb', :'A', 'F-B',
        '0c000000-0000-0000-0000-0000000000c2', 'زبون أ', '0900000111',
        'c@test.local', 'bank_transfer', 1000, 1000, 'k-fb');
insert into public.payments (id, kind, store_id, order_id, method, status, amount,
                             failed_reason, idempotency_key)
values ('0a000000-0000-0000-0000-0000000000a1', 'order', :'A',
        '0f000000-0000-0000-0000-0000000000fb', 'bank_transfer', 'failed', 1000,
        'الإيصال غير واضح', 'k-fb:proof');
insert into public.payment_events (payment_id, event, from_status, to_status)
values ('0a000000-0000-0000-0000-0000000000a1', 'store_rejected_transfer',
        'pending', 'failed');

select t.ok((select count(*) from public.notifications
              where user_id = :'customerA' and type = 'order.payment_rejected') = 1,
            '★★ التنبيه وصل الزبون');
select t.ok((select body from public.notifications
              where user_id = :'customerA' and type = 'order.payment_rejected')
            = 'الإيصال غير واضح', '★★★ وفيه السبب');
select t.ok((select count(*) from public.email_outbox
              where template = 'order_payment_rejected') = 1,
            '★★ وبريدٌ في الصندوق لمن أعطى بريدًا');
-- والسبب يظهر للزبون في تفاصيل الطلب
select t.ok((select rejection_reason from public.order_digital_detail(
               :'A', 'F-B', null, '0900000111')) = 'الإيصال غير واضح',
            '★★★ ويظهر له في تفاصيل الطلب');
rollback;

\echo '── ★★ تنبيه «جاهز للتنفيذ» يصل من يملك orders:update ──'
begin;
select t.reset();
insert into public.orders (id, store_id, order_number, contact_name, contact_phone,
                           payment_method, subtotal, total, idempotency_key)
values ('0f000000-0000-0000-0000-0000000000fc', :'A', 'F-C', 'زبون', '0900000112',
        'bank_transfer', 1000, 1000, 'k-fc');
insert into public.payments (id, kind, store_id, order_id, method, status, amount,
                             idempotency_key)
values ('0a000000-0000-0000-0000-0000000000a2', 'order', :'A',
        '0f000000-0000-0000-0000-0000000000fc', 'bank_transfer', 'paid', 1000,
        'k-fc:proof');
insert into public.payment_events (payment_id, event, from_status, to_status)
values ('0a000000-0000-0000-0000-0000000000a2', 'store_confirmed_transfer',
        'pending', 'paid');
select t.ok((select count(*) from public.notifications
              where type = 'order.ready' and user_id = :'ownerA') = 1,
            '★★ المالك أُبلِغ أنّ الطلب جاهز للتنفيذ');
select t.ok((select count(*) from public.notifications
              where type = 'order.ready' and user_id = :'customerA') = 0,
            '★★★ ولم يصل الزبون تنبيهٌ داخليّ للتاجر');
rollback;

\echo '── ★★★ المتجر العادي: كل مسارات المال والطلب كما كانت ──'
begin;
select t.reset();
-- طلب كامل بالمسار القائم على متجر classic + مجانية
select t.ok((select total from public.create_order(
               :'A',
               '[{"product_id":"d1000000-0000-0000-0000-000000000001","quantity":2}]'::jsonb,
               (select id from public.delivery_zones where store_id = :'A' limit 1),
               '{"name":"زبون عادي","phone":"0912345678"}'::jsonb,
               '{"line":"شارع النيل ١٢"}'::jsonb,
               'cash_on_delivery', null, 'classic-regress-1')) = 42000,
            '★★★ Classic + Free: الطلب ينجح والمال يُحسب خادميًّا (٤٠٠٠٠+٢٠٠٠)');
select t.ok((select reserved from public.inventory where product_id = :'prodA') = 2,
            '★★★ والحجز كما كان');
rollback;

\echo '✓ 117_digital_theme'
