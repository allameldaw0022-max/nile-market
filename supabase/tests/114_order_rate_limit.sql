\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set P1 d1000000-0000-0000-0000-000000000001

-- =====================================================================
-- حدّ إنشاء الطلبات — إغراق فعلي، لا وصف للحدّ
--
-- ★ هذا الملف موجود لأنّ الحدّ الذي أضافته 0052 كان يمرّ على
--   اختبارات 113 كاملةً وهو **معطوب**: 113 تتحقّق من وجود المحفّز
--   ومن أنّ `check_rate_limit` محجوبة عن الزائر، ولم تُجرِ إغراقًا
--   حقيقيًا من زائرٍ بلا حساب. فمرّ حدٌّ لا يحدّ شيئًا.
--   لذلك تُقاس هنا **النتيجة** (هل يُرفض السادس؟) لا البنية.
-- =====================================================================

-- الزائر لا يملك SELECT على `orders`، فالعدّ يلي `t.reset()` دائمًا.
\echo '── ★★★ إغراق الطلبات من زائر بلا حساب ──'
begin;
select t.logout();
-- ★ مفتاح idempotency جديد في كل نداء: هذا بالضبط ما يفعله المهاجم،
--   وهو سبب أنّ المفتاح يمنع التكرار لا الإغراق.
select t.ok((select count(*) = 5 from (
  select create_order(:'A',
    jsonb_build_array(jsonb_build_object('product_id', :'P1', 'quantity', 1)),
    (select id from delivery_zones where store_id = :'A' and name = 'الخرطوم'),
    '{"name":"مهاجم","phone":"0999000111"}'::jsonb, '{"line":"الخرطوم"}'::jsonb,
    'cash_on_delivery', null, 'flood-' || g)
  from generate_series(1, 5) g) x),
  '★★★ الخمسة الأولى تُقبل: الحدّ لا يعاقب الشراء الطبيعي');

select t.throws(
  'select create_order(' || quote_literal(:'A') || ','
  || 'jsonb_build_array(jsonb_build_object(''product_id'', ' || quote_literal(:'P1') || ', ''quantity'', 1)),'
  || '(select id from delivery_zones where store_id = ' || quote_literal(:'A') || ' and name = ''الخرطوم''),'
  || '''{"name":"مهاجم","phone":"0999000111"}''::jsonb, ''{"line":"الخرطوم"}''::jsonb,'
  || '''cash_on_delivery'', null, ''flood-6'')',
  '★★★ والسادس يُرفض — لا يُفرِغ المخزون ولا يحرق حصّة الباقة');

select t.reset();
select t.ok((select count(*) = 5 from orders
             where store_id = :'A' and contact_phone = '0999000111'),
            '★★★ ولا صفّ سادس بقي في الجدول');
rollback;

\echo '── ★★★ الدلو مبنيّ على هويّة ثابتة لا على توكن الطلب ──'
begin;
select t.logout();
select t.ok((select count(*) = 3 from (
  select create_order(:'A',
    jsonb_build_array(jsonb_build_object('product_id', :'P1', 'quantity', 1)),
    (select id from delivery_zones where store_id = :'A' and name = 'الخرطوم'),
    '{"name":"زائر","phone":"0999000222"}'::jsonb, '{"line":"الخرطوم"}'::jsonb,
    'cash_on_delivery', null, 'bucket-' || g)
  from generate_series(1, 3) g) x),
  'ثلاثة طلبات من نفس الزائر تحت الحدّ');

select t.reset();
-- ★ الخطأ الذي أُصلح في 0054: `guest_token` عشوائي لكل طلب، فلو كان
--   هو المميِّز لَظهرت ثلاثة دلاء بعدّاد ١ بدل دلوٍ بعدّاد ٣.
select t.ok((select count(distinct guest_token) = 3 from orders
             where store_id = :'A' and contact_phone = '0999000222'),
            'كل طلب يحمل توكنًا مختلفًا (توكن متابعة، لا هويّة)');
select t.ok((select count(*) = 1 from public.rate_limit_counters
             where bucket = 'order:' || :'A' || ':0999000222'),
            '★★★ ومع ذلك: دلوٌ واحد فقط لكل الطلبات الثلاثة');
select t.ok((select count from public.rate_limit_counters
             where bucket = 'order:' || :'A' || ':0999000222') = 3,
            '★★★ وعدّاده ٣ — أي أنّه يتراكم فعلًا');
rollback;

\echo '── الحدّ لا يعاقب من لا يستحقّ ──'
begin;
select t.logout();
-- ثمانية زبائن مختلفين على نفس المتجر: لا يحجب أحدهم الآخر
select t.ok((select count(*) = 8 from (
  select create_order(:'A',
    jsonb_build_array(jsonb_build_object('product_id', :'P1', 'quantity', 1)),
    (select id from delivery_zones where store_id = :'A' and name = 'الخرطوم'),
    jsonb_build_object('name', 'زبون', 'phone', '09990003' || lpad(g::text, 2, '0')),
    '{"line":"الخرطوم"}'::jsonb, 'cash_on_delivery', null, 'many-' || g)
  from generate_series(1, 8) g) x),
  'ثمانية زبائن مختلفين يشترون بلا حجب: الدلو لكل هويّة لا للمتجر');
rollback;

begin;
select t.logout();
-- ★ إعادة المحاولة عند انقطاع الشبكة: نفس المفتاح ⇒ نفس الطلب، ولا
--   تُحسب من الحصّة (المحفّز AFTER، والفهرس الفريد يسبقه).
select t.ok((select count(distinct x.create_order::text) = 1 from (
  select create_order(:'A',
    jsonb_build_array(jsonb_build_object('product_id', :'P1', 'quantity', 1)),
    (select id from delivery_zones where store_id = :'A' and name = 'الخرطوم'),
    '{"name":"زائر","phone":"0999000444"}'::jsonb, '{"line":"الخرطوم"}'::jsonb,
    'cash_on_delivery', null, 'retry-same')
  from generate_series(1, 7) g) x),
  'سبع محاولات بنفس المفتاح ⇒ نفس الطلب يُعاد (idempotency)');

select t.reset();
select t.ok((select count(*) = 1 from orders
             where store_id = :'A' and contact_phone = '0999000444'),
            'وصفٌّ واحد في الجدول');
select t.ok((select count from public.rate_limit_counters
             where bucket = 'order:' || :'A' || ':0999000444') = 1,
            'ولا تستهلك من الحصّة إلا واحدة — لا يُعاقَب على شبكة متقطّعة');
rollback;

\echo '── طلبات اللوحة من التاجر ليست طلبات زائر ──'
begin;
-- الإدراج المباشر ممنوع على `authenticated` أيضًا (منح مسحوبة في 0052)،
-- فيُحاكى مسار اللوحة بدور الخادم — والمحفّز يقرأ `placed_via` لا الدور.
insert into public.orders
  (store_id, order_number, contact_name, contact_phone, placed_via,
   payment_method, subtotal, total, idempotency_key)
select :'A', 'DASH-' || g, 'زبون هاتفي', '0999000555', 'dashboard',
       'cash_on_delivery', 20000, 20000, 'dash-' || g
from generate_series(1, 9) g;
select t.ok((select count(*) = 9 from orders
             where store_id = :'A' and contact_phone = '0999000555'),
            'تسعة طلبات من لوحة التاجر تمرّ: هو صاحب المتجر لا زائر');
select t.ok((select count(*) = 0 from public.rate_limit_counters
             where bucket = 'order:' || :'A' || ':0999000555'),
            'ولا دلو أصلًا لها');
rollback;
