\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set B b0000000-0000-0000-0000-00000000000b
\set ownerA 11111111-1111-1111-1111-111111111111
\set ownerB 22222222-2222-2222-2222-222222222222
\set ordersA 44444444-4444-4444-4444-444444444444
\set customerA 77777777-7777-7777-7777-777777777777
\set partner1 bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
\set adminSup 99999999-9999-9999-9999-999999999999
\set p1 9a000000-0000-0000-0000-00000000000a

-- =====================================================================
-- عزل العروض (VIEWS)
--
-- ★ الفجوة التي يسدّها هذا الملف: مسح العزل في 104 يُبنى من الكتالوج
-- بشرط `table_type = 'BASE TABLE'`. أي أن العروض كانت **خارج** الفحص
-- كلّه. والعرض سطح قراءة حقيقي عبر PostgREST تمامًا كالجدول:
-- `/rest/v1/store_team?select=*` نداء صالح.
--
-- وفي القاعدة ثلاثة عروض، ولكلٍّ منها منح كتابة كاملة
-- (INSERT/UPDATE/DELETE/TRUNCATE) لـ anon و authenticated — وهي منح
-- زائدة لا تفيد أحدًا. Postgres يرفض الكتابة اليوم لأن العروض الثلاثة
-- غير قابلة للتحديث تلقائيًا (ضمّ أو تجميع)، لكن المنح يبقى قنبلة
-- موقوتة: أوّل `instead of` trigger يُضاف لاحقًا يجعله نافذًا.
--
-- `store_team` عرض SECURITY DEFINER عن قصد: هو ما يتيح لمالك المتجر
-- رؤية أسماء زملائه دون توسيع سياسات `profiles` (التي تكشف الصف
-- لصاحبه وحده). الاعتماد على `security_invoker` كان سيُفرغ قائمة
-- الفريق من كل اسم عدا اسم القارئ. لذلك العزل هنا مفروض داخل شرط
-- العرض نفسه — وهذا الملف يثبته بالتنفيذ بدل الاكتفاء بقراءة التعريف.
-- =====================================================================

\echo '── store_team: العزل مفروض داخل العرض ──'
begin;
select t.login(:'ownerA');
select t.ok((select count(*) from public.store_team where store_id = :'A') = 5,
            'مالك أ يرى فريقه كاملًا (٥ أعضاء)');
select t.ok((select count(*) from public.store_team where store_id = :'B') = 0,
            '★★★ ولا يرى عضوًا واحدًا من فريق متجر ب');
select t.ok((select count(*) from public.store_team) = 5,
            '★★ وبلا شرط store_id لا يتسرّب شيء: خمسة لا ستة');
rollback;

begin;
select t.login(:'ownerB');
select t.ok((select count(*) from public.store_team where store_id = :'A') = 0,
            '★★★ ومالك ب لا يرى فريق متجر أ');
select t.ok((select count(*) from public.store_team) = 1,
            '★★ ولا يرى إلا صفّه هو');
rollback;

begin;
select t.login(:'ordersA');
select t.ok((select count(*) from public.store_team) = 1,
            '★★ وعضو بلا صلاحية members:view يرى صفّه وحده لا الفريق');
rollback;

begin;
select t.login(:'customerA');
select t.ok((select count(*) from public.store_team) = 0,
            '★★ والزبون لا يرى أي عضو فريق');
rollback;

begin;
select t.logout();
select t.throws('select count(*) from public.store_team',
                '★★★ والزائر المجهول يُمنع من العرض أصلًا لا أن يُفلتر');
rollback;

\echo '── store_team: لا كتابة عبر العرض ──'
begin;
select t.login(:'ownerB');
select t.throws('insert into public.store_team(store_id, profile_id, role, status) values ('
                || quote_literal(:'A') || ', ' || quote_literal(:'ownerB')
                || ', ''owner'', ''active'')',
                '★★★ لا إدراج عضوية في متجر أ عبر العرض');
select t.throws('update public.store_team set role = ''owner'' where store_id = '
                || quote_literal(:'A'),
                '★★★ ولا ترقية دور عبر العرض');
select t.throws('delete from public.store_team where store_id = ' || quote_literal(:'A'),
                '★★★ ولا حذف عضو عبر العرض');
rollback;

\echo '── العروض المالية: سياسات القارئ هي التي تُطبَّق ──'
begin;
select t.reset();
-- قيدان في دفتر الأستاذ: واحد لمتجر أ وآخر لمتجر ب
insert into ledger_entries (account_kind, account_id, entry_type, direction, amount)
values ('store'::ledger_account, :'A', 'subscription_revenue'::ledger_entry_type,
        'credit'::ledger_direction, 50000),
       ('store'::ledger_account, :'B', 'subscription_revenue'::ledger_entry_type,
        'credit'::ledger_direction, 90000);
-- عمولة للشريك الأول على متجر أ
insert into commission_ledger (partner_id, store_id, base_amount, rate_applied, amount)
values (:'p1', :'A', 50000, 10, 5000);

select t.logout();
select t.throws('select count(*) from public.ledger_balances',
                '★★★ الزائر المجهول يُمنع من أرصدة دفتر الأستاذ');
select t.throws('select count(*) from public.partner_balances',
                '★★★ ويُمنع من أرصدة الشركاء');

select t.login(:'customerA');
select t.ok((select count(*) from public.ledger_balances) = 0,
            '★★★ والزبون لا يرى رصيدًا واحدًا');
select t.ok((select coalesce(sum(total), 0) from public.partner_balances) = 0,
            '★★★ ولا يرى عمولة شريك');

select t.login(:'ownerB');
select t.ok((select count(*) from public.ledger_balances
              where account_id = :'A') = 0,
            '★★★ ومالك ب لا يرى رصيد متجر أ في العرض المجمَّع');

select t.login(:'partner1');
select t.ok((select count(*) from public.partner_balances) = 1,
            '★★ والشريك يرى صفّه هو');
select t.ok((select payable from public.partner_balances where partner_id = :'p1') = 5000,
            '★★ وبرصيد مستحق صحيح (٥٠٠٠)');
select t.ok((select count(*) from public.ledger_balances) = 0,
            '★★★ لكنه لا يرى دفتر أستاذ المنصة');
rollback;

\echo '── العروض المالية: لا كتابة ──'
begin;
select t.login(:'customerA');
select t.throws('insert into public.ledger_balances(account_kind, account_id, currency, balance)'
                || ' values (''platform'', null, ''SDG'', 999999)',
                '★★★ لا إدراج رصيد ملفّق في ledger_balances');
select t.throws('update public.partner_balances set payable = 999999',
                '★★★ ولا تضخيم مستحقّات شريك عبر partner_balances');
rollback;

\echo '── لا منح كتابة زائدة على أي عرض ──'
begin;
select t.reset();
select t.ok((select count(*) from information_schema.role_table_grants g
              join pg_class c on c.relname = g.table_name
              join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
             where g.table_schema = 'public' and c.relkind in ('v','m')
               and g.grantee in ('anon','authenticated')
               and g.privilege_type <> 'SELECT') = 0,
            '★★ ولا عرض واحد يحمل منح كتابة لـ anon أو authenticated');
rollback;

select t.reset();
\echo '✓ اختبارات عزل العروض مرّت'
