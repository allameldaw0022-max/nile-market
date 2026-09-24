\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set B b0000000-0000-0000-0000-00000000000b
\set ownerA  11111111-1111-1111-1111-111111111111
\set ownerB  22222222-2222-2222-2222-222222222222
\set custA   77777777-7777-7777-7777-777777777777
\set csA     66666666-6666-6666-6666-666666666666
\set adminOwner 88888888-8888-8888-8888-888888888888
\set adminSup   99999999-9999-9999-9999-999999999999
\set adminFin   aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
\set adminOps   cccccccc-cccc-cccc-cccc-cccccccccccc
\set PARTNER 9a000000-0000-0000-0000-00000000000a
\set partnerUser bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb

\echo '── النسبة المعتمدة: 30% ──'
begin;
select t.reset();
select t.ok((select default_partner_rate = 30 from platform_settings),
            '★ النسبة الافتراضية للمنصة 30%');
select t.ok((
  select column_default like '30%' from information_schema.columns
   where table_name = 'partners' and column_name = 'commission_rate'),
            'وعمود النسبة في `partners` افتراضه 30');
rollback;

\echo '── التعيين: صلاحية الإدارة وحدها ──'
begin;
select t.reset();
select t.logout();
select t.throws('select 1 from assign_marketing_partner(' || quote_literal(:'custA') || ')',
                '★★★ الزائر لا يعيّن مسوّقًا (رُفض قبل أي كتابة)');

select t.login(:'custA');
select t.throws('select 1 from assign_marketing_partner(' || quote_literal(:'custA') || ')',
                '★★★ ولا يعيّن المستخدم نفسه مسوّقًا');
select t.throws('select 1 from assign_marketing_partner(' || quote_literal(:'ownerA') || ')',
                '★★ ولا يعيّن غيره');

select t.login(:'ownerA');
select t.throws('select 1 from assign_marketing_partner(' || quote_literal(:'custA') || ')',
                '★★ ولا تاجر');

select t.login(:'adminSup');
select t.throws('select 1 from assign_marketing_partner(' || quote_literal(:'custA') || ')',
                '★★ ولا موظف منصة بلا صلاحية partners:edit (support/stores:view فقط)');
rollback;

\echo '── التعيين ينشئ ملف مسوّق بكود فريد ──'
begin;
select t.reset();
select t.login(:'adminOps');        -- partners:edit
select partner_id as pid, referral_code as code, was_created as made
  from assign_marketing_partner(:'custA')
\gset
select t.ok(:'made' = 't', '★ التعيين أنشأ ملف مسوّق');
select t.reset();
select t.ok((select status = 'active' and profile_id = :'custA'
             from partners where id = :'pid'),
            'الملف نشط ومربوط بالحساب');
select t.ok((select commission_rate = 30 from partners where id = :'pid'),
            '★★ النسبة 30% — من إعدادات المنصة لا من المتصفح');
select t.ok((select length(referral_code) = 8 from partners where id = :'pid'),
            'وله كود إحالة');
select t.ok((select count(*) = 1 from partners where referral_code = :'code'),
            '★ الكود فريد');
select t.ok((select count(*) = 1 from audit_logs
             where action = 'partner.assigned' and resource_id = :'pid'),
            'والتعيين مقيَّد في سجل التدقيق');

-- لا سجل مكرر عند إعادة التعيين
select t.login(:'adminOps');
select t.ok((select was_created = false from assign_marketing_partner(:'custA')),
            '★★ إعادة التعيين لا تُنشئ صفًّا ثانيًا');
select t.reset();
select t.ok((select count(*) = 1 from partners where profile_id = :'custA'),
            'وصف واحد في الجدول');
rollback;

\echo '── حدود التعيين ──'
begin;
select t.reset();
select t.login(:'adminOps');
select t.throws('select 1 from assign_marketing_partner(' || quote_literal(:'adminOps') || ')',
                '★★★ الموظف لا يعيّن نفسه مسوّقًا ولو ملك الصلاحية');
select t.throws('select 1 from assign_marketing_partner(' || quote_literal(:'adminFin') || ')',
                '★★★ وموظف المنصة لا يكون مسوّقًا (من يعتمد العمولة لا يستحقّها)');
select t.throws('select 1 from assign_marketing_partner('
                || quote_literal('00000000-0000-0000-0000-0000000000ff') || ')',
                '★ وحساب غير موجود مرفوض');
rollback;

begin;
select t.reset();
-- الإيقاف بصلاحية users:manage — الحارس في 0002/0035 يردّ غيرها
select t.login(:'adminOwner');
update profiles set account_status = 'suspended' where id = :'custA';
select t.login(:'adminOps');
select t.throws('select 1 from assign_marketing_partner(' || quote_literal(:'custA') || ')',
                '★★ وحساب موقوف لا يصير مسوّقًا');
rollback;

\echo '── دعوة معلّقة بنفس البريد تُربط ولا تُكرَّر ──'
begin;
select t.reset();
insert into partners (name, email, status, referral_code, commission_rate)
values ('دعوة سابقة', 'customerA@test.local', 'invited', 'OLDCODE1', 30);
select t.login(:'adminOps');
select partner_id as pid2 from assign_marketing_partner(:'custA')
\gset
select t.reset();
select t.ok((select count(*) = 1 from partners
             where lower(email) = 'customera@test.local'),
            '★★ صف واحد: الدعوة رُبطت بالحساب ولم يُنشأ ملف ثانٍ');
select t.ok((select referral_code = 'OLDCODE1' and status = 'active'
             and profile_id = :'custA' from partners where id = :'pid2'),
            'والكود الأصلي محفوظ — لا ينقسم تاريخ العمولات');
rollback;

\echo '── الإزالة: إيقاف لا حذف ──'
begin;
select t.reset();
select t.login(:'adminOps');
select partner_id as pid3 from assign_marketing_partner(:'custA')
\gset
select t.reset();
-- عمولة قائمة قبل الإزالة
insert into commission_ledger
  (partner_id, store_id, entry_kind, amount, status, base_amount, rate_applied)
values (:'pid3', :'A', 'commission', 6000, 'payable', 20000, 30);

select t.login(:'custA');
select t.throws('select revoke_marketing_partner(' || quote_literal(:'custA') || ')',
                '★★★ المسوّق لا يزيل نفسه (ولا يزيل غيره)');

select t.login(:'adminOps');
select revoke_marketing_partner(:'custA');
select t.reset();
select t.ok((select status = 'suspended' from partners where id = :'pid3'),
            '★ الإزالة توقف الملف');
select t.ok((select count(*) = 1 from commission_ledger where partner_id = :'pid3'),
            '★★★ والعمولة المقيَّدة لا تُمسّ — عمل ماضٍ مستحَق');
select t.ok((select count(*) = 1 from audit_logs
             where action = 'partner.revoked' and resource_id = :'pid3'),
            'والإزالة مقيَّدة في سجل التدقيق');

-- الموقوف لا يملك لوحة مسوّق
select t.login(:'custA');
select t.ok((select app.current_partner_id() is null),
            '★★ والحساب الموقوف لا يُعدّ مسوّقًا نشطًا ⇒ لا لوحة');

-- ثم يُعاد تفعيله بنفس الملف
select t.login(:'adminOps');
select t.ok((select was_created = false from assign_marketing_partner(:'custA')),
            'وإعادة التعيين تُعيد تفعيل نفس الملف');
select t.reset();
select t.ok((select status = 'active' from partners where id = :'pid3'),
            'بنفس الكود والتاريخ');
rollback;

\echo '── العمولة لا تُحتسب إلا على دفع مؤكَّد ──'
begin;
select t.reset();
select t.login(:'adminOps');
select partner_id as pid4 from assign_marketing_partner(:'custA')
\gset
select t.reset();
-- إحالة يدوية بصلاحية الإدارة (الإسناد التلقائي يمرّ بـattribute_referral)
insert into referrals (partner_id, store_id, attribution_source)
values (:'pid4', :'B', 'admin_manual');

select t.ok((select count(*) = 0 from commission_ledger where partner_id = :'pid4'),
            '★★★ ربط التاجر بالمسوّق وحده لا يُنشئ عمولة');

-- طلب اشتراك معلّق: لا دفع ⇒ لا عمولة
select t.login(:'ownerB');
insert into subscription_requests
  (store_id, plan_id, amount, discount_amount, net_amount, idempotency_key)
values (:'B', (select id from plans where code='basic'), 20000, 0, 20000, 'mk-req');
select t.reset();
select t.ok((select count(*) = 0 from commission_ledger where partner_id = :'pid4'),
            '★★★ وطلب اشتراك قيد المراجعة لا يُنشئ عمولة');

-- الاعتماد والدفع المؤكَّد ⇒ عمولة 30%
select t.login(:'adminFin');
\o /dev/null
select record_payment('subscription',
  (select id from subscription_requests where idempotency_key='mk-req'),
  'bank_transfer', 20000, 'TRX-MK', null, 'mk-pay');
\o
select t.reset();
select t.ok((select amount = 6000 and rate_applied = 30 and status = 'payable'
             from commission_ledger where partner_id = :'pid4'),
            '★★★ الدفع المؤكَّد وحده يُنشئ العمولة: 30% من 20,000 = 6,000');

-- التجديد: دفعة ثانية ⇒ عمولة ثانية
select t.login(:'ownerB');
insert into subscription_requests
  (store_id, plan_id, amount, discount_amount, net_amount, idempotency_key)
values (:'B', (select id from plans where code='basic'), 20000, 0, 20000, 'mk-ren');
select t.login(:'adminFin');
\o /dev/null
select record_payment('subscription',
  (select id from subscription_requests where idempotency_key='mk-ren'),
  'bank_transfer', 20000, 'TRX-MK2', null, 'mk-pay2');
\o
select t.reset();
select t.ok((select count(*) = 2 and sum(amount) = 12000
             from commission_ledger where partner_id = :'pid4'),
            '★★★ والتجديد يُنشئ عمولة جديدة — العمولة تستمر مع كل تجديد');
rollback;

\echo '── عزل المسوّقين عن بعضهم ──'
begin;
select t.reset();
select t.login(:'adminOps');
select partner_id as pid5 from assign_marketing_partner(:'custA')
\gset
select t.reset();
insert into referrals (partner_id, store_id, attribution_source)
values (:'pid5', :'B', 'admin_manual');
insert into commission_ledger
  (partner_id, store_id, entry_kind, amount, status, base_amount, rate_applied)
values (:'pid5', :'B', 'commission', 6000, 'payable', 20000, 30);

-- المسوّق يرى تجاره وعمولاته
select t.login(:'custA');
select t.ok((select count(*) = 1 from partner_referred_stores()),
            'المسوّق يرى تاجره التابع');
select t.ok((select commission_total = 6000 from partner_referred_stores()),
            'ومعه عمولته من هذا التاجر');
select t.ok((select count(*) = 1 from partner_commission_rows()),
            'ويرى قيود عمولته');
select t.ok((select status = 'payable' from partner_commission_rows()),
            'بحالتها: مستحقة');

-- ولا يرى مسوّقًا آخر
select t.throws('select 1 from partner_referred_stores(' || quote_literal(:'PARTNER') || ')',
                '★★★ ولا يمرّر معرّف مسوّق آخر ليرى تجاره');
select t.throws('select 1 from partner_commission_rows(' || quote_literal(:'PARTNER') || ')',
                '★★★ ولا ليرى عمولاته');
select t.empty('select 1 from partners where id = ' || quote_literal(:'PARTNER'),
               '★★★ ولا يقرأ صفّ مسوّق آخر أصلًا');
select t.empty('select 1 from commission_ledger where partner_id = ' || quote_literal(:'PARTNER'),
               '★★★ ولا قيود عمولته');

-- ولا يعدّل نسبته
select t.no_effect('update partners set commission_rate = 90 where id = '
                   || quote_literal(:'pid5'),
                   '★★★ ولا يرفع نسبته بنفسه');
-- ولا يربط نفسه بتاجر
select t.throws('insert into referrals (partner_id, store_id, attribution_source) values ('
                || quote_literal(:'pid5') || ', ' || quote_literal(:'A') || ', ''admin_manual'')',
                '★★★ ولا يربط نفسه بتاجر يدويًا');
-- ولا يغيّر صاحب إحالة قائمة
select t.no_effect('update referrals set partner_id = ' || quote_literal(:'pid5')
                   || ' where store_id = ' || quote_literal(:'A'),
                   '★★★ ولا ينتزع تاجرًا من مسوّق آخر');

-- الإدارة ترى الجميع
select t.login(:'adminOps');
select t.ok((select count(*) = 1 from partner_referred_stores(:'pid5')),
            '★ وموظف partners:view يرى تجار أي مسوّق');
select t.ok((select count(*) = 1 from partner_commission_rows(:'pid5')),
            'وعمولاته وحالتها');
rollback;

\echo '── قائمة المستخدمين تكشف دور المسوّق للإدارة وحدها ──'
begin;
select t.reset();
select t.login(:'adminOps');
\o /dev/null
select assign_marketing_partner(:'custA');
\o
select t.login(:'adminSup');       -- users:view غير ممنوحة لهذا الموظف
select t.throws('select 1 from platform_users()',
                '★★ موظف بلا users:view لا يقرأ القائمة');
select t.login(:'adminOwner');
select t.ok((select partner_status = 'active' and referral_code is not null
             from platform_users() where profile_id = :'custA'),
            '★ والمالك يرى أن هذا الحساب مسوّق نشط');
select t.ok((select partner_id is null from platform_users()
             where profile_id = :'ownerB'),
            'ومن ليس مسوّقًا يظهر بلا ملف');
rollback;

\echo '✓ اختبارات المسوّقين مرّت'
