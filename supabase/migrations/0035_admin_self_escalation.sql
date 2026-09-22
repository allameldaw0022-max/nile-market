-- =====================================================================
-- 0035 سدّ تصعيد الصلاحيات الذاتي (إضافية · لا تمسّ ما سبق)
--
-- ★ الثغرة: `admin_permissions` كانت محميّة بـ`block_self_permission_change`،
-- لكن `admin_members` لم تكن. وسياسة `admin_members_write` تمنح
-- `settings:manage` كتابةً كاملة على الجدول، فموظفٌ يملك إدارة
-- الإعدادات وحدها كان يستطيع:
--
--     update admin_members set is_owner = true where profile_id = auth.uid();
--
-- عبر PostgREST مباشرةً، متجاوزًا فحص «لا تعدّل حسابك» الذي يعيش في
-- دالة `upsert_admin_member` وحدها. و`is_owner` يجعل
-- `app.has_platform_permission` تعيد true لكل قسم ومستوى — بما فيها
-- `payouts:approve` و`payments:approve`، فينهار فصل المهام (D29/D30)
-- كلّه: يصير الموظف قادرًا على اعتماد صرفه واسترداده بنفسه.
--
-- ★ الإصلاح في القاعدة لا في الدالة: الحارس يسري على أي مسار كتابة،
-- بما فيه PostgREST المباشر. (service_role يتجاوز RLS لا triggers.)
-- =====================================================================

create or replace function app.guard_admin_member_self()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  -- النظام والمهام الخلفية بلا هوية: لا شيء «ذاتي» لتحميه
  if v_actor is null then
    return coalesce(new, null);
  end if;

  if tg_op = 'INSERT' then
    -- لا يُنشئ أحد لنفسه حساب إدارة. أول مالك يُزرع بـservice_role
    -- أو migration، وكلاهما بلا `auth.uid()`.
    if new.profile_id = v_actor then
      raise exception 'SELF_ESCALATION: لا تُنشئ حساب إدارة لنفسك'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.profile_id = v_actor then
    -- الحقول الحسّاسة وحدها ممنوعة: يبقى تحديث `last_active_at`
    -- و`display_name` ممكنًا للموظف على نفسه.
    if new.is_owner is distinct from old.is_owner then
      raise exception 'SELF_ESCALATION: لا تمنح نفسك ملكية المنصة'
        using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      raise exception 'SELF_ESCALATION: لا تغيّر حالة حسابك الإداري'
        using errcode = '42501';
    end if;
    if new.mfa_required is distinct from old.mfa_required then
      raise exception 'SELF_ESCALATION: لا تُسقط التحقق بخطوتين عن نفسك'
        using errcode = '42501';
    end if;
    if new.profile_id is distinct from old.profile_id then
      raise exception 'SELF_ESCALATION: لا تنقل حسابك الإداري' using errcode = '42501';
    end if;
  end if;

  -- ★ منح الملكية لغير النفس يبقى ممكنًا لمالك منصة فقط: موظف
  -- `settings:manage` كان يستطيع تنصيب حساب ثانٍ يملكه مالكًا، ثم
  -- يستخدمه لاعتماد ما بادر به هو — فيلتفّ على فصل المهام بحسابين.
  if new.is_owner and not coalesce(old.is_owner, false)
     and not exists (select 1 from public.admin_members m
                      where m.profile_id = v_actor
                        and m.is_owner and m.status = 'active') then
    raise exception 'OWNER_ONLY: منح ملكية المنصة لا يتم إلا من مالك منصة'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists admin_members_no_self on public.admin_members;
create trigger admin_members_no_self
  before insert or update on public.admin_members
  for each row execute function app.guard_admin_member_self();

-- نفس الحارس على الإنشاء: موظف `settings:manage` كان يستطيع إدراج
-- حساب مالك جديد مباشرةً عبر PostgREST.
create or replace function app.guard_admin_member_insert_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null then return new; end if;
  if new.is_owner
     and not exists (select 1 from public.admin_members m
                      where m.profile_id = v_actor
                        and m.is_owner and m.status = 'active') then
    raise exception 'OWNER_ONLY: إنشاء حساب مالك منصة لا يتم إلا من مالك منصة'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists admin_members_insert_owner on public.admin_members;
create trigger admin_members_insert_owner
  before insert on public.admin_members
  for each row execute function app.guard_admin_member_insert_owner();

-- ---------------------------------------------------------------------
-- ★ وكذلك `profiles.is_platform_staff`: رفعه يدويًا لا يمنح صلاحية
-- (الصلاحية من `admin_members`)، لكنه يفتح قراءة `platform_settings`
-- عبر `app.is_platform_staff()`. الحارس القائم
-- `app.protect_profile_columns` يردّه لمن لا يملك `users:manage`،
-- ونضيف هنا منع تعديل المرء عمودَه بنفسه مهما كانت صلاحيته.
-- ---------------------------------------------------------------------
create or replace function app.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- لا أحد يرفع عن نفسه صفة موظف المنصة، ولو ملك `users:manage`
  if new.id = (select auth.uid())
     and new.is_platform_staff is distinct from old.is_platform_staff then
    new.is_platform_staff := old.is_platform_staff;
  end if;

  if not app.has_platform_permission('users', 'manage') then
    new.is_platform_staff := old.is_platform_staff;
    new.account_status    := old.account_status;
    new.email_verified_at := old.email_verified_at;
    new.anonymized_at     := old.anonymized_at;
  end if;
  return new;
end;
$$;

-- =====================================================================
-- ★ إصلاح: `profiles.is_platform_staff` لم تكن تُضبط أبدًا
--
-- `app.sync_platform_staff_flag` (AFTER على `admin_members`) تكتب
-- العمود، لكن `app.protect_profile_columns` (BEFORE على `profiles`)
-- كانت تردّ الكتابة: الحارس يسأل `has_platform_permission('users','manage')`،
-- و`auth.uid()` وقت المزامنة قد يكون بلا صلاحية (أو null في الزرع
-- والمهام)، فيُعيد القيمة القديمة. النتيجة: العمود false لكل موظفي
-- المنصة دائمًا.
--
-- الأثر: `platform_users()` تُظهر «موظف منصة» لأحد، فتعرض الواجهة زرّ
-- إيقاف لحساب إداري — ثم ترفضه القاعدة. (لا ثغرة صلاحيات:
-- `app.is_platform_staff()` تقرأ `admin_members` مباشرةً لا العمود.)
--
-- الإصلاح: علَم معاملة تضعه المزامنة وحدها، كما في `app.store_publish`.
-- =====================================================================
create or replace function app.sync_platform_staff_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.staff_sync', 'on', true);
  if tg_op = 'DELETE' then
    update public.profiles set is_platform_staff = false where id = old.profile_id;
    perform set_config('app.staff_sync', 'off', true);
    return old;
  end if;
  update public.profiles
     set is_platform_staff = (new.status = 'active')
   where id = new.profile_id;
  perform set_config('app.staff_sync', 'off', true);
  return new;
end;
$$;

create or replace function app.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_sync boolean := coalesce(
  current_setting('app.staff_sync', true) = 'on', false);
begin
  -- المزامنة من `admin_members` هي المصدر الوحيد لهذا العمود
  if v_sync then
    new.account_status    := old.account_status;
    new.email_verified_at := old.email_verified_at;
    new.anonymized_at     := old.anonymized_at;
    return new;
  end if;

  -- لا أحد يرفع عن نفسه صفة موظف المنصة، ولو ملك `users:manage`
  if new.id = (select auth.uid())
     and new.is_platform_staff is distinct from old.is_platform_staff then
    new.is_platform_staff := old.is_platform_staff;
  end if;

  if not app.has_platform_permission('users', 'manage') then
    new.is_platform_staff := old.is_platform_staff;
    new.account_status    := old.account_status;
    new.email_verified_at := old.email_verified_at;
    new.anonymized_at     := old.anonymized_at;
  end if;
  return new;
end;
$$;

-- مصالحة الصفوف القائمة مع مصدر الحقيقة
do $$
begin
  perform set_config('app.staff_sync', 'on', true);
  update public.profiles p
     set is_platform_staff = exists (
       select 1 from public.admin_members m
        where m.profile_id = p.id and m.status = 'active')
   where p.is_platform_staff is distinct from exists (
       select 1 from public.admin_members m
        where m.profile_id = p.id and m.status = 'active');
  perform set_config('app.staff_sync', 'off', true);
end $$;
