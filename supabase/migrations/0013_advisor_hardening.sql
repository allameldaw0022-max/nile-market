-- =====================================================================
-- 0013 تقوية بعد مراجعة Supabase Advisors
--
-- مشكلتان حقيقيتان كشفهما الفاحص، وليستا إيجابيات كاذبة:
--
-- 1) check_rate_limit كانت مُتاحة لـanon وauthenticated عبر PostgREST.
--    اسم الـbucket وسيط من المستدعي ⇒ يستطيع مهاجم تخمين مفتاح مستخدم
--    آخر (مثل 'login:email@x.com') واستنفاد عدّاده عمدًا فيقفل عليه
--    الدخول — حجب خدمة موجَّه ضد شخص بعينه.
--    ⇒ تُسحب من العميل نهائيًا. تحديد المعدل عمل خادمي بحت.
--
-- 2) plan_configuration_status() كانت مُتاحة لأي مستخدم مسجّل، وهي
--    تكشف عدد حسابات Admin النشطة والمفاتيح غير المضبوطة — معلومات
--    داخلية عن المنصة. ⇒ تتحقق من كونه موظف منصة قبل أن تُرجع شيئًا.
--
-- أما بقية تحذيرات الفاحص فهي مقصودة بالتصميم:
--  * create_order / validate_coupon / resolve_store_by_host متاحة لـanon
--    عمدًا (Guest Checkout وحل المستأجر)، وكلٌّ منها يتحقق من سلطته
--    داخليًا ولا يثق بأي وسيط مالي.
--  * جداول النظام (email_outbox · job_queue · idempotency_keys ·
--    rate_limit_counters · store_visits) بـRLS مفعّلة **بلا سياسات**
--    عمدًا: هذا منع كامل لكل الأدوار عدا service_role — أقوى وضع ممكن.
-- =====================================================================

-- (1) تحديد المعدل: خادمي فقط
revoke execute on function public.check_rate_limit(text, integer, integer)
  from anon, authenticated, public;

-- (2) حالة إعداد الباقات: لموظفي المنصة فقط
create or replace function public.plan_configuration_status()
returns table (
  complete              boolean,
  unconfigured_prices   text[],
  unconfigured_features text[],
  active_admins         integer,
  admins_sufficient     boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_staff() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
  with prices as (
    select array_agg(code order by sort_order) as codes
    from public.plans where is_active and not is_free and price_configured_at is null),
  feats as (
    select array_agg(p.code || ':' || pe.feature_key order by p.code, pe.feature_key) as keys
    from public.plan_entitlements pe join public.plans p on p.id = pe.plan_id
    where p.is_active and pe.configured_at is null),
  adm as (select app.active_admin_count() as n)
  select coalesce(prices.codes, '{}') = '{}'
           and coalesce(feats.keys, '{}') = '{}' and adm.n >= 2,
         coalesce(prices.codes, '{}'), coalesce(feats.keys, '{}'),
         adm.n, adm.n >= 2
  from prices, feats, adm;
end;
$$;

revoke execute on function public.plan_configuration_status() from public, anon;
grant   execute on function public.plan_configuration_status() to authenticated;

-- (3) جداول النظام: منع صريح على مستوى الجدول أيضًا (دفاع مزدوج)
revoke all on public.email_outbox        from anon, authenticated;
revoke all on public.job_queue           from anon, authenticated;
revoke all on public.idempotency_keys    from anon, authenticated;
revoke all on public.rate_limit_counters from anon, authenticated;
revoke all on public.store_visits        from anon, authenticated;

-- تسجيل زيارة المتجر يمر بدالة مدقَّقة بدل INSERT مباشر،
-- فلا يستطيع أحد حقن زيارات لمتجر غير منشور أو إغراق الجدول بحرية.
create or replace function public.track_store_visit(
  p_store_id uuid, p_visitor_token text, p_path text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_store_public(p_store_id) then return; end if;
  if p_visitor_token is null or length(trim(p_visitor_token)) < 8 then return; end if;
  if not public.check_rate_limit('visit:' || p_store_id::text || ':' || p_visitor_token, 60, 60) then
    return;                                   -- تجاوز الحد: يُتجاهل بصمت
  end if;
  insert into public.store_visits (store_id, visitor_token, path)
  values (p_store_id, left(p_visitor_token, 64), left(coalesce(p_path, '/'), 200));
end;
$$;

revoke execute on function public.track_store_visit(uuid, text, text) from public;
grant   execute on function public.track_store_visit(uuid, text, text) to anon, authenticated;
