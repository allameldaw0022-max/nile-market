\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set adminOwner 88888888-8888-8888-8888-888888888888
\set customerA 77777777-7777-7777-7777-777777777777

-- =====================================================================
-- مراقبة السعة — تُقاس قدرتها على **التنبيه**، لا على العمل
--
-- ★ دالّة مراقبة تعمل ولا تُنبِّه عند الضغط أسوأ من غيابها: تُعطي
--   طمأنينة كاذبة. فالاختبار هنا يُنزل العتبة عمدًا ويطالب بالتنبيه.
-- =====================================================================

\echo '── قراءة السعة تعمل وتُسجَّل ──'
begin;
select t.ok((app.sample_capacity() ->> 'level') in ('ok','warn','critical'),
            'القياس يعيد مستوى معروفًا');
select t.ok((select count(*) from public.capacity_samples) > 0,
            'ويكتب قراءات في السلسلة الزمنية');
select t.ok((select count(*) = 1 from public.system_health_checks
              where component = 'capacity'
                and checked_at >= now() - interval '1 minute'),
            'ويُسجّل فحصًا واحدًا في صحّة النظام القائمة');
rollback;

\echo '── ★★★ العتبة تُنبِّه فعلًا حين تُتجاوَز ──'
begin;
-- عتبة اتصالات عند صفر ⇒ أيّ اتصال قائم يجب أن يُنبِّه
update public.platform_settings
   set resource_limits = resource_limits || jsonb_build_object('capacity',
         jsonb_build_object('connections_pct_warn', 0,
                            'connections_pct_critical', 99999))
 where id;
select t.ok((app.sample_capacity() ->> 'level') = 'warn',
            '★★★ تجاوز عتبة `warn` يُعلن `warn` لا `ok`');
select t.ok((select count(*) = 1 from public.system_health_checks
              where component = 'capacity' and status = 'degraded'
                and checked_at >= now() - interval '1 minute'),
            '★★★ ويُسجَّل `degraded` — فيُعلنه /api/v1/health');

-- والحرج يُعلن `down` فيُعطي 503 لمراقب خارجي
update public.platform_settings
   set resource_limits = resource_limits || jsonb_build_object('capacity',
         jsonb_build_object('connections_pct_warn', 0,
                            'connections_pct_critical', 0))
 where id;
select t.ok((app.sample_capacity() ->> 'level') = 'critical',
            '★★★ وتجاوز الحرج يُعلن `critical`');
select t.ok((select count(*) = 1 from public.system_health_checks
              where component = 'capacity' and status = 'down'
                and checked_at >= now() - interval '1 minute'),
            '★★★ ويُسجَّل `down`');
rollback;

\echo '── العتبة الافتراضية لا تُنبِّه على نظام هادئ ──'
begin;
update public.platform_settings set resource_limits = resource_limits - 'capacity' where id;
select t.ok((app.sample_capacity() ->> 'level') = 'ok',
            'نظامٌ هادئ ⇒ `ok` (ولا إنذار كاذب)');
-- ★ نسبة إصابة الذاكرة تراكميّة، فلا تُقيَّم قبل حجم قراءات كافٍ
select t.ok((select count(*) > 0 from public.capacity_samples
              where metric in ('cache_hit_pct','cache_hit_pct_pending')),
            'ونسبة الذاكرة تُسجَّل في كل حال');
rollback;

\echo '── ★★★ لا يُكشف نصّ استعلام ولا بيان مستأجر ──'
begin;
-- `pg_stat_activity` تحمل نصوص الاستعلامات وفيها قيم العملاء
select t.ok((app.read_capacity())::text not like '%select %'
            and (app.read_capacity())::text not like '%insert %',
            '★★★ القراءة أعدادٌ فقط — لا نصّ استعلام واحد');
select t.ok((app.read_capacity()) ? 'connections'
            and (app.read_capacity()) ? 'contention'
            and (app.read_capacity()) ? 'throughput',
            'وتحمل المحاور المطلوبة: اتصالات وتنازع وإنتاجية');
rollback;

\echo '── ★★★ الصلاحيات: المراقبة ليست عامّة ──'
begin;
select t.logout();
select t.throws('select public.capacity_latest()',
                '★★★ الزائر لا يقرأ سعة المنصّة');
select t.throws('select public.record_capacity()',
                '★★★ ولا يكتب قراءة');
select t.throws('select app.read_capacity()',
                '★★★ ولا ينادي القراءة الداخلية');
rollback;

begin;
select t.login(:'customerA');
select t.throws('select public.capacity_latest()',
                '★★★ وزبونٌ مسجَّل لا يقرأ سعة المنصّة');
select t.throws('select public.record_capacity()',
                '★★★ ولا يكتب قراءة');
select t.throws('select public.capacity_series(''connections_pct'', 24)',
                '★★★ ولا يقرأ السلسلة');
rollback;

begin;
select t.login(:'adminOwner');
select t.ok((select count(*) >= 0 from public.capacity_latest()),
            'ومالك المنصّة يقرأ الأحدث');
select t.ok((select count(*) >= 0 from public.capacity_series('connections_pct', 24)),
            'ويقرأ السلسلة');
rollback;
