-- =====================================================================
-- 0056 حدّ نموّ عدّادات الحدّ — إصلاح اختناق على **كل** مسار كتابة
--
-- كشفه اختبار الكتابة، لا التدقيق: `check_rate_limit` تُدرج صفًّا لكل
-- (دلو، نافذة) ولا شيء يحذف النوافذ المنتهية. فالجدول ينمو بلا حدّ،
-- وكل زيارة وكل طلب وكل تذكرة تدفع ثمن إدراجٍ في شجرة تكبر أبدًا.
--
-- ★ القياس: بعد ٤٦٦٢٤٣ طلبًا و٤٢٦٠٦٩ زيارة في بيئة الاختبار، صار
--   `rate_limit_counters` **١٧٦ م.ب** (منها ٨٨ م.ب فهارس) — أكبر من
--   جدول الزيارات نفسه (٩٥ م.ب)، وهو ليس بيان عمل بل عدّادات لحظية.
--   وهبطت إنتاجية إنشاء الطلب ١٤٤٣ ⟶ ١٠٢٢ طلبًا/ثانية، وتسجيل
--   الزيارة ٦٨٣٩ ⟶ ٥٢٨٢ زيارة/ثانية، مع نموّ البيان.
--
-- ★ الخطر الحقيقي عند الحمل المستهدَف: دلو الزيارة مفتاحه
--   (متجر، زائر) بنافذة ٦٠ ثانية. فمئة ألف مستخدم متزامن تعني
--   ١٠٠٠٠٠ صفٍّ **كل دقيقة** — ١٤٤ مليون صفٍّ يوميًّا، لا يُقرأ منها
--   شيء بعد دقيقة واحدة.
--
-- ★ الإصلاح بنيويّ لا دوريّ: كل نداء يحذف نوافذ **دلوه** المنتهية،
--   فيصير الجدول محدودًا بعدد الهويّات النشِطة لا بمرور الزمن. والحذف
--   على نفس صفحة الفهرس التي يُدرَج فيها (`bucket, window_start`)
--   فكلفته لا تُقاس. ويبقى كنسٌ يوميّ للدلاء التي لا تعود أبدًا.
--
-- ★ ولا يتغيّر سلوك الحدّ: القرار يُتَّخذ من عدّاد **النافذة الحالية**
--   وحده، والنوافذ الماضية لا يقرأها أحد — فحذفها لا يُرخي حدًّا ولا
--   يُشدّده. (مُثبَت في اختبارات 114 و116.)
-- =====================================================================

-- فهرس على النافذة: يجعل الكنس اليوميّ مسحَ فهرسٍ لا مسحَ جدول
create index if not exists rate_limit_counters_window_idx
  on public.rate_limit_counters (window_start);

create or replace function public.check_rate_limit(
  p_bucket text, p_max integer, p_window_seconds integer
) returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_window timestamptz; v_count integer;
begin
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds)
                           * p_window_seconds);
  insert into public.rate_limit_counters (bucket, window_start, count)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update
    set count = public.rate_limit_counters.count + 1
  returning count into v_count;

  -- ★ نوافذ هذا الدلو المنتهية تُحذف مع النداء نفسه: صفٌّ واحد لكل
  --   هويّة نشِطة بدل صفٍّ لكل هويّة لكل نافذة إلى الأبد. والحذف
  --   محصور بـ`bucket` فيمرّ بالفهرس الفريد ولا يلمس دلو غيره.
  delete from public.rate_limit_counters
   where bucket = p_bucket and window_start < v_window;

  return v_count <= p_max;
end $$;

revoke execute on function public.check_rate_limit(text, integer, integer)
  from public, anon;
grant   execute on function public.check_rate_limit(text, integer, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- كنس الدلاء المهجورة — من لا يعود لا يحذف صفَّه بنفسه
-- ---------------------------------------------------------------------
-- ★ ٤٨ ساعة هامشٌ واسع: أطول نافذة في النظام ٦٠٠ ثانية، فصفٌّ أقدم
--   من يومين لا يمكن أن يؤثّر في أيّ قرار حدٍّ قائم.
-- ★ وبدفعات محدودة: حذفٌ واحد لملايين الصفوف يقفل الجدول على مسار
--   الكتابة كلّه — وهو بالضبط ما نحاول حمايته.
create or replace function public.prune_rate_limits(
  p_keep_hours integer default 48, p_batch integer default 50000
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cut   timestamptz := now() - make_interval(hours => greatest(1, p_keep_hours));
  v_gone  integer := 0;
  v_round integer;
begin
  if (select auth.uid()) is not null
     and not app.has_platform_permission('system_health', 'view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  loop
    with doomed as (
      select ctid from public.rate_limit_counters
       where window_start < v_cut
       limit greatest(1000, p_batch)
    )
    delete from public.rate_limit_counters r
     using doomed d where r.ctid = d.ctid;
    get diagnostics v_round = row_count;
    v_gone := v_gone + v_round;
    exit when v_round = 0 or v_gone >= 2000000;   -- سقف لكل جريان
  end loop;

  return v_gone;
end;
$$;

revoke execute on function public.prune_rate_limits(integer, integer) from public, anon;
grant   execute on function public.prune_rate_limits(integer, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- تُضاف إلى الصيانة اليومية القائمة — لا مجدول جديد ولا نظام جديد.
-- وتُضاف معها قراءة السعة، فتُسجَّل سلسلة يوميّة بلا تدخّل.
-- ---------------------------------------------------------------------
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

  return v_result;
end;
$function$
