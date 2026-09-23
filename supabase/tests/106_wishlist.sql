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
\set customerA 77777777-7777-7777-7777-777777777777
\set ownerB 22222222-2222-2222-2222-222222222222

-- =====================================================================
-- المفضّلة — العزل والتكامل
-- =====================================================================

\echo '── الإضافة والإزالة ──'
begin;
select t.login(:'customerA');
select t.ok((select in_wishlist from public.toggle_wishlist(:'prodA')) = true,
            'الإضافة تعيد «مضاف»');
select t.ok((select count(*) from public.wishlists
              where profile_id = :'customerA' and product_id = :'prodA') = 1,
            'والصفّ مُنشأ فعلًا');
select t.ok((select store_id from public.wishlists where product_id = :'prodA') = :'A',
            '★★ والمتجر مُشتقّ من المنتج لا من العميل');
select t.ok((select in_wishlist from public.toggle_wishlist(:'prodA')) = false,
            'والضغط ثانيةً يزيل');
select t.ok((select count(*) from public.wishlists
              where profile_id = :'customerA' and product_id = :'prodA') = 0,
            'والصفّ حُذف');
rollback;

\echo '── لا تكرار ──'
begin;
select t.login(:'customerA');
select public.toggle_wishlist(:'prodA');
select t.throws('insert into public.wishlists (store_id, profile_id, product_id) values ('
                || quote_literal(:'A') || ', ' || quote_literal(:'customerA') || ', '
                || quote_literal(:'prodA') || ')',
                '★★ الإدراج المباشر المكرّر يُرفض بالفهرس الفريد');
select t.ok((select count(*) from public.wishlists where profile_id = :'customerA') = 1,
            'ويبقى صفّ واحد');
rollback;

\echo '── ★★★ تكامل المستأجر: منتج متجر ب في مفضّلة متجر أ ──'
begin;
select t.login(:'customerA');
select t.throws('insert into public.wishlists (store_id, profile_id, product_id) values ('
                || quote_literal(:'A') || ', ' || quote_literal(:'customerA') || ', '
                || quote_literal(:'prodB') || ')',
                '★★★ لا يُربط منتج متجر ب بمفضّلة متجر أ');
select t.throws('insert into public.wishlists (store_id, profile_id, product_id) values ('
                || quote_literal(:'B') || ', ' || quote_literal(:'customerA') || ', '
                || quote_literal(:'prodA') || ')',
                '★★★ ولا العكس');
rollback;

\echo '── ★★★ عزل المستخدمين ──'
begin;
select t.reset();
insert into public.wishlists (store_id, profile_id, product_id)
values (:'A', :'ownerA', :'prodA');

select t.login(:'customerA');
select t.ok((select count(*) from public.wishlists) = 0,
            '★★★ المستخدم لا يقرأ مفضّلة غيره');
select t.no_effect('delete from public.wishlists where profile_id = ' || quote_literal(:'ownerA'),
                   '★★★ ولا يحذف منها');
select t.ok((select count(*) from public.my_wishlist(:'A')) = 0,
            '★★★ ولا تكشفها له دالّة العرض');

select t.reset();
select t.ok((select count(*) from public.wishlists where profile_id = :'ownerA') = 1,
            'وصفّ صاحبها سليم لم يُمسّ');
rollback;

\echo '── ★★ عزل المتاجر في العرض ──'
begin;
select t.reset();
insert into public.wishlists (store_id, profile_id, product_id)
values (:'A', :'customerA', :'prodA'), (:'B', :'customerA', :'prodB');

select t.login(:'customerA');
select t.ok((select count(*) from public.my_wishlist(:'A')) = 1,
            '★★ مفضّلة متجر أ لا تعرض ما حُفظ في متجر ب');
select t.ok((select product_id from public.my_wishlist(:'A')) = :'prodA',
            'وهو المنتج الصحيح');
select t.ok((select count(*) from public.my_wishlist(:'B')) = 1,
            'وكلٌّ يرى متجره');
rollback;

\echo '── المنتج غير الصالح ──'
begin;
select t.login(:'customerA');
select t.throws('select * from public.toggle_wishlist(''00000000-0000-0000-0000-0000000000ff'')',
                '★★ منتج غير موجود يُرفض');
rollback;

begin;
select t.reset();
update public.products set status = 'draft' where id = :'prodA2';
select t.login(:'customerA');
select t.throws('select * from public.toggle_wishlist(' || quote_literal(:'prodA2') || ')',
                '★★ ومنتج غير منشور يُرفض');
rollback;

\echo '── المنتج الذي حُذف بعد الإضافة ──'
begin;
select t.reset();
insert into public.wishlists (store_id, profile_id, product_id)
values (:'A', :'customerA', :'prodA');
update public.products set deleted_at = now() where id = :'prodA';

select t.login(:'customerA');
select t.ok((select count(*) from public.my_wishlist(:'A')) = 0,
            '★★ المنتج المحذوف يختفي من العرض بهدوء لا بخطأ');
rollback;

\echo '── الزائر ──'
begin;
select t.logout();
select t.throws('select * from public.toggle_wishlist(' || quote_literal(:'prodA') || ')',
                '★★★ الزائر المجهول لا يضيف إلى المفضّلة');
select t.throws('select count(*) from public.wishlists',
                '★★★ ولا يقرأ الجدول أصلًا');
rollback;

\echo '── حالة الشبكة ──'
begin;
select t.reset();
insert into public.wishlists (store_id, profile_id, product_id)
values (:'A', :'customerA', :'prodA');
select t.login(:'customerA');
select t.ok((select count(*) from public.wishlist_state(
              array[:'prodA', :'prodA2']::uuid[])) = 1,
            '★★ حالة الشبكة تعيد المحفوظ وحده');
select t.login(:'ownerB');
select t.ok((select count(*) from public.wishlist_state(
              array[:'prodA', :'prodA2']::uuid[])) = 0,
            '★★★ ولا تكشف حالة مستخدم لآخر');
rollback;

\echo '── منح الجدول ──'
begin;
select t.reset();
select t.ok((select count(*) from information_schema.role_table_grants
              where table_schema = 'public' and table_name = 'wishlists'
                and grantee = 'anon') = 0,
            '★★ لا منح للدور المجهول على المفضّلة');
select t.ok((select count(*) from information_schema.role_table_grants
              where table_schema = 'public' and table_name = 'wishlists'
                and grantee = 'authenticated'
                and privilege_type in ('UPDATE','TRUNCATE')) = 0,
            '★★ ولا تعديل ولا تفريغ للمسجَّل');
rollback;

select t.reset();
\echo '✓ اختبارات المفضّلة مرّت'

-- =====================================================================
-- بعد بناء دخول العميل في المتجر (المرحلة ٥)
--
-- ★ الجلسة في التطبيق مقصورة على مضيف المتجر بحكم الكوكي، وهو ما
-- لا يُختبر في القاعدة. ما يُختبر هنا هو الطبقة التي **لا تعرف
-- المضيف أصلًا**: حتى لو تسرّبت جلسة عميل متجر إلى متجر آخر، لا
-- تستطيع تلك الجلسة قراءة ولا كتابة مفضّلة ذلك المتجر.
-- =====================================================================

\echo '── ★★★ جلسة عميل لا تَنفُذ إلى متجر آخر مهما كان المضيف ──'
begin;
select t.reset();
insert into public.wishlists (store_id, profile_id, product_id)
values (:'A', :'customerA', :'prodA');

select t.login(:'customerA');
-- العميل نفسه، لكن يطلب مفضّلة متجر ب: لا شيء — ولو زوّر المضيف
select t.ok((select count(*) from public.my_wishlist(:'B')) = 0,
            '★★★ تمرير معرّف متجر آخر لا يكشف شيئًا');
-- ولا يستطيع إنشاء صفّ في متجر ب لمنتج متجر أ
select t.throws('insert into public.wishlists (store_id, profile_id, product_id) values ('
                || quote_literal(:'B') || ', ' || quote_literal(:'customerA') || ', '
                || quote_literal(:'prodA') || ')',
                '★★★ ولا يكتب في متجر ب بمنتج متجر أ');
rollback;

\echo '── ★★ دورة العميل الكاملة بعد الدخول ──'
begin;
select t.login(:'customerA');
select t.ok((select in_wishlist from public.toggle_wishlist(:'prodA')) = true,
            'يضيف منتجًا');
select t.ok((select count(*) from public.my_wishlist(:'A')) = 1,
            'ويراه في مفضّلته');
select t.ok((select in_wishlist from public.toggle_wishlist(:'prodA')) = false,
            'ويزيله');
select t.ok((select count(*) from public.my_wishlist(:'A')) = 0,
            'فتفرغ مفضّلته');
rollback;

\echo '── ★★★ الخروج: الجلسة تنتهي فلا قراءة ──'
begin;
select t.reset();
insert into public.wishlists (store_id, profile_id, product_id)
values (:'A', :'customerA', :'prodA');
select t.logout();
select t.throws('select count(*) from public.wishlists',
                '★★★ بعد الخروج لا يُقرأ الجدول');
select t.throws('select * from public.my_wishlist(' || quote_literal(:'A') || ')',
                '★★★ ولا دالّة العرض');
rollback;

select t.reset();
\echo '✓ اختبارات المفضّلة بعد الدخول مرّت'
