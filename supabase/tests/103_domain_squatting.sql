\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set ownerA 11111111-1111-1111-1111-111111111111
\set ownerB 22222222-2222-2222-2222-222222222222

\echo '── احتكار نطاق المنصة ──'
begin;
select t.reset();
-- الباقة يجب أن تسمح بالدومين المخصص
insert into plan_entitlements (plan_id, feature_key, bool_value)
select id, 'custom_domain.enabled', true from plans where code = 'basic'
on conflict (plan_id, feature_key) do update set bool_value = true;
update subscriptions set plan_id = (select id from plans where code='basic'),
                         status = 'active', current_period_end = now() + interval '30 days'
 where store_id = :'A';

select t.login(:'ownerA');
select t.throws('select 1 from add_custom_domain(' || quote_literal(:'A')
                || ', ''nilemarket.online'')',
                '★★★ التاجر لا يسجّل جذر نطاق المنصة');
select t.throws('select 1 from add_custom_domain(' || quote_literal(:'A')
                || ', ''www.nilemarket.online'')',
                '★★ ولا www الخاص بها');
select t.throws('select 1 from add_custom_domain(' || quote_literal(:'A')
                || ', ''store-b.nilemarket.online'')',
                '★★★ ولا نطاقًا فرعيًا يخص متجرًا آخر (كان يمنعه من الوجود)');
select t.throws('select 1 from add_custom_domain(' || quote_literal(:'A')
                || ', ''localhost'')',
                '★ ولا اسمًا بلا نقطة');
select t.throws('select 1 from add_custom_domain(' || quote_literal(:'A')
                || ', ''bad..example.com'')',
                '★ ولا نطاقًا بنقطتين متتاليتين');

select t.ok((select count(*) = 1 from add_custom_domain(:'A', 'my-real-shop.com')),
            'ونطاق حقيقي خارج المنصة يُقبل');
rollback;

\echo '── النطاق الفرعي لا يُنشأ بصمت معطوبًا ──'
begin;
select t.reset();
insert into auth.users (id, email, email_confirmed_at)
values ('e8000000-0000-0000-0000-00000000000e', 'squat@test.local', now());
-- نحاكي الاحتكار بإدراج مباشر (لم يعد ممكنًا عبر add_custom_domain)
insert into store_domains (store_id, hostname, kind, status, verification_token)
values (:'A', 'newshop.nilemarket.online', 'custom', 'verification_required', 'tok');

select t.login('e8000000-0000-0000-0000-00000000000e');
select t.throws('select 1 from create_store(''متجر جديد'', ''newshop'')',
                '★★★ إنشاء متجر بنطاق محتكَر يفشل صراحةً لا بصمت');
rollback;

begin;
select t.reset();
insert into auth.users (id, email, email_confirmed_at)
values ('e8000000-0000-0000-0000-00000000000e', 'ok@test.local', now());
select t.login('e8000000-0000-0000-0000-00000000000e');
select store_id as nsid from create_store('متجر سليم', 'clean-shop')
\gset
select t.reset();
select t.ok((select count(*) = 1 from store_domains
             where store_id = :'nsid' and is_primary and status = 'active'),
            '★ والمتجر السليم يحصل على نطاقه الأساسي');
rollback;

\echo '── رابط التنبيه داخلي دائمًا ──'
begin;
select t.reset();
select t.throws($$insert into notifications (user_id, type, title, link)
                 values ('11111111-1111-1111-1111-111111111111','x','y',
                         'javascript:alert(1)')$$,
                '★★★ رابط javascript: مرفوض في التخزين');
select t.throws($$insert into notifications (user_id, type, title, link)
                 values ('11111111-1111-1111-1111-111111111111','x','y',
                         'https://evil.test/phish')$$,
                '★★ ورابط خارجي مرفوض');
select t.throws($$insert into notifications (user_id, type, title, link)
                 values ('11111111-1111-1111-1111-111111111111','x','y',
                         '//evil.test/phish')$$,
                '★★ و«//» المخادع مرفوض');
insert into notifications (user_id, type, title, link)
values ('11111111-1111-1111-1111-111111111111','x','y','/dashboard/orders');
select t.ok(true, 'والمسار الداخلي مقبول');
rollback;
select t.reset();

\echo '✓ اختبارات احتكار النطاق ومسار التنبيه مرّت'
