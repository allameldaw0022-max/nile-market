\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

-- =====================================================================
-- رحلة كاملة من الصفر: حساب جديد ⇒ متجر ⇒ منتج ⇒ سلة زائر ⇒ طلب ⇒
-- تحصيل ⇒ اشتراك ⇒ عمولة شريك ⇒ صرف.
--
-- ★ هذا اختبار شامل لطبقة البيانات والصلاحيات وتسلسل الحالات، وليس
-- اختبار HTTP: بيئة التنفيذ تمنع الاتصال المباشر بـSupabase
-- (403 CONNECT)، فمسار الشبكة والواجهة غير مشمول هنا.
-- =====================================================================

\set newOwner e1000000-0000-0000-0000-00000000000e
\set buyer    e2000000-0000-0000-0000-00000000000e
\set adminFin aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
\set adminOwner 88888888-8888-8888-8888-888888888888
\set adminOps cccccccc-cccc-cccc-cccc-cccccccccccc
\set P1 9a000000-0000-0000-0000-00000000000a

\echo '── ١) حساب جديد ينشئ متجرًا ──'
begin;
select t.reset();
insert into auth.users (id, email, email_confirmed_at) values
  (:'newOwner', 'e2e-owner@test.local', now()),
  (:'buyer',    'e2e-buyer@test.local', now());

select t.login(:'newOwner');
select store_id as sid, slug as sslug from create_store('متجر التجربة', 'e2e-shop')
\gset
select t.ok(:'sid' is not null, 'إنشاء المتجر ينجح');
select t.reset();
select t.ok((select owner_id = :'newOwner' and status = 'draft'
             from stores where id = :'sid'),
            '★ المتجر يبدأ مسودة بمالكه — لا نشرًا تلقائيًا');
select t.ok((select count(*) = 1 from store_members
             where store_id = :'sid' and profile_id = :'newOwner' and role = 'owner'),
            'والمالك عضو owner في فريقه');
select t.ok((select count(*) = 1 from store_domains
             where store_id = :'sid' and kind = 'subdomain' and is_primary),
            'ونطاق فرعي أساسي يُنشأ له');
select t.ok((select count(*) = 1 from subscriptions
             where store_id = :'sid'),
            '★ واشتراك مبدئي يُمنح فلا يبقى المتجر بلا خطة');

\echo '── ٢) منتج ومخزون ──'
select t.login(:'newOwner');
select product_id as pid from save_product(
  :'sid', 'قميص تجربة', 25000,
  p_sku => 'E2E-1', p_status => 'active',
  p_track_inventory => true, p_initial_quantity => 5)
\gset
select t.reset();
select t.ok((select status = 'active' and price = 25000
             from products where id = :'pid'),
            'المنتج يُحفظ منشورًا بسعره');
select t.ok((select quantity = 5 from inventory where product_id = :'pid'),
            'والمخزون الابتدائي يُقيَّد');

-- المتجر مسودة ⇒ لا يظهر للزائر
select t.logout();
select t.empty('select 1 from products where id = ' || quote_literal(:'pid'),
               '★★ منتج متجر لم يُنشر لا يراه الزائر');

\echo '── ٣) نشر المتجر ──'
-- ★ النشر الناقص يُرفض بقائمة صريحة لا برسالة عامة: التاجر يحتاج أن
-- يعرف ما ينقصه بالضبط.
select t.login(:'newOwner');
select t.ok((select not ok from publish_store(:'sid')),
            '★★ متجر ناقص المتطلبات لا يُنشر');
select t.ok((select 'شعار المتجر' = any(missing) from publish_store(:'sid')),
            'والنقص يُسمّى بالاسم');

select t.reset();
update stores set logo_url = 'https://cdn.test/logo.png' where id = :'sid';
insert into store_settings (store_id, cod_enabled, order_prefix, whatsapp_number)
values (:'sid', true, 'E', '249900000000')
on conflict (store_id) do update
  set cod_enabled = true, whatsapp_number = '249900000000';
insert into delivery_zones (store_id, name, fee) values (:'sid', 'الخرطوم', 3000);

select t.login(:'newOwner');
select ok as published from publish_store(:'sid')
\gset
select t.ok(:'published', 'النشر ينجح بعد اكتمال المتطلبات');
select t.reset();
select t.ok((select status = 'active' from stores where id = :'sid'),
            'والمتجر يصير نشطًا');
select t.logout();
select t.ok((select count(*) = 1 from products where id = :'pid'),
            'والآن يراه الزائر');

\echo '── ٤) سلة زائر ثم طلب ──'
select t.logout();
select cart_id as anoncart from cart_add_item(:'sid', :'pid', 2,
                                              p_anon_token => 'e2e-anon-token-0123456789')
\gset
select t.ok((select count(*) = 1 from get_cart(:'sid', 'e2e-anon-token-0123456789')),
            'الزائر يضيف إلى سلته بتوكن خادمي');
select t.ok((select line_total = 50000
             from get_cart(:'sid', 'e2e-anon-token-0123456789')),
            '★ والسعر يُقرأ من المنتج وقت العرض لا من صف السلة');

select t.empty('select 1 from get_cart(' || quote_literal(:'sid')
               || ', ''e2e-other-token-9876543210'')',
               '★★ توكن سلة آخر لا يفتح سلة غيره');
rollback;

\echo '── ٤ب) إتمام الطلب ──'
begin;
select t.reset();
insert into auth.users (id, email, email_confirmed_at) values
  (:'newOwner', 'e2e-owner@test.local', now());
select t.login(:'newOwner');
select store_id as sid from create_store('متجر التجربة', 'e2e-shop')
\gset
select product_id as pid from save_product(
  :'sid', 'قميص تجربة', 25000, p_sku => 'E2E-1', p_status => 'active',
  p_track_inventory => true, p_initial_quantity => 5)
\gset
select t.reset();
update stores set logo_url = 'https://cdn.test/logo.png' where id = :'sid';
insert into store_settings (store_id, cod_enabled, order_prefix, whatsapp_number)
values (:'sid', true, 'E', '249900000000')
on conflict (store_id) do update
  set cod_enabled = true, whatsapp_number = '249900000000';
insert into delivery_zones (store_id, name, fee) values (:'sid', 'الخرطوم', 3000);
select id as zid from delivery_zones where store_id = :'sid'
\gset
select t.login(:'newOwner');
\o /dev/null
select ok from publish_store(:'sid');
\o

select t.logout();
select order_id as oid, order_number as onum, guest_token as gtok from create_order(
  :'sid',
  jsonb_build_array(jsonb_build_object('product_id', :'pid', 'quantity', 2)),
  :'zid',
  jsonb_build_object('name', 'مشترٍ', 'phone', '0900000001'),
  jsonb_build_object('line1', 'شارع النيل'),
  'cash_on_delivery',
  p_idempotency_key => 'e2e-order-1')
\gset
select t.reset();
select t.ok((select total = 53000 and subtotal = 50000 and delivery_fee = 3000
             from orders where id = :'oid'),
            '★ الإجمالي يُحسب في القاعدة: ٥٠٠٠٠ + ٣٠٠٠ توصيل');
select t.ok((select quantity - reserved = 3 from inventory where product_id = :'pid'),
            '★★ والمخزون يُحجز فورًا فلا يُباع ما ليس موجودًا');

-- التكرار بنفس المفتاح لا ينشئ طلبًا ثانيًا
select t.logout();
select order_id as oid2 from create_order(
  :'sid',
  jsonb_build_array(jsonb_build_object('product_id', :'pid', 'quantity', 2)),
  :'zid',
  jsonb_build_object('name', 'مشترٍ', 'phone', '0900000001'),
  jsonb_build_object('line1', 'شارع النيل'),
  'cash_on_delivery',
  p_idempotency_key => 'e2e-order-1')
\gset
select t.ok(:'oid' = :'oid2',
            '★★ نفس مفتاح التكرار يعيد الطلب نفسه لا طلبًا ثانيًا');
select t.reset();
select t.ok((select count(*) = 1 from orders where store_id = :'sid'),
            'وطلب واحد فقط في القاعدة');

\echo '── ٥) الزائر يتتبّع طلبه ولا يرى غيره ──'
select t.logout();
select t.ok((select count(*) = 1 from track_order(:'sid', :'onum', '0900000001')),
            'التتبّع برقم الطلب والهاتف يعمل');
select t.empty('select 1 from track_order(' || quote_literal(:'sid') || ', '
               || quote_literal(:'onum') || ', ''0900000099'')',
               '★★ وهاتف خاطئ لا يكشف الطلب');
select t.ok((select count(*) = 1 from order_details(:'sid', :'onum', :'gtok')),
            'وتوكن الضيف يفتح تفاصيل طلبه');
select t.empty('select 1 from order_details(' || quote_literal(:'sid') || ', '
               || quote_literal(:'onum') || ', ''توكن-مزوّر'')',
               '★★ وتوكن مزوّر لا يفتح شيئًا');

\echo '── ٦) التاجر ينقل الطلب ويحصّل ──'
select t.login(:'newOwner');
select transition_order(:'oid', 'confirmed');
select transition_order(:'oid', 'preparing');
select t.throws('select transition_order(' || quote_literal(:'oid') || ', ''new'')',
                '★★ الرجوع إلى «جديد» مرفوض — آلة الحالة لا تُعكس');

\o /dev/null
select record_payment('order', :'oid', 'cash_on_delivery', 53000,
                      p_idempotency_key => 'e2e-pay-1');
\o
select t.reset();
select t.ok((select payment_status = 'paid' and paid_total = 53000
             from orders where id = :'oid'),
            '★ التحصيل يحدّث حالة الدفع والمبلغ المحصَّل');
select t.ok((select count(*) = 1 from payments
             where order_id = :'oid' and status = 'paid'),
            'ودفعة الطلب تُقيَّد');
-- ★ دفتر المنصة يخصّ مال المنصة: دفعة الطلب بين الزبون والتاجر ولا
-- تدخله. خلطهما كان سيجعل «إيراد المنصة» يساوي مبيعات كل المتاجر.
select t.empty('select 1 from ledger_entries where payment_id = (select id from payments where order_id = ' || quote_literal(:'oid') || ')',
               '★★ ودفعة الطلب لا تدخل دفتر المنصة');

select t.login(:'newOwner');
select transition_order(:'oid', 'shipped');
select transition_order(:'oid', 'completed');
select t.reset();
select t.ok((select status = 'completed' and completed_at is not null
             from orders where id = :'oid'),
            'والطلب يكتمل');
select t.ok((select quantity = 3 from inventory where product_id = :'pid'),
            '★ والحجز يتحوّل خصمًا فعليًا من المخزون');
rollback;

\echo '── ٧) اشتراك مدفوع بإحالة شريك ثم صرف (D18 · D30) ──'
begin;
select t.reset();
-- سعر الباقة غير مضبوط ⇒ لا تُباع (D18)
update plans set price_configured_at = null where code = 'basic';
select id as basicid from plans where code = 'basic'
\gset
select t.login('11111111-1111-1111-1111-111111111111');
select t.throws('select 1 from submit_subscription_request('
                || quote_literal('a0000000-0000-0000-0000-00000000000a') || ', '
                || quote_literal(:'basicid') || ')',
                '★★ باقة لم يُضبط سعرها لا تُباع (D18)');
rollback;

begin;
select t.reset();
select id as basicid from plans where code = 'basic'
\gset
select t.login('11111111-1111-1111-1111-111111111111');
select request_id as reqid from submit_subscription_request(
  'a0000000-0000-0000-0000-00000000000a', :'basicid', 'E2E-REF')
\gset
select t.login(:'adminFin');
select t.ok((select review_subscription_request(:'reqid', 'approve') ->> 'status'
             = 'approved'),
            'الإدارة تعتمد الطلب');
select t.reset();
select t.ok((select status = 'active' from subscriptions
             where store_id = 'a0000000-0000-0000-0000-00000000000a'),
            '★ والاشتراك يُفعَّل');
select t.ok((select count(*) = 1 from commission_ledger
             where partner_id = :'P1' and entry_kind = 'commission'),
            '★ وعمولة الشريك المُحيل تُقيَّد تلقائيًا');

select payable as due from partner_balances where partner_id = :'P1'
\gset
select t.ok(:'due'::numeric > 0, 'ويصير للشريك رصيد مستحق');

-- الشريك يطلب الصرف
select t.login('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select payout_id as pid from request_partner_payout(
  :'due'::numeric, 'طلب تجربة', 'e2e-payout-1')
\gset
select t.reset();
select t.ok((select status = 'submitted' and initiated_by is not null
             from partner_payouts where id = :'pid'),
            'الطلب يُسجَّل باسم من بادر به');

-- ★ فصل المهام: من سجّل لا يعتمد
select t.login(:'adminFin');
\o /dev/null
select review_payout(:'pid', 'record');
\o
select t.throws('select review_payout(' || quote_literal(:'pid') || ', ''approve'')',
                '★★ من سجّل الطلب إداريًا لا يعتمده (D30)');

select t.login(:'adminOwner');
select t.ok((select review_payout(:'pid', 'approve') ->> 'status' = 'approved'),
            'وموظف آخر يعتمده');
select t.reset();
select t.ok((select approved_by <> requested_by from partner_payouts where id = :'pid'),
            '★★ والقيد في الجدول يضمن اختلاف المعتمِد عن المسجِّل');

select t.login(:'adminOwner');
\o /dev/null
select mark_payout_paid(:'pid', 'HAWALA-1');
\o
select t.reset();
select t.ok((select status = 'paid' and paid_at is not null
             from partner_payouts where id = :'pid'),
            'والصرف يُختم');
select t.ok((select paid > 0 from partner_balances where partner_id = :'P1'),
            '★ ورصيد الشريك ينتقل من «مستحق» إلى «مصروف»');
rollback;
select t.reset();

\echo '✓ الرحلة الكاملة مرّت'
