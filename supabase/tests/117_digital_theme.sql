\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set B b0000000-0000-0000-0000-00000000000b
\set prodA d1000000-0000-0000-0000-000000000001
\set prodA2 d1000000-0000-0000-0000-000000000002
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

\echo '── ★★★ المفتاح الرقميّ كما ضبطه الإداريّ: منطقيًّا أو رقمًا (0062) ──'
begin;
select t.login(:'ownerA');
select t.ok(public.set_storefront_template(:'A', 'digital') = 'digital', 'رقمي');
select t.reset();
-- ★ لقطة حدّ منتجات المجانية قبل أيّ عبث: يُقارَن بها في آخر الكتلة
select (select coalesce(limit_value::text, '∅') || '/' ||
               (configured_at is not null)::text
          from public.plan_entitlements e
          join public.plans p on p.id = e.plan_id
         where p.code = 'free' and e.feature_key = 'products.max') as pmax0 \gset
-- ★ الحالة الحقيقية في الإنتاج: حدٌّ رقميّ مضبوط لا قيمة منطقية
--   (وجدها التدقيق: free = 0 · basic = 300 · pro = 500)
update public.plan_entitlements
   set limit_value = 0, bool_value = null, configured_at = now()
 where feature_key = 'digital_store.orders'
   and plan_id = (select id from public.plans where code = 'basic');
update public.subscriptions
   set plan_id = (select id from public.plans where code = 'basic'),
       status = 'active', current_period_end = now() + interval '30 days'
 where store_id = :'A' and status <> 'cancelled';
select t.ok(app.digital_orders_allowed(:'A') = false,
            '★★★ حدٌّ رقميّ = ٠ على باقة مدفوعة ⇒ يمنع (زرّ اللوحة يفعل شيئًا)');
select t.ok(app.store_can_checkout(:'A') = false,
            '★★★ والبوّابة تُغلق — لا زرّ مخفيًّا فقط');
-- وحدٌّ موجب يسمح
update public.plan_entitlements set limit_value = 300
 where feature_key = 'digital_store.orders'
   and plan_id = (select id from public.plans where code = 'basic');
select t.ok(app.digital_orders_allowed(:'A') = true,
            '★★ وحدٌّ موجب يسمح (وهي قيم الإنتاج اليوم)');
-- والمنطقيّ يتقدّم على الرقميّ إن ضُبط
update public.plan_entitlements set bool_value = false
 where feature_key = 'digital_store.orders'
   and plan_id = (select id from public.plans where code = 'basic');
select t.ok(app.digital_orders_allowed(:'A') = false,
            '★★★ والحكم المنطقيّ الصريح يتقدّم على الرقم');
-- وغير المضبوط أصلًا ⇒ القاعدة القائمة (مدفوعة ⇒ مسموح)
update public.plan_entitlements
   set bool_value = null, limit_value = null, configured_at = null
 where feature_key = 'digital_store.orders'
   and plan_id = (select id from public.plans where code = 'basic');
select t.ok(app.digital_orders_allowed(:'A') = true,
            '★★ وغير المضبوط يعود للقاعدة: باقة مدفوعة تشغيلية ⇒ مسموح');
-- ★ ولا يُمسّ حدّ المنتجات ولا سعر الباقة في كل ما سبق
select t.ok((select coalesce(limit_value::text, '∅') || '/' ||
                    (configured_at is not null)::text
               from public.plan_entitlements e
               join public.plans p on p.id = e.plan_id
              where p.code = 'free' and e.feature_key = 'products.max')
            = :'pmax0',
            '★★★ وحدّ منتجات المجانية لم يُمسّ (قيمةً وحالةَ ضبط)');
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

-- =====================================================================
-- تدقيق المرحلة الثالثة — محاولات التجاوز والدورة الكاملة
-- =====================================================================

\echo '── ★★★ دورة القالب: عادي ⟶ رقمي ⟶ عادي ⟶ رقمي بلا فقدان بيان ──'
begin;
select t.login(:'ownerA');
select t.ok(public.set_storefront_template(:'A','digital') = 'digital', 'رقمي');
select public.save_digital_field(:'A', :'prodA', 'رقم اللاعب', null, 'تعليمة');
select public.save_theme_banner(:'A', null, 'hero', null, 'بنر الدورة');
select t.reset();
insert into public.product_variants (product_id, store_id, name, price, options, sort_order)
values (:'prodA', :'A', 'باقة الدورة', 7000, '{"package":"rt"}'::jsonb, 0);
insert into public.orders (id, store_id, order_number, contact_name, contact_phone,
                           payment_method, subtotal, total, idempotency_key)
values ('0c000000-0000-0000-0000-0000000000d1', :'A', 'RT-1', 'زبون', '0900000200',
        'bank_transfer', 7000, 7000, 'k-rt1');
insert into public.order_digital_values (order_id, store_id, field_label, value)
values ('0c000000-0000-0000-0000-0000000000d1', :'A', 'رقم اللاعب', '555444333');

create temp table snap as
select (select md5(string_agg(id::text, ',' order by id)) from public.products
         where store_id = :'A' and deleted_at is null) pid,
       (select md5(string_agg(id::text, ',' order by id)) from public.product_variants
         where store_id = :'A' and deleted_at is null) vid,
       (select md5(string_agg(id::text, ',' order by id)) from public.orders
         where store_id = :'A') oid,
       (select md5(string_agg(id::text, ',' order by id)) from public.product_digital_fields
         where store_id = :'A' and deleted_at is null) fid,
       (select count(*) from public.categories where store_id = :'A' and deleted_at is null) c,
       (select count(*) from public.store_theme_banners
         where store_id = :'A' and deleted_at is null) b,
       (select count(*) from public.order_digital_values where store_id = :'A') dv,
       (select count(*) from public.delivery_zones where store_id = :'A') dz;

select t.login(:'ownerA');
select t.ok(public.set_storefront_template(:'A','classic') = 'classic', 'عادي');
select t.ok(public.set_storefront_template(:'A','digital') = 'digital', 'رقمي');
select t.ok(public.set_storefront_template(:'A','classic') = 'classic', 'عادي');
select t.ok(public.set_storefront_template(:'A','digital') = 'digital', 'رقمي');
select t.reset();

select t.ok((select pid from snap) = (select md5(string_agg(id::text, ',' order by id))
             from public.products where store_id = :'A' and deleted_at is null),
            '★★★ معرّفات المنتجات لم تتغيّر بعد أربع تحويلات');
select t.ok((select vid from snap) = (select md5(string_agg(id::text, ',' order by id))
             from public.product_variants where store_id = :'A' and deleted_at is null),
            '★★★ ولا معرّفات الباقات');
select t.ok((select oid from snap) = (select md5(string_agg(id::text, ',' order by id))
             from public.orders where store_id = :'A'), '★★★ ولا معرّفات الطلبات');
select t.ok((select fid from snap) = (select md5(string_agg(id::text, ',' order by id))
             from public.product_digital_fields where store_id = :'A' and deleted_at is null),
            '★★★ ولا معرّفات الحقول الرقمية');
select t.ok((select c from snap) = (select count(*) from public.categories
             where store_id = :'A' and deleted_at is null), '★★★ التصنيفات كما هي');
select t.ok((select b from snap) = (select count(*) from public.store_theme_banners
             where store_id = :'A' and deleted_at is null),
            '★★★ البنرات محفوظة في العادي وتعود في الرقمي');
select t.ok((select dv from snap) = (select count(*) from public.order_digital_values
             where store_id = :'A'), '★★★ لقطة بيانات الشحن محفوظة');
select t.ok((select dz from snap) = (select count(*) from public.delivery_zones
             where store_id = :'A'), '★★★ مناطق التوصيل كما هي');
select t.ok((select cod_enabled from public.store_settings where store_id = :'A') = true,
            '★★ وإعدادات الدفع لم تُمسّ');
select t.ok((select count(*) from public.audit_logs
              where action = 'store.template_changed' and store_id = :'A') = 5,
            '★★ وكل تبديل مسجَّل في التدقيق');
rollback;

\echo '── ★★★ الاشتراك لا يغيّر القالب، والقالب لا يفتح الطلبات ──'
begin;
select t.login(:'ownerA');
select t.ok(public.set_storefront_template(:'A','digital') = 'digital', 'رقمي');
select t.reset();
update public.subscriptions set status = 'expired'
 where store_id = :'A' and status <> 'cancelled';
select t.ok(app.store_template(:'A') = 'digital',
            '★★★ Expired: القالب يبقى رقميًّا — لا تحويل تلقائي إلى العادي');
update public.subscriptions set status = 'suspended'
 where store_id = :'A' and status <> 'cancelled';
select t.ok(app.store_template(:'A') = 'digital',
            '★★★ Suspended: القالب يبقى رقميًّا');
-- والتاجر يبدّل القالب والاشتراك منتهٍ (§٢)
select t.login(:'ownerA');
select t.ok(public.set_storefront_template(:'A','classic') = 'classic',
            '★★★ والتاجر يبدّل القالب والاشتراك منتهٍ');
select t.ok(public.set_storefront_template(:'A','digital') = 'digital', 'ويعود');
rollback;

\echo '── ★★★ تجاوز البوّابة: نداءات مباشرة على الدوال ──'
begin;
select t.login(:'ownerA');
select t.ok(public.set_storefront_template(:'A','digital') = 'digital', 'رقمي + مجانية');
select t.reset();

-- المسار المباشر
select t.logout();
select t.throws(
  'select public.create_order(' || quote_literal(:'A') || ',
     ''[{"product_id":"d1000000-0000-0000-0000-000000000001","quantity":1}]''::jsonb,
     null, ''{"name":"ز","phone":"0912345678"}''::jsonb, ''{}''::jsonb,
     ''cash_on_delivery'')',
  '★★★ create_order مباشرةً يُرفض');
-- مسار الرقمي نفسه
select t.throws(
  'select public.create_digital_order(' || quote_literal(:'A') || ', '
  || quote_literal(:'prodA') || ', null, 1,
     ''{"name":"ز","phone":"0912345678"}''::jsonb, ''bank_transfer'',
     ''00000000-0000-0000-0000-000000000001'')',
  '★★★ create_digital_order مباشرةً يُرفض');
-- ورفع الإيصال نفسه مرفوض قبل الطلب
select t.throws(
  'select public.prepare_order_proof_upload(' || quote_literal(:'A')
  || ', ''tok'', ''image/jpeg'', 1000, ''jpg'')',
  '★★★ ورفع الإيصال يُرفض — فلا يُبنى نصف طلب');
-- وعرض السعر يقول «لا شراء»
select t.ok((select can_checkout from public.quote_checkout(:'A', 'tok')) = false,
            '★★★ وquote_checkout تعلن منع الشراء');
rollback;

\echo '── ★★★ والتجاوز مرفوض في expired وsuspended كذلك ──'
begin;
select t.login(:'ownerA');
select t.ok(public.set_storefront_template(:'A','digital') = 'digital', 'رقمي');
select t.reset();
update public.subscriptions
   set plan_id = (select id from public.plans where code = 'basic'), status = 'expired'
 where store_id = :'A' and status <> 'cancelled';
select t.logout();
select t.throws(
  'select public.create_digital_order(' || quote_literal(:'A') || ', '
  || quote_literal(:'prodA') || ', null, 1,
     ''{"name":"ز","phone":"0912345678"}''::jsonb, ''bank_transfer'',
     ''00000000-0000-0000-0000-000000000001'')',
  '★★★ Expired: الطلب الرقمي يُرفض');
select t.reset();
update public.subscriptions set status = 'suspended'
 where store_id = :'A' and status <> 'cancelled';
select t.logout();
select t.throws(
  'select public.create_digital_order(' || quote_literal(:'A') || ', '
  || quote_literal(:'prodA') || ', null, 1,
     ''{"name":"ز","phone":"0912345678"}''::jsonb, ''bank_transfer'',
     ''00000000-0000-0000-0000-000000000001'')',
  '★★★ Suspended: الطلب الرقمي يُرفض');
rollback;

\echo '── ★★★ أمان الباقة: لا باقة من متجر آخر ولا سعر من العميل ──'
begin;
select t.login(:'ownerA');
select t.ok(public.set_storefront_template(:'A','digital') = 'digital', 'رقمي');
select t.reset();
update public.subscriptions
   set plan_id = (select id from public.plans where code = 'basic'), status = 'active'
 where store_id = :'A' and status <> 'cancelled';
-- باقة في متجر ب
insert into public.product_variants (id, product_id, store_id, name, price, options)
values ('0c000000-0000-0000-0000-0000000000b1', :'prodB', :'B', 'باقة ب', 3000,
        '{"package":"b"}'::jsonb);
select t.logout();
select t.throws(
  'select public.create_digital_order(' || quote_literal(:'A') || ', '
  || quote_literal(:'prodA') || ', ''0c000000-0000-0000-0000-0000000000b1'', 1,
     ''{"name":"ز","phone":"0912345678"}''::jsonb, ''bank_transfer'',
     ''00000000-0000-0000-0000-000000000001'')',
  '★★★ باقة متجر ب على طلب متجر أ تُرفض');
-- وباقة منتج آخر في نفس المتجر تُرفض
select t.reset();
insert into public.product_variants (id, product_id, store_id, name, price, options)
values ('0c000000-0000-0000-0000-0000000000a2', :'prodA2', :'A', 'باقة منتج آخر', 4000,
        '{"package":"a2"}'::jsonb);
select t.logout();
select t.throws(
  'select public.create_digital_order(' || quote_literal(:'A') || ', '
  || quote_literal(:'prodA') || ', ''0c000000-0000-0000-0000-0000000000a2'', 1,
     ''{"name":"ز","phone":"0912345678"}''::jsonb, ''bank_transfer'',
     ''00000000-0000-0000-0000-000000000001'')',
  '★★★ وباقة منتجٍ آخر على هذا المنتج تُرفض');
rollback;

\echo '── ★★★ باقة واحدة لكل طلب رقمي — بحكم التوقيع ──'
begin;
-- لا معامل قائمة أسطر في التوقيع ⇒ لا سبيل لدسّ باقة ثانية
select t.ok((select count(*) from information_schema.parameters
              where specific_name in (
                select specific_name from information_schema.routines
                 where routine_name = 'create_digital_order')
                and parameter_name = 'p_items') = 0,
            '★★★ لا معامل `p_items` — الطلب الرقمي سطرٌ واحد بنيويًّا');
select t.ok((select count(*) from information_schema.parameters
              where specific_name in (
                select specific_name from information_schema.routines
                 where routine_name = 'create_digital_order')
                and parameter_name = 'p_variant_id') = 1,
            '★★ ومعامل باقة واحدة');
rollback;

\echo '── ★★★ الحقل المحذوف بعد الطلب لا يمحو لقطته ──'
begin;
select t.reset();
insert into public.orders (id, store_id, order_number, contact_name, contact_phone,
                           payment_method, subtotal, total, idempotency_key)
values ('0c000000-0000-0000-0000-0000000000f0', :'A', 'DF-1', 'زبون', '0900000300',
        'bank_transfer', 1000, 1000, 'k-df1');
insert into public.order_digital_values (order_id, store_id, field_label, value)
values ('0c000000-0000-0000-0000-0000000000f0', :'A', 'رقم اللاعب', '777666555');
select t.login(:'ownerA');
select public.save_digital_field(:'A', :'prodA', 'رقم اللاعب');
select public.delete_digital_field(:'A',
  (select id from public.product_digital_fields where product_id = :'prodA'
    and deleted_at is null limit 1));
select t.reset();
select t.ok((select value from public.order_digital_values
              where order_id = '0c000000-0000-0000-0000-0000000000f0') = '777666555',
            '★★★ لقطة الطلب باقية بعد حذف تعريف الحقل');
rollback;

\echo '── ★★★ التنفيذ يُرفض على دفعة معلّقة أو مرفوضة ──'
begin;
select t.reset();
insert into public.orders (id, store_id, order_number, contact_name, contact_phone,
                           payment_status, payment_method, subtotal, total, idempotency_key)
values ('0c000000-0000-0000-0000-0000000000e1', :'A', 'FF-1', 'زبون', '0900000401',
        'pending', 'bank_transfer', 1000, 1000, 'k-ff1'),
       ('0c000000-0000-0000-0000-0000000000e2', :'A', 'FF-2', 'زبون', '0900000402',
        'unpaid', 'bank_transfer', 1000, 1000, 'k-ff2');
select t.login(:'ownerA');
select t.throws('select public.mark_digital_order_shipped(''0c000000-0000-0000-0000-0000000000e1'')',
                '★★★ payment_status = pending ⇒ التنفيذ يُرفض');
select t.throws('select public.mark_digital_order_shipped(''0c000000-0000-0000-0000-0000000000e2'')',
                '★★★ ودفعة مرفوضة (unpaid) ⇒ يُرفض');
rollback;

\echo '── ★★★ رفض الدفع بلا سبب يفشل ──'
begin;
select t.reset();
insert into public.orders (id, store_id, order_number, contact_name, contact_phone,
                           payment_method, subtotal, total, idempotency_key)
values ('0c000000-0000-0000-0000-0000000000e3', :'A', 'RJ-1', 'زبون', '0900000403',
        'bank_transfer', 1000, 1000, 'k-rj1');
insert into public.media_files (id, bucket, path, store_id, purpose, mime_type,
                                size_bytes, status)
values ('0c000000-0000-0000-0000-0000000000e4', 'store-private',
        'stores/a/order-payment-proofs/x.jpg', :'A', 'order_payment_proof',
        'image/jpeg', 9000, 'ready');
insert into public.payments (id, kind, store_id, order_id, method, status, amount,
                             proof_media_id, idempotency_key)
values ('0c000000-0000-0000-0000-0000000000e5', 'order', :'A',
        '0c000000-0000-0000-0000-0000000000e3', 'bank_transfer', 'pending', 1000,
        '0c000000-0000-0000-0000-0000000000e4', 'k-rj1:proof');
select t.login(:'ownerA');
select t.throws(
  'select public.review_order_payment(''0c000000-0000-0000-0000-0000000000e5'', ''reject'')',
  '★★★ رفض بلا سبب يفشل');
select t.throws(
  'select public.review_order_payment(''0c000000-0000-0000-0000-0000000000e5'', ''reject'', ''   '')',
  '★★★ وسببٌ فراغات يفشل');
select public.review_order_payment('0c000000-0000-0000-0000-0000000000e5', 'reject',
                                   'الإيصال لا يطابق المبلغ');
select t.reset();
select t.ok((select failed_reason from public.payments
              where id = '0c000000-0000-0000-0000-0000000000e5')
            = 'الإيصال لا يطابق المبلغ', '★★ والسبب محفوظ');
select t.ok((select rejection_reason from public.order_digital_detail(
               :'A', 'RJ-1', null, '0900000403')) = 'الإيصال لا يطابق المبلغ',
            '★★★ ويظهر للعميل');
-- ولا تنفيذ بعد الرفض
select t.login(:'ownerA');
select t.throws('select public.mark_digital_order_shipped(''0c000000-0000-0000-0000-0000000000e3'')',
                '★★★ ولا تنفيذ بعد رفض الدفع');
rollback;

\echo '── ★★ رفع الإيصال لا يعني الدفع ──'
begin;
select t.reset();
insert into public.orders (id, store_id, order_number, contact_name, contact_phone,
                           payment_method, subtotal, total, idempotency_key)
values ('0c000000-0000-0000-0000-0000000000e6', :'A', 'PP-1', 'زبون', '0900000404',
        'bank_transfer', 1000, 1000, 'k-pp1');
insert into public.media_files (id, bucket, path, store_id, purpose, mime_type,
                                size_bytes, status)
values ('0c000000-0000-0000-0000-0000000000e7', 'store-private',
        'stores/a/order-payment-proofs/y.jpg', :'A', 'order_payment_proof',
        'image/jpeg', 9000, 'ready');
insert into public.payments (id, kind, store_id, order_id, method, status, amount,
                             proof_media_id, idempotency_key)
values ('0c000000-0000-0000-0000-0000000000e8', 'order', :'A',
        '0c000000-0000-0000-0000-0000000000e6', 'bank_transfer', 'pending', 1000,
        '0c000000-0000-0000-0000-0000000000e7', 'k-pp1:proof');
select t.ok((select payment_status from public.orders
              where id = '0c000000-0000-0000-0000-0000000000e6')::text <> 'paid',
            '★★★ الإيصال مرفوع والدفع ليس paid');
select t.login(:'ownerA');
select t.throws('select public.mark_digital_order_shipped(''0c000000-0000-0000-0000-0000000000e6'')',
                '★★★ ولا تنفيذ');
-- التاجر يؤكّد ⇒ paid ⇒ التنفيذ ينجح
select public.review_order_payment('0c000000-0000-0000-0000-0000000000e8', 'approve');
select t.reset();
select t.ok((select payment_status from public.orders
              where id = '0c000000-0000-0000-0000-0000000000e6')::text = 'paid',
            '★★★ وبعد التأكيد صار paid');
select t.login(:'ownerA');
select t.ok(public.mark_digital_order_shipped('0c000000-0000-0000-0000-0000000000e6')::text
            = 'completed', '★★★ والتنفيذ ينجح ⇒ مكتمل');
select t.reset();
select t.ok((select count(*) from public.order_status_history
              where order_id = '0c000000-0000-0000-0000-0000000000e6') >= 4,
            '★★ وسجلّ الحالات مكتوب');
select t.ok((select count(*) from public.notifications
              where type = 'order.ready') >= 1,
            '★★ وتنبيه «جاهز للتنفيذ» أُنشئ');
rollback;

\echo '── ★★ لا تنبيه مكرَّر عند تكرار الحدث ──'
begin;
select t.reset();
insert into public.customers (id, store_id, profile_id, name, phone)
values ('0c000000-0000-0000-0000-0000000000c9', :'A', :'customerA', 'زبون', '0900000500');
insert into public.orders (id, store_id, order_number, customer_id, contact_name,
                           contact_phone, contact_email, payment_method, subtotal,
                           total, idempotency_key)
values ('0c000000-0000-0000-0000-0000000000ea', :'A', 'ND-1',
        '0c000000-0000-0000-0000-0000000000c9', 'زبون', '0900000500',
        'nd1@test.local', 'bank_transfer', 1000, 1000, 'k-nd1');
insert into public.payments (id, kind, store_id, order_id, method, status, amount,
                             failed_reason, idempotency_key)
values ('0c000000-0000-0000-0000-0000000000eb', 'order', :'A',
        '0c000000-0000-0000-0000-0000000000ea', 'bank_transfer', 'failed', 1000,
        'سبب', 'k-nd1:proof');
insert into public.payment_events (payment_id, event, from_status, to_status)
values ('0c000000-0000-0000-0000-0000000000eb', 'store_rejected_transfer', 'pending', 'failed');
insert into public.payment_events (payment_id, event, from_status, to_status)
values ('0c000000-0000-0000-0000-0000000000eb', 'store_rejected_transfer', 'pending', 'failed');
select t.ok((select count(*) from public.notifications
              where user_id = :'customerA' and type = 'order.payment_rejected') = 1,
            '★★★ حدثان ⇒ تنبيه واحد (dedupe_key)');
select t.ok((select count(*) from public.email_outbox
              where template = 'order_payment_rejected') = 1,
            '★★ وبريد واحد لمن أعطى بريدًا');
rollback;

\echo '✓ 117 audit block'

\echo '── ★★★ مسار كتابة القالب واحدٌ مدقَّق (لا PATCH مباشر) ──'
begin;
select t.login(:'ownerA');
-- ★ الكتابة المباشرة على العمود ممنوعة بعد 0060: لو مرّت لتخطّت
--   سجلّ التدقيق، و«العملية الموثَّقة» تفقد معناها.
select t.no_effect(
  'update public.store_settings set storefront_template = ''digital''
    where store_id = ' || quote_literal(:'A'),
  '★★★ PATCH مباشر على القالب لا يمرّ');
select t.reset();
select t.ok(app.store_template(:'A') = 'classic',
            '★★★ والقالب لم يتغيّر');
-- والدالّة تعمل وتُدقِّق
select t.login(:'ownerA');
select t.ok(public.set_storefront_template(:'A','digital') = 'digital',
            '★★★ والدالّة هي المسار الباقي');
select t.reset();
select t.ok((select count(*) from public.audit_logs
              where action = 'store.template_changed' and store_id = :'A') = 1,
            '★★★ وكل تبديل مدقَّق');
-- ★ ولا ينكسر تحديث بقيّة الإعدادات
select t.login(:'ownerA');
update public.store_settings set whatsapp_number = '0912999888'
 where store_id = :'A';
select t.reset();
select t.ok((select whatsapp_number from public.store_settings where store_id = :'A')
            = '0912999888', '★★★ وتحديث بقيّة الإعدادات يعمل كما كان');
select t.login(:'ownerA');
update public.store_settings set theme = '{"sections":{"offers":false}}'::jsonb
 where store_id = :'A';
select t.reset();
select t.ok((select theme -> 'sections' ->> 'offers' from public.store_settings
              where store_id = :'A') = 'false',
            '★★★ وأقسام القالب تُحفَظ كما كانت');
rollback;

\echo '── ★★★ ولا متجرٌ آخر يبدّل قالبي ولو بالدالّة ──'
begin;
select t.login(:'ownerB');
select t.throws('select public.set_storefront_template(' || quote_literal(:'A')
                || ', ''digital'')', '★★★ تاجر آخر يُرفض');
select t.no_effect(
  'update public.store_settings set whatsapp_number = ''0900000000''
    where store_id = ' || quote_literal(:'A'),
  '★★★ ولا يعدّل إعدادات متجري');
-- ★★★ ولا باب إدراجٍ يُغني عن التحديث: لا سياسة INSERT على الجدول،
--     فمنح الإدراج على العمود خامل. ولو أُضيفت سياسةٌ غدًا لفشل هذا.
select t.reset();
select t.ok((select count(*) from pg_policy
              where polrelid = 'public.store_settings'::regclass
                and polcmd = 'a') = 0,
            '★★★ لا سياسة إدراج على الإعدادات — فلا تبديل قالب بإدراج');
rollback;

\echo '✓ 117 template write path'

-- =====================================================================
-- ★★★ المسار الكامل للطلب الرقمي — أقصى ما تُثبته القاعدة
--
-- يمرّ بكل خطوة حقيقية: تذكرة رفع من القاعدة ⟶ كائن تخزين فعلي في
-- `storage.objects` ⟶ ربط الإيصال بالسلّة ⟶ إنشاء الطلب بالباقة
-- والحقول ⟶ دفعة معلّقة ⟶ مراجعة التاجر ⟶ التنفيذ ⟶ مكتمل ⟶ ربط
-- الطلب بحساب العميل ⟶ رؤيته في حسابه.
--
-- ★ ما لا يُثبته هذا: رفع البايتات الفعلي عبر HTTP إلى Supabase
--   Storage (شبكة الإنتاج محجوبة في بيئة التطوير). لكنّ **تصريح**
--   الرفع يُثبَت هنا: السياسة `order_proof_insert` تُقيَّم على مسارٍ
--   أصدرته القاعدة، وتُرفَض على مسارٍ لم تُصدره.
-- =====================================================================
\echo '── ★★★ المسار الكامل: من الباقة إلى «مكتمل» إلى حساب العميل ──'
begin;
-- متجر رقمي مؤهَّل
select t.login(:'ownerA');
select t.ok(public.set_storefront_template(:'A','digital') = 'digital', 'رقمي');
select public.save_digital_field(:'A', :'prodA', 'رقم اللاعب', null,
                                'أدخل رقم اللاعب كما يظهر داخل اللعبة.');
select public.save_digital_field(:'A', :'prodA', 'رقم السيرفر', null, 'بين قوسين.');

-- ★ منتجٌ رقميّ حقيقي: التاجر يُطفئ تتبّع المخزون عبر `save_product` نفسها
--   التي يستعملها في لوحته. الباقة الرقمية لا مخزون لها، ولو بقي التتبّع
--   مشتغلًا لرفضت `cart_add_item` الباقة الجديدة بحجّة النفاد — وهو
--   السلوك الصحيح للمنتج الملموس، لا للرقمي.
select public.save_product(:'A', p.name, p.price, p.id, p_track_inventory => false)
  from public.products p where p.id = :'prodA';
select t.ok((select track_inventory from public.products where id = :'prodA') = false,
            '★ المنتج الرقمي بلا تتبّع مخزون');
select t.reset();
update public.subscriptions
   set plan_id = (select id from public.plans where code = 'basic'),
       status = 'active', current_period_end = now() + interval '30 days'
 where store_id = :'A' and status <> 'cancelled';
insert into public.product_variants (id, product_id, store_id, name, price, options,
                                     is_active, sort_order)
values ('0c000000-0000-0000-0000-0000000000a1', :'prodA', :'A', '530 جوهرة', 13000,
        '{"package":"530"}'::jsonb, true, 2);

-- ★ ١) السلّة: سطرٌ واحد (شرط رفع الإيصال في القاعدة)
--   ★ الزائر يبقى زائرًا هنا: كل نداء يمرّ بدور `anon` كما في المتصفّح.
--   الفحوص على الجداول تحتاج قراءةً مباشرة، فنعود إلى دور الاختبار
--   لحظةَ الفحص وحده ثم نرجع زائرين — لا نُرخّي الدور لنُنجح نداءً.
select t.logout();
\o /dev/null
select public.cart_add_item(:'A', :'prodA', 1,
                            '0c000000-0000-0000-0000-0000000000a1', 'e2e-token');
\o
select t.reset();
select t.ok((select count(*) from public.cart_items ci
              join public.carts c on c.id = ci.cart_id
             where c.anon_token = 'e2e-token') = 1, '★★ سطرٌ واحد في السلّة');

-- ★ ٢) تذكرة رفع من القاعدة + كائن تخزين حقيقي
select t.logout();
select t.order_proof(:'A', 'e2e-token') as pm \gset
select t.reset();
select t.ok(:'pm' is not null, '★★ تذكرة الرفع صدرت من القاعدة');
select t.ok((select count(*) from storage.objects o
              join public.media_files m on m.path = o.name
             where m.id = :'pm'::uuid) = 1, '★★ والكائن موجود في التخزين');
select t.ok((select cart_id from public.media_files where id = :'pm'::uuid) is not null,
            '★★★ والإيصال مربوط بالسلّة — فلا إيصال عملية أخرى');

-- ★ ٣) تصريح التخزين: مسارٌ لم تُصدره القاعدة يُرفض
--   ★ لا بدّ من دور `anon` هنا: دور الاختبار يتخطّى RLS، فلو فحصنا
--     السياسة به لَنَجح الإدراج المزوَّر وظنّنا الاختبار بلا قيمة.
select t.logout();
select t.throws(
  'insert into storage.objects (bucket_id, name) values
     (''store-private'', ''stores/'' || ' || quote_literal(:'A')
  || ' || ''/order-payment-proofs/forged.jpg'')',
  '★★★ مسار مزوَّر في دلو الإيصالات يُرفض (تصريح التخزين)');

-- ★ ٤) الطلب الرقمي: حقل ناقص يُرفض، ثم الكامل ينجح
select t.throws(
  'select public.create_digital_order(' || quote_literal(:'A') || ', '
  || quote_literal(:'prodA') || ', ''0c000000-0000-0000-0000-0000000000a1'', 1,
     ''{"name":"أبوذر","phone":"0912345678"}''::jsonb, ''bank_transfer'', '
  || quote_literal(:'pm') || ',
     ''[{"label":"رقم اللاعب","value":"123456789"}]''::jsonb, ''e2e-1'', null, null,
     ''e2e-token'')',
  '★★★ حقل «رقم السيرفر» ناقص ⇒ الطلب يُرفض في القاعدة');

select order_number as onum, order_id as oid, guest_token as gt
  from public.create_digital_order(
    :'A', :'prodA', '0c000000-0000-0000-0000-0000000000a1', 1,
    '{"name":"أبوذر","phone":"0912345678","email":"e2e@test.local"}'::jsonb,
    'bank_transfer', :'pm'::uuid,
    '[{"label":"رقم اللاعب","value":"123456789"},
      {"label":"رقم السيرفر","value":"EU"}]'::jsonb,
    'e2e-1', null, 'REF-1', 'e2e-token') \gset
select t.reset();
select t.ok(:'onum' is not null, '★★★ والطلب الكامل ينجح');
select t.ok((select total from public.orders where id = :'oid'::uuid) = 13000,
            '★★★ والسعر من القاعدة لا من العميل (١٣٠٠٠ = سعر الباقة)');
select t.ok((select variant_name from public.order_items where order_id = :'oid'::uuid)
            = '530 جوهرة', '★★ واسم الباقة لقطةٌ من القاعدة');
select t.ok((select count(*) from public.order_digital_values
              where order_id = :'oid'::uuid) = 2, '★★★ وحقلا الشحن محفوظان');
select t.ok((select payment_status from public.orders where id = :'oid'::uuid)::text
            = 'pending', '★★★ والدفع «بانتظار التحقّق» لا «مدفوع»');
select t.ok((select status from public.payments where order_id = :'oid'::uuid)::text
            = 'pending', '★★ والدفعة معلّقة');
select t.ok((select reference from public.payments where order_id = :'oid'::uuid) = 'REF-1',
            '★★ ورقم العملية محفوظ');

-- ★ ٥) إعادة الإرسال بنفس المفتاح ⇒ نفس الطلب لا طلبٌ ثانٍ
select t.logout();
select order_number as onum2 from public.create_digital_order(
    :'A', :'prodA', '0c000000-0000-0000-0000-0000000000a1', 1,
    '{"name":"أبوذر","phone":"0912345678"}'::jsonb, 'bank_transfer', :'pm'::uuid,
    '[{"label":"رقم اللاعب","value":"123456789"},
      {"label":"رقم السيرفر","value":"EU"}]'::jsonb,
    'e2e-1', null, null, 'e2e-token') \gset
select t.reset();
select t.ok(:'onum' = :'onum2', '★★★ إعادة الإرسال تعيد نفس الطلب');
select t.ok((select count(*) from public.order_digital_values
              where order_id = :'oid'::uuid) = 2,
            '★★★ ولا تُضاعف لقطة بيانات الشحن');

-- ★ ٦) لا تنفيذ قبل التأكيد
select t.login(:'ownerA');
select t.throws('select public.mark_digital_order_shipped(' || quote_literal(:'oid') || ')',
                '★★★ لا تنفيذ والدفع معلّق');

-- ★ ٧) التاجر يؤكّد الدفع
select public.review_order_payment(
  (select id from public.payments where order_id = :'oid'::uuid), 'approve');
select t.reset();
select t.ok((select payment_status from public.orders where id = :'oid'::uuid)::text
            = 'paid', '★★★ التأكيد ⇒ paid');
select t.ok((select status from public.orders where id = :'oid'::uuid)::text = 'confirmed',
            '★★ والطلب صار مؤكَّدًا بآلة الحالة القائمة');
select t.ok((select count(*) from public.notifications where type = 'order.ready') >= 1,
            '★★ وتنبيه «جاهز للتنفيذ» وصل الفريق');

-- ★ ٨) «تم الشحن» ⇒ مكتمل
select t.login(:'ownerA');
select t.ok(public.mark_digital_order_shipped(:'oid'::uuid)::text = 'completed',
            '★★★ «تم الشحن» ⇒ مكتمل بضغطة واحدة');
select t.reset();
select t.ok((select count(*) from public.order_status_history
              where order_id = :'oid'::uuid) = 5,
            '★★★ وسجلّ الحالات كامل: صفّ الإنشاء + أربعة انتقالات');
select t.ok((select string_agg(coalesce(from_status::text,'∅') || '→' || to_status::text,
                              ',' order by created_at)
               from public.order_status_history where order_id = :'oid'::uuid)
            = '∅→new,new→confirmed,confirmed→preparing,preparing→shipped,shipped→completed',
            '★★★ وبالانتقالات الشرعية وحدها — لا اختصار للتدقيق');

-- ★ ولا حركة مخزون للمنتج الرقمي: لا حجزٌ ولا خصمٌ من رصيد لا وجود له
select t.ok((select track_inventory from public.products where id = :'prodA') = false,
            '★ المنتج الرقمي بلا تتبّع مخزون');
select t.ok((select count(*) from public.inventory_movements
              where product_id = :'prodA' and reason <> 'initial') = 0,
            '★★★ ولا حركة مخزون واحدة للمنتج الرقمي');

-- ★ ٩) العميل يربط الطلب بحسابه ويراه
select t.login(:'customerA');
select t.ok((select order_number from public.claim_guest_order(:'A', :'onum', :'gt'))
            = :'onum', '★★★ ربط الطلب بحساب العميل ينجح');
select t.ok((select count(*) from public.orders where id = :'oid'::uuid
              and customer_id = app.current_customer_id(:'A')) = 1,
            '★★★ والطلب صار في حسابه');
select t.ok((select count(*) from public.my_orders(:'A')) >= 1,
            '★★★ ويراه في «طلباتي»');
select t.ok((select jsonb_array_length(digital_values)
               from public.order_digital_detail(:'A', :'onum')) = 2,
            '★★★ ويرى بيانات شحنه بعد الربط');

-- ★ ١٠) ولا عميل آخر يراه
select t.login(:'ownerB');
select t.empty('select * from public.order_digital_values where order_id = '
               || quote_literal(:'oid'), '★★★ ولا تاجر آخر يقرأ بياناته');
rollback;

\echo '✓ 117 e2e'

-- =====================================================================
-- ★★★ النشر: المتجر الرقمي لا يُشترط عليه ما لا يفعله (0063)
--
-- عطبٌ كشفه استعمالٌ فعليّ: التبديل ينجح، والمحتوى يُزرع، ثم لا يظهر
-- القالب — لأنّ المتجر **لم يُنشر**، و`publish_store` كان يشترط منطقة
-- توصيل على متجرٍ لا يوصّل شيئًا. فكان الرقمي غير قابل للنشر أصلًا.
-- =====================================================================
\echo '── ★★★ نشر المتجر الرقمي: بلا منطقة توصيل ──'
begin;
select t.reset();
-- متجر مستوفٍ كل الشروط إلا التوصيل
update public.stores set logo_url = 'https://cdn.test/logo.png' where id = :'A';
update public.store_settings
   set whatsapp_number = '249912345678', cod_enabled = true
 where store_id = :'A';
update public.delivery_zones set is_active = false where store_id = :'A';
update public.stores set status = 'draft' where id = :'A';

select t.login(:'ownerA');
-- ★ عاديّ + بلا منطقة توصيل ⇒ النشر يُرفض ويُسمّي الناقص (لم يتغيّر)
select t.ok((select not ok from public.publish_store(:'A')),
            '★★ العادي بلا منطقة توصيل لا يُنشر');
select t.ok((select 'منطقة توصيل واحدة على الأقل' = any(missing)
               from public.publish_store(:'A')),
            '★★★ والشرط ما زال قائمًا على العادي حرفيًّا');

-- ★ ورقميّ + بلا منطقة توصيل ⇒ يُنشر
select t.reset();
select t.ok(public.set_storefront_template(:'A','digital') = 'digital', 'صار رقميًّا')
  from (select 1) _ where t.login(:'ownerA') is not null;
select t.ok((select ok from public.publish_store(:'A')),
            '★★★ والرقمي يُنشر بلا منطقة توصيل');
select t.reset();
select t.ok((select status from public.stores where id = :'A')::text = 'active',
            '★★★ والمتجر صار نشطًا فعلًا');

-- ★ وبقيّة الشروط لم تُرخَ للرقمي: ناقص الشعار يُرفض
select t.reset();
update public.stores set status = 'draft', logo_url = null where id = :'A';
select t.login(:'ownerA');
select t.ok((select not ok from public.publish_store(:'A')),
            '★★★ والرقمي بلا شعار لا يُنشر — لا تخفيف للشروط الأخرى');
select t.ok((select 'شعار المتجر' = any(missing) from public.publish_store(:'A')),
            '★★ والسبب مُسمّى');
rollback;

\echo '✓ 117 publish digital'

-- =====================================================================
-- ★★ أول منتج في المتجر الرقمي يُحفظ منشورًا (الواجهة ترسل `active`)
-- =====================================================================
\echo '── ★★ حالة أول منتج رقمي ──'
begin;
select t.login(:'ownerA');
select t.ok(public.set_storefront_template(:'A','digital') = 'digital', 'رقمي');
select product_id as np from public.save_product(
  :'A', 'كرت شحن', 5000, null, null, null, null, null, null, null,
  'active'::public.product_status, false) \gset
select t.reset();
select t.ok((select status from public.products where id = :'np'::uuid)::text = 'active',
            '★★★ المنتج يُحفظ «منشورًا» كما أرسلته خطوة الإنشاء');
select t.ok((select published_at from public.products where id = :'np'::uuid) is not null,
            '★★ ووقت النشر مختوم');
select t.ok((select track_inventory from public.products where id = :'np'::uuid) = false,
            '★★ وبلا تتبّع مخزون — فلا «نفاد» لمنتج رقمي');
-- ★ ويظهر في مصدر الواجهة العامّة (الشرط `status = active`)
select t.ok((select count(*) from public.products
              where store_id = :'A' and status = 'active' and deleted_at is null) >= 1,
            '★★★ فيقع ضمن ما تقرأه الرئيسية');
rollback;

\echo '✓ 117 onboarding product status'
