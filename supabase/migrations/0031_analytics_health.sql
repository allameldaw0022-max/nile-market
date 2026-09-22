-- =====================================================================
-- 0031 إحصاءات المتجر وفحوص الصحة (إضافية · لا تمسّ ما سبق)
-- =====================================================================

-- ---------------------------------------------------------------------
-- إصلاح: التجميع كان يبدأ من `orders` وحدها.
--
-- ★ متجر زاره مئة شخص ولم يشترِ أحد كان **لا يحصل على صف** ذلك اليوم،
-- فتضيع زياراته ويظهر معدّل التحويل صفرًا من مقام صفر. والمتجر الذي
-- لا يبيع هو أحوج ما يكون لقراءة زياراته.
--
-- الإصلاح: المصدر صار اتحاد المتاجر التي لها طلبات **أو** زيارات في
-- ذلك اليوم.
-- ---------------------------------------------------------------------
create or replace function public.aggregate_analytics(
  p_date date default current_date - 1
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  insert into public.analytics_daily
    (store_id, date, orders_count, orders_revenue, new_customers,
     products_sold, visits, unique_visitors)
  select s.store_id, p_date,
         coalesce((select count(*) from public.orders o
                    where o.store_id = s.store_id
                      and o.created_at::date = p_date), 0),
         coalesce((select sum(o.total) from public.orders o
                    where o.store_id = s.store_id
                      and o.created_at::date = p_date
                      and o.status <> 'cancelled'), 0),
         coalesce((select count(*) from public.customers c
                    where c.store_id = s.store_id
                      and c.first_order_at::date = p_date), 0),
         coalesce((select sum(oi.quantity) from public.order_items oi
                    join public.orders o2 on o2.id = oi.order_id
                   where o2.store_id = s.store_id
                     and o2.created_at::date = p_date
                     and o2.status <> 'cancelled'), 0),
         coalesce((select count(*) from public.store_visits v
                    where v.store_id = s.store_id
                      and v.created_at::date = p_date), 0),
         coalesce((select count(distinct v.visitor_token) from public.store_visits v
                    where v.store_id = s.store_id
                      and v.created_at::date = p_date), 0)
    from (
      select store_id from public.orders where created_at::date = p_date
      union
      select store_id from public.store_visits where created_at::date = p_date
    ) s
  on conflict (store_id, date) do update
    set orders_count    = excluded.orders_count,
        orders_revenue  = excluded.orders_revenue,
        new_customers   = excluded.new_customers,
        products_sold   = excluded.products_sold,
        visits          = excluded.visits,
        unique_visitors = excluded.unique_visitors;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.aggregate_analytics(date) from public, anon, authenticated;
grant   execute on function public.aggregate_analytics(date) to service_role;

-- =====================================================================
-- إحصاءات المتجر للتاجر.
--
-- ★ `store_visits` مغلق على الجميع (RLS بلا سياسة قراءة): زيارة فيها
-- توكن زائر ومسار، والتاجر يحتاج **العدد** لا الصفوف. هذه الدالة
-- تُرجع أرقامًا مجمَّعة فقط.
--
-- ★ يوم اليوم يُحسب حيًّا والأيام السابقة من `analytics_daily`: انتظار
-- المهمة الليلية كان سيجعل التاجر يفتح لوحته صباحًا فيجد أمس فارغًا.
-- =====================================================================
create or replace function public.store_analytics(
  p_store_id uuid,
  p_days     integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 365);
  v_from date;
  v jsonb;
begin
  if not app.has_store_permission(p_store_id, 'analytics:view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  v_from := current_date - (v_days - 1);

  with daily as (
    -- الأيام المكتملة من الجدول المجمَّع
    select a.date, a.visits, a.unique_visitors, a.orders_count,
           a.orders_revenue, a.new_customers, a.products_sold
      from public.analytics_daily a
     where a.store_id = p_store_id
       and a.date >= v_from and a.date < current_date
    union all
    -- اليوم الجاري يُحسب حيًّا
    select current_date,
           (select count(*) from public.store_visits sv
             where sv.store_id = p_store_id
               and sv.created_at::date = current_date),
           (select count(distinct sv.visitor_token) from public.store_visits sv
             where sv.store_id = p_store_id
               and sv.created_at::date = current_date),
           (select count(*) from public.orders o
             where o.store_id = p_store_id
               and o.created_at::date = current_date),
           (select coalesce(sum(o.total), 0) from public.orders o
             where o.store_id = p_store_id
               and o.created_at::date = current_date
               and o.status <> 'cancelled'),
           (select count(*) from public.customers c
             where c.store_id = p_store_id
               and c.first_order_at::date = current_date),
           (select coalesce(sum(oi.quantity), 0) from public.order_items oi
              join public.orders o2 on o2.id = oi.order_id
             where o2.store_id = p_store_id
               and o2.created_at::date = current_date
               and o2.status <> 'cancelled')
  )
  select jsonb_build_object(
    'days', v_days,
    'from', v_from,
    'series', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', d.date, 'visits', d.visits,
               'visitors', d.unique_visitors, 'orders', d.orders_count,
               'revenue', d.orders_revenue) order by d.date)
        from daily d), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'visits',        coalesce(sum(d.visits), 0),
        'visitors',      coalesce(sum(d.unique_visitors), 0),
        'orders',        coalesce(sum(d.orders_count), 0),
        'revenue',       coalesce(sum(d.orders_revenue), 0),
        'new_customers', coalesce(sum(d.new_customers), 0),
        'items_sold',    coalesce(sum(d.products_sold), 0),
        -- معدّل التحويل: الطلبات ÷ الزوّار المميّزين. المقام صفر ⇒
        -- null لا صفر: «لا نعرف» ليست «صفر بالمئة».
        'conversion', case when coalesce(sum(d.unique_visitors), 0) = 0 then null
                           else round(100.0 * coalesce(sum(d.orders_count), 0)
                                      / sum(d.unique_visitors), 2) end,
        'aov', case when coalesce(sum(d.orders_count), 0) = 0 then null
                    else round(coalesce(sum(d.orders_revenue), 0)
                               / sum(d.orders_count), 2) end)
        from daily d),
    'top_products', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', x.product_name, 'quantity', x.qty, 'revenue', x.revenue)
             order by x.revenue desc)
        from (select oi.product_name,
                     sum(oi.quantity) as qty,
                     sum(oi.line_total) as revenue
                from public.order_items oi
                join public.orders o on o.id = oi.order_id
               where o.store_id = p_store_id
                 and o.created_at::date >= v_from
                 and o.status <> 'cancelled'
               group by oi.product_name
               order by 3 desc
               limit 10) x), '[]'::jsonb),
    'top_pages', coalesce((
      select jsonb_agg(jsonb_build_object('path', x.path, 'visits', x.n)
                       order by x.n desc)
        from (select v2.path, count(*) as n
                from public.store_visits v2
               where v2.store_id = p_store_id
                 and v2.created_at::date >= v_from
               group by v2.path
               order by 2 desc
               limit 10) x), '[]'::jsonb),
    'by_status', coalesce((
      select jsonb_object_agg(x.status, x.n)
        from (select o.status::text as status, count(*) as n
                from public.orders o
               where o.store_id = p_store_id
                 and o.created_at::date >= v_from
               group by o.status) x), '{}'::jsonb)
  ) into v;

  return v;
end;
$$;

revoke execute on function public.store_analytics(uuid, integer) from public, anon;
grant   execute on function public.store_analytics(uuid, integer) to authenticated;

-- =====================================================================
-- تسجيل فحص صحة مكوّن.
--
-- ★ service_role وحده: الفحص يقول «القاعدة تستجيب» و«البريد يخرج».
-- لو كتبه أي مستخدم لصار بإمكانه إعلان النظام سليمًا وهو معطّل، أو
-- إغراق الجدول.
-- =====================================================================
create or replace function public.record_health_check(
  p_component  text,
  p_status     public.health_status,
  p_latency_ms integer default null,
  p_detail     text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if coalesce(trim(p_component), '') = '' then
    raise exception 'VALIDATION: اسم المكوّن مطلوب' using errcode = 'P0001';
  end if;

  insert into public.system_health_checks (component, status, latency_ms, detail)
  values (left(trim(p_component), 60), p_status,
          greatest(coalesce(p_latency_ms, 0), 0),
          left(nullif(trim(coalesce(p_detail, '')), ''), 500))
  returning id into v_id;

  -- الجدول سجلّ تشغيلي لا أرشيف: أسبوعان يكفيان لتشخيص عطل، وما
  -- قبلهما يُحذف هنا بدل أن ينمو بلا حدّ.
  delete from public.system_health_checks
   where checked_at < now() - interval '14 days';

  return v_id;
end;
$$;

revoke execute on function public.record_health_check(
  text, public.health_status, integer, text) from public, anon, authenticated;
grant execute on function public.record_health_check(
  text, public.health_status, integer, text) to service_role;
