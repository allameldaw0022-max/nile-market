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
\set managerA 33333333-3333-3333-3333-333333333333

-- =====================================================================
-- تقييم المنتجات — «لا تقييم بلا شراء» مفروضة في القاعدة
-- =====================================================================


\echo '── ★★★ لا تقييم بلا شراء ──'
begin;
select t.login(:'customerA');
select t.throws('select public.submit_product_review(' || quote_literal(:'prodA') || ', 5)',
                '★★★ من لم يشترِ لا يُقيّم');
select t.ok((select can_review from public.product_review_state(:'prodA')) = false,
            'وحالة الصفحة تقول ذلك');
select t.ok((select reason from public.product_review_state(:'prodA')) = 'not_purchased',
            'بسبب واضح للواجهة');
rollback;

\echo '── ★★★ ولا تقييم من طلب لم يصل بعد ──'
begin;
select t.reset();
select t.buy(:'A', :'customerA', :'prodA', 'new');
select t.login(:'customerA');
select t.throws('select public.submit_product_review(' || quote_literal(:'prodA') || ', 5)',
                '★★★ طلب جديد ليس شراءً مكتملًا');
rollback;

begin;
select t.reset();
select t.buy(:'A', :'customerA', :'prodA', 'cancelled');
select t.login(:'customerA');
select t.throws('select public.submit_product_review(' || quote_literal(:'prodA') || ', 5)',
                '★★★ والطلب الملغى ليس شراءً');
rollback;

\echo '── الشراء الفعلي يفتح التقييم ──'
begin;
select t.reset();
select t.buy(:'A', :'customerA', :'prodA');
select t.login(:'customerA');
select t.ok((select can_review from public.product_review_state(:'prodA')) = true,
            'المشتري يستطيع التقييم');
select t.ok((select review_id from public.submit_product_review(:'prodA', 4, 'ممتاز')) is not null,
            'والتقييم يُكتب');
-- ★ الأعمدة الشخصية محجوبة بالمنح، فالتأكّد منها يحتاج تجاوز الأدوار
select t.reset();
select t.ok((select rating from public.product_reviews
              where product_id = :'prodA' and profile_id = :'customerA') = 4,
            'بالنجوم التي أرسلها');
select t.ok((select order_id from public.product_reviews
              where product_id = :'prodA') is not null,
            '★ ومربوط بالطلب الذي أثبت الشراء');
select t.ok((select store_id from public.product_reviews where product_id = :'prodA') = :'A',
            '★★ والمتجر مُشتقّ من المنتج لا من العميل');
select t.ok((select author_name from public.product_reviews where product_id = :'prodA')
            = 'أحمد م.',
            '★ والاسم المعروض مُقنَّع: الأول وحرف');
rollback;

\echo '── ★★ تقييم واحد لكل عميل: الثاني تعديل لا صفّ جديد ──'
begin;
select t.reset();
select t.buy(:'A', :'customerA', :'prodA');
select t.login(:'customerA');
select public.submit_product_review(:'prodA', 2, 'لم يعجبني');
select public.submit_product_review(:'prodA', 5, 'غيّرت رأيي');
select t.reset();
select t.ok((select count(*) from public.product_reviews
              where product_id = :'prodA' and profile_id = :'customerA') = 1,
            '★★ صفّ واحد لا صفّان');
select t.ok((select rating from public.product_reviews
              where product_id = :'prodA') = 5,
            'والقيمة الأخيرة هي المحفوظة');
rollback;

\echo '── ★★ المتوسّط والعدد يُشتقّان من الجدول لا من الواجهة ──'
begin;
select t.reset();
select t.buy(:'A', :'customerA', :'prodA');
select t.buy(:'A', :'managerA', :'prodA');
select t.login(:'customerA');
select public.submit_product_review(:'prodA', 5);
select t.login(:'managerA');
select public.submit_product_review(:'prodA', 4);
select t.reset();
select t.ok((select rating_count from public.products where id = :'prodA') = 2,
            'العدد ٢');
select t.ok((select rating_avg from public.products where id = :'prodA') = 4.50,
            'والمتوسّط ٤٫٥٠');
select t.ok((select rating_avg from public.products where id = :'prodA2') is null,
            '★ ومنتج بلا تقييم متوسّطه null لا صفر');
rollback;

\echo '── ★★★ الأعمدة الشخصية محجوبة عن المسار العام ──'
begin;
select t.reset();
select t.buy(:'A', :'customerA', :'prodA');
select t.login(:'customerA');
select public.submit_product_review(:'prodA', 5, 'رائع');
select t.logout();
select t.throws('select profile_id from public.product_reviews where product_id = '
                || quote_literal(:'prodA'),
                '★★★ الزائر لا يقرأ معرّف حساب صاحب التقييم');
select t.throws('select customer_id from public.product_reviews where product_id = '
                || quote_literal(:'prodA'),
                '★★★ ولا معرّف العميل');
select t.throws('select order_id from public.product_reviews where product_id = '
                || quote_literal(:'prodA'),
                '★★★ ولا معرّف الطلب');
select t.ok((select author_name from public.product_reviews where product_id = :'prodA')
            = 'أحمد م.', 'ويرى الاسم المُقنَّع وحده');
rollback;

\echo '── قائمة التقييمات العامة ──'
begin;
select t.reset();
select t.buy(:'A', :'customerA', :'prodA');
select t.login(:'customerA');
select public.submit_product_review(:'prodA', 5, 'رائع');
select t.logout();
select t.ok((select count(*) from public.product_reviews_page(:'prodA')) = 1,
            'الزائر يقرأ القائمة العامة');
select t.ok((select author_name from public.product_reviews_page(:'prodA')) = 'أحمد م.',
            'بالاسم المُقنَّع');
select t.login(:'ownerA');
update public.product_reviews set status = 'hidden' where product_id = :'prodA';
select t.logout();
select t.ok((select count(*) from public.product_reviews_page(:'prodA')) = 0,
            '★ والمخفيّ لا يظهر فيها');
rollback;

\echo '── ★★★ الكتابة المباشرة إلى الجدول مستحيلة ──'
begin;
select t.reset();
select t.buy(:'A', :'customerA', :'prodA');
select t.login(:'customerA');
select t.throws('insert into public.product_reviews '
                || '(store_id, product_id, customer_id, profile_id, rating, author_name) '
                || 'values (' || quote_literal(:'A') || ', ' || quote_literal(:'prodA')
                || ', ' || quote_literal(:'A') || ', ' || quote_literal(:'customerA')
                || ', 5, ' || quote_literal('وهمي') || ')',
                '★★★ لا منح INSERT لأحد — ولو كان مشتريًا');
rollback;

\echo '── ★★★ عزل المستأجر ──'
begin;
select t.reset();
select t.buy(:'A', :'customerA', :'prodA');
select t.login(:'customerA');
select t.throws('select public.submit_product_review(' || quote_literal(:'prodB') || ', 5)',
                '★★★ شراء من متجر أ لا يفتح تقييم منتج متجر ب');
rollback;

\echo '── ★★★ التاجر يُخفي ولا يؤلّف ──'
begin;
select t.reset();
select t.buy(:'A', :'customerA', :'prodA');
select t.login(:'customerA');
select public.submit_product_review(:'prodA', 1, 'رديء');
select t.login(:'ownerA');
update public.product_reviews set status = 'hidden' where product_id = :'prodA';
select t.ok((select status from public.product_reviews where product_id = :'prodA')::text
            = 'hidden', 'التاجر يستطيع الإخفاء');
select t.reset();
select t.ok((select rating_count from public.products where id = :'prodA') = 0,
            '★ والمخفيّ يخرج من العدد');
select t.ok((select rating_avg from public.products where id = :'prodA') is null,
            'ومن المتوسّط');

select t.login(:'ownerA');
-- خطّ دفاع أوّل: المنح على مستوى العمود لا يذكر `rating` ولا `body`
select t.throws('update public.product_reviews set rating = 5 where product_id = '
                || quote_literal(:'prodA'),
                '★★★ ولا يستطيع تغيير النجوم — لا منح على العمود');
select t.throws('update public.product_reviews set body = ''ممتاز'' where product_id = '
                || quote_literal(:'prodA'),
                '★★★ ولا نصّ التقييم');
select t.reset();
select t.ok((select rating from public.product_reviews where product_id = :'prodA') = 1,
            'والقيم كما كتبها صاحبها');
select t.ok((select body from public.product_reviews where product_id = :'prodA') = 'رديء',
            'نصًّا ونجومًا');
rollback;

\echo '── ★★★ وحارس الأعمدة يصمد لو مُنح العمود يومًا ──'
begin;
select t.reset();
select t.buy(:'A', :'customerA', :'prodA');
select t.login(:'customerA');
select public.submit_product_review(:'prodA', 1, 'رديء');
select t.reset();
-- محاكاة خطأ إعداد مستقبلي: منح العمود صراحةً ثم محاولة التزوير
grant update (rating, body) on public.product_reviews to authenticated;
select t.login(:'ownerA');
update public.product_reviews set rating = 5, body = 'ممتاز' where product_id = :'prodA';
select t.reset();
select t.ok((select rating from public.product_reviews where product_id = :'prodA') = 1,
            '★★★ الحارس يعيد النجوم ولو مُنح العمود');
select t.ok((select body from public.product_reviews where product_id = :'prodA') = 'رديء',
            '★★★ والنصّ كذلك');
rollback;

\echo '── ★★ تاجر آخر لا يمسّ تقييمات جاره ──'
begin;
select t.reset();
select t.buy(:'A', :'customerA', :'prodA');
select t.login(:'customerA');
select public.submit_product_review(:'prodA', 3);
select t.login(:'ownerB');
select t.no_effect('update public.product_reviews set status = ''hidden'' where product_id = '
                   || quote_literal(:'prodA'),
                   '★★★ صاحب متجر ب لا يُخفي تقييمًا في متجر أ');
select t.empty('select 1 from public.product_reviews where product_id = ' || quote_literal(:'prodA')
               || ' and status = ''hidden''', 'ويبقى منشورًا');
rollback;

\echo '── ★★ الحذف ممنوع على الجميع ──'
begin;
select t.reset();
select t.buy(:'A', :'customerA', :'prodA');
select t.login(:'customerA');
select public.submit_product_review(:'prodA', 3);
select t.no_effect('delete from public.product_reviews where product_id = ' || quote_literal(:'prodA'),
                   '★★ صاحب التقييم لا يحذفه');
select t.login(:'ownerA');
select t.no_effect('delete from public.product_reviews where product_id = ' || quote_literal(:'prodA'),
                   '★★ ولا التاجر');
rollback;

\echo '── حدود النجوم ──'
begin;
select t.reset();
select t.buy(:'A', :'customerA', :'prodA');
select t.login(:'customerA');
select t.throws('select public.submit_product_review(' || quote_literal(:'prodA') || ', 0)',
                'صفر نجوم يُرفض');
select t.throws('select public.submit_product_review(' || quote_literal(:'prodA') || ', 6)',
                'وست نجوم كذلك');
select t.throws('select public.submit_product_review(' || quote_literal(:'prodA') || ', 3, '
                || quote_literal(repeat('ء', 1001)) || ')',
                'والتعليق الطويل يُرفض');
rollback;

\echo '── الزائر يقرأ ولا يكتب ──'
begin;
select t.reset();
select t.buy(:'A', :'customerA', :'prodA');
select t.login(:'customerA');
select public.submit_product_review(:'prodA', 5, 'رائع');
select t.logout();
select t.ok((select count(*) from public.product_reviews where product_id = :'prodA') = 1,
            'الزائر يرى التقييم المنشور');
select t.throws('select public.submit_product_review(' || quote_literal(:'prodA') || ', 5)',
                '★★★ ولا يستطيع كتابة تقييم');
rollback;

\echo '── ★★ المخفيّ لا يُرى من الزائر ويراه صاحبه ──'
begin;
select t.reset();
select t.buy(:'A', :'customerA', :'prodA');
select t.login(:'customerA');
select public.submit_product_review(:'prodA', 1, 'رديء');
select t.login(:'ownerA');
update public.product_reviews set status = 'hidden' where product_id = :'prodA';
select t.logout();
select t.empty('select 1 from public.product_reviews where product_id = ' || quote_literal(:'prodA'),
               '★★ الزائر لا يرى المخفيّ');
select t.login(:'customerA');
select t.ok((select count(*) from public.product_reviews where product_id = :'prodA') = 1,
            '★ وصاحبه يراه — إخفاء لا مصادرة');
rollback;

\echo '── ★ تعديل تقييم مخفيّ لا يعيد نشره ──'
begin;
select t.reset();
select t.buy(:'A', :'customerA', :'prodA');
select t.login(:'customerA');
select public.submit_product_review(:'prodA', 1, 'بذيء');
select t.login(:'ownerA');
update public.product_reviews set status = 'hidden' where product_id = :'prodA';
select t.login(:'customerA');
select public.submit_product_review(:'prodA', 5, 'نصّ آخر');
select t.reset();
select t.ok((select status from public.product_reviews where product_id = :'prodA')::text
            = 'hidden', '★★ يبقى مخفيًّا بعد التعديل');
rollback;

\echo '✓ 112_product_reviews'
