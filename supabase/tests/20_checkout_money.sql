\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set B b0000000-0000-0000-0000-00000000000b
\set P1 d1000000-0000-0000-0000-000000000001
\set PB d2000000-0000-0000-0000-000000000001
\set ownerA 11111111-1111-1111-1111-111111111111
\set custA  77777777-7777-7777-7777-777777777777

\echo '── حساب المبالغ خادميًا ──'

-- المثال المعتمد في المواصفات: 20,000 مع خصم 5,000 ⇒ 15,000
begin;
select t.login(:'custA');
with z as (select id from delivery_zones where store_id = :'A' and name = 'الخرطوم'),
     r as (
       select * from create_order(
         :'A',
         jsonb_build_array(jsonb_build_object('product_id', :'P1', 'quantity', 1)),
         (select id from z),
         '{"name":"عميل","phone":"0912345678"}'::jsonb,
         '{"line":"الخرطوم"}'::jsonb,
         'cash_on_delivery', 'SAVE5000', 'idem-test-1'
       )
     )
select t.ok((select total from r) = 17000,
            'الإجمالي = 20000 منتج + 2000 توصيل − 5000 خصم = 17000');

select t.ok((select subtotal = 20000 and delivery_fee = 2000 and discount_total = 5000
             from orders where idempotency_key = 'idem-test-1'),
            'كل مكوّنات المبلغ محسوبة من القاعدة');
rollback;

\echo '── منع التلاعب من العميل ──'
begin;
select t.login(:'custA');
-- العميل لا يملك أي طريقة لإرسال سعر أو رسوم: الدالة لا تقبل هذه الوسائط أصلًا
select t.ok((select count(*) = 0
             from information_schema.parameters
             where specific_schema='public'
               and specific_name like 'create_order%'
               and parameter_name in ('p_price','p_total','p_delivery_fee','p_discount')),
            'دالة إنشاء الطلب لا تقبل سعرًا ولا رسومًا ولا إجماليًا من العميل');

-- منطقة توصيل من متجر آخر ⇒ رفض
select t.throws(
  'select create_order(' || quote_literal(:'A') || ',' ||
  ' jsonb_build_array(jsonb_build_object(''product_id'', ' || quote_literal(:'P1') || ', ''quantity'', 1)),' ||
  ' (select id from delivery_zones where store_id = ' || quote_literal(:'B') || ' limit 1),' ||
  ' ''{"name":"x","phone":"0900000000"}''::jsonb, ''{}''::jsonb, ''cash_on_delivery'', null, ''idem-x1'')',
  'منطقة توصيل من متجر آخر مرفوضة');

-- منتج من متجر آخر ⇒ رفض
select t.throws(
  'select create_order(' || quote_literal(:'A') || ',' ||
  ' jsonb_build_array(jsonb_build_object(''product_id'', ' || quote_literal(:'PB') || ', ''quantity'', 1)),' ||
  ' null, ''{"name":"x","phone":"0900000000"}''::jsonb, ''{}''::jsonb, ''cash_on_delivery'', null, ''idem-x2'')',
  'منتج من متجر آخر مرفوض في طلب هذا المتجر');

-- كمية تفوق المخزون ⇒ رفض
select t.throws(
  'select create_order(' || quote_literal(:'A') || ',' ||
  ' jsonb_build_array(jsonb_build_object(''product_id'', ' || quote_literal(:'P1') || ', ''quantity'', 9999)),' ||
  ' null, ''{"name":"x","phone":"0900000000"}''::jsonb, ''{}''::jsonb, ''cash_on_delivery'', null, ''idem-x3'')',
  'كمية تفوق المخزون مرفوضة');

-- كوبون غير موجود ⇒ لا خصم (لا فشل)
select t.ok((select discount = 0 from validate_coupon(:'A', 'NOPE', 20000, null)),
            'كود خصم غير صالح لا يمنح خصمًا');
-- خصم ثابت لا يتجاوز المجموع
select t.ok((select discount = 1000 from validate_coupon(:'A','SAVE5000', 1000, null)),
            'الخصم الثابت لا يتجاوز مجموع السلة');
rollback;

\echo '── Idempotency: منع الطلبات المكررة ──'
begin;
select t.login(:'custA');
select create_order(:'A',
  jsonb_build_array(jsonb_build_object('product_id', :'P1', 'quantity', 1)),
  null, '{"name":"عميل","phone":"0912345678"}'::jsonb, '{}'::jsonb,
  'cash_on_delivery', null, 'same-key');
select create_order(:'A',
  jsonb_build_array(jsonb_build_object('product_id', :'P1', 'quantity', 1)),
  null, '{"name":"عميل","phone":"0912345678"}'::jsonb, '{}'::jsonb,
  'cash_on_delivery', null, 'same-key');
select t.reset();
select t.ok((select count(*) = 1 from orders where idempotency_key = 'same-key'),
            'الضغط المزدوج بنفس المفتاح ⇒ طلب واحد فقط');
rollback;

\echo '── آلة حالة الطلب ──'
begin;
select t.login(:'custA');
select create_order(:'A',
  jsonb_build_array(jsonb_build_object('product_id', :'P1', 'quantity', 2)),
  null, '{"name":"عميل","phone":"0912345678"}'::jsonb, '{}'::jsonb,
  'cash_on_delivery', null, 'sm-1');

select t.login(:'ownerA');
select t.throws('select transition_order((select id from orders where idempotency_key=''sm-1''), ''shipped'')',
                'قفزة new → shipped مرفوضة');
select t.throws('select transition_order((select id from orders where idempotency_key=''sm-1''), ''cancelled'')',
                'الإلغاء بلا سبب مرفوض');

select transition_order((select id from orders where idempotency_key='sm-1'), 'confirmed');
select transition_order((select id from orders where idempotency_key='sm-1'), 'preparing');
select transition_order((select id from orders where idempotency_key='sm-1'), 'shipped');
select transition_order((select id from orders where idempotency_key='sm-1'), 'completed');
select t.ok((select status = 'completed' from orders where idempotency_key='sm-1'),
            'المسار الكامل new→confirmed→preparing→shipped→completed');
select t.throws('select transition_order((select id from orders where idempotency_key=''sm-1''), ''cancelled'', ''محاولة'')',
                'completed حالة نهائية — لا انتقال منها');
select t.ok((select count(*) = 5 from order_status_history
             where order_id = (select id from orders where idempotency_key='sm-1')),
            'كل انتقال سُجّل في order_status_history');
select t.throws('update orders set status = ''new'' where idempotency_key = ''sm-1''',
                'تغيير الحالة مباشرة بـUPDATE مرفوض');
rollback;

\echo '── المخزون يتبع الحالة ──'
begin;
select t.login(:'custA');
select create_order(:'A',
  jsonb_build_array(jsonb_build_object('product_id', :'P1', 'quantity', 3)),
  null, '{"name":"ع","phone":"0912345678"}'::jsonb, '{}'::jsonb,
  'cash_on_delivery', null, 'inv-1');
select t.reset();
select t.ok((select reserved = 3 from inventory where product_id = :'P1'),
            'إنشاء الطلب يحجز المخزون ولا يخصمه');
select t.ok((select quantity = 50 from inventory where product_id = :'P1'),
            'الكمية لم تتغير عند الحجز');

select t.login(:'ownerA');
select transition_order((select id from orders where idempotency_key='inv-1'), 'confirmed');
select transition_order((select id from orders where idempotency_key='inv-1'), 'preparing');
select transition_order((select id from orders where idempotency_key='inv-1'), 'shipped');
select t.reset();
select t.ok((select quantity = 47 and reserved = 0 from inventory where product_id = :'P1'),
            'الشحن يخصم من الكمية ويفكّ الحجز');
select t.ok((select count(*) = 1 from inventory_movements
             where order_id = (select id from orders where idempotency_key='inv-1')
               and reason = 'order_placed'),
            'حركة مخزون مسجَّلة للطلب');
rollback;

\echo '── المخزون لا يُعدَّل مباشرة ──'
begin;
select t.login(:'ownerA');
select t.throws('update inventory set quantity = 99999 where product_id = ' || quote_literal(:'P1'),
                'تعديل الكمية مباشرة مرفوض — عبر الحركات فقط');
select t.throws('delete from inventory_movements where product_id = ' || quote_literal(:'P1'),
                'حذف حركة مخزون مرفوض (إلحاقي)');
rollback;

\echo '✓ اختبارات المال والطلبات مرّت'
