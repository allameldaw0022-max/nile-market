-- =====================================================================
-- 0057 حدٌّ لنموّ `store_visits` + مقياسه في المراقبة
--
-- كشفه تدقيق هذه المرحلة: `store_visits` — مثل `rate_limit_counters`
-- قبل 0056 — **لا يُحذف منه شيء أبدًا**. صفٌّ لكل عرض صفحة، إلى الأبد.
--
-- ★ القياس من بيئة الاختبار: ٤٢٦٠٦٩ زيارة ⇒ ٩٥ م.ب (٥٠ فهارس)،
--   وهبطت إنتاجية تسجيل الزيارة ٦٨٣٩ ⟶ ٥٢٨٢ زيارة/ثانية مع النموّ.
--   وعند ١٠٠ ألف مستخدم متزامن: ١٠٠٠٠ عرض/ثانية ⇒ ٨٦٤ مليون صفٍّ
--   يوميًّا على أسخن مسار كتابة في المنصّة.
--
-- ★ ولماذا الاحتفاظ ٤٠٠ يومًا افتراضًا لا ٧: `store_analytics()` تقرأ
--   `store_visits` **خامًا** في موضعين — عدّادات اليوم الجاري، و
--   `top_pages` على كل النطاق المطلوب (يُقصّ إلى ٣٦٥ يومًا كحدّ أقصى).
--   فحذفٌ أقصر من ذلك يقصّ «أكثر الصفحات زيارةً» لدى التاجر. ٤٠٠ يومًا
--   تعني: **لا تغيّر في ما يراه أحد**، والجدول محدود بدل أن يكون أبديًّا.
--
-- ★ والمالك يملك الرافعة: `resource_limits.capacity.visits_retention_days`
--   يخفضها متى قَبِل تقصير نافذة `top_pages` وحدها — وبقيّة الإحصاءات
--   تأتي من `analytics_daily` المجمَّع فلا تتأثّر. وهذا هو ما يجعل
--   الجدول قابلًا للتحجيم فعلًا.
--
-- ★ ولا يُحذف يومٌ لم يُجمَّع بعد: الحذف محصور بما هو أقدم من آخر يوم
--   مُجمَّع في `analytics_daily`. فلو تعطّلت الصيانة اليومية أسبوعًا لم
--   يُفقَد شيء — يُحذف فقط ما صار له بديلٌ مجمَّع.
-- =====================================================================

-- الفهرس القائم `(store_id, created_at)` لا يخدم حذفًا عامًّا بالتاريخ
create index if not exists store_visits_created_idx
  on public.store_visits (created_at);

create or replace function public.prune_store_visits(
  p_keep_days integer default null, p_batch integer default 50000
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keep  integer;
  v_cut   timestamptz;
  v_safe  date;
  v_gone  integer := 0;
  v_round integer;
begin
  if (select auth.uid()) is not null
     and not app.has_platform_permission('system_health', 'view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- الاحتفاظ: من الإعدادات إن وُجد، وإلا ٤٠٠ يومًا؛ ولا يقلّ عن ٨ أيام
  -- (نافذة `store_analytics` الدنيا ٧ أيام).
  v_keep := greatest(8, coalesce(p_keep_days,
              app.threshold('visits_retention_days', 400)::integer));
  v_cut := (current_date - v_keep)::timestamptz;

  -- ★ السقف الصلب: لا يُحذف يومٌ لم يُجمَّع بعد.
  select max(date) into v_safe from public.analytics_daily;
  if v_safe is null then
    return 0;                     -- لم يُجمَّع شيء ⇒ لا يُحذف شيء
  end if;
  v_cut := least(v_cut, v_safe::timestamptz);

  loop
    with doomed as (
      select ctid from public.store_visits
       where created_at < v_cut
       limit greatest(1000, p_batch)
    )
    delete from public.store_visits v
     using doomed d where v.ctid = d.ctid;
    get diagnostics v_round = row_count;
    v_gone := v_gone + v_round;
    exit when v_round = 0 or v_gone >= 2000000;   -- سقف لكل جريان
  end loop;

  return v_gone;
end;
$$;

revoke execute on function public.prune_store_visits(integer, integer) from public, anon;
grant   execute on function public.prune_store_visits(integer, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- المقياس: صفوف `store_visits` تُراقَب كما تُراقَب عدّادات الحدّ
-- ---------------------------------------------------------------------
-- العتبة 50م/200م: عند ١٠٠ ألف مستخدم متزامن يُنشأ ~٨٦٤ مليون صفٍّ
-- يوميًّا، فـ٥٠ مليونًا تنبيهٌ مبكّر بأسبوعٍ من النموّ لا بانفجار.
create or replace function app.read_capacity()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_max_conn    numeric := current_setting('max_connections')::numeric;
  v_conn        numeric;
  v_active      numeric;
  v_idle_tx     numeric;
  v_lock_wait   numeric;
  v_ungranted   numeric;
  v_oldest_tx   numeric;
  v_hit         numeric;
  v_blocks      numeric;
  v_deadlocks   numeric;
  v_commits     numeric;
  v_rollbacks   numeric;
  v_db_bytes    numeric := pg_database_size(current_database());
  v_orders_1m   numeric;
  v_orders_1h   numeric;
  v_visits_1m   numeric;
  v_visits_1h   numeric;
  v_rl_rows     numeric;
  v_sv_rows     numeric;
  v_limits      jsonb;
begin
  select count(*),
         count(*) filter (where state = 'active'),
         count(*) filter (where state = 'idle in transaction'),
         count(*) filter (where wait_event_type = 'Lock'),
         coalesce(max(extract(epoch from (now() - xact_start))), 0)
    into v_conn, v_active, v_idle_tx, v_lock_wait, v_oldest_tx
    from pg_stat_activity
   where datname = current_database();

  select count(*) into v_ungranted from pg_locks where not granted;

  select case when (blks_hit + blks_read) = 0 then 100
              else round(blks_hit * 100.0 / (blks_hit + blks_read), 2) end,
         (blks_hit + blks_read),
         deadlocks, xact_commit, xact_rollback
    into v_hit, v_blocks, v_deadlocks, v_commits, v_rollbacks
    from pg_stat_database where datname = current_database();

  select count(*) filter (where created_at >= now() - interval '1 minute'),
         count(*) filter (where created_at >= now() - interval '1 hour')
    into v_orders_1m, v_orders_1h from public.orders;

  select count(*) filter (where created_at >= now() - interval '1 minute'),
         count(*) filter (where created_at >= now() - interval '1 hour')
    into v_visits_1m, v_visits_1h from public.store_visits;

  -- ★ تقدير من الإحصاء لا `count(*)`: مراقبةٌ تمسح جدولًا ضخمًا كل
  --   ساعة تصير هي الحمل.
  select coalesce(n_live_tup, 0) into v_rl_rows
    from pg_stat_user_tables where relname = 'rate_limit_counters';
  select coalesce(n_live_tup, 0) into v_sv_rows
    from pg_stat_user_tables where relname = 'store_visits';

  select coalesce(resource_limits, '{}'::jsonb) into v_limits
    from public.platform_settings where id;

  return jsonb_build_object(
    'connections', jsonb_build_object(
      'used', v_conn, 'max', v_max_conn,
      'pct', round(v_conn * 100.0 / greatest(v_max_conn, 1), 2),
      'active', v_active, 'idle_in_transaction', v_idle_tx),
    'contention', jsonb_build_object(
      'lock_waiters', v_lock_wait, 'ungranted_locks', v_ungranted,
      'longest_tx_seconds', round(v_oldest_tx, 2),
      'deadlocks_total', v_deadlocks,
      'xact_commit_total', v_commits, 'xact_rollback_total', v_rollbacks),
    'cache', jsonb_build_object('hit_pct', v_hit, 'blocks_total', v_blocks,
                                'evaluated', v_blocks >= 100000),
    'database', jsonb_build_object(
      'bytes', v_db_bytes,
      'limit_bytes', nullif(v_limits ->> 'database', '')::numeric),
    'throughput', jsonb_build_object(
      'orders_1m', v_orders_1m, 'orders_1h', v_orders_1h,
      'visits_1m', v_visits_1m, 'visits_1h', v_visits_1h),
    'rate_limits', jsonb_build_object('rows_estimate', coalesce(v_rl_rows, 0)),
    'store_visits', jsonb_build_object('rows_estimate', coalesce(v_sv_rows, 0)),
    'generated_at', now()
  );
end;
$$;

revoke execute on function app.read_capacity() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- تقييم المقياس الجديد + إضافة الكنس إلى الصيانة اليومية القائمة
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sample_capacity()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  m          jsonb := app.read_capacity();
  v_worst    text := 'ok';
  v_rank     integer := 1;
  v_rows     integer := 0;
  v_alerts   jsonb := '[]'::jsonb;
begin
  -- ★ التقييم في CTE واحد لا في عشرة فروع: الإضافة لمقياسٍ جديد
  --   سطرٌ في القائمة، فلا يُنسى تسجيله ولا تقييمه.
  with spec(metric, value, lim, warn, crit, lower_is_worse, detail) as (
    values
      ('connections_pct',
       (m -> 'connections' ->> 'pct')::numeric,
       100::numeric,
       app.threshold('connections_pct_warn', 60),
       app.threshold('connections_pct_critical', 80), false,
       m -> 'connections'),
      ('lock_waiters',
       (m -> 'contention' ->> 'lock_waiters')::numeric, null::numeric,
       app.threshold('lock_waiters_warn', 5),
       app.threshold('lock_waiters_critical', 20), false,
       m -> 'contention'),
      ('longest_tx_seconds',
       (m -> 'contention' ->> 'longest_tx_seconds')::numeric, null::numeric,
       app.threshold('longest_tx_seconds_warn', 30),
       app.threshold('longest_tx_seconds_critical', 120), false,
       m -> 'contention'),
      -- تُقيَّم بعد ١٠٠ ألف قراءة كتلة فقط؛ وقبلها تُسجَّل ولا تُنبِّه
      (case when (m -> 'cache' ->> 'evaluated')::boolean
            then 'cache_hit_pct' else 'cache_hit_pct_pending' end,
       (m -> 'cache' ->> 'hit_pct')::numeric, 100::numeric,
       case when (m -> 'cache' ->> 'evaluated')::boolean
            then app.threshold('cache_hit_pct_warn', 95) else -1 end,
       case when (m -> 'cache' ->> 'evaluated')::boolean
            then app.threshold('cache_hit_pct_critical', 90) else -1 end, true,
       m -> 'cache'),
      ('orders_per_min',
       (m -> 'throughput' ->> 'orders_1m')::numeric, null::numeric,
       app.threshold('orders_per_min_warn', 6000),
       app.threshold('orders_per_min_critical', 12000), false,
       m -> 'throughput'),
      ('visits_per_min',
       (m -> 'throughput' ->> 'visits_1m')::numeric, null::numeric,
       app.threshold('visits_per_min_warn', 60000),
       app.threshold('visits_per_min_critical', 120000), false,
       m -> 'throughput'),
      ('rate_limit_rows',
       (m -> 'rate_limits' ->> 'rows_estimate')::numeric, null::numeric,
       app.threshold('rate_limit_rows_warn', 2000000),
       app.threshold('rate_limit_rows_critical', 10000000), false,
       m -> 'rate_limits'),
      ('store_visits_rows',
       (m -> 'store_visits' ->> 'rows_estimate')::numeric, null::numeric,
       app.threshold('store_visits_rows_warn', 50000000),
       app.threshold('store_visits_rows_critical', 200000000), false,
       m -> 'store_visits'),
      ('database_pct',
       case when (m -> 'database' ->> 'limit_bytes') is null then null
            else round((m -> 'database' ->> 'bytes')::numeric * 100.0
                       / (m -> 'database' ->> 'limit_bytes')::numeric, 2) end,
       100::numeric,
       app.threshold('database_pct_warn', 70),
       app.threshold('database_pct_critical', 85), false,
       m -> 'database')
  ), scored as (
    select metric, value, lim, warn, crit, detail,
           case
             when value is null then 'ok'
             when lower_is_worse and value <= crit then 'critical'
             when lower_is_worse and value <= warn then 'warn'
             when not lower_is_worse and value >= crit then 'critical'
             when not lower_is_worse and value >= warn then 'warn'
             else 'ok'
           end as level
      from spec
  ), written as (
    insert into public.capacity_samples (metric, value, limit_value, pct, level, detail)
    select metric, coalesce(value, 0), lim,
           case when lim is null or lim = 0 then null
                else round(coalesce(value, 0) * 100.0 / lim, 2) end,
           level,
           coalesce(detail, '{}'::jsonb)
                || jsonb_build_object('warn', warn, 'critical', crit)
      from scored
     where value is not null
    returning metric, level
  )
  select count(*),
         coalesce(max(case level when 'critical' then 3 when 'warn' then 2 else 1 end), 1),
         coalesce(jsonb_agg(jsonb_build_object('metric', metric, 'level', level))
                    filter (where level <> 'ok'), '[]'::jsonb)
    into v_rows, v_rank, v_alerts
    from written;

  v_worst := case v_rank when 3 then 'critical' when 2 then 'warn' else 'ok' end;

  -- ★ يُسجَّل في صحّة النظام القائمة: `degraded` للتنبيه المبكّر،
  --   و`down` للحرج — فيراه المالك في صفحته ويعلنه `/api/v1/health`.
  perform public.record_health_check(
    'capacity',
    case v_worst when 'critical' then 'down'::public.health_status
                 when 'warn'     then 'degraded'::public.health_status
                 else 'healthy'::public.health_status end,
    null,
    case when v_worst = 'ok' then null else v_alerts::text end);

  -- المراقبة لا تأكل ما تراقبه: تُحفظ ٩٠ يومًا لا أكثر.
  delete from public.capacity_samples where measured_at < now() - interval '90 days';

  return jsonb_build_object('level', v_worst, 'metrics', v_rows,
                            'alerts', v_alerts, 'reading', m);
end;
$function$;

revoke execute on function app.sample_capacity() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.run_daily_maintenance()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb := '{}'::jsonb;
  v_sweep  record;
  v_num    integer;
begin
  begin
    select * into v_sweep from public.sweep_subscriptions();
    v_result := v_result || jsonb_build_object('subscriptions', jsonb_build_object(
      'warned', v_sweep.warned, 'graced', v_sweep.graced, 'expired', v_sweep.expired));
  exception when others then
    v_result := v_result || jsonb_build_object('subscriptions_error', sqlerrm);
  end;

  begin
    v_num := public.aggregate_analytics();
    v_result := v_result || jsonb_build_object('analytics_rows', v_num);
  exception when others then
    v_result := v_result || jsonb_build_object('analytics_error', sqlerrm);
  end;

  begin
    v_num := public.anonymize_due_accounts();
    v_result := v_result || jsonb_build_object('anonymized', v_num);
  exception when others then
    v_result := v_result || jsonb_build_object('anonymize_error', sqlerrm);
  end;

  begin
    v_num := public.purge_old_tickets();
    v_result := v_result || jsonb_build_object('tickets_purged', v_num);
  exception when others then
    v_result := v_result || jsonb_build_object('tickets_error', sqlerrm);
  end;

  begin
    v_num := public.release_expired_slugs();
    v_result := v_result || jsonb_build_object('slugs_released', v_num);
  exception when others then
    v_result := v_result || jsonb_build_object('slugs_error', sqlerrm);
  end;

  begin
    v_num := public.prune_rate_limits();
    v_result := v_result || jsonb_build_object('rate_limits_pruned', v_num);
  exception when others then
    v_result := v_result || jsonb_build_object('rate_limits_error', sqlerrm);
  end;

  begin
    v_result := v_result || jsonb_build_object('capacity', app.sample_capacity() - 'reading');
  exception when others then
    v_result := v_result || jsonb_build_object('capacity_error', sqlerrm);
  end;

  begin
    v_num := public.prune_store_visits();
    v_result := v_result || jsonb_build_object('visits_pruned', v_num);
  exception when others then
    v_result := v_result || jsonb_build_object('visits_error', sqlerrm);
  end;

  return v_result;
end;
$function$;
