\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set B b0000000-0000-0000-0000-00000000000b
\set P1 d1000000-0000-0000-0000-000000000001
\set ownerA 11111111-1111-1111-1111-111111111111
\set ownerB 22222222-2222-2222-2222-222222222222
\set custA  77777777-7777-7777-7777-777777777777
\set adminSup 99999999-9999-9999-9999-999999999999
\set adminOwner 88888888-8888-8888-8888-888888888888
\set adminFin aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa

\echo '── الدعم: الملاحظات الداخلية لا تُقرأ بأي طريق ──'
begin;
select t.login(:'ownerA');
insert into support_tickets (requester_id, requester_kind, store_id, subject)
values (:'ownerA', 'merchant', :'A', 'مشكلة في الطلبات');

select t.login(:'adminSup');
insert into support_internal_notes (ticket_id, author_id, body)
values ((select id from support_tickets where subject='مشكلة في الطلبات'),
        'ad000000-0000-0000-0000-00000000000b', 'ملاحظة داخلية سرية');
select t.ok((select count(*) = 1 from support_internal_notes),
            'موظف الدعم يقرأ الملاحظات الداخلية');

select t.login(:'ownerA');
select t.empty('select 1 from support_internal_notes',
               '★ صاحب التذكرة لا يقرأ الملاحظات الداخلية إطلاقًا');
select t.empty('select 1 from support_internal_notes where body like ''%سرية%''',
               'ولا حتى ببحث مباشر في النص');

select t.login(:'ownerB');
select t.empty('select 1 from support_tickets', 'تاجر B لا يرى تذاكر تاجر A');
select t.empty('select 1 from support_internal_notes', 'تاجر B لا يرى أي ملاحظة داخلية');

select t.login(:'custA');
select t.empty('select 1 from support_tickets', 'عميل لا يرى تذاكر غيره');
rollback;

\echo '── الدعم: موظف الدعم لا يرى البيانات المالية ──'
begin;
select t.login(:'adminSup');
select t.empty('select 1 from payments',          'موظف الدعم لا يرى المدفوعات');
select t.empty('select 1 from commission_ledger', 'موظف الدعم لا يرى العمولات');
select t.empty('select 1 from ledger_entries',    'موظف الدعم لا يرى القيود المالية');
select t.empty('select 1 from partner_payouts',   'موظف الدعم لا يرى الصرف');
select t.empty('select 1 from store_payment_settings', 'موظف الدعم لا يرى بيانات البنوك');
select t.ok(not app.has_platform_permission('payments','view'),
            'وصلاحيته لا تشمل المدفوعات أصلًا');
rollback;

\echo '── D14: انتهاء الاشتراك يوقف الشراء ولا يحذف شيئًا ──'
begin;
select t.reset();
select t.ok(app.store_can_checkout(:'A'), 'المتجر النشط يسمح بالشراء');

update subscriptions set status = 'expired' where store_id = :'A';
select t.ok(not app.store_can_checkout(:'A'),
            '★ الاشتراك المنتهي يمنع الشراء');
select t.ok((select status = 'active' from stores where id = :'A'),
            'لكن المتجر يبقى نشطًا وقابلًا للزيارة');
select t.ok((select count(*) > 0 from products where store_id = :'A'),
            'والمنتجات لم تُحذف');

select t.login(:'custA');
select t.throws(
  'select create_order(' || quote_literal(:'A') ||
  ', jsonb_build_array(jsonb_build_object(''product_id'', ' || quote_literal(:'P1') || ', ''quantity'', 1))' ||
  ', null, ''{"name":"ع","phone":"0912345678"}''::jsonb, ''{}''::jsonb, ''cash_on_delivery'', null, ''exp-1'')',
  'محاولة الشراء مرفوضة في القاعدة لا في الواجهة');

-- فترة السماح تسمح بالشراء
select t.reset();
update subscriptions set status = 'grace' where store_id = :'A';
select t.ok(app.store_can_checkout(:'A'), 'فترة السماح تسمح بالشراء');
rollback;

\echo '── D31: بوابة الإطلاق التجاري ──'
begin;
select t.login(:'adminOwner');
select t.ok((select not complete from plan_configuration_status()),
            'الإعداد غير مكتمل ما دامت حدود الباقات غير مضبوطة');
select t.ok((select array_length(unconfigured_features, 1) > 0 from plan_configuration_status()),
            'وتُعرض قائمة الميزات غير المضبوطة');
select t.login(:'custA');
select t.throws('select * from plan_configuration_status()',
                'مستخدم عادي لا يرى حالة إعداد المنصة');
select t.login(:'adminOwner');
select t.throws('update platform_settings set commercial_launch_enabled = true where id = true',
                '★ تفعيل الإطلاق التجاري مرفوض والإعداد ناقص');

-- اضبط كل شيء ثم أعد المحاولة
select t.reset();
update plans set price = 50000 where code = 'pro';
update plan_entitlements set limit_value = 100 where limit_value is null and bool_value is null;
select t.login(:'adminOwner');
select t.ok((select complete from plan_configuration_status()),
            'بعد ضبط الأسعار والحدود (وحسابا Admin) يكتمل الإعداد');
update platform_settings set commercial_launch_enabled = true where id = true;
select t.ok((select commercial_launch_enabled from platform_settings),
            'ويُسمح بتفعيل الإطلاق التجاري');
rollback;

\echo '── D29: بوابة حسابَي Admin ──'
begin;
select t.reset();
update plans set price = 50000 where code = 'pro';
update plan_entitlements set limit_value = 100 where limit_value is null and bool_value is null;
update admin_members set status = 'suspended'
 where id in ('ad000000-0000-0000-0000-00000000000b','ad000000-0000-0000-0000-00000000000c',
              'ad000000-0000-0000-0000-00000000000d');
select t.login(:'adminOwner');
select t.ok((select active_admins = 1 and not admins_sufficient from plan_configuration_status()),
            'حساب Admin واحد ⇒ غير كافٍ');
select t.throws('update platform_settings set commercial_launch_enabled = true where id = true',
                '★ الإطلاق مرفوض بحساب Admin واحد (فصل المهام مستحيل)');
rollback;

\echo '── سجل التدقيق: إلحاقي ولا يحذفه أحد ──'
begin;
select t.login(:'ownerA');
update products set price = 22000 where id = :'P1';
select t.reset();
select t.ok((select count(*) > 0 from audit_logs
             where action = 'products.update' and resource_id = :'P1'),
            'تغيير السعر سُجّل في audit_logs تلقائيًا');
select t.ok((select (before ->> 'price')::numeric = 20000
                and (after ->> 'price')::numeric = 22000
             from audit_logs where action='products.update' and resource_id = :'P1'
             order by created_at desc limit 1),
            'السجل يحفظ القيمة قبل وبعد');

select t.login(:'adminOwner');
select t.throws('delete from audit_logs', 'حتى Admin Owner لا يحذف سجل التدقيق');
select t.throws('update audit_logs set action = ''x''', 'ولا يعدّله');
select t.reset();
set local role service_role;
select t.throws('delete from audit_logs', 'ولا service_role يحذفه');
rollback;

\echo '── حدود الباقة تُفرض في القاعدة ──'
begin;
select t.reset();
update plan_entitlements set limit_value = 2
 where feature_key = 'products.max'
   and plan_id = (select plan_id from subscriptions where store_id = :'A');
select t.login(:'ownerA');
select t.throws('select app.assert_within_limit(' || quote_literal(:'A') || ', ''products.max'')',
                '★ تجاوز حد المنتجات يُرفض في القاعدة (منتجان موجودان والحد 2)');
select t.reset();
update plan_entitlements set limit_value = 10
 where feature_key = 'products.max'
   and plan_id = (select plan_id from subscriptions where store_id = :'A');
select t.login(:'ownerA');
select app.assert_within_limit(:'A', 'products.max');
select t.ok(true, 'ودون الحد يمرّ');
rollback;

\echo '── D33: حجز الـslug عند التغيير ──'
begin;
select t.reset();
update stores set slug = 'store-a-new' where id = :'A';
select t.ok((select count(*) = 1 from reserved_slugs
             where slug = 'store-a' and reason = 'slug_change'
               and reserved_until > now() + interval '11 months'),
            'الـslug القديم محجوز 12 شهرًا');
select t.ok((select redirect_to_primary from store_domains
             where hostname like 'store-a.%'),
            'والنطاق القديم يعيد التوجيه');
select t.ok((select is_primary from store_domains where hostname like 'store-a-new.%'),
            'والجديد صار الأساسي');
select t.ok(not app.is_slug_available('store-a'),
            'ولا يستطيع متجر آخر أخذ الاسم القديم أثناء الحجز');
rollback;

\echo '── الدومينات: لا دومين لمتجرين ──'
begin;
select t.reset();
select t.throws(
  'insert into store_domains (store_id, hostname, kind, status) values ('
  || quote_literal(:'B') || ', (select hostname from store_domains where store_id = '
  || quote_literal(:'A') || ' limit 1), ''custom'', ''active'')',
  'ربط دومين مستخدَم بمتجر آخر مرفوض');
select t.ok((select store_id = :'A' from resolve_store_by_host(
               (select hostname from store_domains where store_id = :'A' limit 1))),
            'حل المستأجر من الـHost يعيد المتجر الصحيح');
select t.empty('select 1 from resolve_store_by_host(''unknown.example.com'')',
               'Host مجهول لا يعيد أي متجر');
rollback;

\echo '✓ اختبارات الدعم والاشتراكات والتدقيق مرّت'
