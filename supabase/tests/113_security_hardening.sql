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
\set adminSupport 99999999-9999-9999-9999-999999999999
\set adminOwner 88888888-8888-8888-8888-888888888888

-- =====================================================================
-- اختبارات اختراق داخلية — تحاول الاختراق فعلًا لا تصفه
-- =====================================================================

\echo '── ★★★ عزل المستأجر عبر عرض الفريق (store_team) ──'
begin;
select t.login(:'ownerB');
select t.empty('select 1 from public.store_team where store_id = ' || quote_literal(:'A'),
               '★★★ صاحب متجر ب لا يرى فريق متجر أ');
select t.ok((select count(*) from public.store_team where store_id = :'B') >= 1,
            'ويرى فريقه هو');
rollback;

begin;
select t.login(:'customerA');
select t.empty('select 1 from public.store_team',
               '★★★ زبون بلا عضوية لا يرى أيّ فريق');
rollback;

begin;
select t.logout();
select t.throws('select 1 from public.store_team',
                '★★★ والزائر لا يملك منحًا على العرض أصلًا');
rollback;

\echo '── ★★★ منح الكتابة لدور anon مسحوبة ──'
begin;
select t.logout();
select t.throws('insert into public.orders (store_id, order_number, contact_name, '
                || 'contact_phone, payment_method, subtotal, total, idempotency_key) values ('
                || quote_literal(:'A') || ', ''X-1'', ''x'', ''0900000000'', '
                || '''cash_on_delivery'', 0, 0, ''k1'')',
                '★★★ الزائر لا يُدرج طلبًا مباشرةً');
select t.throws('insert into public.profiles (id, full_name) values ('
                || quote_literal('deadbeef-0000-0000-0000-000000000001') || ', ''hacker'')',
                '★★★ ولا صفّ بروفايل');
select t.throws('update public.platform_settings set maintenance_mode = true',
                '★★★ ولا يعدّل إعدادات المنصّة');
select t.throws('insert into public.admin_members (profile_id, display_name, status) values ('
                || quote_literal(:'customerA') || ', ''me'', ''active'')',
                '★★★ ولا يصنع لنفسه حساب إدارة');
select t.throws('delete from public.products where store_id = ' || quote_literal(:'A'),
                '★★★ ولا يحذف منتجات متجر');
rollback;

\echo '── ★★★ تصعيد الصلاحية: عضو متجر ⟶ موظّف منصّة ──'
begin;
select t.login(:'ownerA');
select t.throws('insert into public.admin_members (profile_id, display_name, status) values ('
                || quote_literal(:'ownerA') || ', ''hacker'', ''active'')',
                '★★★ صاحب متجر لا يضيف نفسه إلى الإدارة');
-- ★ هنا الصفّ **يتأثّر** فعلًا (سياسة «عدّل صفّك»)، لكن حارس
-- الأعمدة يعيد العمود الحسّاس. فالتأكيد على **القيمة** لا على عدد
-- الصفوف: اختبارٌ يقيس row_count هنا يمرّ على نظام مخترَق.
update public.profiles set is_platform_staff = true where id = :'ownerA';
select t.reset();
select t.ok((select is_platform_staff from public.profiles where id = :'ownerA') = false,
            '★★★ ولا يرفع نفسه عبر عمود البروفايل — الحارس يعيده');
select t.login(:'ownerA');
update public.profiles set account_status = 'active' where id = :'ownerA';
select t.reset();
select t.ok((select account_status from public.profiles where id = :'ownerA')::text = 'active',
            'وحالة الحساب تبقى كما ضبطتها الإدارة');
rollback;

\echo '── ★★★ تصعيد الصلاحية داخل الإدارة ──'
begin;
select t.login(:'adminSupport');
select t.no_effect('update public.admin_permissions set level = ''manage'' '
                   || 'where admin_member_id = ''ad000000-0000-0000-0000-00000000000b''',
                   '★★★ موظّف دعم لا يرفع مستوى صلاحيته');
select t.throws('insert into public.admin_permissions (admin_member_id, section, level) '
                || 'values (''ad000000-0000-0000-0000-00000000000b'', ''payments'', ''approve'')',
                '★★★ ولا يمنح نفسه قسمًا جديدًا');
rollback;

\echo '── ★★★ IDOR: تمرير store_id متجر آخر إلى دوال RPC ──'
begin;
select t.login(:'ownerB');
select t.throws('select public.adjust_inventory(' || quote_literal(:'A') || ', '
                || quote_literal(:'prodA') || ', 100, ''theft'')',
                '★★★ تعديل مخزون متجر أ بهوية صاحب ب يُرفض');
select t.throws('select public.product_costs(' || quote_literal(:'A') || ')',
                '★★★ وقراءة تكاليف متجر أ تُرفض');
select t.throws('select public.prepare_upload(' || quote_literal(:'A')
                || ', ''product_image'', ''image/jpeg'', 1000, ''jpg'')',
                '★★★ ورفع ملف إلى مساحة متجر أ يُرفض');
select t.throws('select public.invite_store_member(' || quote_literal(:'A')
                || ', ''x@test.local'', ''manager'', null)',
                '★★★ ودعوة عضو إلى متجر أ تُرفض');
rollback;

\echo '── ★★★ سعر التكلفة لا يخرج للمسار العام ──'
begin;
select t.logout();
select t.throws('select cost_price from public.products where store_id = ' || quote_literal(:'A'),
                '★★★ الزائر لا يقرأ سعر التكلفة (منح على مستوى العمود)');
select t.ok((select count(*) from public.products where store_id = :'A') >= 1,
            'ويقرأ المنتج العام كالمعتاد');
rollback;

\echo '── ★★★ حدّ إغراق الطلبات ──'
begin;
select t.reset();
-- ستة طلبات متتالية من نفس الزائر: السادس يُرفض
do $$
declare i integer; v_ok boolean := true;
begin
  for i in 1..5 loop
    insert into public.orders
      (store_id, order_number, contact_name, contact_phone, status, payment_method,
       subtotal, total, idempotency_key, guest_token, placed_via)
    values ('a0000000-0000-0000-0000-00000000000a', 'F-' || i, 'زائر', '0911111111',
            'new', 'cash_on_delivery', 1000, 1000, 'flood-' || i, 'tok-flood', 'storefront');
  end loop;
end $$;
select t.ok((select count(*) from public.orders where guest_token = 'tok-flood') = 5,
            'خمسة طلبات تمرّ');
select t.throws('insert into public.orders '
                || '(store_id, order_number, contact_name, contact_phone, status, payment_method, '
                || 'subtotal, total, idempotency_key, guest_token, placed_via) values ('
                || quote_literal(:'A') || ', ''F-6'', ''زائر'', ''0911111111'', ''new'', '
                || '''cash_on_delivery'', 1000, 1000, ''flood-6'', ''tok-flood'', ''storefront'')',
                '★★★ والسادس يُرفض — لا إغراق');
select t.ok((select count(*) from public.orders where guest_token = 'tok-flood') = 5,
            'ولا يُكتب صفّ سادس');
rollback;

\echo '── ★ الحدّ لكل زائر لا لكل متجر (لا حرمان خدمة) ──'
begin;
select t.reset();
do $$
declare i integer;
begin
  for i in 1..5 loop
    insert into public.orders
      (store_id, order_number, contact_name, contact_phone, status, payment_method,
       subtotal, total, idempotency_key, guest_token, placed_via)
    values ('a0000000-0000-0000-0000-00000000000a', 'G-' || i, 'مهاجم', '0922222222',
            'new', 'cash_on_delivery', 1000, 1000, 'dos-' || i, 'tok-attacker', 'storefront');
  end loop;
end $$;
insert into public.orders
  (store_id, order_number, contact_name, contact_phone, status, payment_method,
   subtotal, total, idempotency_key, guest_token, placed_via)
values (:'A', 'H-1', 'زبون حقيقي', '0933333333', 'new', 'cash_on_delivery',
        1000, 1000, 'real-1', 'tok-real', 'storefront');
select t.ok((select count(*) from public.orders where guest_token = 'tok-real') = 1,
            '★★ زبون آخر يشتري رغم استنفاد المهاجم حصّته');
rollback;

\echo '── ★ طلبات اللوحة لا تُحدّ ──'
begin;
select t.reset();
do $$
declare i integer;
begin
  for i in 1..8 loop
    insert into public.orders
      (store_id, order_number, contact_name, contact_phone, status, payment_method,
       subtotal, total, idempotency_key, guest_token, placed_via)
    values ('a0000000-0000-0000-0000-00000000000a', 'D-' || i, 'تاجر', '0944444444',
            'new', 'cash_on_delivery', 1000, 1000, 'dash-' || i, 'tok-dash', 'dashboard');
  end loop;
end $$;
select t.ok((select count(*) from public.orders where guest_token = 'tok-dash') = 8,
            'التاجر يسجّل طلباته يدويًا بلا حدّ');
rollback;

\echo '── ★★★ مدخلات خبيثة ──'
begin;
-- ★ بهوية مالك المنصّة: الحقن يُختبر على المسار المسموح له فعلًا.
-- (نفس النداء بهوية تاجر يُرفض بـFORBIDDEN، وهو سلوك صحيح لكنه
-- يخفي ما نريد قياسه هنا.)
select t.login(:'adminOwner');
select t.ok((select count(*) from public.platform_users(
               ''''';drop table public.orders;--', null, 10, 0, null)) >= 0,
            '★★★ نصّ حقن في بحث المستخدمين لا يُنفَّذ');
select t.ok((select count(*) from public.orders) >= 0,
            'وجدول الطلبات باقٍ');
rollback;

\echo '── ★★ الزائر لا ينفّذ دوال الإدارة ──'
begin;
select t.logout();
select t.throws('select public.admin_overview()', '★★★ لا لوحة إدارة للزائر');
select t.throws('select public.platform_users(null, null, 10, 0, null)',
                '★★★ ولا قائمة مستخدمي المنصّة');
select t.throws('select public.check_rate_limit(''x'', 1, 60)',
                '★★★ ولا محدِّد المعدّل نفسه (لا يُصفَّر من الخارج)');
rollback;

begin;
select t.login(:'customerA');
select t.throws('select public.admin_overview()', '★★★ ولا لمستخدم مسجَّل بلا دور');
select t.throws('select public.payments_page(null, null, null, 10, 0)',
                '★★★ ولا صفحة المدفوعات');
rollback;

\echo '✓ 113_security_hardening'
