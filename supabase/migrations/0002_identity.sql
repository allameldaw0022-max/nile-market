-- =====================================================================
-- 0002 Identity — profiles · sessions · admin members & permissions
--
-- D7: لا عمود `role` عام. الدور سياقي:
--     داخل متجر → store_members · في المنصة → admin_members
--     كشريك → partners.
-- D28: MFA إلزامي لحسابات Admin، ويُفرض خادميًا.
-- =====================================================================

-- ---------------------------------------------------------------------
-- profiles — مرآة auth.users
-- ---------------------------------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  full_name          text,
  phone              text,
  avatar_url         text,
  locale             text not null default 'ar',
  account_status     public.account_status not null default 'active',
  is_platform_staff  boolean not null default false,
  email_verified_at  timestamptz,
  anonymized_at      timestamptz,
  last_seen_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index profiles_platform_staff_idx on public.profiles (id)
  where is_platform_staff;
create index profiles_status_idx on public.profiles (account_status);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function app.set_updated_at();

alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------
-- إنشاء البروفايل عند التسجيل.
-- أمني: لا يُقرأ أي دور أو صلاحية من raw_user_meta_data — المستخدم
-- يتحكم بها بالكامل. الأدوار تُمنح لاحقًا بعملية مدقَّقة فقط.
-- ---------------------------------------------------------------------
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email_verified_at)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    new.email_confirmed_at
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- مزامنة تأكيد البريد
create or replace function app.sync_email_verified()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is distinct from old.email_confirmed_at then
    update public.profiles set email_verified_at = new.email_confirmed_at
    where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_confirmed
  after update on auth.users
  for each row execute function app.sync_email_verified();

-- ---------------------------------------------------------------------
-- user_sessions_meta — مركز الأمان (المواصفات §29)
-- ---------------------------------------------------------------------
create table public.user_sessions_meta (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  session_id     text,
  ip_hash        text,
  user_agent     text,
  device_label   text,
  last_active_at timestamptz not null default now(),
  revoked_at     timestamptz,
  created_at     timestamptz not null default now()
);

create index user_sessions_meta_user_idx
  on public.user_sessions_meta (user_id, last_active_at desc);

alter table public.user_sessions_meta enable row level security;

-- ---------------------------------------------------------------------
-- admin_members — موظفو المنصة
-- ---------------------------------------------------------------------
create table public.admin_members (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null unique references public.profiles (id) on delete restrict,
  display_name   text not null,
  status         public.member_status not null default 'active',
  is_owner       boolean not null default false,
  mfa_required   boolean not null default true,
  created_by     uuid references public.profiles (id),
  last_active_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index admin_members_status_idx on public.admin_members (status);

create trigger admin_members_set_updated_at before update on public.admin_members
  for each row execute function app.set_updated_at();

alter table public.admin_members enable row level security;

-- ---------------------------------------------------------------------
-- admin_permissions — صلاحية لكل قسم على حدة (المواصفات: إضافة موظفي Admin)
-- ---------------------------------------------------------------------
create table public.admin_permissions (
  id               uuid primary key default gen_random_uuid(),
  admin_member_id  uuid not null references public.admin_members (id) on delete cascade,
  section          public.admin_section not null,
  level            public.admin_level not null default 'none',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (admin_member_id, section)
);

create index admin_permissions_member_idx on public.admin_permissions (admin_member_id);

create trigger admin_permissions_set_updated_at before update on public.admin_permissions
  for each row execute function app.set_updated_at();

alter table public.admin_permissions enable row level security;

-- مزامنة راية الدخول السريع على profiles
create or replace function app.sync_platform_staff_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.profiles set is_platform_staff = false where id = old.profile_id;
    return old;
  end if;
  update public.profiles
     set is_platform_staff = (new.status = 'active')
   where id = new.profile_id;
  return new;
end;
$$;

create trigger admin_members_sync_flag
  after insert or update or delete on public.admin_members
  for each row execute function app.sync_platform_staff_flag();

-- =====================================================================
-- دوال السلطة — أساس كل سياسات RLS.
-- SECURITY DEFINER لتقرأ جداول العضوية بتجاوز RLS ⇒ لا ارتداد (S1).
-- STABLE ⇒ تُقيَّم مرة لكل استعلام لا مرة لكل صف (S7).
-- =====================================================================

create or replace function app.current_profile_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select (select auth.uid());
$$;

-- هل الحساب نشط؟ حساب موقوف أو مغلق لا يُنفّذ شيئًا.
create or replace function app.is_active_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
  );
$$;

-- صلاحية موظف المنصة على قسم بمستوى معيّن.
create or replace function app.has_platform_permission(
  p_section public.admin_section,
  p_level   public.admin_level
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_members am
    join public.profiles pr on pr.id = am.profile_id
    left join public.admin_permissions ap
           on ap.admin_member_id = am.id and ap.section = p_section
    where am.profile_id = (select auth.uid())
      and am.status = 'active'
      and pr.account_status = 'active'
      and (
        am.is_owner
        or app.level_rank(coalesce(ap.level, 'none')) >= app.level_rank(p_level)
      )
  );
$$;

create or replace function app.is_platform_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_members am
    where am.profile_id = (select auth.uid()) and am.status = 'active'
  );
$$;

create or replace function app.current_admin_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select am.id from public.admin_members am
  where am.profile_id = (select auth.uid()) and am.status = 'active';
$$;

-- عدد حسابات Admin النشطة — بوابة فصل المهام (D29)
create or replace function app.active_admin_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.admin_members where status = 'active';
$$;

grant execute on function app.current_profile_id()  to authenticated;
grant execute on function app.is_active_account()   to authenticated;
grant execute on function app.has_platform_permission(public.admin_section, public.admin_level) to authenticated;
grant execute on function app.is_platform_staff()   to authenticated;
grant execute on function app.current_admin_member_id() to authenticated;
grant execute on function app.active_admin_count()  to authenticated;

-- =====================================================================
-- RLS — profiles
-- =====================================================================
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_select_platform on public.profiles
  for select to authenticated
  using (app.has_platform_permission('users', 'view'));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_update_platform on public.profiles
  for update to authenticated
  using (app.has_platform_permission('users', 'edit'))
  with check (app.has_platform_permission('users', 'edit'));

-- لا INSERT ولا DELETE لأي دور: الإنشاء بـtrigger، والحذف يتبع auth.users.

-- حماية الأعمدة الحساسة من التعديل الذاتي
create or replace function app.protect_profile_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not app.has_platform_permission('users', 'manage') then
    new.is_platform_staff := old.is_platform_staff;
    new.account_status    := old.account_status;
    new.email_verified_at := old.email_verified_at;
    new.anonymized_at     := old.anonymized_at;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_columns before update on public.profiles
  for each row execute function app.protect_profile_columns();

-- =====================================================================
-- RLS — user_sessions_meta
-- =====================================================================
create policy sessions_select_self on public.user_sessions_meta
  for select to authenticated using (user_id = (select auth.uid()));

create policy sessions_insert_self on public.user_sessions_meta
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy sessions_update_self on public.user_sessions_meta
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy sessions_select_platform on public.user_sessions_meta
  for select to authenticated
  using (app.has_platform_permission('security', 'view'));

-- =====================================================================
-- RLS — admin_members / admin_permissions
-- الإدارة لمالك المنصة فقط (settings:manage) — لا يرفع موظف نفسه.
-- =====================================================================
create policy admin_members_select_self on public.admin_members
  for select to authenticated using (profile_id = (select auth.uid()));

create policy admin_members_select_staff on public.admin_members
  for select to authenticated
  using (app.has_platform_permission('settings', 'view'));

create policy admin_members_write on public.admin_members
  for all to authenticated
  using (app.has_platform_permission('settings', 'manage'))
  with check (app.has_platform_permission('settings', 'manage'));

create policy admin_permissions_select_self on public.admin_permissions
  for select to authenticated
  using (admin_member_id = app.current_admin_member_id());

create policy admin_permissions_select_staff on public.admin_permissions
  for select to authenticated
  using (app.has_platform_permission('settings', 'view'));

create policy admin_permissions_write on public.admin_permissions
  for all to authenticated
  using (app.has_platform_permission('settings', 'manage'))
  with check (app.has_platform_permission('settings', 'manage'));

-- لا يعدّل موظف صلاحيات نفسه بأي حال
create or replace function app.block_self_permission_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_target uuid;
begin
  v_target := coalesce(new.admin_member_id, old.admin_member_id);
  if v_target = app.current_admin_member_id() then
    raise exception 'SELF_ESCALATION: لا يمكن تعديل صلاحياتك الخاصة'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger admin_permissions_no_self
  before insert or update or delete on public.admin_permissions
  for each row execute function app.block_self_permission_change();

-- =====================================================================
-- صلاحيات الجداول. RLS هي التي تُرشّح الصفوف؛ هذه تفتح الباب على مستوى
-- الجدول فقط. Supabase تمنحها افتراضيًا، ونثبّتها صراحةً ليكون المخطط
-- مكتفيًا بذاته وقابلًا للاختبار محليًا.
-- =====================================================================
grant select, update on public.profiles            to authenticated;
grant select, insert, update on public.user_sessions_meta to authenticated;
grant select, insert, update, delete on public.admin_members     to authenticated;
grant select, insert, update, delete on public.admin_permissions to authenticated;
