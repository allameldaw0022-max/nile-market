\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set B b0000000-0000-0000-0000-00000000000b
\set ownerA 11111111-1111-1111-1111-111111111111
\set ownerB 22222222-2222-2222-2222-222222222222
\set adminOwner 88888888-8888-8888-8888-888888888888
\set adminSup 99999999-9999-9999-9999-999999999999
\set adminFin aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
\set adminOps cccccccc-cccc-cccc-cccc-cccccccccccc
\set P1 9a000000-0000-0000-0000-00000000000a
\set zoneA d0000000-0000-0000-0000-0000000000a1

-- بيئة مشتركة: طلب مدفوع في متجر أ
\set prep 'insert into delivery_zones (id, store_id, name, fee) values (:\'zoneA\', :\'A\', ''منطقة'', 1000);'

\echo '── طريقة الدفع: الطرق الثلاث تُفحص لا COD وحده ──'
begin;
select t.reset();
insert into delivery_zones (id, store_id, name, fee)
values (:'zoneA', :'A', 'منطقة الاختبار', 1000);
update store_settings set cod_enabled = true, bank_transfer_enabled = false,
                          bankak_enabled = false
 where store_id = :'A';

select t.logout();
select t.throws($$select 1 from create_order(
  'a0000000-0000-0000-0000-00000000000a',
  jsonb_build_array(jsonb_build_object('product_id','d1000000-0000-0000-0000-000000000001','quantity',1)),
  'd0000000-0000-0000-0000-0000000000a1',
  jsonb_build_object('name','زبون','phone','0900000002'),
  jsonb_build_object('line1','عنوان'),
  'bank_transfer', null, 'pm-off-1')$$,
  '★★ طلب بتحويل بنكي على متجر أطفأه يُرفض (كان يمرّ)');

select t.throws($$select 1 from create_order(
  'a0000000-0000-0000-0000-00000000000a',
  jsonb_build_array(jsonb_build_object('product_id','d1000000-0000-0000-0000-000000000001','quantity',1)),
  'd0000000-0000-0000-0000-0000000000a1',
  jsonb_build_object('name','زبون','phone','0900000002'),
  jsonb_build_object('line1','عنوان'),
  'bankak', null, 'pm-off-2')$$,
  '★★ وكذلك بنكك');

select t.ok((select count(*) = 1 from create_order(
  :'A',
  jsonb_build_array(jsonb_build_object('product_id','d1000000-0000-0000-0000-000000000001','quantity',1)),
  :'zoneA',
  jsonb_build_object('name','زبون','phone','0900000002'),
  jsonb_build_object('line1','عنوان'),
  'cash_on_delivery', null, 'pm-on-1')),
  'والطريقة المفعّلة تمرّ');
rollback;

\echo '── الكوبون: حدّ «مرّة لكل عميل» يُفرض فعلًا ──'
begin;
select t.reset();
insert into delivery_zones (id, store_id, name, fee)
values (:'zoneA', :'A', 'منطقة الاختبار', 1000);
insert into coupons (id, store_id, code, type, value, usage_limit_per_customer)
values ('e9000000-0000-0000-0000-000000000009', :'A', 'ONCE', 'fixed', 1000, 1);
-- يحتاج عميلًا مسجَّلًا: الحدّ لكل عميل لا معنى له لزائر مجهول
insert into auth.users (id, email, email_confirmed_at)
values ('e5000000-0000-0000-0000-00000000000e', 'coupon@test.local', now());

select t.login('e5000000-0000-0000-0000-00000000000e');
\o /dev/null
select order_id from create_order(
  :'A',
  jsonb_build_array(jsonb_build_object('product_id','d1000000-0000-0000-0000-000000000001','quantity',1)),
  :'zoneA',
  jsonb_build_object('name','زبون','phone','0900000003'),
  jsonb_build_object('line1','عنوان'),
  'cash_on_delivery', 'ONCE', 'cp-1');
\o
select t.reset();
select t.ok((select discount_total = 1000 from orders where idempotency_key = 'cp-1'),
            'أول استخدام للكوبون يخصم');

select t.login('e5000000-0000-0000-0000-00000000000e');
\o /dev/null
select order_id from create_order(
  :'A',
  jsonb_build_array(jsonb_build_object('product_id','d1000000-0000-0000-0000-000000000001','quantity',1)),
  :'zoneA',
  jsonb_build_object('name','زبون','phone','0900000003'),
  jsonb_build_object('line1','عنوان'),
  'cash_on_delivery', 'ONCE', 'cp-2');
\o
select t.reset();
select t.ok((select discount_total = 0 from orders where idempotency_key = 'cp-2'),
            '★★ والاستخدام الثاني لنفس العميل لا يخصم (كان يخصم بلا حدّ)');
select t.ok((select count(*) = 1 from coupon_redemptions
             where coupon_id = 'e9000000-0000-0000-0000-000000000009'),
            'ولا يُسجَّل استخدام ثانٍ');
rollback;

\echo '── الكوبون: الحدّ الكلي يُعاد فحصه تحت قفل ──'
begin;
select t.reset();
insert into delivery_zones (id, store_id, name, fee)
values (:'zoneA', :'A', 'منطقة الاختبار', 1000);
insert into coupons (id, store_id, code, type, value, usage_limit_total)
values ('e9000000-0000-0000-0000-00000000000a', :'A', 'ONLYONE', 'fixed', 500, 1);

select t.logout();
select order_id as cord from create_order(
  :'A',
  jsonb_build_array(jsonb_build_object('product_id','d1000000-0000-0000-0000-000000000001','quantity',1)),
  :'zoneA',
  jsonb_build_object('name','زبون','phone','0900000005'),
  jsonb_build_object('line1','عنوان'),
  'cash_on_delivery', 'ONLYONE', 'lim-1')
\gset
select t.reset();
select t.ok((select discount_total = 500 from orders where idempotency_key = 'lim-1'),
            'أول استخدام يستهلك الحدّ الكلي');
select t.ok((select discount = 0 from validate_coupon(:'A', 'ONLYONE', 50000, null)),
            '★ ثم لا يُطبَّق الكوبون بعد بلوغ حدّه');

-- ★ الطلب الثاني يمرّ **بلا خصم** لا أن يُرفض: إلغاء طلب كامل لأن
-- كوبونًا نفد أسوأ من إتمامه بالسعر الكامل. والقفل على صفّ الكوبون
-- يجعل طلبين متزامنين يتسلسلان، فالثاني يرى استهلاك الأول ولا
-- يتجاوز الحدّ.
select t.logout();
\o /dev/null
select order_id from create_order(
  :'A',
  jsonb_build_array(jsonb_build_object('product_id','d1000000-0000-0000-0000-000000000001','quantity',1)),
  :'zoneA',
  jsonb_build_object('name','زبون','phone','0900000006'),
  jsonb_build_object('line1','عنوان'),
  'cash_on_delivery', 'ONLYONE', 'lim-2');
\o
select t.reset();
select t.ok((select discount_total = 0 and coupon_id is null
             from orders where idempotency_key = 'lim-2'),
            '★★ والطلب الثاني يمرّ بلا خصم — لا يتجاوز الحدّ ولا يُلغى');
select t.ok((select count(*) = 1 from coupon_redemptions
             where coupon_id = 'e9000000-0000-0000-0000-00000000000a'),
            '★ واستخدام واحد فقط مسجَّل');
rollback;

\echo '── الاسترداد: المسار كاملًا ──'
begin;
select t.reset();
insert into delivery_zones (id, store_id, name, fee)
values (:'zoneA', :'A', 'منطقة الاختبار', 1000);

select t.logout();
select order_id as oid from create_order(
  :'A',
  jsonb_build_array(jsonb_build_object('product_id','d1000000-0000-0000-0000-000000000001','quantity',1)),
  :'zoneA',
  jsonb_build_object('name','زبون','phone','0900000004'),
  jsonb_build_object('line1','عنوان'),
  'cash_on_delivery', null, 'rf-order-1')
\gset
select t.login(:'ownerA');
\o /dev/null
select record_payment('order', :'oid', 'cash_on_delivery', 21000, p_idempotency_key => 'rf-pay-1');
\o
select t.reset();
select id as payid from payments where order_id = :'oid'
\gset

-- الصلاحية
select t.logout();
select t.throws('select 1 from request_refund(' || quote_literal(:'payid') || ', 1000, ''سبب'')',
                '★ الزائر لا يطلب استردادًا');
select t.login(:'ownerB');
select t.throws('select 1 from request_refund(' || quote_literal(:'payid') || ', 1000, ''سبب'')',
                '★★ تاجر آخر لا يطلب استردادًا على دفعة متجر ليس له');

-- المبلغ
select t.login(:'ownerA');
select t.throws('select 1 from request_refund(' || quote_literal(:'payid') || ', 0, ''سبب'')',
                '★ مبلغ صفري يُرفض');
select t.throws('select 1 from request_refund(' || quote_literal(:'payid') || ', 99999, ''سبب'')',
                '★★ ومبلغ يتجاوز الدفعة يُرفض');
select t.throws('select 1 from request_refund(' || quote_literal(:'payid') || ', 1000, ''x'')',
                '★ وسبب أقصر من ثلاثة أحرف يُرفض');

select refund_id as rid from request_refund(:'payid', 5000, 'منتج تالف')
\gset
select t.reset();
select t.ok((select status = 'submitted' and initiated_by = :'ownerA'
             and initiated_by_kind = 'store' from refunds where id = :'rid'),
            'التاجر يبادر بطلب الاسترداد');

-- التكرار
select t.login(:'ownerA');
select refund_id as rid2 from request_refund(:'payid', 5000, 'منتج تالف', 'rf-key-x')
\gset
select refund_id as rid3 from request_refund(:'payid', 5000, 'منتج تالف', 'rf-key-x')
\gset
select t.ok(:'rid2' = :'rid3',
            '★★ نفس مفتاح التكرار يعيد الطلب نفسه لا طلبًا ثانيًا');
select t.reset();
select t.throws('delete from refunds where id = ' || quote_literal(:'rid2'),
                '★★ وجدول الاستردادات لا يقبل الحذف (سجل مالي)');

-- فصل المهام
select t.login(:'adminSup');
select t.throws('select review_refund(' || quote_literal(:'rid') || ', ''record'')',
                '★ موظف الدعم لا يسجّل استردادًا');

select t.login(:'adminFin');
select t.ok((select review_refund(:'rid', 'record') ->> 'status' = 'pending_review'),
            'موظف المالية يسجّل الطلب');
select t.throws('select review_refund(' || quote_literal(:'rid') || ', ''approve'')',
                '★★ ومن سجّله لا يعتمده (D30)');

select t.login(:'adminOwner');
select t.ok((select review_refund(:'rid', 'approve') ->> 'status' = 'approved'),
            'وموظف آخر يعتمده');
select t.reset();
select t.ok((select approved_by <> requested_by and approved_by <> initiated_by
             from refunds where id = :'rid'),
            '★★ والقيد في الجدول يضمن ثلاثة أطراف مختلفة');

-- الإتمام
select t.login(:'adminOwner');
select t.ok((select complete_refund(:'rid', 'REF-1') ->> 'status' = 'completed'),
            'والإتمام ينجح');
select t.reset();
select t.ok((select refunded_total = 5000 and payment_status = 'partially_refunded'
             from orders where id = :'oid'),
            '★★ وإجماليات الطلب تتحدّث (كان يبقى «مدفوعًا»)');
select t.ok((select count(*) = 1 from ledger_entries
             where refund_id = :'rid' and entry_type = 'refund' and direction = 'debit'),
            '★ وقيد الاسترداد يُكتب في الدفتر');

select t.login(:'adminOwner');
select t.ok((select complete_refund(:'rid') ->> 'already' = 'true'),
            '★ وإعادة الإتمام لا تُقيَّد مرّتين');
rollback;

\echo '── الاسترداد يعكس عمولة الشريك بالتناسب ──'
begin;
select t.reset();
select id as basicid from plans where code = 'basic'
\gset
select t.login(:'ownerA');
select request_id as reqid from submit_subscription_request(
  :'A', :'basicid', null, t.sub_proof(:'A'))
\gset
select t.login(:'adminFin');
\o /dev/null
select review_subscription_request(:'reqid', 'approve');
\o
select t.reset();
select id as subpay from payments where kind = 'subscription' and store_id = :'A'
\gset
select amount as comm from commission_ledger
 where partner_id = :'P1' and entry_kind = 'commission'
\gset
select t.ok(:'comm'::numeric > 0, 'عمولة الشريك مقيَّدة');

-- استرداد نصف الدفعة
select t.reset();
select amount as paidamt from payments where id = :'subpay'
\gset
select t.login(:'adminSup');
select t.throws('select 1 from request_refund(' || quote_literal(:'subpay')
                || ', 100, ''سبب'')',
                '★ موظف بلا payments:approve لا يطلب استرداد اشتراك');

select t.login(:'adminFin');
select refund_id as srid from request_refund(
  :'subpay', (:'paidamt'::numeric / 2), 'إلغاء اشتراك')
\gset
select t.login(:'adminOwner');
\o /dev/null
select review_refund(:'srid', 'record');
\o
select t.login(:'adminOps');
select t.throws('select review_refund(' || quote_literal(:'srid') || ', ''approve'')',
                '★ موظف بلا صلاحية الاعتماد يُرفض');
select t.login(:'adminSup');
select t.throws('select review_refund(' || quote_literal(:'srid') || ', ''approve'')',
                '★ وموظف الدعم كذلك');

-- adminFin بادر، adminOwner سجّل ⇒ يحتاج ثالثًا
select t.reset();
insert into admin_permissions (admin_member_id, section, level)
values ('ad000000-0000-0000-0000-00000000000d', 'payments', 'approve');
select t.login(:'adminOps');
select t.ok((select review_refund(:'srid', 'approve') ->> 'status' = 'approved'),
            'وطرف ثالث يعتمد');
\o /dev/null
select complete_refund(:'srid');
\o
select t.reset();
select t.ok((select count(*) = 1 from commission_ledger
             where refund_id = :'srid' and entry_kind = 'reversal'),
            '★★ وعمولة الشريك تُعكَس');
select t.ok((select amount = -(:'comm'::numeric / 2) from commission_ledger
             where refund_id = :'srid' and entry_kind = 'reversal'),
            '★★ بالتناسب: نصف الدفعة ⇒ نصف العمولة');
select t.ok((select count(*) = 2 from ledger_entries
             where refund_id = :'srid' and entry_type = 'commission_reversal'),
            '★ وقيدا الدفتر المتقابلان يُكتبان');
rollback;
select t.reset();

\echo '✓ اختبارات الاسترداد وإصلاحات الدفع مرّت'
