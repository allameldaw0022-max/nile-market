\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set B b0000000-0000-0000-0000-00000000000b
\set ownerA 11111111-1111-1111-1111-111111111111
\set adminOwner 88888888-8888-8888-8888-888888888888
\set adminSup 99999999-9999-9999-9999-999999999999
\set adminFin aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
\set adminOps cccccccc-cccc-cccc-cccc-cccccccccccc
\set partner1 bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
\set P1 9a000000-0000-0000-0000-00000000000a

\echo '── اعتماد طلب الاشتراك ──'
begin;
select t.reset();
select id as basicid from plans where code = 'basic'
\gset
select t.login(:'ownerA');
select request_id as reqid from submit_subscription_request(
  :'A', :'basicid', null, t.sub_proof(:'A'))
\gset

-- التاجر لا يعتمد طلبه بنفسه
select t.throws('select review_subscription_request(' || quote_literal(:'reqid')
                || ', ''approve'')',
                '★ التاجر لا يعتمد طلب اشتراكه');
select t.login(:'adminSup');
select t.throws('select review_subscription_request(' || quote_literal(:'reqid')
                || ', ''approve'')',
                '★ ولا موظف الدعم (لا يملك subscriptions:approve)');

select t.login(:'adminFin');
select t.ok((select review_subscription_request(:'reqid', 'approve') ->> 'status'
             = 'approved'),
            'موظف المالية يعتمد الطلب');
select t.reset();
select t.ok((select status = 'approved' from subscription_requests where id = :'reqid'),
            'والطلب يصبح معتمدًا');
select t.ok((select status = 'active' and current_period_end > now()
             from subscriptions where store_id = :'A'),
            '★ والاشتراك يُفعَّل ويُمدَّد');
select t.ok((select count(*) = 1 from payments
             where kind = 'subscription' and store_id = :'A'),
            'ودفعة واحدة تُقيَّد');
select t.ok((select count(*) = 1 from ledger_entries
             where entry_type = 'subscription_revenue'),
            '★ وإيراد المنصة يُقيَّد في الدفتر');
select t.ok((select count(*) = 1 from commission_ledger
             where partner_id = :'P1' and entry_kind = 'commission'),
            '★ وعمولة الشريك المُحيل تُنشأ تلقائيًا');
select t.ok((select exists (select 1 from notifications
             where user_id = :'ownerA' and type = 'subscription.approved')),
            'والتاجر يُنبَّه');

select t.login(:'adminFin');
select t.throws('select review_subscription_request(' || quote_literal(:'reqid')
                || ', ''approve'')',
                '★ الطلب المعتمَد لا يُعتمد مرتين');
rollback;

\echo '── رفض طلب الاشتراك ──'
begin;
select t.reset();
select id as basicid from plans where code = 'basic'
\gset
select t.login(:'ownerA');
select request_id as reqid from submit_subscription_request(
  :'A', :'basicid', null, t.sub_proof(:'A'))
\gset

select t.login(:'adminFin');
select t.throws('select review_subscription_request(' || quote_literal(:'reqid')
                || ', ''reject'')',
                '★ الرفض بلا سبب مرفوض');
select t.ok((select review_subscription_request(:'reqid', 'reject', 'لم يصل التحويل')
             ->> 'status' = 'rejected'),
            'الرفض بسبب واضح ينجح');
select t.reset();
select t.ok((select rejection_reason = 'لم يصل التحويل' from subscription_requests
             where id = :'reqid'),
            'والسبب يُحفظ');
select t.ok((select count(*) = 0 from payments where kind = 'subscription'),
            '★ ولا تُقيَّد دفعة عند الرفض');
rollback;

\echo '── فصل المهام في صرف الشريك (D30) ──'
begin;
select t.reset();
insert into commission_ledger
  (partner_id, store_id, entry_kind, amount, status, base_amount, rate_applied)
values (:'P1', :'A', 'commission', 10000, 'payable', 20000, 50);

select t.login(:'partner1');
select save_partner_payout_account('bankak', 'الشريك الأول', null, null, '0911111111');
select payout_id as pid from request_partner_payout()
\gset

-- لا اعتماد قبل التسجيل الإداري
select t.login(:'adminFin');
select t.throws('select review_payout(' || quote_literal(:'pid') || ', ''approve'')',
                '★ لا اعتماد قبل تسجيل الطلب إداريًا');

-- موظف يسجّل
select t.login(:'adminOps');
select t.throws('select review_payout(' || quote_literal(:'pid') || ', ''record'')',
                'موظف بلا payouts:edit لا يسجّل');
select t.login(:'adminOwner');
select t.ok((select review_payout(:'pid', 'record') ->> 'status' = 'pending_review'),
            'مالك المنصة يسجّل الطلب إداريًا');

-- ونفس الشخص لا يعتمد
select t.throws('select review_payout(' || quote_literal(:'pid') || ', ''approve'')',
                '★★ لا يعتمد مَن سجّل الطلب (فصل المهام)');

-- موظف آخر يعتمد
select t.login(:'adminFin');
select t.ok((select review_payout(:'pid', 'approve') ->> 'status' = 'approved'),
            'موظف آخر يعتمد');
select t.reset();
select t.ok((select requested_by = :'adminOwner' and approved_by = :'adminFin'
             from partner_payouts where id = :'pid'),
            '★ الطرفان مختلفان في السجل');
select t.ok((select exists (select 1 from notifications
             where user_id = :'partner1' and type = 'payout.approved')),
            'والشريك يُنبَّه بالاعتماد');

-- الصرف
select t.login(:'adminFin');
select t.ok((select mark_payout_paid(:'pid', 'REF-1') = 10000),
            'الصرف يصرف العمولات المحجوزة لهذا الطلب');
select t.reset();
select t.ok((select status = 'paid' from partner_payouts where id = :'pid'),
            'والطلب يصبح مصروفًا');
select t.ok((select status = 'paid' and payout_id = :'pid' from commission_ledger
             where partner_id = :'P1' and entry_kind = 'commission'),
            '★ والعمولة تُوسم مدفوعة فلا تُصرف مرتين');
rollback;

-- الشريك نفسه لو كان موظفًا: لا يعتمد صرفه
begin;
select t.reset();
insert into commission_ledger
  (partner_id, store_id, entry_kind, amount, status, base_amount, rate_applied)
values (:'P1', :'A', 'commission', 10000, 'payable', 20000, 50);
insert into admin_members (profile_id, display_name, is_owner, status)
values (:'partner1', 'شريك وموظف', false, 'active');
insert into admin_permissions (admin_member_id, section, level)
select id, 'payouts', 'approve' from admin_members where profile_id = :'partner1';

select t.login(:'partner1');
select save_partner_payout_account('bankak', 'الشريك الأول', null, null, '0911111111');
select payout_id as pid2 from request_partner_payout()
\gset
select t.login(:'adminOwner');
\o /dev/null
select review_payout(:'pid2', 'record');
\o
select t.login(:'partner1');
select t.throws('select review_payout(' || quote_literal(:'pid2') || ', ''approve'')',
                '★★ مَن بادر بالطلب لا يعتمده ولو كان موظفًا');
rollback;

\echo '── رفض الصرف ──'
begin;
select t.reset();
insert into commission_ledger
  (partner_id, store_id, entry_kind, amount, status, base_amount, rate_applied)
values (:'P1', :'A', 'commission', 10000, 'payable', 20000, 50);
select t.login(:'partner1');
select save_partner_payout_account('bankak', 'الشريك الأول', null, null, '0911111111');
select payout_id as pid3 from request_partner_payout()
\gset
select t.login(:'adminOwner');
\o /dev/null
select review_payout(:'pid3', 'record');
\o
select t.login(:'adminFin');
select t.throws('select review_payout(' || quote_literal(:'pid3') || ', ''reject'')',
                '★ الرفض بلا سبب مرفوض');
select t.ok((select review_payout(:'pid3', 'reject', 'بيانات الحساب ناقصة')
             ->> 'status' = 'rejected'),
            'الرفض بسبب ينجح');
select t.reset();
select t.ok((select count(*) = 0 from ledger_entries where entry_type = 'partner_payout'),
            '★ ولا يتحرّك مال عند الرفض');
rollback;

\echo '── حالة المتجر ──'
begin;
select t.reset();
select t.login(:'ownerA');
select t.throws('select set_store_status(' || quote_literal(:'A') || ', ''suspended'', ''س'')',
                '★ التاجر لا يوقف متجره ولا متجر غيره');

select t.login(:'adminOps');
select t.throws('select set_store_status(' || quote_literal(:'A') || ', ''suspended'')',
                '★ الإيقاف بلا سبب مرفوض');
select set_store_status(:'A', 'suspended', 'مخالفة الشروط');
select t.reset();
select t.ok((select status = 'suspended' and suspended_reason = 'مخالفة الشروط'
             from stores where id = :'A'),
            'موظف مخوّل يوقف المتجر بسبب مسجَّل');
select t.ok((select exists (select 1 from notifications
             where user_id = :'ownerA' and type = 'store.status')),
            'والمالك يُنبَّه');
select t.ok((select count(*) = 2 from products where store_id = :'A' and deleted_at is null),
            '★ ومنتجاته تبقى كما هي (المتجر يُغلق ولا يُحذف)');
rollback;

\echo '── أرقام لوحة الإدارة ──'
begin;
select t.login(:'adminOwner');
select t.ok((select (admin_overview() ? 'stores_total')),
            'مالك المنصة يقرأ ملخّص الأرقام');
rollback;

begin;
select t.login(:'ownerA');
select t.throws('select admin_overview()', '★ التاجر لا يقرأ أرقام المنصة');
select t.logout();
select t.throws('select admin_overview()', '★ ولا الزائر');
rollback;
select t.reset();


\echo '── موظفو المنصة ومصفوفة الصلاحيات ──'
begin;
select t.reset();
insert into auth.users (id, email, email_confirmed_at)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'newstaff@test.local', now());

select t.login(:'adminSup');
select t.throws('select upsert_admin_member(''dddddddd-dddd-dddd-dddd-dddddddddddd'', '
                || '''موظف جديد'')',
                '★ موظف بلا settings:manage لا يضيف موظفًا');

select t.login(:'adminOwner');
select t.ok((select upsert_admin_member(
               'dddddddd-dddd-dddd-dddd-dddddddddddd', 'موظف جديد', false,
               '{"support":"edit","stores":"view"}'::jsonb) is not null),
            'مالك المنصة يضيف موظفًا بصلاحياته');
select t.reset();
select t.ok((select mfa_required from admin_members
             where profile_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
            '★ MFA إلزامي افتراضًا لكل حساب إدارة (D28)');
select t.ok((select count(*) = 2 from admin_permissions ap
             join admin_members am on am.id = ap.admin_member_id
             where am.profile_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
            'وصفّا صلاحية أُنشئا');
select t.ok((select is_platform_staff from profiles
             where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
            'وراية موظف المنصة تُزامن على البروفايل');

-- الصلاحيات تُستبدل بالكامل لا تُدمج
select t.login(:'adminOwner');
\o /dev/null
select upsert_admin_member('dddddddd-dddd-dddd-dddd-dddddddddddd', 'موظف جديد',
                           false, '{"support":"view"}'::jsonb);
\o
select t.reset();
select t.ok((select count(*) = 1 from admin_permissions ap
             join admin_members am on am.id = ap.admin_member_id
             where am.profile_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
            '★ الصلاحيات تُستبدل بالكامل فلا تبقى صلاحية منسيّة');

select t.login(:'adminOwner');
select t.throws('select upsert_admin_member(' || quote_literal(:'adminOwner')
                || ', ''أنا'')',
                '★ لا يعدّل موظف حسابه الإداري من هنا');
rollback;

\echo '── إيقاف موظف: لا يقلّ عن حسابين نشطين (D29) ──'
begin;
select t.reset();
select id as supid from admin_members where profile_id = :'adminSup'
\gset
select t.login(:'adminOwner');
select suspend_admin_member(:'supid');
select t.reset();
select t.ok((select status = 'suspended' from admin_members where id = :'supid'),
            'مالك المنصة يوقف موظفًا');

-- نُبقي حسابين فقط ثم نحاول
update admin_members set status = 'suspended'
 where profile_id in (:'adminOps');
select t.ok((select active_admin_count_check from
             (select app.active_admin_count() = 2 as active_admin_count_check) q),
            'بقي حسابان نشطان');

select id as finid from admin_members where profile_id = :'adminFin'
\gset
select t.login(:'adminOwner');
select t.throws('select suspend_admin_member(' || quote_literal(:'finid') || ')',
                '★★ لا يُوقَف الحساب الذي يُنزل العدد دون حسابين (D29)');
rollback;

\echo '── مصفوفة الوصول ──'
begin;
select t.login(:'adminOwner');
select t.ok((select count(*) = 4 from admin_access_matrix()),
            'المالك يرى كل الموظفين في مصفوفة واحدة');
select t.ok((select permissions ? 'support' from admin_access_matrix()
             where display_name = 'Support Staff'),
            'وصلاحيات كل موظف معه');
rollback;

begin;
select t.login(:'ownerA');
select t.empty('select 1 from admin_access_matrix()',
               '★ التاجر لا يرى مصفوفة صلاحيات المنصة');
select t.logout();
select t.empty('select 1 from admin_access_matrix()', '★ ولا الزائر');
rollback;
select t.reset();

\echo '✓ اختبارات مراجعات الإدارة مرّت'
