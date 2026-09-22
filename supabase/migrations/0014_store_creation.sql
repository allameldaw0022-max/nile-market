-- =====================================================================
-- 0014 إنشاء المتجر والنشر (إضافية — لا تمسّ ما سبق)
--
-- stores بلا سياسة INSERT عمدًا: الإنشاء يمر بدالة واحدة مدقَّقة تُنشئ
-- كل ما يحتاجه المتجر ذرّيًا وتطبّق قاعدة الإسناد (D19).
-- =====================================================================

create or replace function public.create_store(
  p_name          text,
  p_slug          text,
  p_business_type text default null,
  p_visitor_token text default null    -- كوكي الإحالة HttpOnly (D19)
)
returns table (store_id uuid, slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_slug text := lower(trim(p_slug));
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if not app.is_active_account() then
    raise exception 'FORBIDDEN: الحساب غير نشط' using errcode = '42501';
  end if;

  if length(trim(p_name)) < 2 then
    raise exception 'VALIDATION: اسم المتجر مطلوب' using errcode = 'P0001';
  end if;
  if v_slug !~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])?$' then
    raise exception 'VALIDATION: رابط المتجر يجب أن يكون حروفًا لاتينية وأرقامًا وشرطات'
      using errcode = 'P0001';
  end if;
  if not app.is_slug_available(v_slug) then
    raise exception 'SLUG_TAKEN: هذا الرابط محجوز — اختر غيره' using errcode = 'P0001';
  end if;

  -- متجر واحد لكل مالك في V1
  if exists (select 1 from public.stores s
             where s.owner_id = v_user and s.deleted_at is null) then
    raise exception 'STORE_EXISTS: لديك متجر بالفعل' using errcode = 'P0001';
  end if;

  insert into public.stores (owner_id, name, slug, business_type, status, onboarding_step)
  values (v_user, trim(p_name), v_slug, nullif(trim(p_business_type), ''),
          'draft', 'logo')
  returning id into v_id;

  -- صف المالك (الـtrigger يتحقق أنه يطابق stores.owner_id)
  insert into public.store_members (store_id, profile_id, role, status, accepted_at)
  values (v_id, v_user, 'owner', 'active', now());

  insert into public.store_settings (store_id) values (v_id);
  insert into public.store_payment_settings (store_id) values (v_id);
  insert into public.store_order_sequences (store_id) values (v_id);

  -- إسناد الإحالة Last-touch داخل نافذة 30 يومًا (D19)
  if p_visitor_token is not null then
    perform app.attribute_referral(v_id, p_visitor_token);
  end if;

  return query select v_id, v_slug;
end;
$$;

revoke execute on function public.create_store(text, text, text, text) from public, anon;
grant   execute on function public.create_store(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- حفظ خطوة الـWizard (Autosave + Resume)
-- ---------------------------------------------------------------------
create or replace function public.save_onboarding_step(
  p_store_id uuid,
  p_step     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.has_store_permission(p_store_id, 'settings:update') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.stores set onboarding_step = p_step where id = p_store_id;
end;
$$;

revoke execute on function public.save_onboarding_step(uuid, text) from public, anon;
grant   execute on function public.save_onboarding_step(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- نشر المتجر — لا يُنشر ناقصًا
-- ---------------------------------------------------------------------
create or replace function public.publish_store(p_store_id uuid)
returns table (ok boolean, missing text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing text[] := '{}';
  v_store public.stores%rowtype;
  v_settings public.store_settings%rowtype;
begin
  if not app.has_store_permission(p_store_id, 'settings:update') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_store    from public.stores         where id = p_store_id;
  select * into v_settings from public.store_settings where store_id = p_store_id;

  if v_store.logo_url is null then
    v_missing := v_missing || 'شعار المتجر'::text;
  end if;
  if coalesce(trim(v_settings.whatsapp_number), '') = '' then
    v_missing := v_missing || 'رقم واتساب'::text;
  end if;
  if not exists (select 1 from public.products
                 where store_id = p_store_id and deleted_at is null) then
    v_missing := v_missing || 'منتج واحد على الأقل'::text;
  end if;
  if not exists (select 1 from public.delivery_zones
                 where store_id = p_store_id and is_active and deleted_at is null) then
    v_missing := v_missing || 'منطقة توصيل واحدة على الأقل'::text;
  end if;
  if not v_settings.cod_enabled
     and not v_settings.bank_transfer_enabled
     and not v_settings.bankak_enabled then
    v_missing := v_missing || 'طريقة دفع واحدة على الأقل'::text;
  end if;

  if array_length(v_missing, 1) > 0 then
    return query select false, v_missing;
    return;
  end if;

  -- النشر يحتاج تجاوز حارس أعمدة المتجر (status محمي من التاجر)
  perform set_config('app.store_publish', 'on', true);
  update public.stores
     set status = 'active',
         published_at = coalesce(published_at, now()),
         onboarding_step = 'done',
         onboarding_completed_at = coalesce(onboarding_completed_at, now())
   where id = p_store_id;
  perform set_config('app.store_publish', 'off', true);

  -- أول منتج يُنشر مع المتجر ليظهر فورًا
  update public.products
     set status = 'active', published_at = coalesce(published_at, now())
   where store_id = p_store_id and status = 'draft' and deleted_at is null;

  return query select true, '{}'::text[];
end;
$$;

revoke execute on function public.publish_store(uuid) from public, anon;
grant   execute on function public.publish_store(uuid) to authenticated;

-- يسمح لـpublish_store بتغيير الحالة، ويبقي الحماية على كل ما عداها.
-- (تعديل إضافي للحارس القائم، لا إعادة كتابة له.)
create or replace function app.protect_store_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_publishing boolean :=
    coalesce(current_setting('app.store_publish', true), '') = 'on';
begin
  if not app.has_platform_permission('stores', 'edit') then
    -- النشر عبر publish_store() يغيّر status فقط بعد اجتياز التحقق
    if not v_publishing then
      new.status := old.status;
    end if;
    new.suspended_reason       := old.suspended_reason;
    new.suspended_at           := old.suspended_at;
    new.referred_by_partner_id := old.referred_by_partner_id;  -- D19
    new.owner_id               := old.owner_id;
    new.deleted_at             := old.deleted_at;
  end if;
  return new;
end;
$$;
