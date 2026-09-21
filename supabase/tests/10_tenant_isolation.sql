\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set B b0000000-0000-0000-0000-00000000000b
\set ownerA 11111111-1111-1111-1111-111111111111
\set ownerB 22222222-2222-2222-2222-222222222222
\set managerA 33333333-3333-3333-3333-333333333333
\set csA    66666666-6666-6666-6666-666666666666
\set custA  77777777-7777-7777-7777-777777777777
\set support 99999999-9999-9999-9999-999999999999

\echo '── عزل المتاجر: Store A ⇎ Store B ──'

begin;
select t.login(:'ownerA');
select t.empty('select 1 from store_payment_settings where store_id = ' || quote_literal(:'B'),
               'مالك A لا يقرأ الحسابات البنكية لمتجر B');
select t.ok((select count(*) = 1 from store_payment_settings where store_id = :'A'),
            'مالك A يقرأ حساباته البنكية هو');
select t.ok((select count(*) = 1 from store_payment_settings),
            'مالك A لا يرى إلا صفًا واحدًا في كل الجدول');
select t.empty('select 1 from store_members where store_id = ' || quote_literal(:'B'),
               'مالك A لا يرى أعضاء B');
select t.empty('select 1 from delivery_zones where store_id = ' || quote_literal(:'B') ||
               ' and not exists (select 1 from stores s where s.id = ' || quote_literal(:'B') || ' and s.status=''active'')',
               'مالك A لا يرى مناطق توصيل B الخاصة');
select t.throws('insert into store_members (store_id, profile_id, role, status) values (' || quote_literal(:'B') ||
                ', ' || quote_literal(:'ownerA') || ', ''manager'', ''active'')',
                'مالك A لا يضيف عضوًا في B');
select t.no_effect('update stores set name = ''مخترَق'' where id = ' || quote_literal(:'B'),
                   'مالك A لا يعدّل متجر B');
select t.no_effect('update delivery_zones set fee = 0 where store_id = ' || quote_literal(:'B'),
                   'مالك A لا يعدّل أسعار توصيل B');
select t.throws('insert into store_payment_settings (store_id, bank_accounts) values (' ||
                quote_literal(:'B') || ', ''[{"x":1}]''::jsonb)',
                'مالك A لا يكتب بيانات بنوك B');
rollback;

\echo '── البيانات البنكية: المالك فقط ──'
begin;
select t.login(:'managerA');
select t.ok(not app.has_store_permission(:'A', 'settings:banking'),
            'المدير لا يملك صلاحية settings:banking');
select t.empty('select 1 from store_payment_settings',
               'المدير لا يرى أي حساب بنكي حتى لمتجره');
select t.login(:'csA');
select t.empty('select 1 from store_payment_settings',
               'خدمة العملاء لا ترى أي حساب بنكي');
rollback;

\echo '── تحويل صف بين المتاجر (Cross-tenant move) ──'
begin;
select t.login(:'ownerA');
select t.throws('update store_members set store_id = ' || quote_literal(:'B') ||
                ' where store_id = ' || quote_literal(:'A') || ' and role = ''manager''',
                'لا يمكن نقل عضو من A إلى B');
select t.throws('update delivery_zones set store_id = ' || quote_literal(:'B') || ' where store_id = ' || quote_literal(:'A'),
                'لا يمكن نقل منطقة توصيل من A إلى B');
rollback;

\echo '── الصلاحيات داخل المتجر ──'
begin;
select t.login(:'csA');
select t.ok(app.has_store_permission(:'A', 'orders:view'),
            'خدمة العملاء تقرأ الطلبات');
select t.ok(not app.has_store_permission(:'A', 'products:delete'),
            'خدمة العملاء لا تحذف منتجات');
select t.ok(not app.has_store_permission(:'A', 'settings:banking'),
            'خدمة العملاء لا ترى البيانات البنكية');
select t.ok(not app.has_store_permission(:'A', 'members:manage'),
            'خدمة العملاء لا تدير الموظفين');
select t.ok(not app.has_store_permission(:'B', 'orders:view'),
            'موظف A لا يملك أي صلاحية في B');
select t.throws('insert into store_members (store_id, profile_id, role, status) values (' || quote_literal(:'A') ||
                ', ' || quote_literal(:'custA') || ', ''manager'', ''active'')',
                'موظف خدمة عملاء لا يضيف مديرًا');
rollback;

\echo '── تصعيد الصلاحيات ──'
begin;
select t.login(:'csA');
select t.no_effect('update store_members set role = ''owner'' where profile_id = ' || quote_literal(:'csA'),
                   'موظف لا يرفع نفسه إلى مالك');
select t.no_effect('update profiles set is_platform_staff = true where id = ' || quote_literal(:'custA'),
                   'مستخدم لا يعدّل بروفايل غيره');
rollback;

-- حماية عمود is_platform_staff تتم بـtrigger صامت، نتحقق من النتيجة الفعلية
begin;
select t.login(:'csA');
update profiles set is_platform_staff = true where id = :'csA';
select t.reset();
select t.ok((select not is_platform_staff from profiles where id = :'csA'),
            'محاولة رفع النفس إلى موظف منصة لا تُغيّر شيئًا');
rollback;

\echo '── عميل وزائر ──'
begin;
select t.login(:'custA');
select t.empty('select 1 from store_members', 'عميل لا يرى أي عضوية متجر');
select t.empty('select 1 from store_invitations', 'عميل لا يرى الدعوات');
select t.empty('select 1 from admin_members', 'عميل لا يرى موظفي المنصة');
rollback;

begin;
select t.logout();
select t.empty('select 1 from store_members', 'زائر لا يرى أعضاء المتاجر');
select t.empty('select 1 from store_invitations', 'زائر لا يرى الدعوات');
select t.empty('select 1 from admin_members', 'زائر لا يرى موظفي المنصة');
select t.empty('select 1 from profiles', 'زائر لا يرى أي بروفايل');
select t.ok((select count(*) = 2 from stores), 'زائر يرى المتاجر النشطة فقط');
rollback;

\echo '── موظفو المنصة: الصلاحية لا تأتي من مجرد الدخول ──'
begin;
select t.login(:'support');
select t.ok(app.has_platform_permission('support','manage'), 'موظف الدعم يدير الدعم');
select t.ok(app.has_platform_permission('stores','view'),    'موظف الدعم يرى المتاجر');
select t.ok(not app.has_platform_permission('payments','view'),
            'موظف الدعم لا يرى المدفوعات');
select t.ok(not app.has_platform_permission('commissions','view'),
            'موظف الدعم لا يرى العمولات');
select t.ok(not app.has_platform_permission('settings','manage'),
            'موظف الدعم لا يدير الإعدادات');
select t.throws('insert into admin_permissions (admin_member_id, section, level) values ' ||
                '(''ad000000-0000-0000-0000-00000000000b'',''payments'',''manage'')',
                'موظف الدعم لا يمنح نفسه صلاحية المدفوعات');
rollback;

\echo '✓ كل اختبارات العزل مرّت'
