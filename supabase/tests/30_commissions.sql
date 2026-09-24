\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set PARTNER 9a000000-0000-0000-0000-00000000000a
\set ownerA  11111111-1111-1111-1111-111111111111
\set adminOwner 88888888-8888-8888-8888-888888888888
\set adminFin   aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
\set adminSup   99999999-9999-9999-9999-999999999999
\set adminOps   cccccccc-cccc-cccc-cccc-cccccccccccc
\set partnerUser bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb

\echo '── المثال المعتمد: 20,000 − 5,000 = 15,000 ⇒ 4,500 بنسبة 30% ──'
begin;
select t.login(:'ownerA');
insert into subscription_requests (store_id, plan_id, amount, discount_amount, net_amount, idempotency_key)
values (:'A', (select id from plans where code='basic'), 20000, 5000, 15000, 'req-1');

select t.login(:'adminFin');
select record_payment('subscription',
  (select id from subscription_requests where idempotency_key='req-1'),
  'bank_transfer', 15000, 'TRX-1', null, 'pay-1');

select t.reset();
select t.ok((select amount = 4500 from commission_ledger where entry_kind='commission'),
            'عمولة المسوّق = 4,500 من صافي 15,000 بنسبة 30%');
select t.ok((select base_amount = 15000 and rate_applied = 30 from commission_ledger),
            'الأساس هو المدفوع فعليًا والنسبة ملقَّطة');
select t.ok((select balance = 10500 from ledger_balances
             where account_kind='platform'),
            'حصة المنصة = 10,500 (15,000 إيراد − 4,500 عمولة)');
select t.ok((select balance = 4500 from ledger_balances
             where account_kind='partner' and account_id = :'PARTNER'),
            'رصيد المسوّق = 4,500');
select t.ok((select status = 'active' and current_period_end > now() from subscriptions where store_id = :'A'),
            'الاشتراك فُعّل بنفس المعاملة');
rollback;

\echo '── منع العمولة المكررة (حاجز بنيوي) ──'
begin;
select t.login(:'ownerA');
insert into subscription_requests (store_id, plan_id, amount, discount_amount, net_amount, idempotency_key)
values (:'A', (select id from plans where code='basic'), 20000, 5000, 15000, 'req-2');
select t.login(:'adminFin');
select record_payment('subscription',
  (select id from subscription_requests where idempotency_key='req-2'),
  'bank_transfer', 15000, 'TRX-2', null, 'pay-2');
-- محاولة احتساب ثانية صراحةً
select app.post_commission_for_payment((select id from payments where idempotency_key='pay-2'));
select app.post_commission_for_payment((select id from payments where idempotency_key='pay-2'));
select t.reset();
select t.ok((select count(*) = 1 from commission_ledger
             where payment_id = (select id from payments where idempotency_key='pay-2')
               and entry_kind='commission'),
            'ثلاث محاولات احتساب ⇒ صف عمولة واحد');
rollback;

\echo '── Idempotency على الدفع ──'
begin;
select t.login(:'ownerA');
insert into subscription_requests (store_id, plan_id, amount, discount_amount, net_amount, idempotency_key)
values (:'A', (select id from plans where code='basic'), 20000, 0, 20000, 'req-3');
select t.login(:'adminFin');
select record_payment('subscription',
  (select id from subscription_requests where idempotency_key='req-3'),
  'bank_transfer', 20000, 'TRX-3', null, 'same-pay');
select record_payment('subscription',
  (select id from subscription_requests where idempotency_key='req-3'),
  'bank_transfer', 20000, 'TRX-3', null, 'same-pay');
select t.reset();
select t.ok((select count(*) = 1 from payments where idempotency_key='same-pay'),
            'نفس مفتاح Idempotency ⇒ دفعة واحدة');
rollback;

\echo '── لا دفع ⇒ لا عمولة ──'
begin;
select t.reset();
select t.ok((select app.post_commission_for_payment(gen_random_uuid()) is null),
            'دفعة غير موجودة ⇒ لا عمولة');
rollback;

\echo '── السجلات المالية إلحاقية ──'
begin;
select t.login(:'ownerA');
insert into subscription_requests (store_id, plan_id, amount, discount_amount, net_amount, idempotency_key)
values (:'A', (select id from plans where code='basic'), 20000, 5000, 15000, 'req-4');
select t.login(:'adminFin');
select record_payment('subscription',
  (select id from subscription_requests where idempotency_key='req-4'),
  'bank_transfer', 15000, 'TRX-4', null, 'pay-4');

select t.throws('update commission_ledger set amount = 999999', 'تعديل عمولة مرفوض');
select t.throws('delete from commission_ledger',                'حذف عمولة مرفوض');
select t.throws('update ledger_entries set amount = 1',         'تعديل قيد مالي مرفوض');
select t.throws('delete from ledger_entries',                   'حذف قيد مالي مرفوض');
select t.throws('delete from payments',                         'حذف دفعة مرفوض');
select t.throws('update payments set amount = 1 where idempotency_key = ''pay-4''',
                'تعديل مبلغ دفعة مؤكَّدة مرفوض');

-- ★ نفس المحاولات عبر service_role (يتجاوز RLS) — يجب أن تفشل أيضًا
select t.reset();
set local role service_role;
select t.throws('update commission_ledger set amount = 999999',
                'service_role أيضًا لا يعدّل العمولات');
select t.throws('delete from ledger_entries',
                'service_role أيضًا لا يحذف القيود المالية');
rollback;

\echo '── ★ فصل المهام: لا bypass حتى من service_role (D29/D30) ──'
begin;
select t.reset();
set local role service_role;
-- نفس الشخص طالبًا ومعتمِدًا ⇒ انتهاك CHECK
select t.throws_check(
  'insert into partner_payouts (partner_id, amount, requested_by, approved_by, idempotency_key, status)'
  || ' values (' || quote_literal(:'PARTNER') || ', 1000, ' || quote_literal(:'adminFin')
  || ', ' || quote_literal(:'adminFin') || ', ''sod-1'', ''approved'')',
  'طالب = معتمِد ⇒ يرفضه قيد CHECK رغم service_role');

-- الشريك نفسه معتمِدًا ⇒ انتهاك CHECK
select t.throws(
  'insert into partner_payouts (partner_id, amount, initiated_by, requested_by, approved_by, idempotency_key, status)'
  || ' values (' || quote_literal(:'PARTNER') || ', 1000, ' || quote_literal(:'partnerUser')
  || ', ' || quote_literal(:'adminFin') || ', ' || quote_literal(:'partnerUser')
  || ', ''sod-2'', ''approved'')',
  'الشريك لا يعتمد صرف نفسه (يمسكه حارس الأطراف أولًا)');

-- اعتماد بلا تسجيل إداري ⇒ مرفوض
select t.throws(
  'insert into partner_payouts (partner_id, amount, initiated_by, approved_by, idempotency_key, status)'
  || ' values (' || quote_literal(:'PARTNER') || ', 1000, ' || quote_literal(:'partnerUser')
  || ', ' || quote_literal(:'adminFin') || ', ''sod-3'', ''approved'')',
  'اعتماد قبل التسجيل الإداري مرفوض');

-- معتمِد ليس موظف منصة ⇒ مرفوض
select t.throws(
  'insert into partner_payouts (partner_id, amount, requested_by, approved_by, idempotency_key, status)'
  || ' values (' || quote_literal(:'PARTNER') || ', 1000, ' || quote_literal(:'adminFin')
  || ', ' || quote_literal(:'ownerA') || ', ''sod-4'', ''approved'')',
  'معتمِد ليس موظف منصة مرفوض');

-- المسار الصحيح: ثلاثة أطراف مختلفة
insert into partner_payouts (partner_id, amount, initiated_by, initiated_by_kind,
                             requested_by, approved_by, approved_at, idempotency_key, status)
values (:'PARTNER', 1000, :'partnerUser', 'partner', :'adminFin', :'adminOwner', now(), 'sod-ok', 'approved');
select t.ok((select count(*) = 1 from partner_payouts where idempotency_key='sod-ok'),
            'ثلاثة أطراف مختلفة ⇒ مقبول');

-- نفس الشيء على الاستردادات
select t.throws_check(
  'insert into refunds (payment_id, amount, reason, requested_by, approved_by, idempotency_key)'
  || ' values (gen_random_uuid(), 100, ''سبب'', ' || quote_literal(:'adminFin')
  || ', ' || quote_literal(:'adminFin') || ', ''rf-1'')',
  'استرداد: طالب = معتمِد ⇒ قيد CHECK رغم service_role');
rollback;

\echo '── عزل بيانات الشريك ──'
begin;
select t.login(:'partnerUser');
select t.ok((select count(*) = 1 from referrals), 'الشريك يرى إحالاته فقط');
select t.empty('select 1 from orders',   'الشريك لا يرى طلبات التاجر');
select t.empty('select 1 from customers','الشريك لا يرى عملاء التاجر');
select t.empty('select 1 from products where store_id is not null and false',
               'الشريك لا يصل لبيانات المتجر التجارية');
select t.no_effect('update partners set commission_rate = 90 where id = ' || quote_literal(:'PARTNER'),
                   'الشريك لا يرفع نسبة عمولته');
rollback;

\echo '── نسبة العمولة: Admin فقط، وبأثر مستقبلي ──'
begin;
select t.login(:'adminSup');
select t.no_effect('update partners set commission_rate = 70 where id = ' || quote_literal(:'PARTNER'),
                   'موظف الدعم لا يرى الشركاء أصلًا فلا يعدّل نسبتهم');
rollback;

-- موظف بصلاحية partners:edit لكن بلا commissions:manage:
-- يعدّل بيانات الشريك، ولا يلمس النسبة (حارس مستقل عن RLS)
begin;
select t.login(:'adminOps');
update partners set phone = '0999' where id = :'PARTNER';
select t.ok((select phone = '0999' from partners where id = :'PARTNER'),
            'موظف partners:edit يعدّل بيانات الشريك');
select t.throws('update partners set commission_rate = 70 where id = ' || quote_literal(:'PARTNER'),
                'لكنه لا يعدّل نسبة العمولة (تحتاج commissions:manage)');
rollback;

-- تغيير النسبة يسري على المستقبل فقط: الصفوف السابقة تحتفظ بنسبتها
begin;
select t.login(:'ownerA');
insert into subscription_requests (store_id, plan_id, amount, discount_amount, net_amount, idempotency_key)
values (:'A', (select id from plans where code='basic'), 20000, 0, 20000, 'req-rate');
select t.login(:'adminFin');
select record_payment('subscription',
  (select id from subscription_requests where idempotency_key='req-rate'),
  'bank_transfer', 20000, 'TRX-R', null, 'pay-rate');
select t.login(:'adminOwner');
update partners set commission_rate = 40 where id = :'PARTNER';
select t.reset();
select t.ok((select rate_applied = 30 from commission_ledger
             where payment_id = (select id from payments where idempotency_key='pay-rate')),
            'العمولة السابقة تحتفظ بنسبة 30% بعد تغيير النسبة إلى 40%');
rollback;

\echo '✓ اختبارات العمولات والمال مرّت'

\echo '── الاسترداد: عكس بقيد جديد بلا مساس بالأصل ──'
begin;
select t.login(:'ownerA');
insert into subscription_requests (store_id, plan_id, amount, discount_amount, net_amount, idempotency_key)
values (:'A', (select id from plans where code='basic'), 20000, 5000, 15000, 'req-rf');
select t.login(:'adminFin');
select record_payment('subscription',
  (select id from subscription_requests where idempotency_key='req-rf'),
  'bank_transfer', 15000, 'TRX-RF', null, 'pay-rf');

-- استرداد كامل بثلاثة أطراف مختلفة
insert into refunds (payment_id, store_id, amount, reason, initiated_by, initiated_by_kind,
                     requested_by, approved_by, approved_at, status, idempotency_key)
values ((select id from payments where idempotency_key='pay-rf'), :'A', 15000,
        'طلب التاجر إلغاء الاشتراك', :'ownerA', 'store', :'adminFin', :'adminOwner',
        now(), 'approved', 'rf-full');

select app.reverse_commission((select id from refunds where idempotency_key='rf-full'));
select t.reset();

select t.ok((select amount = 4500 from commission_ledger
             where entry_kind='commission'
               and payment_id = (select id from payments where idempotency_key='pay-rf')),
            'صف العمولة الأصلي سليم ولم يُمسّ');
select t.ok((select amount = -4500 from commission_ledger where entry_kind='reversal'),
            'قيد عكس بقيمة −4,500');
select t.ok((select reverses_id is not null from commission_ledger where entry_kind='reversal'),
            'قيد العكس يشير إلى الأصل');
select t.ok((select balance = 0 from ledger_balances
             where account_kind='partner' and account_id = :'PARTNER'),
            'رصيد الشريك عاد إلى صفر بعد العكس الكامل');
rollback;

\echo '── استرداد جزئي 40% ⇒ عكس 40% ──'
begin;
select t.login(:'ownerA');
insert into subscription_requests (store_id, plan_id, amount, discount_amount, net_amount, idempotency_key)
values (:'A', (select id from plans where code='basic'), 20000, 5000, 15000, 'req-pr');
select t.login(:'adminFin');
select record_payment('subscription',
  (select id from subscription_requests where idempotency_key='req-pr'),
  'bank_transfer', 15000, 'TRX-PR', null, 'pay-pr');
insert into refunds (payment_id, store_id, amount, reason, requested_by, approved_by,
                     approved_at, status, idempotency_key)
values ((select id from payments where idempotency_key='pay-pr'), :'A', 6000,
        'استرداد جزئي', :'adminFin', :'adminOwner', now(), 'approved', 'rf-part');
select app.reverse_commission((select id from refunds where idempotency_key='rf-part'));
select t.reset();
select t.ok((select amount = -1800 from commission_ledger where entry_kind='reversal'),
            'استرداد 6,000 من 15,000 (40%) ⇒ عكس 1,800 من 4,500');
select t.ok((select balance = 2700 from ledger_balances
             where account_kind='partner' and account_id = :'PARTNER'),
            'رصيد المسوّق = 4,500 − 1,800 = 2,700');
rollback;

\echo '── مجموع الاستردادات لا يتجاوز الدفعة ──'
begin;
select t.login(:'ownerA');
insert into subscription_requests (store_id, plan_id, amount, discount_amount, net_amount, idempotency_key)
values (:'A', (select id from plans where code='basic'), 20000, 0, 20000, 'req-ov');
select t.login(:'adminFin');
select record_payment('subscription',
  (select id from subscription_requests where idempotency_key='req-ov'),
  'bank_transfer', 20000, 'TRX-OV', null, 'pay-ov');
select t.throws(
  'insert into refunds (payment_id, amount, reason, requested_by, approved_by, approved_at, status, idempotency_key)'
  || ' values ((select id from payments where idempotency_key=''pay-ov''), 25000, ''زائد'', '
  || quote_literal(:'adminFin') || ', ' || quote_literal(:'adminOwner') || ', now(), ''approved'', ''rf-ov'')',
  'استرداد يتجاوز مبلغ الدفعة مرفوض');
rollback;

\echo '── الصرف: لا صرف مزدوج ──'
begin;
select t.login(:'ownerA');
insert into subscription_requests (store_id, plan_id, amount, discount_amount, net_amount, idempotency_key)
values (:'A', (select id from plans where code='basic'), 20000, 5000, 15000, 'req-po');
select t.login(:'adminFin');
select record_payment('subscription',
  (select id from subscription_requests where idempotency_key='req-po'),
  'bank_transfer', 15000, 'TRX-PO', null, 'pay-po');
select t.reset();
insert into partner_payouts (partner_id, amount, initiated_by, initiated_by_kind,
                             requested_by, approved_by, approved_at, status, idempotency_key)
values (:'PARTNER', 4500, :'partnerUser', 'partner', :'adminFin', :'adminOwner',
        now(), 'approved', 'po-1');
select t.login(:'adminFin');
select mark_payout_paid((select id from partner_payouts where idempotency_key='po-1'), 'TRF-1');
select t.reset();
select t.ok((select status = 'paid' from commission_ledger where entry_kind='commission'),
            'صف العمولة صار مصروفًا ومرتبطًا بالصرف');
select t.login(:'adminFin');
select t.throws('select mark_payout_paid((select id from partner_payouts where idempotency_key=''po-1''), ''TRF-2'')',
                'صرف نفس الطلب مرتين مرفوض');
-- صرف جديد لا يلتقط عمولة مصروفة
insert into partner_payouts (partner_id, amount, requested_by, approved_by, approved_at, status, idempotency_key)
values (:'PARTNER', 4500, :'adminFin', :'adminOwner', now(), 'approved', 'po-2');
select t.ok((select mark_payout_paid((select id from partner_payouts where idempotency_key='po-2')) = 0),
            'صرف ثانٍ لا يلتقط أي عمولة مصروفة سلفًا');
rollback;

\echo '── الصرف لا يتم قبل الاعتماد ──'
begin;
select t.reset();
insert into partner_payouts (partner_id, amount, initiated_by, initiated_by_kind, status, idempotency_key)
values (:'PARTNER', 500, :'partnerUser', 'partner', 'submitted', 'po-3');
select t.login(:'adminFin');
select t.throws('select mark_payout_paid((select id from partner_payouts where idempotency_key=''po-3''))',
                'طلب الشريك وحده لا يُصرف — يحتاج تسجيلًا واعتمادًا');
rollback;
