\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set P1 d1000000-0000-0000-0000-000000000001
\set customerA 77777777-7777-7777-7777-777777777777
\set adminOwner 88888888-8888-8888-8888-888888888888

-- =====================================================================
-- نموّ عدّادات الحدّ — الجدول الذي كان ينمو أبدًا
--
-- ★ لا يُختبر هنا «هل تعمل الدالّة» بل شيئان معًا:
--   ١) أنّ الجدول صار محدودًا (صفٌّ لكل هويّة نشِطة، لا لكل نافذة).
--   ٢) وأنّ **قرار الحدّ لم يتغيّر** — وإلا كان التحسين إرخاءً لحدٍّ
--      أمني وهو أسوأ من الجدول المتضخّم.
-- =====================================================================

\echo '── ★★★ صفٌّ واحد لكل هويّة مهما مرّت النوافذ ──'
begin;
delete from public.rate_limit_counters where bucket = 'probe:one';
select t.ok(public.check_rate_limit('probe:one', 100, 1), 'النافذة الأولى تُقبل');
commit;
\o /dev/null
select pg_sleep(1.2);
\o
begin;
select t.ok(public.check_rate_limit('probe:one', 100, 1), 'والثانية');
commit;
\o /dev/null
select pg_sleep(1.2);
\o
begin;
select t.ok(public.check_rate_limit('probe:one', 100, 1), 'والثالثة');
select t.ok((select count(*) = 1 from public.rate_limit_counters
              where bucket = 'probe:one'),
            '★★★ ثلاث نوافذ متتالية ⇒ صفٌّ واحد (كان ثلاثة)');
select t.ok((select count = 1 from public.rate_limit_counters
              where bucket = 'probe:one'),
            'وعدّاده يعود إلى ١ في النافذة الجديدة — لا يتراكم');
delete from public.rate_limit_counters where bucket = 'probe:one';
commit;

\echo '── ★★★ والحدّ نفسه لم يُرخَ ──'
begin;
delete from public.rate_limit_counters where bucket = 'probe:decide';
select t.ok((select bool_and(public.check_rate_limit('probe:decide', 5, 600))
               from generate_series(1, 5)),
            '★★★ خمسة نداءات تحت حدّ ٥ تُقبل');
select t.ok(not public.check_rate_limit('probe:decide', 5, 600),
            '★★★ والسادس يُرفض — القرار لم يتغيّر بحذف النوافذ الماضية');
rollback;

\echo '── ★★★ حدّ الطلبات الحقيقي ما زال يعمل بعد التغيير ──'
begin;
select t.logout();
select t.ok((select count(*) = 5 from (
  select create_order(:'A',
    jsonb_build_array(jsonb_build_object('product_id', :'P1', 'quantity', 1)),
    (select id from delivery_zones where store_id = :'A' and name = 'الخرطوم'),
    '{"name":"مهاجم","phone":"0999111222"}'::jsonb, '{"line":"الخرطوم"}'::jsonb,
    'cash_on_delivery', null, 'rl116-' || g)
  from generate_series(1, 5) g) x),
  'خمسة طلبات تُقبل');
select t.throws(
  'select create_order(' || quote_literal(:'A') || ','
  || 'jsonb_build_array(jsonb_build_object(''product_id'', ' || quote_literal(:'P1') || ', ''quantity'', 1)),'
  || '(select id from delivery_zones where store_id = ' || quote_literal(:'A') || ' and name = ''الخرطوم''),'
  || '''{"name":"مهاجم","phone":"0999111222"}''::jsonb, ''{"line":"الخرطوم"}''::jsonb,'
  || '''cash_on_delivery'', null, ''rl116-6'')',
  '★★★ والسادس يُرفض — إصلاح النموّ لم يكسر حدّ الإغراق');
rollback;

\echo '── الكنس يحذف المهجور ويُبقي الحاضر ──'
begin;
delete from public.rate_limit_counters where bucket like 'probe:sweep%';
insert into public.rate_limit_counters (bucket, window_start, count)
values ('probe:sweep:old', now() - interval '10 days', 3),
       ('probe:sweep:mid', now() - interval '3 days', 3),
       ('probe:sweep:new', now(), 3);
select t.ok(public.prune_rate_limits(48) >= 2,
            'كنسُ ٤٨ ساعة يحذف القديم');
select t.ok((select count(*) = 0 from public.rate_limit_counters
              where bucket in ('probe:sweep:old','probe:sweep:mid')),
            'فلا يبقى صفٌّ أقدم من الحدّ');
select t.ok((select count(*) = 1 from public.rate_limit_counters
              where bucket = 'probe:sweep:new'),
            '★★★ ويبقى صفّ النافذة الحاضرة — الكنس لا يُرخي حدًّا قائمًا');
rollback;

\echo '── ★★★ الكنس ليس عامًّا ──'
begin;
select t.logout();
select t.throws('select public.prune_rate_limits()',
                '★★★ الزائر لا ينادي الكنس');
rollback;

begin;
select t.login(:'customerA');
select t.throws('select public.prune_rate_limits()',
                '★★★ ولا زبونٌ مسجَّل (وإلا أمكن تصفير عدّادات الحدّ)');
rollback;

begin;
select t.login(:'adminOwner');
select t.ok(public.prune_rate_limits(48) >= 0,
            'ومالك المنصّة ينادي الكنس');
rollback;
