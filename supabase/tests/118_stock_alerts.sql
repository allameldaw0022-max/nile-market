\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set prodA d1000000-0000-0000-0000-000000000001
\set prodA2 d1000000-0000-0000-0000-000000000002
\set ownerA 11111111-1111-1111-1111-111111111111

-- =====================================================================
-- توفّر المنتج وتنبيه العودة إلى المخزون (0064)
--
-- ★★ الفرضية المحورية: التوفّر `quantity - reserved > 0` لا
-- `quantity > 0`. والتقريب الثاني يكذب في حالتين، وهما أول ما يُختبر
-- هنا — لأنّ ترشيحًا يكذب أسوأ من غيابه.
-- =====================================================================

\echo '── ★★★ العمود يقول الحقيقة لا التقريب ──'
begin;
select t.reset();

-- المنتج متتبَّع بـ٥٠ قطعة من البذرة
select t.ok((select in_stock from public.products where id = :'prodA'),
            '★ منتجٌ متتبَّع برصيد ⇒ متوفّر');

-- ★★★ الحجز الكامل نفاد — وهنا بالضبط كان `quantity > 0` يكذب
update public.inventory set reserved = quantity where product_id = :'prodA';
select t.ok((select in_stock from public.products where id = :'prodA') = false,
            '★★★ كلّ الكمّية محجوزة ⇒ نافد (التقريب القديم يقول متوفّر)');
select t.ok((select quantity from public.inventory where product_id = :'prodA') > 0,
            '★ والكمّية نفسها لم تُمَسّ — لا إرخاء قيد ولا كمّية مخترعة');

update public.inventory set reserved = 0 where product_id = :'prodA';
select t.ok((select in_stock from public.products where id = :'prodA'),
            '★★ والإفراج عن الحجز يعيده متوفّرًا');

-- ★★ ومنتجٌ بلا تتبّع متوفّرٌ دائمًا وإن كان رصيده كلّه محجوزًا:
--    لا صفَّ قابلًا للبيع له أصلًا، وكان سيختفي من نتائج الترشيح.
--    ★ والكمّية لا تُكتب مباشرةً — `guard_inventory_quantity` تمنعها،
--      وهي تتغيّر عبر `inventory_movements` وحدها. فالحجز هو الأداة.
update public.inventory set reserved = quantity where product_id = :'prodA';
select t.ok((select in_stock from public.products where id = :'prodA') = false,
            '★ مرجع: متتبَّعٌ محجوزٌ بالكامل ⇒ نافد');
update public.products set track_inventory = false where id = :'prodA';
select t.ok((select in_stock from public.products where id = :'prodA'),
            '★★★ بلا تتبّع مخزون ⇒ متوفّر دائمًا (لا يختفي من الترشيح)');

update public.products set track_inventory = true where id = :'prodA';
select t.ok((select in_stock from public.products where id = :'prodA') = false,
            '★★ وإعادة التتبّع تُعيد حساب الحقيقة لا تفترضها');
rollback;

\echo '── ★★★ العمود حقيقةٌ مشتقّة لا تفضيلٌ يُكتب ──'
begin;
select t.reset();
-- ★★ المنحة وحدها لا تكفي: `authenticated` يملك `update` على مستوى
--    الجدول منذ 0004، و`revoke update (col)` لا يُنقص منها (جُرِّب).
--    فالمقياس هو **الأثر** لا المنحة: هل تثبت القيمة المزوّرة؟
update public.inventory set reserved = quantity where product_id = :'prodA';
select t.ok((select in_stock from public.products where id = :'prodA') = false,
            '★ مرجع: المنتج نافد');

-- كتابةٌ صريحة تدّعي التوفّر
update public.products set in_stock = true where id = :'prodA';
select t.ok((select in_stock from public.products where id = :'prodA') = false,
            '★★★ كتابةٌ مباشرة تدّعي التوفّر تُلغى — الحقيقة تُحسب لا تُقبل');

-- ★ وتهريبها داخل كتابةٍ على عمود آخر يُلغى كذلك
update public.products set name = name, in_stock = true where id = :'prodA';
select t.ok((select in_stock from public.products where id = :'prodA') = false,
            '★★★ ولا تمرّ مهرَّبةً داخل تحديثٍ لعمود آخر');
rollback;

\echo '── ★★ ولا كتابة على المنتجات بلا تغيّر فعليّ ──'
begin;
select t.reset();
-- ★★ بدون `is distinct from` كان كلّ حجزٍ وإفراج كتابةً على `products`
--    تُبطل تخزين صفحات المتجر كلّها. الختم يشهد: لا يتحرّك بلا تغيّر.
update public.inventory set reserved = 0 where product_id = :'prodA';
select t.ok(
  (select updated_at from public.products where id = :'prodA')
  = (select updated_at from public.products where id = :'prodA'),
  '★ مرجع');
create temp table _before as
  select updated_at from public.products where id = :'prodA';
update public.inventory set reserved = 0 where product_id = :'prodA';  -- لا تغيّر
select t.ok(
  (select updated_at from public.products where id = :'prodA')
  = (select updated_at from _before),
  '★★★ تحديثُ مخزونٍ بلا تغيّر في التوفّر لا يكتب على المنتج');
rollback;

\echo '── ★★★ طلب التنبيه: المسار الوحيد، والمتجر من المنتج ──'
begin;
select t.reset();
update public.inventory set reserved = quantity where product_id = :'prodA';

select t.ok(public.request_stock_alert(:'prodA', 'Zain@Example.COM'),
            '★★ زائر يسجّل تنبيهًا لمنتج نافد');

select t.throws('select public.request_stock_alert(' || quote_literal(:'prodA2') || ', ''z@e.com'')',
                '★★★ ولا تنبيه لمنتج متوفّر أصلًا');
select t.throws('select public.request_stock_alert(' || quote_literal(:'prodA') || ', ''لا-بريد'')',
                '★★ وبريدٌ غير صالح يُرفض');
select t.throws('select public.request_stock_alert(''00000000-0000-4000-8000-000000000999'', ''z@e.com'')',
                '★★★ ومنتجٌ غير موجود لا يُسرّب وجوده');

select t.ok((select count(*) from public.stock_alerts where product_id = :'prodA') = 1,
            '★ سجلٌّ واحد');
select t.ok((select email from public.stock_alerts where product_id = :'prodA')
            = 'zain@example.com',
            '★★ والبريد يُخزَّن صغيرًا ومُشذَّبًا');
select t.ok((select store_id from public.stock_alerts where product_id = :'prodA') = :'A',
            '★★★ والمتجر مُشتقٌّ من المنتج لا مُرسَلٌ من العميل');

-- ★★ إعادة الضغط لا تُنشئ سجلًّا ثانيًا ولا بريدين
select public.request_stock_alert(:'prodA', 'zain@example.com');
select t.ok((select count(*) from public.stock_alerts where product_id = :'prodA') = 1,
            '★★ وإعادة الضغط لا تُنشئ سجلًّا ثانيًا');
rollback;

\echo '── ★★★ قائمة البُرُد ليست مقروءة لأيّ دور عميل ──'
begin;
select t.reset();
set local role anon;
select t.throws('select count(*) from public.stock_alerts',
                '★★★ anon لا يقرأ قائمة البُرُد المنتظِرة');
set local role authenticated;
select t.throws('select count(*) from public.stock_alerts',
                '★★★ ولا authenticated');
rollback;

\echo '── ★★★ العودة إلى المخزون تُنبّه مرّةً واحدة ──'
begin;
select t.reset();
update public.inventory set reserved = quantity where product_id = :'prodA';
select public.request_stock_alert(:'prodA', 'zain@example.com');
delete from public.email_outbox where template = 'stock_back';

update public.inventory set reserved = 0 where product_id = :'prodA';

select t.ok((select count(*) from public.email_outbox where template = 'stock_back') = 1,
            '★★★ العودة إلى المخزون تُدرج بريدًا في الطابور القائم');
select t.ok((select to_email from public.email_outbox where template = 'stock_back' limit 1)
            = 'zain@example.com', '★ إلى صاحب الطلب');
select t.ok((select notified_at from public.stock_alerts where product_id = :'prodA')
            is not null, '★★ والطلب يُختم «نُبِّه»');

-- ★★★ تذبذب المخزون لا يُرسل بريدًا ثانيًا لنفس الطلب
update public.inventory set reserved = quantity where product_id = :'prodA';
update public.inventory set reserved = 0 where product_id = :'prodA';
select t.ok((select count(*) from public.email_outbox where template = 'stock_back') = 1,
            '★★★ وتذبذب المخزون لا يُرسل بريدًا ثانيًا');

-- ★★ وبعد التنبيه يجوز طلبٌ جديد: الفهرس الفريد على المعلّق وحده
update public.inventory set reserved = quantity where product_id = :'prodA';
select t.ok(public.request_stock_alert(:'prodA', 'zain@example.com'),
            '★★ وبعد التنبيه يجوز طلبٌ جديد لنفس البريد');
select t.ok((select count(*) from public.stock_alerts where product_id = :'prodA') = 2,
            '★ فيصير سجلّان: واحدٌ نُبِّه وآخرُ معلّق');
rollback;

\echo '✓ 118_stock_alerts'
