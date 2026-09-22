-- =====================================================================
-- 0029 موظفو المنصة وصلاحياتهم (إضافية · لا تمسّ ما سبق)
--
-- الجداول والسياسات موجودة منذ 0002. الناقص كان المسار الآمن
-- لإضافة موظف: إنشاء `admin_members` + صف صلاحيات لكل قسم، وفق
-- قواعد لا تُترك للواجهة:
--
--   * لا يعدّل موظف صلاحيات نفسه (trigger في 0002 يرفض ذلك أصلًا).
--   * لا يُخفَّض آخر مالك منصة نشط: الإدارة بلا مالك لا تُدار،
--     وفصل المهام (D29) يحتاج حسابين نشطين على الأقل.
--   * MFA إلزامي افتراضًا لكل حساب إدارة جديد (D28).
-- =====================================================================

create or replace function public.upsert_admin_member(
  p_profile_id  uuid,
  p_display_name text,
  p_is_owner    boolean default false,
  p_permissions jsonb default '{}'::jsonb   -- {"stores":"edit", ...}
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid;
  v_section text;
  v_level   text;
begin
  if not app.has_platform_permission('settings', 'manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_profile_id = (select auth.uid()) then
    raise exception 'SELF_MODIFY: لا تعدّل حسابك الإداري من هنا'
      using errcode = '42501';
  end if;
  if length(trim(coalesce(p_display_name, ''))) < 2 then
    raise exception 'VALIDATION: اسم الموظف مطلوب' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'NOT_FOUND: لا يوجد حساب بهذا المعرّف' using errcode = 'P0002';
  end if;

  insert into public.admin_members
    (profile_id, display_name, is_owner, status, mfa_required, created_by)
  values (p_profile_id, trim(p_display_name), coalesce(p_is_owner, false),
          'active', true, (select auth.uid()))
  on conflict (profile_id) do update
    set display_name = excluded.display_name,
        is_owner     = excluded.is_owner,
        status       = 'active'
  returning id into v_id;

  -- الصلاحيات تُستبدل بالكامل: قائمة صريحة أوضح من دمج جزئي يترك
  -- صلاحية قديمة منسيّة.
  delete from public.admin_permissions where admin_member_id = v_id;

  for v_section, v_level in
    select key, value #>> '{}' from jsonb_each(coalesce(p_permissions, '{}'::jsonb))
  loop
    if v_level is null or v_level = 'none' then
      continue;
    end if;
    insert into public.admin_permissions (admin_member_id, section, level)
    values (v_id, v_section::public.admin_section, v_level::public.admin_level);
  end loop;

  return v_id;
end;
$$;

revoke execute on function public.upsert_admin_member(uuid, text, boolean, jsonb)
  from public, anon;
grant execute on function public.upsert_admin_member(uuid, text, boolean, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------
-- إيقاف موظف منصة.
--
-- ★ لا يُوقَف آخر حسابَي إدارة نشطين: فصل المهام (D29) يشترط وجود
-- معتمِد غير الطالب، وإيقاف ما دونهما يجمّد كل اعتماد مالي.
-- ---------------------------------------------------------------------
create or replace function public.suspend_admin_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare m public.admin_members%rowtype;
begin
  if not app.has_platform_permission('settings', 'manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into m from public.admin_members where id = p_member_id;
  if not found then
    raise exception 'NOT_FOUND: الموظف غير موجود' using errcode = 'P0002';
  end if;
  if m.profile_id = (select auth.uid()) then
    raise exception 'SELF_MODIFY: لا توقف حسابك الإداري' using errcode = '42501';
  end if;
  if m.status <> 'active' then
    return;
  end if;
  if app.active_admin_count() <= 2 then
    raise exception 'SOD_MIN_ADMINS: يجب بقاء حسابَي إدارة نشطين على الأقل (D29)'
      using errcode = 'P0001';
  end if;

  update public.admin_members set status = 'suspended' where id = p_member_id;
end;
$$;

revoke execute on function public.suspend_admin_member(uuid) from public, anon;
grant   execute on function public.suspend_admin_member(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- مصفوفة صلاحيات الوصول — كل موظف وما يراه في كل قسم.
--
-- تُقرأ في صفحة واحدة: مراجعة الصلاحيات دوريًا تحتاج رؤية الصورة
-- كاملة لا صفحة لكل موظف.
-- ---------------------------------------------------------------------
create or replace function public.admin_access_matrix()
returns table (
  member_id    uuid,
  profile_id   uuid,
  display_name text,
  is_owner     boolean,
  status       public.member_status,
  mfa_required boolean,
  last_active_at timestamptz,
  permissions  jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id, m.profile_id, m.display_name, m.is_owner, m.status,
    m.mfa_required, m.last_active_at,
    coalesce((
      select jsonb_object_agg(p.section::text, p.level::text)
        from public.admin_permissions p
       where p.admin_member_id = m.id and p.level <> 'none'
    ), '{}'::jsonb)
  from public.admin_members m
  where app.has_platform_permission('settings', 'view')
  order by m.is_owner desc, m.display_name;
$$;

revoke execute on function public.admin_access_matrix() from public, anon;
grant   execute on function public.admin_access_matrix() to authenticated;
