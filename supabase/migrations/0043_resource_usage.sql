-- =====================================================================
-- 0043 مراقبة استهلاك موارد المنصة (إضافي · لا يمسّ ما سبق)
--
-- ★ القياس حقيقي أو لا يكون: `pg_database_size()` لحجم القاعدة،
-- ومجموع أحجام الكائنات في `storage.objects` للتخزين. ولا يُحسب
-- التخزين من `media_files`: صفٌّ قد يبقى بلا كائن، وكائنٌ قد يوجد
-- بلا صفّ — والمقياس هو ما يشغل القرص فعلًا.
--
-- ★ حدّ الخطة ليس قياسًا بل إعلانًا. مصدره Management API وهو غير
-- مُهيّأ، فيبقى `null` وتُعرض «غير معروف» — لا صفر ولا رقم مخترع.
-- =====================================================================

alter table public.platform_settings
  add column if not exists resource_limits jsonb not null default '{}'::jsonb;

comment on column public.platform_settings.resource_limits is
  'حدود الخطة بالبايت بالمفتاح: database · storage. مصدرها إعلان المالك '
  'لا قياس — لا تُخترع، وغيابها يُعرض «غير معروف».';

create table if not exists public.resource_usage (
  id           uuid primary key default gen_random_uuid(),
  resource     text   not null,
  value_bytes  bigint not null check (value_bytes >= 0),
  limit_bytes  bigint check (limit_bytes is null or limit_bytes > 0),
  percentage   numeric(6,2),
  source       text   not null,
  detail       jsonb  not null default '{}'::jsonb,
  measured_at  timestamptz not null default now()
);

create index if not exists resource_usage_latest_idx
  on public.resource_usage (resource, measured_at desc);

alter table public.resource_usage enable row level security;
-- لا سياسة SELECT: القراءة تمرّ بدالة تفحص صلاحية القسم وحدها.
revoke all on public.resource_usage from anon, authenticated;

create or replace function app.measure_resource_usage()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limits jsonb;
  v_lim    bigint;
  v_bytes  bigint;
  v_n      integer := 0;
  r        record;
begin
  select coalesce(resource_limits, '{}'::jsonb) into v_limits
    from public.platform_settings where id;

  v_bytes := pg_database_size(current_database());
  v_lim   := nullif(v_limits ->> 'database', '')::bigint;
  insert into public.resource_usage (resource, value_bytes, limit_bytes, percentage, source)
  values ('database', v_bytes, v_lim,
          case when v_lim is null then null
               else round(v_bytes * 100.0 / v_lim, 2) end,
          'pg_database_size');
  v_n := v_n + 1;

  select coalesce(sum((metadata ->> 'size')::bigint), 0), count(*)
    into v_bytes, v_n
    from storage.objects;
  v_lim := nullif(v_limits ->> 'storage', '')::bigint;
  insert into public.resource_usage
    (resource, value_bytes, limit_bytes, percentage, source, detail)
  values ('storage.total', v_bytes, v_lim,
          case when v_lim is null then null
               else round(v_bytes * 100.0 / v_lim, 2) end,
          'storage.objects', jsonb_build_object('file_count', v_n));

  v_n := 2;
  for r in
    select bucket_id,
           coalesce(sum((metadata ->> 'size')::bigint), 0) as bytes,
           count(*) as files
      from storage.objects group by bucket_id
  loop
    insert into public.resource_usage
      (resource, value_bytes, source, detail)
    values ('storage.' || r.bucket_id, r.bytes, 'storage.objects',
            jsonb_build_object('file_count', r.files));
    v_n := v_n + 1;
  end loop;

  -- ★ المراقبة لا تأكل ما تراقبه: تُحفظ ١٨٠ يومًا لا أكثر.
  delete from public.resource_usage where measured_at < now() - interval '180 days';
  return v_n;
end;
$$;

revoke execute on function app.measure_resource_usage() from public, anon, authenticated;

create or replace function public.record_resource_usage()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- ★ المجدول يعمل بلا هوية مستخدم (`service_role`)، والموظف يعمل
  -- بهويته. القياس لا يقرأ بيانات مستأجر ولا يكتب فيها — فالسماح
  -- للمجدول لا يوسّع سطحًا، ومنعه كان يعني ألّا يُقاس شيء تلقائيًا.
  if (select auth.uid()) is not null
     and not app.has_platform_permission('system_health', 'view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return app.measure_resource_usage();
end;
$$;

revoke execute on function public.record_resource_usage() from public, anon;
grant   execute on function public.record_resource_usage() to authenticated, service_role;

create or replace function public.resource_usage_latest()
returns table (
  resource    text,
  value_bytes bigint,
  limit_bytes bigint,
  percentage  numeric,
  source      text,
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
    select distinct on (u.resource)
           u.resource, u.value_bytes, u.limit_bytes, u.percentage,
           u.source, u.detail, u.measured_at
      from public.resource_usage u
     order by u.resource, u.measured_at desc;
end;
$$;

revoke execute on function public.resource_usage_latest() from public, anon;
grant   execute on function public.resource_usage_latest() to authenticated;

select app.measure_resource_usage();
