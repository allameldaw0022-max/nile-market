\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set B b0000000-0000-0000-0000-00000000000b
\set ownerA 11111111-1111-1111-1111-111111111111
\set ownerB 22222222-2222-2222-2222-222222222222
\set csA    66666666-6666-6666-6666-666666666666
\set custA  77777777-7777-7777-7777-777777777777
\set adminSup 99999999-9999-9999-9999-999999999999
\set P1 d1000000-0000-0000-0000-000000000001

\echo '── تنبيه الطلب الجديد ──'
begin;
select t.reset();
update store_settings set contact_email = 'owner@store-a.test' where store_id = :'A';

select t.logout();
\o /dev/null
select create_order(
  :'A', ('[{"product_id":"' || :'P1' || '","quantity":1}]')::jsonb,
  null, '{"name":"زبون التنبيه","phone":"0915555555"}'::jsonb,
  '{}'::jsonb, 'cash_on_delivery');
\o

select t.reset();
select t.ok((select count(*) > 0 from notifications
             where store_id = :'A' and type = 'order.created'),
            'الطلب الجديد يُنبّه فريق المتجر');
select t.ok((select exists (select 1 from notifications
             where user_id = :'ownerA' and type = 'order.created')),
            'والمالك من بينهم');
select t.empty('select 1 from notifications where user_id = ' || quote_literal(:'custA')
               || ' and type = ''order.created''',
               '★ الزبون لا يصله تنبيه فريق المتجر');
select t.ok((select count(*) = 1 from email_outbox
             where template = 'order_created' and to_email = 'owner@store-a.test'),
            'وبريد واحد في الصندوق');
rollback;

\echo '── تنبيه الزبون بتغيّر حالة طلبه ──'
begin;
select t.reset();
select t.login(:'custA');
\o /dev/null
select create_order(
  :'A', ('[{"product_id":"' || :'P1' || '","quantity":1}]')::jsonb,
  null, '{"name":"عميل مسجّل","phone":"0916666666"}'::jsonb,
  '{}'::jsonb, 'cash_on_delivery');
\o
select t.reset();
select id as oid from orders where store_id = :'A' order by created_at desc limit 1
\gset

select t.login(:'ownerA');
select transition_order(:'oid', 'confirmed');
select t.reset();
select t.ok((select exists (select 1 from notifications
             where user_id = :'custA' and type = 'order.status')),
            'الزبون المسجَّل يُنبَّه بتأكيد طلبه');
rollback;

\echo '── التنبيهات: كل صندوق لصاحبه ──'
begin;
select t.reset();
insert into notifications (user_id, type, title) values
  (:'ownerA', 'test', 'تنبيه أ'),
  (:'ownerB', 'test', 'تنبيه ب');

select t.login(:'ownerA');
select t.ok((select count(*) = 1 from notifications where type = 'test'),
            '★ كل مستخدم يرى تنبيهاته وحده');
select t.ok((select mark_notifications_read() = 1),
            'يعلّم تنبيهاته كمقروءة');
select t.reset();
select t.ok((select read_at is null from notifications
             where user_id = :'ownerB' and type = 'test'),
            '★ ولا يمسّ تنبيهات غيره');
rollback;

-- لا يُنشئ مستخدم تنبيهًا لنفسه ولا لغيره
begin;
select t.login(:'ownerA');
select t.throws('insert into notifications (user_id, type, title) values ('
                || quote_literal(:'ownerB') || ', ''fake'', ''مزيّف'')',
                '★ لا يكتب مستخدم تنبيهًا في صندوق غيره');
select t.throws('insert into notifications (user_id, type, title) values ('
                || quote_literal(:'ownerA') || ', ''fake'', ''مزيّف'')',
                '★ ولا في صندوقه هو (التنبيه من النظام)');
rollback;

\echo '── صندوق البريد: لا مسار للعميل ──'
begin;
select t.login(:'ownerA');
select t.empty('select 1 from email_outbox', '★ التاجر لا يقرأ صندوق البريد');
select t.throws('select claim_emails(5)', '★ ولا يسحب منه بريدًا');
select t.throws('select mark_email_sent(gen_random_uuid())',
                '★ ولا يوسم بريدًا مُرسَلًا');
rollback;

begin;
select t.reset();
insert into email_outbox (to_email, template) values ('x@y.test', 'tpl');
set local role service_role;
select t.ok((select count(*) = 1 from claim_emails(10)),
            'النظام يسحب البريد المنتظر');
select t.ok((select status = 'sending' and attempts = 1 from email_outbox
             where to_email = 'x@y.test'),
            'ويُوسم «قيد الإرسال» بمحاولة واحدة');
rollback;
select t.reset();

-- الفشل يعيد الجدولة، والفشل المتكرر يتوقف
begin;
select t.reset();
insert into email_outbox (to_email, template, attempts) values ('z@y.test', 'tpl', 1);
select id as eid from email_outbox where to_email = 'z@y.test'
\gset
set local role service_role;
select mark_email_failed(:'eid', 'خطأ مؤقت');
reset role;
select t.ok((select status = 'queued' and scheduled_for > now() from email_outbox
             where id = :'eid'),
            'الفشل المبكر يعيد الجدولة بتراجع أسّي');

update email_outbox set attempts = 5 where id = :'eid';
set local role service_role;
select mark_email_failed(:'eid', 'خطأ نهائي');
reset role;
select t.ok((select status = 'failed' from email_outbox where id = :'eid'),
            '★ بعد 5 محاولات يتوقف بدل إعادة محاولة أبدية');
rollback;
select t.reset();

\echo '── تذاكر الدعم ──'
begin;
select t.login(:'ownerA');
select t.ok((select ticket_number like 'NM-%' from create_support_ticket(
               'مشكلة في الطلبات', 'orders', 'لا تظهر الطلبات الجديدة لدي')),
            'التاجر يفتح تذكرة برقم متسلسل');
select t.ok((select count(*) = 1 from support_messages),
            'وأول رسالة تُحفظ معها');

select t.throws('select create_support_ticket(''x'', ''other'', ''نص كافٍ هنا'')',
                'عنوان قصير مرفوض');
select t.throws('select create_support_ticket(''عنوان صالح'', ''other'', ''قصير'')',
                'نص قصير مرفوض');
select t.throws('select create_support_ticket(''عنوان صالح'', ''other'', ''نص كافٍ هنا'', '
                || quote_literal(:'B') || ')',
                '★ لا يربط تذكرته بمتجر ليس عضوًا فيه');
rollback;

\echo '── الرد على التذكرة وعزل التذاكر ──'
begin;
select t.login(:'ownerA');
select ticket_id as tid from create_support_ticket(
  'تذكرة للرد', 'other', 'نص المشكلة هنا بالتفصيل')
\gset

select t.login(:'ownerB');
select t.empty('select 1 from support_tickets where id = ' || quote_literal(:'tid'),
               '★ تاجر آخر لا يرى التذكرة');
select t.throws('select reply_to_ticket(' || quote_literal(:'tid') || ', ''تطفّل'')',
                '★ ولا يرد عليها');

select t.login(:'adminSup');
select reply_to_ticket(:'tid', 'أهلًا، نتابع معك الآن.');
select t.reset();
select t.ok((select status = 'in_progress' from support_tickets where id = :'tid'),
            'رد الدعم على تذكرة جديدة ينقلها إلى «قيد المعالجة»');
select t.ok((select first_response_at is not null from support_tickets where id = :'tid'),
            'ويُسجَّل زمن أول رد');
select t.ok((select exists (select 1 from notifications
             where user_id = :'ownerA' and type = 'support.reply')),
            '★ والتنبيه يذهب لصاحب التذكرة لا لكاتب الرد');
select t.empty('select 1 from notifications where user_id = ' || quote_literal(:'adminSup')
               || ' and type = ''support.reply''',
               '★ ولا يُنبَّه كاتب الرد بنفسه');
rollback;

-- إعادة الفتح بعد الحل، والإغلاق النهائي
begin;
select t.login(:'ownerA');
select ticket_id as tid2 from create_support_ticket(
  'تذكرة للحل', 'other', 'نص المشكلة هنا بالتفصيل')
\gset
-- فريق الدعم هو من يحلّ التذكرة، وآلة الحالة لا تقفز من new إلى resolved
select t.login(:'adminSup');
update support_tickets set status = 'in_progress' where id = :'tid2';
update support_tickets set status = 'resolved'    where id = :'tid2';

select t.login(:'ownerA');
select reply_to_ticket(:'tid2', 'ما زالت المشكلة قائمة');
select t.reset();
select t.ok((select status = 'in_progress' and reopened_count = 1 from support_tickets
             where id = :'tid2'),
            '★ رد صاحب التذكرة على «تم الحل» يعيد فتحها');

select t.login(:'ownerA');
select close_my_ticket(:'tid2');
select t.reset();
select t.ok((select status = 'closed' and closed_at is not null from support_tickets
             where id = :'tid2'),
            'وصاحبها يغلقها حين يكتفي');
select t.login(:'ownerA');
select t.throws('select reply_to_ticket(' || quote_literal(:'tid2') || ', ''مرة أخرى'')',
                '★ المغلقة لا يُرد عليها');
rollback;
select t.reset();


\echo '── الوظائف الدورية: للنظام وحده ──'
begin;
select t.login(:'ownerA');
select t.throws('select run_daily_maintenance()',
                '★ التاجر لا يشغّل الصيانة اليومية');
select t.throws('select sweep_subscriptions()',
                '★ ولا يكنس الاشتراكات');
select t.throws('select anonymize_due_accounts()',
                '★ ولا يُخفي هوية حسابات');
select t.throws('select purge_old_tickets()',
                '★ ولا يحذف تذاكر');
rollback;

begin;
select t.login(:'adminSup');
select t.throws('select run_daily_maintenance()',
                '★ ولا موظف الدعم');
rollback;

begin;
select t.reset();
set local role service_role;
select t.ok((select (run_daily_maintenance() ? 'subscriptions')),
            'النظام يشغّلها وتعيد ملخّصًا');
rollback;
select t.reset();

\echo '✓ اختبارات الدعم والتنبيهات مرّت'
