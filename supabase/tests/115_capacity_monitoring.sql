\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set adminOwner 88888888-8888-8888-8888-888888888888
\set customerA 77777777-7777-7777-7777-777777777777
\set A a0000000-0000-0000-0000-00000000000a

-- =====================================================================
-- مراقبة السعة — تُقاس قدرتها على **التنبيه**، لا على العمل
--
-- ★ دالّة مراقبة تعمل ولا تُنبِّه عند الضغط أسوأ من غيابها: تُعطي
--   طمأنينة كاذبة. فالاختبار هنا يُنزل العتبة عمدًا ويطالب بالتنبيه.
-- =====================================================================

\echo '── قراءة السعة تعمل وتُسجَّل ──'
begin;
delete from public.system_health_checks where component = 'capacity';
delete from public.capacity_samples;
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
delete from public.system_health_checks where component = 'capacity';
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
delete from public.system_health_checks where component = 'capacity';
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

\echo '── ★★★ حدّ نموّ الزيارات: لا يُحذف يومٌ لم يُجمَّع ──'
begin;
-- زيارة قديمة جدًّا، وبلا أيّ يوم مُجمَّع
delete from public.analytics_daily;
delete from public.store_visits where visitor_token like 'probe115%';
insert into public.store_visits (store_id, visitor_token, path, created_at)
values (:'A', 'probe115-old', '/x', now() - interval '500 days'),
       (:'A', 'probe115-new', '/y', now());
select t.ok(public.prune_store_visits() = 0,
            '★★★ بلا تجميع ⇒ لا يُحذف شيء ولو كان عمره ٥٠٠ يومًا');
select t.ok((select count(*) = 2 from public.store_visits
              where visitor_token like 'probe115%'),
            'والصفّان باقيان');

-- الآن يوم مُجمَّع قديم ⇒ يُسمح بالحذف حتى ذلك اليوم فقط
insert into public.analytics_daily (store_id, date, visits)
values (:'A', current_date - 450, 1)
on conflict (store_id, date) do nothing;
select t.ok(public.prune_store_visits() = 1,
            '★★★ وبعد التجميع يُحذف القديم وحده');
select t.ok((select count(*) = 1 from public.store_visits
              where visitor_token = 'probe115-new'),
            '★★★ وزيارة اليوم تبقى — `top_pages` لا تُقصّ بلا إذن');
rollback;

\echo '── ★★★ كنس الزيارات ليس عامًّا ──'
begin;
select t.logout();
select t.throws('select public.prune_store_visits()',
                '★★★ الزائر لا ينادي كنس الزيارات');
rollback;
begin;
select t.login(:'customerA');
select t.throws('select public.prune_store_visits()',
                '★★★ ولا زبونٌ مسجَّل');
rollback;

\echo '── مقياس الزيارات مسجَّل ──'
begin;
select t.ok((app.read_capacity()) ? 'store_visits',
            'قراءة السعة تحمل عدد صفوف الزيارات');
-- ★ يُصفَّر المقياس أولًا: تأكيدٌ يعتمد على صفوف جريان سابق تأكيدٌ هشّ
delete from public.capacity_samples where metric = 'store_visits_rows';
\o /dev/null
select app.sample_capacity();
\o
select t.ok((select count(*) = 1 from public.capacity_samples
              where metric = 'store_visits_rows'),
            'ويُسجَّل كمقياس له عتبتاه');
rollback;
