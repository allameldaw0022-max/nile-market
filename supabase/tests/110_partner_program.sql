\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set B b0000000-0000-0000-0000-00000000000b
\set ownerA  11111111-1111-1111-1111-111111111111
\set ownerB  22222222-2222-2222-2222-222222222222
\set custA   77777777-7777-7777-7777-777777777777
\set adminOwner 88888888-8888-8888-8888-888888888888
\set adminFin   aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
\set adminOps   cccccccc-cccc-cccc-cccc-cccccccccccc
\set PARTNER 9a000000-0000-0000-0000-00000000000a
\set partnerUser bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb

-- =====================================================================
-- التسجيل كشريك
-- =====================================================================
\echo '── التسجيل الذاتي كشريك ──'
begin;
select t.reset();
select t.logout();
select t.throws('select 1 from become_partner()',
                '★★ الزائر لا يُنشئ ملف شريك');

select t.login(:'custA');
select partner_id as pid, referral_code as code, serial_no as sn,
       was_created as made
  from become_partner()
\gset
select t.ok(:'made' = 't', '★ المستخدم المسجَّل ينشئ ملف شريك بنفسه');
select t.reset();
select t.ok((select commission_rate = (select default_partner_rate from platform_settings)
             from partners where id = :'pid'),
            '★★ النسبة من `platform_settings.default_partner_rate` — موضع واحد');
select t.ok((select commission_rate = 30 from partners where id = :'pid'),
            'وهي 30%');
select t.ok((select status = 'active' and profile_id = :'custA'
             from partners where id = :'pid'),
            'والملف نشط ومربوط بالحساب');

-- لا ملف ثانٍ مهما تكرّر النداء
select t.login(:'custA');
select t.ok((select was_created = false from become_partner()),
            '★★ نداء ثانٍ لا يُنشئ ملفًا ثانيًا');
select t.reset();
select t.ok((select count(*) = 1 from partners where profile_id = :'custA'),
            'وصف واحد في الجدول');
rollback;

\echo '── حدود التسجيل الذاتي ──'
begin;
select t.reset();
select t.login(:'adminFin');
select t.throws('select 1 from become_partner()',
                '★★★ موظف المنصة لا يصير شريكًا — من يعتمد العمولة لا يستحقّها');
rollback;

begin;
select t.reset();
select t.login(:'adminOwner');
update profiles set account_status = 'suspended' where id = :'custA';
select t.login(:'custA');
select t.throws('select 1 from become_partner()',
                '★★ وحساب موقوف لا يصير شريكًا');
rollback;

-- =====================================================================
-- الرقم القصير والرابط
-- =====================================================================
\echo '── الرقم التسلسلي والرابط القصير ──'
begin;
select t.reset();
select t.ok((select count(*) = count(serial_no) from partners),
            '★ كل شريك له رقم تسلسلي');
select t.ok((select count(distinct serial_no) = count(*) from partners),
            '★★ والأرقام فريدة');

select serial_no as sn1, referral_code as rc1 from partners where id = :'PARTNER'
\gset
select t.logout();
select t.ok((select partner_code_by_serial(:'sn1') = :'rc1'),
            '★★ الرقم القصير يترجَم إلى رمز الإحالة نفسه — لا نظام إسناد ثانٍ');
select t.ok((select partner_code_by_serial(999999) is null),
            'ورقم لا وجود له لا يترجَم');

-- شريك موقوف: رابطه لا يُسنِد
select t.reset();
update partners set status = 'suspended' where id = :'PARTNER';
select t.logout();
select t.ok((select partner_code_by_serial(:'sn1') is null),
            '★★ ورابط شريك موقوف لا يُترجَم ⇒ لا يُسنِد');
rollback;

begin;
select t.reset();
-- الرقم ثابت: لا يغيّره أحد، ولا يُعاد استخدامه
select t.throws('update partners set serial_no = 999 where id = ' || quote_literal(:'PARTNER')
                || ' returning (select 1/(case when serial_no = 999 then 1 else 0 end))',
                '★★★ الرقم التسلسلي لا يتغيّر (الحارس يردّه)');
select t.ok((select serial_no <> 999 from partners where id = :'PARTNER'),
            'ويبقى كما كان');
select t.reset();
update partners set referral_code = 'HIJACKED' where id = :'PARTNER';
select t.ok((select referral_code <> 'HIJACKED' from partners where id = :'PARTNER'),
            '★★★ ورمز الإحالة كذلك — الرابط المنشور عهد');
rollback;

\echo '── الرابط القديم يعمل كما هو ──'
begin;
select t.reset();
select referral_code as rc from partners where id = :'PARTNER'
\gset
select t.logout();
select t.ok((select record_referral_visit(:'rc',
               'legacyvisitor0123456789abcdef0123', '/', '1.2.3.4', 'ua')),
            '★★ الرابط القديم ?ref=CODE ما زال يسجّل الزيارة');
select t.ok((select record_referral_visit(
               (select partner_code_by_serial(:'sn1')),
               'shortvisitor0123456789abcdef01234', '/', '1.2.3.4', 'ua')),
            '★★ والرابط القصير يدخل نفس النظام');
select t.reset();
select t.ok((select count(*) = 2 from referral_visits
             where partner_id = :'PARTNER'
               and visitor_token in ('legacyvisitor0123456789abcdef0123',
                                     'shortvisitor0123456789abcdef01234')),
            'وكلاهما زيارة في نفس الجدول');
rollback;

\echo '── الأشكال الثلاثة تُسنِد إلى نفس الشريك ──'
begin;
select t.reset();
select serial_no as sn2, referral_code as rc2 from partners where id = :'PARTNER'
\gset
select t.logout();
-- `/1` و`/r/1` يمرّان بنفس الترجمة، و`?ref=CODE` يستعمل الرمز مباشرة
select t.ok((select partner_code_by_serial(:'sn2') = :'rc2'),
            '★★ `/1` و`/r/1` يترجمان إلى نفس رمز `?ref=`');

\o /dev/null
select record_referral_visit(:'rc2', 'formpath0123456789abcdef01234567', '/1');
select record_referral_visit((select partner_code_by_serial(:'sn2')),
                             'formshort0123456789abcdef0123456', '/r/1');
select record_referral_visit(:'rc2', 'formlegacy0123456789abcdef01234', '/');
\o
select t.reset();
select t.ok((select count(*) = 3 from referral_visits
             where partner_id = :'PARTNER'
               and visitor_token in ('formpath0123456789abcdef01234567',
                                     'formshort0123456789abcdef0123456',
                                     'formlegacy0123456789abcdef01234')),
            '★★★ والثلاثة يسجّلون في نفس الجدول لنفس الشريك');

-- ونتيجة الإسناد واحدة أيًّا كان الشكل الذي جاء منه الزائر
select t.ok((select app.attribute_referral(:'B', 'formpath0123456789abcdef01234567')
             is not null),
            'الإسناد من `/1` ينجح');
select t.ok((select partner_id = :'PARTNER' from referrals where store_id = :'B'),
            '★★★ ويُسنِد إلى نفس الشريك تمامًا');
rollback;

\echo '── رقم لا شريك له: لا إحالة ولا زيارة ──'
begin;
select t.reset();
select t.logout();
select t.ok((select partner_code_by_serial(987654) is null),
            '★★ رقم مخترَع لا يُترجَم ⇒ لا رابط إحالة منه');
select t.ok((select record_referral_visit(null, 'ghost0123456789abcdef0123456789')
             = false),
            '★★★ ولا تُسجَّل له زيارة');
select t.reset();
select t.ok((select count(*) = 0 from referral_visits
             where visitor_token = 'ghost0123456789abcdef0123456789'),
            'ولا صفّ في الجدول');
rollback;

\echo '── الإسناد: آخر لمسة · نافذة 30 يومًا · لا إسناد ذاتي ──'
begin;
select t.reset();
-- متجر ب بلا إحالة في البذرة
insert into referral_visits (partner_id, visitor_token, landing_path)
values (:'PARTNER', 'attrvisitor0123456789abcdef01234', '/');
select t.ok((select app.attribute_referral(:'B', 'attrvisitor0123456789abcdef01234')
             is not null),
            '★ زيارة داخل النافذة تُسنِد المتجر للشريك');
select t.ok((select partner_id = :'PARTNER' from referrals where store_id = :'B'),
            'والعلاقة تُكتب');
select t.ok((select app.attribute_referral(:'B', 'attrvisitor0123456789abcdef01234')
             is null),
            '★★ والإسناد لا يتكرّر — العلاقة ثابتة بعد إنشائها');
rollback;

begin;
select t.reset();
insert into referral_visits (partner_id, visitor_token, landing_path, created_at)
values (:'PARTNER', 'oldvisitor0123456789abcdef012345', '/', now() - interval '31 days');
select t.ok((select app.attribute_referral(:'B', 'oldvisitor0123456789abcdef012345')
             is null),
            '★★ زيارة أقدم من 30 يومًا لا تُسنِد');
rollback;

begin;
select t.reset();
-- الشريك يملك متجر ب (نربطه مؤقتًا) ⇒ لا يُحيل نفسه
-- (متجر ب بلا إحالة في البذرة، و`app.protect_referral` يرفض الحذف)
update partners set profile_id = :'ownerB' where id = :'PARTNER';
insert into referral_visits (partner_id, visitor_token, landing_path)
values (:'PARTNER', 'selfvisitor0123456789abcdef01234', '/');
select t.ok((select app.attribute_referral(:'B', 'selfvisitor0123456789abcdef01234')
             is null),
            '★★★ ولا يُحيل الشريك متجرًا يملكه');
select t.ok((select count(*) = 0 from referrals where store_id = :'B'),
            'ولا علاقة تُكتب');
rollback;

-- =====================================================================
-- العمولة: عند الدفع المؤكَّد وحده
-- =====================================================================
\echo '── العمولة: لا شيء قبل الدفع المؤكَّد ──'
begin;
select t.reset();
insert into referrals (partner_id, store_id, attribution_source)
values (:'PARTNER', :'B', 'admin_manual');

select t.ok((select count(*) = 0 from commission_ledger where store_id = :'B'),
            '★★ تسجيل المتجر وربطه بالشريك لا يُنشئ عمولة');

select t.login(:'ownerB');
insert into subscription_requests
  (store_id, plan_id, amount, discount_amount, net_amount, idempotency_key)
values (:'B', (select id from plans where code='basic'), 20000, 0, 20000, 'pp-req');
select t.reset();
select t.ok((select count(*) = 0 from commission_ledger where store_id = :'B'),
            '★★★ وطلب اشتراك معلّق (قبل تأكيد الدفع) لا يُنشئ عمولة');

select t.login(:'adminFin');
\o /dev/null
select record_payment('subscription',
  (select id from subscription_requests where idempotency_key='pp-req'),
  'bank_transfer', 20000, 'TRX-PP', null, 'pp-pay');
\o
select t.reset();
select t.ok((select amount = 6000 and rate_applied = 30 and status = 'payable'
             from commission_ledger where store_id = :'B'),
            '★★★ الدفع المؤكَّد وحده يُنشئ العمولة: 30% من 20,000');

-- محاولة احتساب ثانية لنفس الدفعة
select app.post_commission_for_payment(
  (select id from payments where idempotency_key='pp-pay'));
select t.ok((select count(*) = 1 from commission_ledger where store_id = :'B'),
            '★★★ ونفس الدفعة لا تُنتج عمولة ثانية (unique على payment_id)');

-- تجديد ⇒ عمولة جديدة
select t.login(:'ownerB');
insert into subscription_requests
  (store_id, plan_id, amount, discount_amount, net_amount, idempotency_key)
values (:'B', (select id from plans where code='basic'), 20000, 0, 20000, 'pp-ren');
select t.login(:'adminFin');
\o /dev/null
select record_payment('subscription',
  (select id from subscription_requests where idempotency_key='pp-ren'),
  'bank_transfer', 20000, 'TRX-PP2', null, 'pp-pay2');
\o
select t.reset();
select t.ok((select count(*) = 2 and sum(amount) = 12000
             from commission_ledger where store_id = :'B'),
            '★★★ وكل تجديد مؤكَّد يُنشئ عمولة جديدة');
rollback;

-- =====================================================================
-- الصرف
-- =====================================================================
\echo '── بيانات الاستلام شرط الصرف ──'
begin;
select t.reset();
insert into commission_ledger
  (partner_id, store_id, entry_kind, amount, status, base_amount, rate_applied)
values (:'PARTNER', :'A', 'commission', 6000, 'payable', 20000, 30);

select t.login(:'partnerUser');
select t.ok((select is_complete = false from partner_payout_account()),
            'بيانات الاستلام ناقصة في البداية');
select t.throws('select 1 from request_partner_payout()',
                '★★★ لا طلب صرف قبل استكمال بيانات الاستلام');
select t.throws('select save_partner_payout_account(''paypal'', ''اسم'')',
                '★★ ولا وسيلة استلام غير مدعومة');
select t.throws('select save_partner_payout_account(''bank_transfer'', ''اسم'', ''بنك'', ''12'')',
                '★ ورقم حساب قصير مرفوض');
select save_partner_payout_account('bank_transfer', 'أباذر ميرغني',
                                   'بنك الخرطوم', '1234567890');
select t.ok((select is_complete from partner_payout_account()),
            'وبعد استكمالها تكتمل');
rollback;

\echo '── الطلب يحجز، والرفض يعيد، والاعتماد ليس دفعًا ──'
begin;
select t.reset();
insert into commission_ledger
  (partner_id, store_id, entry_kind, amount, status, base_amount, rate_applied)
values (:'PARTNER', :'A', 'commission', 6000, 'payable', 20000, 30);

select t.login(:'partnerUser');
select save_partner_payout_account('bankak', 'أباذر ميرغني', null, null, '0911111111');
select payout_id as pid, amount as amt from request_partner_payout()
\gset
select t.ok(:'amt'::numeric = 6000,
            '★★ المبلغ يُحسب في القاعدة من العمولات المتاحة');
select t.reset();
select t.ok((select status = 'reserved' and payout_id = :'pid'
             from commission_ledger where partner_id = :'PARTNER'),
            '★★★ والعمولة محجوزة ومرتبطة بالطلب في نفس المعاملة');
select t.ok((select payable = 0 and reserved = 6000
             from partner_balances where partner_id = :'PARTNER'),
            'فلا تظهر متاحة مرة أخرى');
select t.ok((select account_snapshot ->> 'phone' = '0911111111'
             from partner_payouts where id = :'pid'),
            '★★ ولقطة بيانات الاستلام محفوظة في الطلب');

-- تغيير الحساب لاحقًا لا يغيّر لقطة طلب قائم
select t.login(:'partnerUser');
select save_partner_payout_account('bankak', 'اسم آخر', null, null, '0999999999');
select t.reset();
select t.ok((select account_snapshot ->> 'phone' = '0911111111'
             from partner_payouts where id = :'pid'),
            '★★★ وتغيير الحساب لاحقًا لا يمسّ لقطة طلب قديم');

-- طلب ثانٍ بنفس الرصيد مرفوض
select t.login(:'partnerUser');
select t.throws('select 1 from request_partner_payout()',
                '★★★ ولا طلب ثانٍ ورصيد الأول محجوز');

-- الرفض يعيد الرصيد
select t.login(:'adminOwner');
\o /dev/null
select review_payout(:'pid', 'record');
\o
select t.login(:'adminFin');
\o /dev/null
select review_payout(:'pid', 'reject', 'رقم الحساب غير صحيح');
\o
select t.reset();
select t.ok((select status = 'payable' and payout_id is null
             from commission_ledger where partner_id = :'PARTNER'),
            '★★★ الرفض يعيد العمولة متاحة — لا تضيع ولا تصير مدفوعة');
select t.ok((select payable = 6000 from partner_balances where partner_id = :'PARTNER'),
            'والرصيد يعود');
select t.ok((select rejected_reason = 'رقم الحساب غير صحيح'
             from partner_payouts where id = :'pid'),
            'والسبب يظهر للشريك');
select t.ok((select exists (select 1 from notifications
             where user_id = :'partnerUser' and type = 'payout.rejected')),
            'ويُنبَّه بالرفض');
select t.ok((select count(*) = 0 from ledger_entries
             where entry_type = 'partner_payout'),
            '★★ ولا قيد مالي: الرفض ليس صرفًا');
rollback;

\echo '── الاعتماد ≠ الدفع ──'
begin;
select t.reset();
insert into commission_ledger
  (partner_id, store_id, entry_kind, amount, status, base_amount, rate_applied)
values (:'PARTNER', :'A', 'commission', 6000, 'payable', 20000, 30);
select t.login(:'partnerUser');
select save_partner_payout_account('bankak', 'أباذر ميرغني', null, null, '0911111111');
select payout_id as pid from request_partner_payout()
\gset
select t.login(:'adminOwner');
\o /dev/null
select review_payout(:'pid', 'record');
\o
select t.login(:'adminFin');
\o /dev/null
select review_payout(:'pid', 'approve');
\o
select t.reset();
select t.ok((select status = 'approved' from partner_payouts where id = :'pid'),
            'الطلب معتمد');
select t.ok((select status = 'reserved' from commission_ledger where partner_id = :'PARTNER'),
            '★★★ والعمولة ما زالت محجوزة لا مدفوعة — الاعتماد ليس تحويلًا');
select t.ok((select count(*) = 0 from ledger_entries where entry_type = 'partner_payout'),
            '★★ ولا قيد صرف بعد');

-- الدفع يحتاج صلاحية payouts:approve ومرجع تحويل
select t.login(:'adminOps');
select t.throws('select mark_payout_paid(' || quote_literal(:'pid') || ', ''REF'')',
                '★★★ وموظف بلا payouts:approve لا يؤكّد الدفع');
select t.login(:'adminFin');
select t.throws('select mark_payout_paid(' || quote_literal(:'pid') || ')',
                '★★ ولا دفع بلا مرجع تحويل');
select t.ok((select mark_payout_paid(:'pid', 'TRF-9', now(), 'حُوّل عبر بنكك') = 6000),
            'وبمرجع التحويل يُسجَّل الدفع');
select t.reset();
select t.ok((select status = 'paid' and payout_id = :'pid'
             from commission_ledger where partner_id = :'PARTNER'),
            '★★★ والعمولة تصير مدفوعة');
select t.ok((select reference = 'TRF-9' and transferred_at is not null
             and paid_at is not null from partner_payouts where id = :'pid'),
            'ومرجع التحويل وتاريخه محفوظان');
select t.ok((select count(*) = 1 from ledger_entries where entry_type = 'partner_payout'),
            'والقيد المالي يُكتب مرة واحدة');
select t.ok((select exists (select 1 from notifications
             where user_id = :'partnerUser' and type = 'payout.paid')),
            'ويُنبَّه بالتحويل');

-- الشريك لا يعدّل بيانات التحويل
select t.login(:'partnerUser');
select t.no_effect('update partner_payouts set reference = ''مزوّر'' where id = '
                   || quote_literal(:'pid'),
                   '★★★ والشريك لا يعدّل مرجع التحويل');
rollback;

\echo '── الاسترداد بعد الصرف يترك دينًا لا يضيع ──'
begin;
select t.reset();
insert into commission_ledger
  (partner_id, store_id, entry_kind, amount, status, base_amount, rate_applied)
values (:'PARTNER', :'A', 'commission', 6000, 'payable', 20000, 30);
insert into commission_ledger
  (partner_id, store_id, entry_kind, amount, status, base_amount, rate_applied)
values (:'PARTNER', :'A', 'reversal', -2000, 'reversed', 6667, 30);
select t.ok((select payable = 4000 from partner_balances where partner_id = :'PARTNER'),
            '★★ المتاح يطرح قيد العكس: 6,000 − 2,000');
select t.login(:'partnerUser');
select save_partner_payout_account('bankak', 'أباذر ميرغني', null, null, '0911111111');
select t.ok((select amount = 4000 from request_partner_payout()),
            '★★★ والصرف على الصافي لا على الإجمالي');
select t.reset();
select t.ok((select count(*) = 2 from commission_ledger
             where partner_id = :'PARTNER' and payout_id is not null),
            'والقيدان معًا مرتبطان بالطلب فلا يُحتسب العكس مرتين');
rollback;

-- =====================================================================
-- العزل والأمان
-- =====================================================================
\echo '── عزل الشركاء ──'
begin;
select t.reset();
select t.login(:'custA');
select partner_id as pid_b from become_partner()
\gset
select t.reset();
insert into commission_ledger
  (partner_id, store_id, entry_kind, amount, status, base_amount, rate_applied)
values (:'PARTNER', :'A', 'commission', 6000, 'payable', 20000, 30);
insert into partner_payouts (partner_id, amount, initiated_by, initiated_by_kind,
                             status, idempotency_key)
values (:'PARTNER', 6000, :'partnerUser', 'partner', 'submitted', 'iso-1');

select t.login(:'custA');
select t.empty('select 1 from partners where id = ' || quote_literal(:'PARTNER'),
               '★★★ شريك لا يقرأ صفّ شريك آخر');
select t.empty('select 1 from commission_ledger where partner_id = ' || quote_literal(:'PARTNER'),
               '★★★ ولا عمولاته');
select t.empty('select 1 from partner_payouts where partner_id = ' || quote_literal(:'PARTNER'),
               '★★★ ولا طلبات صرفه');
select t.throws('select 1 from partner_payout_rows(' || quote_literal(:'PARTNER') || ')',
                '★★★ ولا يمرّر معرّفه ليقرأها');
select t.throws('select 1 from partner_commission_rows(' || quote_literal(:'PARTNER') || ')',
                '★★★ ولا عمولاته بهذا الطريق');
select t.throws('select 1 from partner_referred_stores(' || quote_literal(:'PARTNER') || ')',
                '★★★ ولا تجاره');
select t.throws('select cancel_partner_payout('
                || '(select id from partner_payouts where idempotency_key = ''iso-1''))',
                '★★★ ولا يسحب طلب صرف غيره');

-- ولا يمسّ ماله ولا مال غيره
select t.no_effect('update partners set commission_rate = 90 where id = ' || quote_literal(:'pid_b'),
                   '★★★ ولا يرفع نسبته');
select t.throws('insert into partner_payouts (partner_id, amount, status, idempotency_key)'
                || ' values (' || quote_literal(:'pid_b') || ', 99999, ''submitted'', ''hack-1'')',
                '★★★ ولا يُدرج طلب صرف بمبلغ من عنده');
select t.throws('insert into commission_ledger (partner_id, store_id, entry_kind, amount,'
                || ' status, base_amount, rate_applied) values (' || quote_literal(:'pid_b')
                || ', ' || quote_literal(:'A') || ', ''commission'', 99999, ''payable'', 1, 1)',
                '★★★ ولا يُنشئ عمولة لنفسه');
select t.throws('insert into referrals (partner_id, store_id, attribution_source) values ('
                || quote_literal(:'pid_b') || ', ' || quote_literal(:'A') || ', ''admin_manual'')',
                '★★★ ولا يربط نفسه بتاجر');
rollback;

\echo '── الإدارة ترى، وبصلاحياتها ──'
begin;
select t.reset();
insert into commission_ledger
  (partner_id, store_id, entry_kind, amount, status, base_amount, rate_applied)
values (:'PARTNER', :'A', 'commission', 6000, 'payable', 20000, 30);
insert into partner_payouts (partner_id, amount, initiated_by, initiated_by_kind,
                             status, idempotency_key, account_snapshot)
values (:'PARTNER', 6000, :'partnerUser', 'partner', 'submitted', 'adm-1',
        jsonb_build_object('method', 'bankak', 'phone', '0911111111'));

select t.login(:'adminFin');          -- payouts:approve
select t.ok((select count(*) = 1 from partner_payout_rows(:'PARTNER')),
            '★ موظف الصرف يرى طلبات الشريك');
select t.ok((select account_snapshot ->> 'phone' = '0911111111'
             from partner_payout_rows(:'PARTNER')),
            '★★ ويرى بيانات الاستلام — هو من سيحوّل');

select t.login(:'custA');
select t.throws('select 1 from partner_payout_rows(' || quote_literal(:'PARTNER') || ')',
                '★★★ وغيره لا يرى شيئًا منها');

-- الشريك يرى لقطته الخاصة؟ لا — اللقطة لمن يحوّل
select t.login(:'partnerUser');
select t.ok((select count(*) >= 1 from partner_payout_rows()),
            'والشريك يرى طلباته هو');
select t.ok((select account_snapshot is null from partner_payout_rows()
             where payout_id = (select id from partner_payouts
                                 where idempotency_key = 'adm-1')),
            'بلا لقطة الحساب — لا حاجة له بها');
rollback;

\echo '✓ اختبارات برنامج الشركاء مرّت'
