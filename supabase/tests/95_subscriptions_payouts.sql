\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set B b0000000-0000-0000-0000-00000000000b
\set ownerA 11111111-1111-1111-1111-111111111111
\set ownerB 22222222-2222-2222-2222-222222222222
\set csA    66666666-6666-6666-6666-666666666666
\set partner1 bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
\set P1 9a000000-0000-0000-0000-00000000000a

\echo '── طلب الاشتراك: السعر من القاعدة لا من المتصفح ──'
begin;
select t.reset();
select id as basicid from plans where code = 'basic'
\gset

select t.login(:'ownerA');
select t.ok((select net_amount = 20000 from submit_subscription_request(
               :'A', :'basicid', null, t.sub_proof(:'A'))),
            '★ المبلغ يُقرأ من سعر الباقة (20,000) لا من الطلب');
select t.ok((select amount = 20000 and net_amount = 20000 from subscription_requests
             where store_id = :'A'),
            'ويُحفظ كما حُسب');
select t.throws('select submit_subscription_request(' || quote_literal(:'A') || ', '
                || quote_literal(:'basicid') || ')',
                '★ طلب معلّق واحد لكل متجر');
rollback;

-- D18: باقة بلا سعر مضبوط لا تُباع
begin;
select t.reset();
update plans set price_configured_at = null where code = 'pro';
select id as proid from plans where code = 'pro'
\gset
select t.login(:'ownerA');
select t.throws('select submit_subscription_request(' || quote_literal(:'A') || ', '
                || quote_literal(:'proid') || ')',
                '★ D18: باقة بلا سعر مضبوط لا تُباع');
rollback;

begin;
select t.reset();
select id as freeid from plans where is_free limit 1
\gset
select t.login(:'ownerA');
select t.throws('select submit_subscription_request(' || quote_literal(:'A') || ', '
                || quote_literal(:'freeid') || ')',
                'الباقة المجانية لا تحتاج طلبًا');
rollback;

begin;
select t.reset();
select id as basicid from plans where code = 'basic'
\gset
select t.login(:'ownerB');
select t.throws('select submit_subscription_request(' || quote_literal(:'A') || ', '
                || quote_literal(:'basicid') || ')',
                '★ مالك ب لا يطلب اشتراكًا لمتجر أ');
select t.login(:'csA');
select t.throws('select submit_subscription_request(' || quote_literal(:'A') || ', '
                || quote_literal(:'basicid') || ')',
                'خدمة العملاء لا تملك subscription:manage');
rollback;

\echo '── التكرار وسحب الطلب ──'
begin;
select t.reset();
select id as basicid from plans where code = 'basic'
\gset
select t.login(:'ownerA');
select t.sub_proof(:'A') as proof1
\gset
select request_id as req1 from submit_subscription_request(
  :'A', :'basicid', null, :'proof1', 'same-key')
\gset
select t.ok((select request_id = :'req1' from submit_subscription_request(
               :'A', :'basicid', null, :'proof1', 'same-key')),
            '★ نفس المفتاح ⇒ نفس الطلب لا طلب ثانٍ');
select t.ok((select count(*) = 1 from subscription_requests where store_id = :'A'),
            'وصف واحد في الجدول');

select cancel_subscription_request(:'req1');
select t.ok((select status = 'cancelled' from subscription_requests where id = :'req1'),
            'التاجر يسحب طلبه المعلّق');
select t.throws('select cancel_subscription_request(' || quote_literal(:'req1') || ')',
                '★ الطلب المسحوب لا يُسحب مرتين');
rollback;

-- إثبات تحويل من متجر آخر لا يُقبل
begin;
select t.reset();
select id as basicid from plans where code = 'basic'
\gset
insert into media_files (id, bucket, path, store_id, purpose, mime_type, size_bytes, status)
values ('f9000000-0000-0000-0000-00000000000b', 'store-private',
        'stores/b/payment-proofs/x.jpg', :'B', 'payment_proof', 'image/jpeg', 100, 'ready');

select t.login(:'ownerA');
select t.throws('select submit_subscription_request(' || quote_literal(:'A') || ', '
                || quote_literal(:'basicid')
                || ', null, ''f9000000-0000-0000-0000-00000000000b'')',
                '★ إثبات تحويل من متجر آخر مرفوض');
rollback;

\echo '── طلب صرف الشريك: المبلغ يُقاس على الرصيد ──'
begin;
select t.reset();
-- عمولة مستحقة للشريك
insert into commission_ledger
  (partner_id, store_id, entry_kind, amount, status, base_amount, rate_applied)
values (:'P1', :'A', 'commission', 10000, 'payable', 20000, 50);

select t.login(:'partner1');
select t.throws('select 1 from request_partner_payout()',
                '★★ لا صرف قبل استكمال بيانات الاستلام');
select save_partner_payout_account('bank_transfer', 'الشريك الأول',
                                   'بنك الخرطوم', '1234567890');
select t.ok((select amount = 10000 from request_partner_payout()),
            '★★ المبلغ يُحسب في القاعدة من العمولات المتاحة — لا يكتبه الشريك');
select t.ok((select status = 'submitted' and initiated_by = :'partner1'
             from partner_payouts where partner_id = :'P1'),
            'الطلب يُسجَّل باسمه كمُبادِر (D30)');
select t.ok((select count(*) = 1 from commission_ledger
             where partner_id = :'P1' and status = 'reserved'),
            '★★ والعمولة تُحجز فور الطلب');
select t.ok((select payable = 0 from partner_balances where partner_id = :'P1'),
            'فلا يبقى رصيد متاح');
rollback;

-- الطلبات المعلّقة محجوزة: لا يُصرف نفس الرصيد مرتين
begin;
select t.reset();
insert into commission_ledger
  (partner_id, store_id, entry_kind, amount, status, base_amount, rate_applied)
values (:'P1', :'A', 'commission', 10000, 'payable', 20000, 50);

select t.login(:'partner1');
select save_partner_payout_account('bankak', 'الشريك الأول', null, null, '0911111111');
\o /dev/null
select request_partner_payout(null, 'k1');
\o
select t.throws('select 1 from request_partner_payout(null, ''k2'')',
                '★★★ الرصيد المحجوز في طلب معلّق لا يُطلب مرة أخرى');
select t.ok((select amount = 10000 from request_partner_payout(null, 'k1')),
            'ونفس المفتاح يعيد الطلب نفسه لا طلبًا ثانيًا');
select t.ok((select count(*) = 1 from partner_payouts where partner_id = :'P1'),
            'وصفّ صرف واحد في الجدول');
rollback;

begin;
select t.reset();
select t.login(:'ownerA');
select t.throws('select request_partner_payout(100)',
                '★ من ليس شريكًا لا يطلب صرفًا');
rollback;
select t.reset();


\echo '── بيانات تحويل المنصة ──'
begin;
select t.reset();
update platform_settings
   set bank_accounts = '[{"bank":"بنك الخرطوم","account":"NM-0001"}]'::jsonb,
       bankak_number = '0999000111';

select t.login(:'ownerA');
select t.ok((select jsonb_array_length(bank_accounts) = 1 from platform_payment_info()),
            'التاجر يرى حساب المنصة ليحوّل اشتراكه');
select t.empty('select 1 from platform_settings',
               '★ ولا يقرأ صف إعدادات المنصة نفسه');

select t.login(:'csA');
select t.empty('select 1 from platform_payment_info()',
               '★ موظف بلا subscription:manage لا يراه');

select t.logout();
select t.empty('select 1 from platform_payment_info()',
               '★ الزائر لا يراه');
rollback;
select t.reset();


\echo '── تسجيل زيارة الإحالة ──'
\set TOK aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
begin;
select t.logout();
select t.ok((select record_referral_visit('P1CODE', :'TOK', '/', '10.0.0.1', 'UA')),
            'الزائر يُسجَّل بكود شريك نشط');
select t.reset();
select t.ok((select count(*) = 1 from referral_visits where visitor_token = :'TOK'),
            'وصف واحد في الجدول');
select t.ok((select ip_hash <> '10.0.0.1' and length(ip_hash) = 64
             from referral_visits where visitor_token = :'TOK'),
            '★ الـIP يُجزَّأ ولا يُخزَّن خامًا');

select t.logout();
select t.ok((select record_referral_visit('P1CODE', :'TOK', '/', '10.0.0.1', 'UA')),
            'إعادة التحميل لا تُنشئ صفًا جديدًا');
select t.reset();
select t.ok((select count(*) = 1 from referral_visits where visitor_token = :'TOK'),
            '★ ولا يُغرَق الجدول');
rollback;

begin;
select t.logout();
select t.ok((select not record_referral_visit('NOSUCHCODE', :'TOK')),
            'كود غير موجود ⇒ لا تسجيل');
select t.ok((select not record_referral_visit('P1CODE', 'short')),
            '★ توكن قصير مرفوض (علامة عبث)');
rollback;

-- شريك موقوف لا يُسجَّل له شيء
begin;
select t.reset();
update partners set status = 'suspended' where referral_code = 'P1CODE';
select t.logout();
select t.ok((select not record_referral_visit('P1CODE', :'TOK')),
            '★ شريك موقوف لا تُسجَّل له زيارات');
rollback;

begin;
select t.logout();
select t.empty('select 1 from referral_visits',
               '★ الزائر لا يقرأ جدول الزيارات');
rollback;
select t.reset();

\echo '✓ اختبارات الاشتراكات وصرف الشركاء مرّت'
