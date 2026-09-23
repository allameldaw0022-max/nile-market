-- =====================================================================
-- 0042 تصحيح نوع البريد في `platform_users` (إضافي · لا يمسّ ما سبق)
--
-- ★ العطل: `/admin/users` يعرض «تعذّر تحميل المستخدمين» دائمًا.
-- السبب `42804: structure of query does not match function result type`.
--
-- الدالة تعلن `email text`، لكن `auth.users.email` نوعه
-- `character varying(255)`. و`return query` يطابق أنواع الأعمدة
-- مطابقة صارمة، فـvarchar لا يمرّ مكان text. العمود يخرج من الـCTE
-- بنوعه الأصلي، فيسقط النداء كلّه قبل أن يعود صفّ واحد.
--
-- ★ الإصلاح تحويل صريح عند المصدر: `u.email::text`. لا تغيير في
-- التوقيع ولا في المنطق ولا في الصلاحيات — الفحص الأمني كما هو.
--
-- ★ مُسحت كلّ دوال لوحة الإدارة التي تعيد جدولًا قبل هذا الترحيل،
-- وهذه وحدها المصابة. وفي ذيل الملف فحص يثبت ذلك عند كل تطبيق.
-- =====================================================================

create or replace function public.platform_users(
  p_search text default null,
  p_status text default null,
  p_limit  integer default 25,
  p_offset integer default 0
)
returns table (
  profile_id     uuid,
  full_name      text,
  email          text,
  phone          text,
  account_status text,
  is_staff       boolean,
  stores_count   bigint,
  created_at     timestamptz,
  last_seen_at   timestamptz,
  total_count    bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_term  text    := nullif(trim(coalesce(p_search, '')), '');
begin
  if not app.has_platform_permission('users', 'view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  with filtered as (
    -- ★ `::text` هنا لا في الـselect الأخير: العمود يعبر الـCTE
    -- بنوعه، فالتحويل عند المصدر يمنع تسرّب varchar إلى الناتج.
    select pr.id, pr.full_name, u.email::text as email, pr.phone,
           pr.account_status, pr.is_platform_staff,
           pr.created_at, pr.last_seen_at,
           (select count(*) from public.stores st
             where st.owner_id = pr.id and st.deleted_at is null) as stores_count
      from public.profiles pr
      left join auth.users u on u.id = pr.id
     where (p_status is null or pr.account_status::text = p_status)
       and (v_term is null
            or pr.full_name ilike '%' || v_term || '%'
            or pr.phone     ilike '%' || v_term || '%'
            or u.email      ilike '%' || v_term || '%')
  )
  select f.id, f.full_name, f.email, f.phone, f.account_status::text,
         f.is_platform_staff, f.stores_count, f.created_at, f.last_seen_at,
         count(*) over ()
    from filtered f
   order by f.created_at desc
   limit v_limit offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.platform_users(text, text, integer, integer)
  from public, anon;
grant execute on function public.platform_users(text, text, integer, integer)
  to authenticated;

-- ---------------------------------------------------------------------
-- فحص بعد التطبيق: يستدعي كلّ دوال اللوحة التي تعيد جدولًا بهوية مالك
-- منصّة نشط، ويُسقط الترحيل إن سقطت أيّها.
--
-- ★ فحص تشغيلي لا اختبار وحدة: خطأ الشكل لا يظهر في `create` ولا في
-- typecheck ولا في lint — لا يظهر إلا عند أول نداء حقيقي. فمكانه هنا.
--
-- ★ يُتخطّى بصمت حين لا يوجد مالك منصّة بعد (قاعدة جديدة): الفحص
-- يحتاج هوية، ولا يصحّ أن يمنع الترحيل على بيئة فارغة.
-- ---------------------------------------------------------------------
do $$
declare
  v_owner uuid;
  v_names text[] := array[
    'admin_overview','admin_access_matrix','platform_users','payments_page',
    'refunds_page','audit_log_page','support_queue','partner_admin_list',
    'plan_configuration_status','assignable_admins'];
  v_nm text; v_n integer; v_msg text; v_state text;
begin
  select m.profile_id into v_owner
    from public.admin_members m
   where m.is_owner and m.status = 'active'
   limit 1;

  if v_owner is null then
    raise notice '0042: لا مالك منصّة بعد — تُخطّى فحوص اللوحة';
    return;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  foreach v_nm in array v_names loop
    begin
      execute format('select count(*) from public.%I()', v_nm) into v_n;
    exception when others then
      get stacked diagnostics v_msg = MESSAGE_TEXT, v_state = RETURNED_SQLSTATE;
      raise exception '0042: دالة اللوحة %() تسقط — % %', v_nm, v_state, v_msg;
    end;
  end loop;

  raise notice '0042: % دالة لوحة تعمل', array_length(v_names, 1);
end $$;
