\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set B b0000000-0000-0000-0000-00000000000b
\set ownerA 11111111-1111-1111-1111-111111111111
\set ownerB 22222222-2222-2222-2222-222222222222
\set ordersA 44444444-4444-4444-4444-444444444444
\set C1 e1000000-0000-0000-0000-000000000001

\echo '── كود الخصم: الإنشاء يعمل فعلًا (العطل الذي أوقف الميزة منذ الإطلاق) ──'
begin;
select t.login(:'ownerA');
select t.ok((select count(*) = 1 from public.save_coupon(
               :'A', 'eid2026', 'percentage', 15,
               p_max_discount_amount => 9000)),
            '★★★ التاجر ينشئ كودًا نشطًا — كان يفشل بـ«خطأ غير متوقع»');
select t.ok((select code = 'EID2026' and is_active and value = 15
               and max_discount_amount = 9000
             from public.coupons where store_id = :'A' and code = 'EID2026'),
            'والكود يُطبَّع إلى الحروف الكبيرة بقيمه كما أُرسلت');
rollback;

\echo '── سقف الخصم لا يُحفظ مع خصم ثابت ──'
begin;
select t.login(:'ownerA');
select t.ok((select count(*) = 1 from public.save_coupon(
               :'A', 'FLAT100', 'fixed', 1000, p_max_discount_amount => 500)),
            'كودٌ ثابت بسقفٍ مُرسَل يُقبل');
select t.ok((select max_discount_amount is null from public.coupons
             where store_id = :'A' and code = 'FLAT100'),
            'سقفٌ لا معنى له مع خصم ثابت لا يُحفظ فيكذب على التاجر لاحقًا');
rollback;

\echo '── الجدار: لا كتابة مباشرة تتجاوز الدالّة والحدّ ──'
begin;
select t.login(:'ownerA');
select t.throws(
  'insert into coupons (store_id, code, type, value) values ('
  || quote_literal(:'A') || ', ''DIRECT1'', ''fixed'', 1000)',
  '★★★ الإدراج المباشر في coupons مرفوض — منحة INSERT مسحوبة');
rollback;

\echo '── حدّ الباقة يُفرض عند الإنشاء ──'
begin;
select t.reset();
-- البذرة فيها كودٌ نشط واحد؛ نجعل الحدّ واحدًا فيصير المتجر على الحافّة.
update plan_entitlements set limit_value = 1, configured_at = now()
 where feature_key = 'coupons.max_active'
   and plan_id = (select plan_id from subscriptions where store_id = :'A');
select t.login(:'ownerA');
select t.throws(
  'select public.save_coupon(' || quote_literal(:'A')
  || ', ''OVERLIMIT'', ''fixed'', 1000)',
  '★★ كودٌ نشط فوق الحدّ يُرفض — الحدّ لم يكن مفروضًا في القاعدة إطلاقًا');
select t.ok((select count(*) = 1 from public.save_coupon(
               :'A', 'DRAFTONE', 'fixed', 1000, p_is_active => false)),
            'وكودٌ معطّل يُقبل: لا يزيد عدد النشطة');
rollback;

\echo '── وعند التفعيل لاحقًا — الباب الخلفي نفسه ──'
begin;
select t.reset();
update plan_entitlements set limit_value = 1, configured_at = now()
 where feature_key = 'coupons.max_active'
   and plan_id = (select plan_id from subscriptions where store_id = :'A');
insert into public.coupons (id, store_id, code, type, value, is_active)
values ('e1000000-0000-0000-0000-0000000000ff', :'A', 'SLEEPER', 'fixed', 1000, false);
select t.login(:'ownerA');
select t.throws(
  'select public.set_coupon_active(' || quote_literal(:'A')
  || ', ''e1000000-0000-0000-0000-0000000000ff'', true)',
  '★★ إحياء كودٍ معطّل فوق الحدّ يُرفض — لا تُجمع أكوادٌ معطّلة ثم تُفعَّل');
-- وتعطيلُ النشط يفرّغ مكانًا فيُقبل الإحياء: الحدّ عدٌّ لا منعٌ أبديّ.
select public.set_coupon_active(:'A', :'C1', false);
select public.set_coupon_active(:'A', 'e1000000-0000-0000-0000-0000000000ff', true);
select t.ok((select is_active from public.coupons
             where id = 'e1000000-0000-0000-0000-0000000000ff'),
            'وبعد تعطيل كودٍ نشط يُقبل الإحياء');
rollback;

\echo '── وتعديل كودٍ نشط على الحافّة لا يُرفض ──'
begin;
select t.reset();
update plan_entitlements set limit_value = 1, configured_at = now()
 where feature_key = 'coupons.max_active'
   and plan_id = (select plan_id from subscriptions where store_id = :'A');
select t.login(:'ownerA');
select t.ok((select count(*) = 1 from public.save_coupon(
               :'A', 'SAVE5000', 'fixed', 7000, p_coupon_id => :'C1')),
            'التعديل يمرّ');
select t.ok((select value = 7000 from public.coupons where id = :'C1'),
            '★ التاجر يصحّح كوده القائم وهو على الحدّ — التعديل لا يزيد العدد');
rollback;

\echo '── الصلاحية والعزل ──'
begin;
select t.login(:'ordersA');
select t.throws(
  'select public.save_coupon(' || quote_literal(:'A') || ', ''NOPE1'', ''fixed'', 1000)',
  'موظّف الطلبات بلا coupons:manage يُرفض');
select t.login(:'ownerB');
select t.throws(
  'select public.save_coupon(' || quote_literal(:'A') || ', ''NOPE2'', ''fixed'', 1000)',
  '★★★ تاجر آخر لا يكتب كودًا في متجرٍ ليس له');
select t.throws(
  'select public.set_coupon_active(' || quote_literal(:'A') || ', '
  || quote_literal(:'C1') || ', false)',
  'ولا يعطّل كود متجرٍ ليس له');
select t.logout();
select t.throws(
  'select public.save_coupon(' || quote_literal(:'A') || ', ''ANON1'', ''fixed'', 1000)',
  'والزائر لا ينفّذ الدالّة أصلًا');
rollback;

\echo '── التحقّق في القاعدة لا في المتصفّح ──'
begin;
select t.login(:'ownerA');
select t.throws(
  'select public.save_coupon(' || quote_literal(:'A') || ', ''خصم'', ''fixed'', 1000)',
  'كودٌ غير لاتينيّ يُرفض');
select t.throws(
  'select public.save_coupon(' || quote_literal(:'A') || ', ''AB'', ''fixed'', 1000)',
  'وكودٌ أقصر من ثلاث خانات');
select t.throws(
  'select public.save_coupon(' || quote_literal(:'A') || ', ''ZERO1'', ''fixed'', 0)',
  'وقيمة خصمٍ صفر');
select t.throws(
  'select public.save_coupon(' || quote_literal(:'A') || ', ''BIG1'', ''percentage'', 120)',
  'ونسبةٌ فوق المئة');
select t.throws(
  'select public.save_coupon(' || quote_literal(:'A') || ', ''DATE1'', ''fixed'', 1000,'
  || ' p_starts_at => now() + interval ''2 days'', p_ends_at => now())',
  'ونهايةٌ قبل البداية');
select t.throws(
  'select public.save_coupon(' || quote_literal(:'A') || ', ''save5000'', ''fixed'', 1000)',
  'وكودٌ مكرّر في المتجر نفسه (ولو بحالة أحرف مختلفة)');
rollback;
