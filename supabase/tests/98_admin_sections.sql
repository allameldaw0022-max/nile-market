\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set ownerA 11111111-1111-1111-1111-111111111111
\set customerA 77777777-7777-7777-7777-777777777777
\set adminOwner 88888888-8888-8888-8888-888888888888
\set adminSup 99999999-9999-9999-9999-999999999999
\set adminFin aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
\set adminOps cccccccc-cccc-cccc-cccc-cccccccccccc
\set P1 9a000000-0000-0000-0000-00000000000a

\echo '── المدفوعات: القراءة بصلاحية payments ──'
begin;
select t.login(:'adminFin');
select t.ok((select count(*) >= 0 from payments_page()),
            'موظف المالية يقرأ صفحة المدفوعات');
select t.login(:'adminSup');
select t.throws('select 1 from payments_page()',
                '★ موظف الدعم لا يقرأ المدفوعات');
select t.login(:'ownerA');
select t.throws('select 1 from payments_page()', '★ ولا التاجر');
select t.logout();
select t.throws('select 1 from payments_page()', '★ ولا الزائر');
rollback;

\echo '── المستخدمون: البريد لا يخرج إلا بصلاحية users ──'
begin;
select t.login(:'adminOwner');
select t.ok((select email = 'ownerA@test.local' from platform_users()
             where profile_id = :'ownerA'),
            'مالك المنصة يرى بريد المستخدم من auth.users');
select t.ok((select stores_count = 1 from platform_users() where profile_id = :'ownerA'),
            'وعدد متاجره معه');
select t.ok((select count(*) = 1 from platform_users('ownerA@test.local')),
            'والبحث بالبريد يطابق');
select t.login(:'adminOps');
select t.throws('select 1 from platform_users()',
                '★ موظف بلا users:view لا يرى قائمة المستخدمين');
select t.login(:'ownerA');
select t.throws('select 1 from platform_users()', '★ ولا التاجر يرى بريد غيره');
rollback;

\echo '── إيقاف حساب مستخدم ──'
begin;
select t.login(:'adminSup');
select t.throws('select set_account_status(' || quote_literal(:'customerA')
                || ', ''suspended'', ''مخالفة'')',
                '★ موظف الدعم لا يوقف الحسابات');

select t.login(:'adminOwner');
select t.throws('select set_account_status(' || quote_literal(:'customerA')
                || ', ''suspended'')',
                '★ الإيقاف بلا سبب مرفوض');
select t.throws('select set_account_status(' || quote_literal(:'adminOwner')
                || ', ''suspended'', ''كذا'')',
                '★ لا يوقف الموظف حسابه بنفسه');
select t.throws('select set_account_status(' || quote_literal(:'adminFin')
                || ', ''suspended'', ''كذا'')',
                '★★ حساب موظف نشط لا يُوقَف من قسم المستخدمين (التفاف على D29)');

select set_account_status(:'customerA', 'suspended', 'مخالفة الشروط');
select t.reset();
select t.ok((select account_status = 'suspended' from profiles where id = :'customerA'),
            'مالك المنصة يوقف حساب عميل');
select t.ok((select exists (select 1 from audit_logs
             where action = 'user.status' and resource_id = :'customerA')),
            'والإيقاف يُقيَّد في سجل التدقيق');
rollback;

\echo '── سجل التدقيق وصحة النظام والتقارير ──'
begin;
select t.login(:'adminOwner');
select t.ok((select count(*) >= 0 from audit_log_page()), 'المالك يقرأ سجل التدقيق');
select t.ok((select (system_health() -> 'email') ? 'queued'),
            'ويقرأ عدّادات صندوق البريد المغلق على service_role');
select t.ok((select (platform_reports(30) ->> 'days') = '30'), 'ويقرأ التقارير');
select t.login(:'adminSup');
select t.throws('select 1 from audit_log_page()', '★ موظف الدعم لا يقرأ سجل التدقيق');
select t.throws('select system_health()', '★ ولا صحة النظام');
select t.throws('select platform_reports()', '★ ولا التقارير');
select t.login(:'ownerA');
select t.throws('select system_health()', '★ ولا التاجر');
rollback;

\echo '── الشركاء ──'
begin;
select t.login(:'adminOps');
select t.ok((select referrals_count = 1 from partner_admin_list()
             where partner_id = :'P1'),
            'موظف الشركاء يرى إحالات الشريك');
select t.ok((select payable >= 0 from partner_admin_list() where partner_id = :'P1'),
            'ورصيده المستحق معه');
select t.login(:'adminSup');
select t.throws('select 1 from partner_admin_list()',
                '★ موظف الدعم لا يرى قائمة الشركاء');
rollback;

\echo '── دعوة شريك وقبولها ──'
begin;
select t.login(:'adminSup');
select t.throws('select 1 from invite_partner(''شريك'', ''x@test.local'')',
                '★ الدعوة تحتاج partners:edit');

select t.login(:'adminOps');
select t.throws('select 1 from invite_partner(''شريك'', ''ليس-بريدًا'')',
                '★ بريد غير صالح يُرفض');
select t.throws('select 1 from invite_partner(''شريك'', ''partner1@test.local'')',
                '★ بريد مدعوّ مسبقًا يُرفض');

select token as ptok, partner_id as pid from invite_partner('شريك ثانٍ', 'p2@test.local')
\gset
select t.reset();
select t.ok((select status = 'invited' and profile_id is null and invite_token_hash is not null
             from partners where id = :'pid'),
            'الشريك يُنشأ مدعوًّا بتوكن مجزّأ');
select t.ok((select invite_token_hash <> :'ptok' from partners where id = :'pid'),
            '★ والتوكن الخام لا يُخزَّن كما هو');
select t.ok((select commission_rate = (select default_partner_rate from platform_settings)
             from partners where id = :'pid'),
            'والنسبة تأتي من إعدادات المنصة لا من الواجهة');

select t.login(:'customerA');
select t.throws('select 1 from accept_partner_invitation(''توكن-خاطئ'')',
                '★ توكن خاطئ يُرفض');
select t.ok((select partner_id = :'pid' from accept_partner_invitation(:'ptok')),
            'صاحب الرابط يقبل الدعوة');
select t.reset();
select t.ok((select status = 'active' and profile_id = :'customerA'
             and invite_token_hash is null from partners where id = :'pid'),
            '★ والتوكن يُستهلك فلا يُقبل مرتين');
select t.login(:'customerA');
select t.throws('select 1 from accept_partner_invitation(' || quote_literal(:'ptok') || ')',
                '★ ومحاولة إعادة استخدامه تُرفض');
rollback;

\echo '── حالة الشريك ونسبته ──'
begin;
select t.login(:'adminSup');
select t.throws('select set_partner_status(' || quote_literal(:'P1') || ', ''suspended'')',
                '★ موظف الدعم لا يوقف شريكًا');

select t.login(:'adminOps');
select set_partner_status(:'P1', 'suspended');
select t.reset();
select t.ok((select status = 'suspended' from partners where id = :'P1'),
            'موظف الشركاء يوقف الشريك');
select t.ok((select count(*) = 1 from referrals where partner_id = :'P1'),
            '★ وإحالاته السابقة تبقى — العمل الماضي مستحَق');

select t.login(:'adminOps');
select t.throws('select set_partner_rate(' || quote_literal(:'P1') || ', 60)',
                '★★ نسبة العمولة لا يغيّرها إلا commissions:manage');
select t.login(:'adminOwner');
select set_partner_rate(:'P1', 60);
select t.reset();
select t.ok((select commission_rate = 60 from partners where id = :'P1'),
            'والمالك يغيّرها');
select t.login(:'adminOwner');
select t.throws('select set_partner_rate(' || quote_literal(:'P1') || ', 140)',
                '★ ونسبة خارج 0–100 تُرفض');
rollback;

\echo '── مكتب الدعم ──'
begin;
select t.reset();
update profiles set full_name = 'صاحب متجر أ' where id = :'ownerA';
select t.login(:'ownerA');
select ticket_id as tid from create_support_ticket('مشكلة في الدفع', 'billing',
                                                   'لم تصل الدفعة', :'A')
\gset

select t.login(:'adminSup');
select t.ok((select requester_name is not null from support_queue()
             where ticket_id = :'tid'),
            '★ موظف الدعم يرى اسم صاحب التذكرة دون فتح جدول المستخدمين');
select t.ok((select count(*) = 1 from support_queue('open')),
            'وتصفية «المفتوحة» تعمل');
select t.ok((select (support_ticket_admin(:'tid') -> 'messages') <> '[]'::jsonb),
            'ويقرأ الرسائل');
select t.ok((select (support_ticket_admin(:'tid') -> 'notes') = '[]'::jsonb),
            'ولا ملاحظات داخلية بعد');

\o /dev/null
select add_internal_note(:'tid', 'راجعنا سجل الدفع');
\o
select t.ok((select jsonb_array_length(support_ticket_admin(:'tid') -> 'notes') = 1),
            'ويضيف ملاحظة داخلية');

select assign_ticket(:'tid', 'ad000000-0000-0000-0000-00000000000b');
select t.reset();
select t.ok((select assigned_to = 'ad000000-0000-0000-0000-00000000000b'
             from support_tickets where id = :'tid'),
            'والإسناد يُسجَّل');
select t.ok((select exists (select 1 from support_events
             where ticket_id = :'tid' and event = 'assigned')),
            'ويُقيَّد في سجل أحداث التذكرة');

rollback;

\echo '── حالة التذكرة: آلة الحالة لا تُتجاوز ──'
begin;
select t.login(:'ownerA');
select ticket_id as tid2 from create_support_ticket('سؤال عن الباقة', 'other',
                                                   'أريد معرفة الفرق بين الباقات', :'A')
\gset
select t.login(:'adminSup');
select t.throws('select set_ticket_status(' || quote_literal(:'tid2')
                || ', ''waiting_customer'')',
                '★★ new → waiting_customer مرفوض (آلة الحالة في 0012)');
select set_ticket_status(:'tid2', 'in_progress', 'high');
select t.reset();
select t.ok((select status = 'in_progress' and priority = 'high'
             from support_tickets where id = :'tid2'),
            'والانتقال المسموح يمرّ مع الأولوية');

select t.login(:'adminSup');
select set_ticket_status(:'tid2', 'resolved');
select t.reset();
select t.ok((select resolved_at is not null from support_tickets where id = :'tid2'),
            'والحلّ يختم وقته');
select t.ok((select exists (select 1 from notifications
             where user_id = :'ownerA' and type = 'support.status')),
            'وصاحب التذكرة يُنبَّه');

select t.login(:'ownerA');
select t.throws('select set_ticket_status(' || quote_literal(:'tid2') || ', ''closed'')',
                '★ صاحب التذكرة لا يستخدم مسار الموظفين');
select t.throws('select 1 from support_queue()',
                '★ ولا يرى طابور الدعم');
select t.throws('select support_ticket_admin(' || quote_literal(:'tid2') || ')',
                '★ ولا نافذة الموظف على تذكرته');
select t.empty('select 1 from support_internal_notes',
               '★★ والملاحظات الداخلية لا تصله بحال');
rollback;
select t.reset();

\echo '✓ اختبارات أقسام الإدارة مرّت'
