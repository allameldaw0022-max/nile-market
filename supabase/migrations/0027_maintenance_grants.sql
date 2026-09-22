-- =====================================================================
-- 0027 صلاحيات الوظائف الدورية (إضافية · لا تمسّ ما سبق)
--
-- دوال الصيانة (كنس الاشتراكات · تجميع التحليلات · إخفاء هوية
-- الحسابات · تنظيف التذاكر · تحرير الـslugs) كانت بلا أي منح: لا
-- يستطيع تنفيذَها إلا مالك القاعدة، فلا يصل إليها المجدول.
--
-- المنح لـ`service_role` وحده، والسحب الصريح من بقية الأدوار: هذه
-- عمليات تمسّ كل المتاجر دفعةً واحدة، ولا يجوز أن يبدأها مستخدم.
-- =====================================================================

revoke execute on function public.sweep_subscriptions()
  from public, anon, authenticated;
grant   execute on function public.sweep_subscriptions() to service_role;

revoke execute on function public.aggregate_analytics(date)
  from public, anon, authenticated;
grant   execute on function public.aggregate_analytics(date) to service_role;

revoke execute on function public.anonymize_due_accounts()
  from public, anon, authenticated;
grant   execute on function public.anonymize_due_accounts() to service_role;

revoke execute on function public.purge_old_tickets()
  from public, anon, authenticated;
grant   execute on function public.purge_old_tickets() to service_role;

revoke execute on function public.release_expired_slugs()
  from public, anon, authenticated;
grant   execute on function public.release_expired_slugs() to service_role;

-- ---------------------------------------------------------------------
-- تشغيلة الصيانة اليومية.
--
-- واحدة بدل خمسة نداءات: تبقى الترتيبية مضمونة (الكنس قبل التنبيه)،
-- وفشل خطوة لا يُسقط البقية — كل خطوة في كتلة استثناء مستقلة، ويُعاد
-- ما نجح وما فشل في ملخّص واحد يقرؤه المجدول.
-- ---------------------------------------------------------------------
create or replace function public.run_daily_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  return v_result;
end;
$$;

revoke execute on function public.run_daily_maintenance()
  from public, anon, authenticated;
grant   execute on function public.run_daily_maintenance() to service_role;
