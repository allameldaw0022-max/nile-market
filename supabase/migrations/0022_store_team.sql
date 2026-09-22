-- =====================================================================
-- 0022 فريق المتجر: الدعوات (إضافية · لا تمسّ ما سبق)
--
-- الدعوة تُخزَّن بـ**تجزئة** التوكن لا بالتوكن نفسه (0003): تسريب
-- نسخة من الجدول لا يمنح أحدًا القدرة على قبول دعوة. التوكن الخام
-- يظهر مرة واحدة في نتيجة الإنشاء، ويذهب إلى رابط الدعوة.
--
-- وفيها أيضًا: الدعوة لا تكشف من هو صاحب البريد. القبول يربط الدعوة
-- بالحساب **المسجَّل دخوله**، لا بالبريد المكتوب في الدعوة، فلا يصير
-- الجدول أداةً لمعرفة أي بريد له حساب.
-- =====================================================================

create or replace function public.invite_store_member(
  p_store_id    uuid,
  p_email       text,
  p_role        public.store_role,
  p_permissions text[] default '{}'
)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_email text := lower(trim(p_email));
  v_token text := app.random_token(24);
  v_id    uuid;
  v_exp   timestamptz := now() + interval '7 days';
begin
  if not app.has_store_permission(p_store_id, 'members:manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'VALIDATION: بريد إلكتروني غير صحيح' using errcode = 'P0001';
  end if;

  -- دور المالك لا يُدعى إليه: هو مالك المتجر في stores.owner_id
  if p_role = 'owner' then
    raise exception 'VALIDATION: لا تُرسَل دعوة بدور المالك' using errcode = 'P0001';
  end if;

  -- منح دور مدير محصور بمالك المتجر (نفس قاعدة protect_store_member)
  if p_role = 'manager'
     and not app.is_store_owner(p_store_id)
     and not app.has_platform_permission('employees', 'manage') then
    raise exception 'ROLE_ESCALATION: منح دور مدير محصور بمالك المتجر'
      using errcode = '42501';
  end if;

  -- حد عدد الموظفين من الباقة
  perform app.assert_within_limit(p_store_id, 'employees.max');

  -- دعوة قائمة لنفس البريد تُستبدل بدل تكديس دعوات
  delete from public.store_invitations
   where store_id = p_store_id and lower(email) = v_email and accepted_at is null;

  insert into public.store_invitations
    (store_id, email, role, permissions, token_hash, expires_at, created_by)
  values (p_store_id, v_email, p_role, coalesce(p_permissions, '{}'),
          app.hash_token(v_token), v_exp, (select auth.uid()))
  returning id into v_id;

  return query select v_id, v_token, v_exp;
end;
$$;

revoke execute on function public.invite_store_member(
  uuid, text, public.store_role, text[]) from public, anon;
grant execute on function public.invite_store_member(
  uuid, text, public.store_role, text[]) to authenticated;

-- ---------------------------------------------------------------------
-- قبول الدعوة.
-- تُربط بالحساب المسجَّل دخوله، ولا يُشترط تطابق البريد: التاجر قد
-- يدعو بريدًا ويقبل الموظف بحسابه المسجَّل ببريد آخر. حيازة التوكن
-- هي الإثبات، وهي سرّ لا يُخمَّن (24 بايت).
-- ---------------------------------------------------------------------
create or replace function public.accept_store_invitation(p_token text)
returns table (store_id uuid, role public.store_role)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := (select auth.uid());
  inv    public.store_invitations%rowtype;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if not app.is_active_account() then
    raise exception 'FORBIDDEN: الحساب غير نشط' using errcode = '42501';
  end if;

  select * into inv from public.store_invitations
   where token_hash = app.hash_token(coalesce(p_token, ''))
   for update;

  -- رسالة واحدة لكل أسباب الفشل ⇒ لا يُستدل من الرد على وجود دعوة
  if not found or inv.accepted_at is not null or inv.expires_at < now() then
    raise exception 'INVITATION_INVALID: الدعوة غير صالحة أو منتهية'
      using errcode = 'P0001';
  end if;

  insert into public.store_members
    (store_id, profile_id, role, permissions, status, invited_by, accepted_at)
  values (inv.store_id, v_user, inv.role, inv.permissions, 'active',
          inv.created_by, now())
  on conflict (store_id, profile_id) do update
    set role        = excluded.role,
        permissions = excluded.permissions,
        status      = 'active',
        deleted_at  = null,
        accepted_at = now();

  update public.store_invitations
     set accepted_at = now(), accepted_by = v_user
   where id = inv.id;

  return query select inv.store_id, inv.role;
end;
$$;

revoke execute on function public.accept_store_invitation(text) from public, anon;
grant   execute on function public.accept_store_invitation(text) to authenticated;

-- ---------------------------------------------------------------------
-- إزالة عضو من الفريق.
-- حذف ناعم: `store_members.deleted_at`. الحذف الفعلي يقطع أثر من
-- نفّذ إجراءات سابقة (حركات مخزون · تحويلات حالة الطلبات).
-- ---------------------------------------------------------------------
create or replace function public.remove_store_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare m public.store_members%rowtype;
begin
  select * into m from public.store_members
   where id = p_member_id and deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND: العضو غير موجود' using errcode = 'P0002';
  end if;
  if not app.has_store_permission(m.store_id, 'members:manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if m.role = 'owner' then
    raise exception 'OWNER_PROTECTED: لا يمكن إزالة مالك المتجر' using errcode = '42501';
  end if;
  if m.profile_id = (select auth.uid()) then
    raise exception 'SELF_MODIFY: لا يمكنك إزالة عضويتك الخاصة' using errcode = '42501';
  end if;

  update public.store_members
     set deleted_at = now(), status = 'suspended'
   where id = p_member_id;
end;
$$;

revoke execute on function public.remove_store_member(uuid) from public, anon;
grant   execute on function public.remove_store_member(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- تغيير دور عضو. يمر بالدالة لا بالجدول مباشرة ليبقى فحص حد الباقة
-- وقواعد الترقية في مكان واحد.
-- ---------------------------------------------------------------------
create or replace function public.set_store_member_role(
  p_member_id   uuid,
  p_role        public.store_role,
  p_permissions text[] default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare m public.store_members%rowtype;
begin
  select * into m from public.store_members
   where id = p_member_id and deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND: العضو غير موجود' using errcode = 'P0002';
  end if;
  if not app.has_store_permission(m.store_id, 'members:manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if m.profile_id = (select auth.uid()) then
    raise exception 'SELF_MODIFY: لا يمكنك تعديل دورك الخاص' using errcode = '42501';
  end if;
  if p_role = 'owner' or m.role = 'owner' then
    raise exception 'OWNER_PROTECTED: دور المالك لا يُمنح ولا يُغيَّر هنا'
      using errcode = '42501';
  end if;
  if p_role = 'manager'
     and not app.is_store_owner(m.store_id)
     and not app.has_platform_permission('employees', 'manage') then
    raise exception 'ROLE_ESCALATION: منح دور مدير محصور بمالك المتجر'
      using errcode = '42501';
  end if;

  update public.store_members
     set role = p_role,
         permissions = coalesce(p_permissions, permissions)
   where id = p_member_id;
end;
$$;

revoke execute on function public.set_store_member_role(uuid, public.store_role, text[])
  from public, anon;
grant execute on function public.set_store_member_role(uuid, public.store_role, text[])
  to authenticated;
