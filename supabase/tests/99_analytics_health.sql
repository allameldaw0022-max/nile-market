\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set B b0000000-0000-0000-0000-00000000000b
\set ownerA 11111111-1111-1111-1111-111111111111
\set ownerB 22222222-2222-2222-2222-222222222222
\set ordersA 44444444-4444-4444-4444-444444444444
\set adminOwner 88888888-8888-8888-8888-888888888888
\set customerA 77777777-7777-7777-7777-777777777777

\echo '── زيارات المتجر: العدّ لا الصفوف ──'
begin;
select t.reset();
insert into store_visits (store_id, visitor_token, path) values
  (:'A', 'visitor-token-one-aaaaaaaa', '/'),
  (:'A', 'visitor-token-one-aaaaaaaa', '/products'),
  (:'A', 'visitor-token-two-bbbbbbbb', '/'),
  (:'B', 'visitor-token-three-cccccc', '/');

select t.login(:'ownerA');
select t.empty('select 1 from store_visits',
               '★★ التاجر لا يقرأ صفوف الزيارات (توكن الزائر ومساره)');
select t.ok((select (store_analytics(:'A') -> 'totals' ->> 'visits')::int = 3),
            'لكنه يقرأ عددها مجمَّعًا');
select t.ok((select (store_analytics(:'A') -> 'totals' ->> 'visitors')::int = 2),
            '★ والزوّار المميّزون يُعدّون بالتوكن لا بعدد الصفحات');
select t.ok((select jsonb_array_length(store_analytics(:'A') -> 'top_pages') = 2),
            'وأكثر الصفحات زيارة');

select t.login(:'ownerB');
select t.throws('select store_analytics(' || quote_literal(:'A') || ')',
                '★★ تاجر آخر لا يقرأ إحصاءات متجر ليس له');
select t.login(:'adminOwner');
select t.throws('select store_analytics(' || quote_literal(:'A') || ')',
                '★ ولا موظف المنصة عبر هذا المسار (إحصاءات المتجر لفريقه)');
select t.logout();
select t.throws('select store_analytics(' || quote_literal(:'A') || ')',
                '★ ولا الزائر');
rollback;

\echo '── معدّل التحويل: لا نعرف ≠ صفر ──'
begin;
select t.reset();
select t.login(:'ownerA');
select t.ok((select store_analytics(:'A') -> 'totals' ->> 'conversion' is null),
            '★★ بلا زوّار: معدّل التحويل null لا صفر');
select t.ok((select store_analytics(:'A') -> 'totals' ->> 'aov' is null),
            '★ وبلا طلبات: متوسط الطلب null لا صفر');
rollback;

\echo '── التجميع اليومي يشمل متجرًا زاره الناس ولم يبع ──'
begin;
select t.reset();
insert into store_visits (store_id, visitor_token, path, created_at) values
  (:'A', 'yesterday-token-aaaaaaaaaa', '/', current_date - 1),
  (:'A', 'yesterday-token-bbbbbbbbbb', '/', current_date - 1);

select t.ok((select aggregate_analytics(current_date - 1) >= 1),
            'المهمة اليومية تُجمّع');
select t.ok((select visits = 2 and unique_visitors = 2 and orders_count = 0
             from analytics_daily
             where store_id = :'A' and date = current_date - 1),
            '★★ متجر بزيارات وبلا طلبات يحصل على صفّه (كان يضيع)');
rollback;

\echo '── منح التجميع والفحوص ──'
begin;
select t.login(:'ownerA');
select t.throws('select aggregate_analytics()',
                '★ التاجر لا ينادي مهمة التجميع');
select t.throws('select record_health_check(''db'', ''healthy'')',
                '★★ ولا يكتب فحص صحة (وإلا أعلن النظام سليمًا وهو معطّل)');
select t.login(:'adminOwner');
select t.throws('select record_health_check(''db'', ''healthy'')',
                '★ ولا موظف المنصة — الفحص يكتبه الخادم وحده');
rollback;

begin;
select t.reset();
select t.ok((select record_health_check('database', 'healthy', 12, 'اتصال سليم')
             is not null),
            'الخادم يكتب الفحص');
select t.login(:'adminOwner');
select t.ok((select (system_health() -> 'checks' -> 0 ->> 'component') = 'database'),
            'ويظهر في صفحة صحة النظام');
select t.login(:'ownerA');
select t.empty('select 1 from system_health_checks',
               '★ والتاجر لا يرى فحوص المنصة');
rollback;
select t.reset();


\echo '── كنس الدومينات المنتظرة ──'
begin;
select t.reset();
insert into store_domains (store_id, hostname, kind, status, verification_token)
values (:'A', 'shop-one.example', 'custom', 'pending', 'tok-one'),
       (:'A', 'shop-two.example', 'custom', 'active',  'tok-two'),
       (:'B', 'shop-old.example', 'custom', 'pending', 'tok-old');
update store_domains set created_at = now() - interval '20 days'
 where hostname = 'shop-old.example';

select t.ok((select count(*) = 1 from claim_pending_domains()),
            '★ الكنس يأخذ المنتظر وحده — لا الدومين النشط');
select t.ok((select count(*) = 0 from claim_pending_domains()),
            '★★ ولا يعيد الدومين نفسه مباشرةً (تباعد يمنع استنزاف DNS)');
select t.empty('select 1 from claim_pending_domains() where hostname = ''shop-old.example''',
               '★ ودومين مضى عليه أسبوعان لا يُفحص آليًا');
select t.ok((select last_checked_at is not null from store_domains
             where hostname = 'shop-one.example'),
            'ووقت الفحص يُختم عند الأخذ');
rollback;

begin;
select t.login(:'ownerA');
select t.throws('select 1 from claim_pending_domains()',
                '★★ التاجر لا ينادي الكنس (وإلا أمكن استنزاف الحصة)');
select t.login(:'adminOwner');
select t.throws('select 1 from claim_pending_domains()',
                '★ ولا موظف المنصة — الكنس للخادم وحده');
rollback;
select t.reset();

\echo '✓ اختبارات الإحصاءات وصحة النظام مرّت'
