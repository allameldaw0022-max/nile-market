-- =====================================================================
-- 0055 مراقبة السعة والتنبيه **قبل** الحدّ (إضافي · لا يمسّ ما سبق)
--
-- ما كان ناقصًا: 0043 تقيس ما يشغل القرص (حجم القاعدة والتخزين)،
-- و`system_health()` تقيس صحّة العمل (طابور البريد، المهام، الاشتراكات).
-- ولا واحدة منهما تقيس **السعة**: كم اتصالًا بقي؟ هل تتنازع المعاملات؟
-- ما إنتاجية الطلبات الآن؟ وهذه بالضبط ما يُسأل عنه قبل الانهيار.
--
-- ★ ولا نظام مراقبة ثانيًا: القياس يُسجَّل في `capacity_samples`، وكل
--   قراءة تتجاوز عتبةً تُكتب في `system_health_checks` عبر
--   `record_health_check` القائمة — فتظهر في صفحة صحة النظام نفسها،
--   وتجعل `/api/v1/health` يعلن `degraded` أو `down` كما يفعل اليوم.
--   جدولٌ جديد للسلاسل الزمنية لأن `resource_usage` مقاسها بايتات،
--   وحشرُ «عدد اتصالات» في `value_bytes` كذبٌ في نمذجة البيان.
--
-- ★ التنبيه قبل الحدّ لا بعده: لكل مقياس عتبتان — `warn` تُعلن
--   `degraded` وهي **قبل** الخطر، و`critical` تُعلن `down`. فمن يراقب
--   يرى الضغط وهو يتشكّل لا وهو يُسقط العملاء.
--
-- ★ ولا يُكشف نصّ استعلام ولا بيانُ مستأجر: `pg_stat_activity` تحمل
--   نصوص الاستعلامات (وفيها قيم العملاء)، فلا يُقرأ منها إلا **أعداد**.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ١) السلسلة الزمنية
-- ---------------------------------------------------------------------
create table if not exists public.capacity_samples (
  id           uuid primary key default gen_random_uuid(),
  metric       text   not null,
  value        numeric not null,
  limit_value  numeric,
  pct          numeric(6,2),
  level        text   not null check (level in ('ok', 'warn', 'critical')),
  detail       jsonb  not null default '{}'::jsonb,
  measured_at  timestamptz not null default now()
);

create index if not exists capacity_samples_latest_idx
  on public.capacity_samples (metric, measured_at desc);

alter table public.capacity_samples enable row level security;
-- لا سياسة SELECT: القراءة تمرّ بدالّة تفحص صلاحية القسم وحدها،
-- كما في `resource_usage` تمامًا.
revoke all on public.capacity_samples from anon, authenticated;

comment on table public.capacity_samples is
  'قراءات سعة دوريّة: اتصالات، تنازع، إنتاجية، حجم. المصدر pg_stat_* '
  'و«الآن» من جداول العمل — لا أرقام معلنة ولا مقدَّرة.';

-- ---------------------------------------------------------------------
-- ٢) العتبات — قابلة للضبط بلا تعديل كود
-- ---------------------------------------------------------------------
-- تُقرأ من `platform_settings.resource_limits -> 'capacity'`، وهي
-- نفس الخانة التي تحمل حدود الخطة في 0043. والقيم أدناه هي الافتراضي
-- حين لا يضبط المالك شيئًا، وكلّها مشتقّة من قياس فعلي لا من ذوق:
--
--   · connections_pct: 60/80 — نسخة الإنتاج عندها `max_connections=60`،
--     وتجاوز ٦٠٪ يعني أنّ موجةً واحدة تكفي لاستنزافها.
--   · lock_waiters: 5/20 — قِيس أنّ انتظار الأقفال يبدأ بالظهور عند
--     ٥١٢ اتصالًا متزامنًا (١٥–١٦ منتظِرًا) مع هبوط الإنتاجية ٤٢٪.
--   · longest_tx_seconds: 30/120 — معاملة تتجاوز ٣٠ ثانية في هذا
--     النظام تعني عطلًا: أثقل مسار (إنشاء طلب) قِيس ٥.٥ م.ث.
--   · cache_hit_pct: 95/90 (تنبيه عند الهبوط تحتها).
--   · orders_per_min: 6000/12000 — السقف المقيس ١٤٤٣ طلبًا/ثانية على
--     أربع أنوية؛ فـ٦٠٠٠/دقيقة (١٠٠/ث) تنبيهٌ مبكّر جدًّا بالنموّ.
--   · visits_per_min: 60000/120000 — السقف المقيس ٦٨٣٩ زيارة/ثانية.
--   · rate_limit_rows: 2م/10م — الجدول على كل مسار كتابة، و0056 يحدّه
--     بصفٍّ لكل هويّة نشِطة؛ فتجاوز مليونين يعني أنّ الحدّ لم يعمل.
--   · db_pct و storage_pct: 70/85 من حدّ الخطة المُعلن في 0043.
create or replace function app.capacity_thresholds()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select resource_limits -> 'capacity' from public.platform_settings where id),
    '{}'::jsonb
  ) || '{}'::jsonb;
$$;

create or replace function app.threshold(p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(app.capacity_thresholds() ->> p_key, '')::numeric, p_default);
$$;

-- ---------------------------------------------------------------------
-- ٣) القياس الحيّ
-- ---------------------------------------------------------------------
-- ★ `security definer` لأنّ `pg_stat_activity` لا تُقرأ كاملةً لغير
--   المالك، فيراها هذا الدالّة وحدها ولا يخرج منها إلا أعداد.
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

  -- ★ نسبة الإصابة تراكميّة من آخر تصفير للإحصاء، لا «الآن». وعلى
  --   قاعدة باردة أو حديثة التصفير تبدأ منخفضة، فتنبيهٌ عليها إنذارٌ
  --   كاذب — ومنبّهٌ يكذب يُطفأ، فتضيع فائدته كلّها. لذلك لا تُقيَّم
  --   إلا بعد حجمٍ كافٍ من القراءات.
  select case when (blks_hit + blks_read) = 0 then 100
              else round(blks_hit * 100.0 / (blks_hit + blks_read), 2) end,
         (blks_hit + blks_read),
         deadlocks, xact_commit, xact_rollback
    into v_hit, v_blocks, v_deadlocks, v_commits, v_rollbacks
    from pg_stat_database where datname = current_database();

  -- إنتاجية حقيقية من جداول العمل — لا عدّاد تطبيقي قد يكذب
  select count(*) filter (where created_at >= now() - interval '1 minute'),
         count(*) filter (where created_at >= now() - interval '1 hour')
    into v_orders_1m, v_orders_1h from public.orders;

  select count(*) filter (where created_at >= now() - interval '1 minute'),
         count(*) filter (where created_at >= now() - interval '1 hour')
    into v_visits_1m, v_visits_1h from public.store_visits;

  -- ★ عدّادات الحدّ تُراقَب لأنها على **كل** مسار كتابة: نموّها غير
  --   المحدود يُبطئ كل زيارة وكل طلب. (قِيس: ١٧٦ م.ب بعد ٤٦٦ ألف طلب
  --   و٤٢٦ ألف زيارة قبل إصلاح 0056.) التقدير كافٍ هنا ولا يمسح جدولًا.
  select coalesce(n_live_tup, 0) into v_rl_rows
    from pg_stat_user_tables where relname = 'rate_limit_counters';

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
    'generated_at', now()
  );
end;
$$;

revoke execute on function app.read_capacity() from public, anon, authenticated;
revoke execute on function app.capacity_thresholds() from public, anon, authenticated;
revoke execute on function app.threshold(text, numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- ٤) التقييم والتسجيل — والتنبيه قبل الحدّ
-- ---------------------------------------------------------------------
create or replace function app.sample_capacity()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke execute on function app.sample_capacity() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- ٥) المداخل العامّة — بنفس حراسة 0043
-- ---------------------------------------------------------------------
create or replace function public.record_capacity()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- المجدول يعمل بلا هويّة (`service_role`)، والموظّف بهويّته.
  -- والقياس لا يقرأ بيان مستأجر ولا يكتب فيه.
  if (select auth.uid()) is not null
     and not app.has_platform_permission('system_health', 'view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return app.sample_capacity();
end;
$$;

revoke execute on function public.record_capacity() from public, anon;
grant   execute on function public.record_capacity() to authenticated, service_role;

create or replace function public.capacity_latest()
returns table (
  metric      text,
  value       numeric,
  limit_value numeric,
  pct         numeric,
  level       text,
  detail      jsonb,
  measured_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_platform_permission('system_health', 'view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
    select distinct on (s.metric)
           s.metric, s.value, s.limit_value, s.pct, s.level, s.detail, s.measured_at
      from public.capacity_samples s
     order by s.metric, s.measured_at desc;
end;
$$;

revoke execute on function public.capacity_latest() from public, anon;
grant   execute on function public.capacity_latest() to authenticated;

-- سلسلة مقياس واحد — للرسم ولمعرفة **اتجاه** الضغط لا لحظته وحدها
create or replace function public.capacity_series(
  p_metric text, p_hours integer default 24
)
returns table (measured_at timestamptz, value numeric, level text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_platform_permission('system_health', 'view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
    select s.measured_at, s.value, s.level
      from public.capacity_samples s
     where s.metric = p_metric
       and s.measured_at >= now() - make_interval(hours => greatest(1, least(p_hours, 720)))
     order by s.measured_at;
end;
$$;

revoke execute on function public.capacity_series(text, integer) from public, anon;
grant   execute on function public.capacity_series(text, integer) to authenticated;
