\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set B b0000000-0000-0000-0000-00000000000b
\set ownerA 11111111-1111-1111-1111-111111111111
\set ownerB 22222222-2222-2222-2222-222222222222
\set managerA 33333333-3333-3333-3333-333333333333
\set ordersA 44444444-4444-4444-4444-444444444444
\set csA 66666666-6666-6666-6666-666666666666
\set customerA 77777777-7777-7777-7777-777777777777
\set partner1 bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
\set adminSup 99999999-9999-9999-9999-999999999999

-- =====================================================================
-- عزل المستأجرين — فحص شامل لا انتقائي
--
-- ★ الفحص يمرّ على **كل** جدول فيه `store_id` بلا استثناء، ويُبنى من
-- كتالوج القاعدة لا من قائمة مكتوبة بيد. جدول جديد يدخل الفحص
-- تلقائيًا؛ القائمة المكتوبة تنسى ما يُضاف بعدها.
-- =====================================================================

create or replace function t.isolation_report(p_actor uuid, p_other_store uuid)
returns table (relname text, leaked bigint)
language plpgsql as $$
declare r record; n bigint;
begin
  perform t.login(p_actor);
  for r in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables tb
        on tb.table_schema = c.table_schema and tb.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'store_id'
       and tb.table_type = 'BASE TABLE'
     order by c.table_name
  loop
    begin
      execute format('select count(*) from public.%I where store_id = $1', r.table_name)
        into n using p_other_store;
    exception when insufficient_privilege then
      n := 0;                       -- لا منح على الجدول أصلًا ⇒ عزل أقوى
    end;
    if n > 0 then
      relname := r.table_name; leaked := n; return next;
    end if;
  end loop;
  perform t.reset();
end $$;

grant execute on function t.isolation_report(uuid, uuid) to anon, authenticated;

\echo '── بذر بيانات لمتجر ب في كل جدول ممكن ──'
begin;
select t.reset();

insert into delivery_zones (id, store_id, name, fee)
values ('d0000000-0000-0000-0000-0000000000b1', :'B', 'منطقة ب', 2000);
insert into coupons (id, store_id, code, type, value)
values ('e1000000-0000-0000-0000-0000000000b1', :'B', 'BSECRET', 'fixed', 500);

-- طلب كامل في متجر ب (يملأ orders · order_items · customers · history)
select t.logout();
\o /dev/null
select order_id from create_order(
  :'B',
  jsonb_build_array(jsonb_build_object('product_id','d2000000-0000-0000-0000-000000000001','quantity',1)),
  'd0000000-0000-0000-0000-0000000000b1',
  jsonb_build_object('name','زبون ب','phone','0911111111'),
  jsonb_build_object('line1','عنوان ب'),
  'cash_on_delivery', null, 'iso-b-1');
\o
select t.reset();
select id as bord from orders where store_id = :'B' limit 1
\gset
select t.login(:'ownerB');
\o /dev/null
select record_payment('order', :'bord', 'cash_on_delivery', 11000,
                      p_idempotency_key => 'iso-b-pay');
\o
select t.reset();

-- بقية الجداول
insert into store_visits (store_id, visitor_token, path)
values (:'B', 'iso-visitor-token-bbbbbbbb', '/secret-b');
insert into analytics_daily (store_id, date, visits, orders_count, orders_revenue)
values (:'B', current_date - 1, 10, 2, 50000);
insert into media_files (store_id, owner_profile_id, bucket, path, purpose, mime_type, size_bytes, status)
values (:'B', :'ownerB', 'store-media', 'b/secret.webp', 'product_image', 'image/webp', 1000, 'ready');
insert into notifications (user_id, type, title, store_id)
values (:'ownerB', 'test', 'تنبيه متجر ب', :'B');
insert into support_tickets (requester_id, requester_kind, store_id, subject, category, priority, status)
values (:'ownerB', 'merchant', :'B', 'تذكرة متجر ب', 'other', 'normal', 'new');
insert into inventory_movements (store_id, product_id, delta, reason)
values (:'B', 'd2000000-0000-0000-0000-000000000001', 3, 'manual_adjust');
insert into customer_addresses (store_id, customer_id, label, address_line)
select :'B', id, 'المنزل', 'عنوان سري' from customers where store_id = :'B' limit 1;

select t.ok((select count(*) > 0 from orders where store_id = :'B'), 'بيانات متجر ب مزروعة');

\echo '── التاجر أ لا يرى شيئًا من متجر ب ──'
-- ★ المستثنى الوحيد المقبول هو ما تعرضه واجهة المتجر للعموم عمدًا:
-- المنتجات المنشورة · مناطق التوصيل · إعدادات العرض · صور المنتجات.
-- وما عداها تسريب. الأعمدة السرّية داخل هذه الصفوف محجوبة على مستوى
-- العمود (0038): سعر التكلفة والإعدادات التشغيلية.
select t.empty($q$select * from t.isolation_report(
                 '11111111-1111-1111-1111-111111111111',
                 'b0000000-0000-0000-0000-00000000000b')
               where relname not in ('products','categories','delivery_zones',
                                     'store_settings','media_files')$q$,
               '★★★ مالك متجر أ: صفر تسريب في كل جدول غير عام');

-- `t.isolation_report` تُعيد الدور إلى الافتراضي في نهايتها، فنعيد
-- الدخول صراحةً قبل الفحوص التالية
select t.login(:'ownerA');
select t.throws('select cost_price from products where store_id = '
                || quote_literal(:'B') || ' limit 1',
                '★★★ ولا يقرأ سعر تكلفة منتجات متجر ب (كان مكشوفًا للجميع)');
select t.throws('select 1 from product_costs(' || quote_literal(:'B') || ')',
                '★★★ ولا عبر الدالة المُحكمة');
select t.throws('select notification_prefs from store_settings where store_id = '
                || quote_literal(:'B'),
                '★★ ولا إعدادات متجر ب التشغيلية');
select t.throws('select 1 from store_operational_settings(' || quote_literal(:'B') || ')',
                '★★ ولا عبر دالتها');
select t.ok((select count(*) = 1 from products
             where store_id = :'B' and status = 'active'),
            '★ لكنه يرى منتج متجر ب المنشور — فواجهة المتجر عامة');

select t.empty('select * from t.isolation_report('
               || quote_literal(:'managerA') || ', ' || quote_literal(:'B')
               || ') where relname not in ('
               || '''products'',''categories'',''delivery_zones'','
               || '''store_settings'',''media_files'')',
               '★★★ ومدير متجر أ كذلك');

select t.empty('select * from t.isolation_report('
               || quote_literal(:'ordersA') || ', ' || quote_literal(:'B')
               || ') where relname not in ('
               || '''products'',''categories'',''delivery_zones'','
               || '''store_settings'',''media_files'')',
               '★★★ وموظف الطلبات كذلك');

select t.empty('select * from t.isolation_report('
               || quote_literal(:'csA') || ', ' || quote_literal(:'B')
               || ') where relname not in ('
               || '''products'',''categories'',''delivery_zones'','
               || '''store_settings'',''media_files'')',
               '★★★ وموظف خدمة العملاء كذلك');

select t.empty('select * from t.isolation_report('
               || quote_literal(:'customerA') || ', ' || quote_literal(:'B')
               || ') where relname not in ('
               || '''products'',''categories'',''delivery_zones'','
               || '''store_settings'',''media_files'')',
               '★★★ وعميل متجر أ كذلك');

select t.empty('select * from t.isolation_report('
               || quote_literal(:'partner1') || ', ' || quote_literal(:'B')
               || ') where relname not in ('
               || '''products'',''categories'',''delivery_zones'','
               || '''store_settings'',''media_files'')',
               '★★★ والشريك كذلك (يرى إحالاته لا بيانات المتاجر)');

-- موظف الدعم يملك `support:manage` و`stores:view`.
-- ★ تذاكر كل المتاجر مقروءة له **عمدًا** — هذا عمله، ومصفوفة الوصول
-- تنصّ عليه. ما يجب ألا يراه هو بقيّة بيانات المتجر التشغيلية:
-- الطلبات والعملاء والمدفوعات والمخزون والكوبونات.
select t.empty('select * from t.isolation_report('
               || quote_literal(:'adminSup') || ', ' || quote_literal(:'B')
               || ') where relname not in ('
               || '''products'',''categories'',''delivery_zones'','
               || '''store_settings'',''media_files'',''support_tickets'')',
               '★★ وموظف الدعم لا يقرأ بيانات المتاجر التشغيلية');
select t.login(:'adminSup');
select t.empty('select 1 from orders where store_id = ' || quote_literal(:'B'),
               '★★ تحديدًا: لا يقرأ طلبات المتجر');
select t.empty('select 1 from customers where store_id = ' || quote_literal(:'B'),
               '★★ ولا عملاءه');
select t.empty('select 1 from payments where store_id = ' || quote_literal(:'B'),
               '★★ ولا مدفوعاته');
select t.ok((select count(*) >= 1 from support_tickets where store_id = :'B'),
            '★ لكنه يرى تذاكره — وهذا عمله');
select t.reset();

\echo '── والعكس: التاجر ب لا يرى متجر أ ──'
select t.empty('select * from t.isolation_report('
               || quote_literal(:'ownerB') || ', ' || quote_literal(:'A')
               || ') where relname not in ('
               || '''products'',''categories'',''delivery_zones'','
               || '''store_settings'',''media_files'')',
               '★★★ مالك متجر ب: صفر تسريب من متجر أ');

\echo '── الزائر المجهول ──'
select t.logout();
select t.empty('select 1 from orders', '★★ الزائر لا يقرأ أي طلب');
select t.empty('select 1 from customers', '★★ ولا أي عميل');
select t.empty('select 1 from payments', '★★ ولا أي دفعة');
select t.empty('select 1 from inventory', '★★ ولا أي مخزون');
select t.empty('select 1 from coupons', '★★ ولا أي كوبون');
select t.empty('select 1 from store_members', '★★ ولا أعضاء فريق');
select t.empty('select 1 from support_tickets', '★★ ولا تذكرة دعم');
select t.empty('select 1 from notifications', '★★ ولا تنبيهًا');
select t.empty('select 1 from analytics_daily', '★★ ولا إحصاءات');
select t.empty('select 1 from refunds', '★★ ولا استردادًا');
select t.empty('select 1 from store_visits', '★★ ولا زيارة');
select t.empty('select 1 from audit_logs', '★★ ولا سجل تدقيق');
select t.empty('select 1 from commission_ledger', '★★ ولا عمولة');
select t.empty('select 1 from ledger_entries', '★★ ولا قيد دفتر');
-- ★ إعدادات المتجر مقروءة للزائر عمدًا (واتساب · السياسات · طرق
-- الدفع)، لكن الأعمدة التشغيلية محجوبة على مستوى العمود
select t.throws('select notification_prefs from store_settings limit 1',
                '★★ ولا يقرأ إعدادات المتجر التشغيلية');
select t.throws('select cost_price from products limit 1',
                '★★★ ولا سعر تكلفة أي منتج على المنصة');

\echo '── تزوير المعرّف: الكتابة في متجر آخر ──'
select t.login(:'ownerA');
select t.throws('select 1 from save_product(' || quote_literal(:'B')
                || ', ''منتج مدسوس'', 1000)',
                '★★★ التاجر أ لا يكتب منتجًا في متجر ب بتمرير معرّفه');
select t.throws('select adjust_inventory(' || quote_literal(:'B')
                || ', ''d2000000-0000-0000-0000-000000000001'', 100)',
                '★★★ ولا يعدّل مخزون متجر ب');
select t.throws('select 1 from invite_store_member(' || quote_literal(:'B')
                || ', ''x@test.local'', ''manager'')',
                '★★★ ولا يدعو عضوًا إلى فريق متجر ب');
select t.throws('select 1 from add_custom_domain(' || quote_literal(:'B')
                || ', ''hijack.example.com'')',
                '★★★ ولا يضيف دومينًا لمتجر ب');
select t.throws('select store_analytics(' || quote_literal(:'B') || ')',
                '★★★ ولا يقرأ إحصاءات متجر ب');
select t.throws('select 1 from submit_subscription_request(' || quote_literal(:'B')
                || ', (select id from plans where code = ''basic''))',
                '★★★ ولا يشترك نيابةً عن متجر ب');
select t.throws('select publish_store(' || quote_literal(:'B') || ')',
                '★★ ولا ينشر متجر ب');
rollback;
select t.reset();

\echo '✓ اختبارات العزل الشامل مرّت'
