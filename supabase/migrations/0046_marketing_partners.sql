-- =====================================================================
-- 0046 تعيين مستخدم قائم كمسوّق من لوحة المستخدمين (إضافية)
--
-- ★ لا نظام ثانٍ. «المسوّق» هو `partners` نفسه بكل ما فيه:
--   · `referrals` — unique(store_id) ⇒ متجر لا يُنسب لمسوّقَين.
--   · `commission_ledger` — unique(payment_id) ⇒ لا احتساب مزدوج،
--     والعمولة تُقيَّد في `app.post_commission_for_payment` على
--     دفعة اشتراك **مؤكَّدة** حصرًا، فتسري على كل تجديد تلقائيًا.
--   · `app.protect_partner_rate` — النسبة بيد commissions:manage.
--   · `app.protect_referral` — صاحب الإحالة ثابت بعد التسجيل.
--
-- الفجوة الوحيدة كانت الباب: لم يكن هناك إلا دعوة بالبريد ثم قبول
-- برابط. هذه الترحيلة تفتح الباب المباشر من لوحة المستخدمين، وتُبقي
-- كل الحواجز القائمة كما هي.
-- =====================================================================

-- ---------------------------------------------------------------------
-- النسبة المعتمدة للمسوّقين: 30%
--
-- ★ القيمة الافتراضية فقط — لا تُمسّ نسبة شريك قائم: النسبة شرط
-- متفق عليه، وتغييرها بأثر رجعي قرار إداري لا ترحيل.
-- ---------------------------------------------------------------------
alter table public.platform_settings
  alter column default_partner_rate set default 30.00;

alter table public.partners
  alter column commission_rate set default 30.00;

update public.platform_settings set default_partner_rate = 30.00 where id;

-- ---------------------------------------------------------------------
-- تعيين مستخدم قائم مسوّقًا.
--
-- ★ الفعل خادمي بالكامل: الصلاحية `partners:edit` تُفحص هنا لا في
-- الواجهة، والدالة ممنوعة على anon.
--
-- ★ «لا يعيّن نفسه»: الفحص على `auth.uid()` لا على ما يرسله المتصفح.
--
-- ★ موظف المنصة لا يكون مسوّقًا: من يعتمد الاشتراكات أو يصرف
-- المستحقات لا يجوز أن يكون مستفيدًا منها (D29).
--
-- ★ لا سجل مكرر: حساب له صفّ شريك يُفعَّل بـUPDATE، ودعوة معلّقة
-- بنفس البريد تُربط بالحساب بدل أن يُنشأ صفّ ثانٍ — فلا ينقسم
-- تاريخ العمولات على صفّين.
-- ---------------------------------------------------------------------
create or replace function public.assign_marketing_partner(p_profile_id uuid)
returns table (partner_id uuid, referral_code text, was_created boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_actor   uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_partner public.partners%rowtype;
  v_email   text;
  v_rate    numeric;
  v_code    text;
  v_try     integer := 0;
  v_id      uuid;
begin
  if not app.has_platform_permission('partners', 'edit') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_profile_id is null then
    raise exception 'VALIDATION: حدّد المستخدم' using errcode = 'P0001';
  end if;
  if p_profile_id = v_actor then
    raise exception 'SELF_ASSIGN: لا يعيّن الموظف نفسه مسوّقًا'
      using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = p_profile_id;
  if not found then
    raise exception 'NOT_FOUND: الحساب غير موجود' using errcode = 'P0002';
  end if;
  if v_profile.account_status <> 'active' then
    raise exception 'VALIDATION: الحساب موقوف أو مغلق' using errcode = 'P0001';
  end if;
  if v_profile.is_platform_staff then
    raise exception 'VALIDATION: موظف المنصة لا يكون مسوّقًا — من يعتمد العمولة لا يستحقّها'
      using errcode = 'P0001';
  end if;

  select u.email::text into v_email from auth.users u where u.id = p_profile_id;
  if coalesce(trim(v_email), '') = '' then
    raise exception 'VALIDATION: لا بريد لهذا الحساب' using errcode = 'P0001';
  end if;

  -- (١) صفّ شريك لنفس الحساب ⇒ تفعيل لا إنشاء
  select * into v_partner from public.partners where profile_id = p_profile_id;
  if found then
    if v_partner.status <> 'active' then
      update public.partners set status = 'active' where id = v_partner.id;
      perform app.audit('partner.reactivated', 'partner', v_partner.id, null,
        jsonb_build_object('status', v_partner.status),
        jsonb_build_object('status', 'active', 'profile_id', p_profile_id));
    end if;
    return query select v_partner.id, v_partner.referral_code, false;
    return;
  end if;

  -- (٢) دعوة معلّقة بنفس البريد ⇒ تُربط بالحساب
  select * into v_partner from public.partners
   where lower(email) = lower(v_email) and profile_id is null
   for update;
  if found then
    update public.partners
       set profile_id = p_profile_id, status = 'active', invite_token_hash = null,
           name = coalesce(nullif(trim(v_profile.full_name), ''), name),
           phone = coalesce(phone, v_profile.phone)
     where id = v_partner.id;
    perform app.audit('partner.linked', 'partner', v_partner.id, null,
      null, jsonb_build_object('email', lower(v_email),
                               'profile_id', p_profile_id));
    return query select v_partner.id, v_partner.referral_code, false;
    return;
  end if;

  -- (٣) مسوّق جديد
  select default_partner_rate into v_rate from public.platform_settings where id;

  loop
    v_try := v_try + 1;
    v_code := upper(substr(app.random_token(5), 1, 8));
    exit when not exists (select 1 from public.partners where referral_code = v_code);
    if v_try > 8 then
      raise exception 'INTERNAL: تعذّر توليد رمز إحالة' using errcode = 'P0001';
    end if;
  end loop;

  insert into public.partners
    (profile_id, name, email, phone, status, referral_code, commission_rate,
     created_by)
  values (p_profile_id,
          coalesce(nullif(trim(v_profile.full_name), ''), split_part(v_email, '@', 1)),
          lower(v_email), v_profile.phone, 'active', v_code,
          coalesce(v_rate, 30), v_actor)
  returning id into v_id;

  perform app.audit('partner.assigned', 'partner', v_id, null, null,
    jsonb_build_object('code', v_code, 'rate', coalesce(v_rate, 30),
                       'profile_id', p_profile_id));

  return query select v_id, v_code, true;
end;
$$;

revoke execute on function public.assign_marketing_partner(uuid) from public, anon;
grant   execute on function public.assign_marketing_partner(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- إزالة المستخدم من دور المسوّق.
--
-- ★ إيقاف لا حذف. الإحالات والعمولات المقيَّدة عمل ماضٍ مستحَق،
-- و`app.protect_referral` يرفض حذفها أصلًا. الإيقاف يكفي لقطع
-- الوصول: `app.current_partner_id()` تشترط `status='active'`،
-- و`app.post_commission_for_payment` لا تقيّد لشريك غير نشط.
-- ---------------------------------------------------------------------
create or replace function public.revoke_marketing_partner(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_partner public.partners%rowtype;
begin
  if not app.has_platform_permission('partners', 'edit') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_partner from public.partners where profile_id = p_profile_id;
  if not found then
    raise exception 'NOT_FOUND: هذا الحساب ليس مسوّقًا' using errcode = 'P0002';
  end if;
  if v_partner.status = 'suspended' then return; end if;

  update public.partners set status = 'suspended' where id = v_partner.id;

  perform app.audit('partner.revoked', 'partner', v_partner.id, null,
    jsonb_build_object('status', v_partner.status),
    jsonb_build_object('status', 'suspended', 'profile_id', p_profile_id));
end;
$$;

revoke execute on function public.revoke_marketing_partner(uuid) from public, anon;
grant   execute on function public.revoke_marketing_partner(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- قائمة المستخدمين تعرف مَن منهم مسوّق.
--
-- الشكل تغيّر ⇒ إسقاط قبل الإنشاء (لا يقبل `create or replace`
-- تغيير أعمدة الناتج). المنح يُعاد بعده.
-- ---------------------------------------------------------------------
drop function if exists public.platform_users(text, text, integer, integer);

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
  partner_id     uuid,
  partner_status text,
  referral_code  text,
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
    -- ★ `::text` عند المصدر لا في الـselect الأخير: العمود يعبر الـCTE
    -- بنوعه، فالتحويل هنا يمنع تسرّب varchar إلى الناتج (0042).
    select pr.id, pr.full_name, u.email::text as email, pr.phone,
           pr.account_status, pr.is_platform_staff,
           pr.created_at, pr.last_seen_at,
           (select count(*) from public.stores st
             where st.owner_id = pr.id and st.deleted_at is null) as stores_count,
           pt.id as partner_id, pt.status as partner_status,
           pt.referral_code
      from public.profiles pr
      left join auth.users u on u.id = pr.id
      left join public.partners pt on pt.profile_id = pr.id
     where (p_status is null or pr.account_status::text = p_status)
       and (v_term is null
            or pr.full_name ilike '%' || v_term || '%'
            or u.email::text ilike '%' || v_term || '%'
            or pr.phone ilike '%' || v_term || '%')
  )
  select f.id, f.full_name, f.email, f.phone, f.account_status::text,
         f.is_platform_staff, f.stores_count, f.created_at, f.last_seen_at,
         f.partner_id, f.partner_status::text, f.referral_code,
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
-- التجار التابعون لمسوّق، ومعهم اشتراكاتهم وتجديداتهم وعمولاتهم.
--
-- ★ دالة واحدة تخدم الجهتين بقاعدة تخويل واحدة:
--   · بلا وسيط ⇒ المسوّق نفسه (`app.current_partner_id()`).
--   · بوسيط   ⇒ موظف المنصة بصلاحية `partners:view` وحده.
-- فلا يمرّ مسوّق معرّف مسوّق آخر ليرى تجاره.
--
-- ★ «التجديدات» ليست عمودًا: كل تجديد دفعة اشتراك مؤكَّدة، فعددها
-- هو عدد الدفعات المدفوعة لهذا المتجر.
-- ---------------------------------------------------------------------
create or replace function public.partner_referred_stores(
  p_partner_id uuid default null
)
returns table (
  store_id            uuid,
  store_name          text,
  store_slug          text,
  store_status        text,
  attributed_at       timestamptz,
  attribution_source  text,
  plan_name           text,
  subscription_status text,
  current_period_end  timestamptz,
  paid_subscriptions  bigint,
  last_paid_at        timestamptz,
  commission_total    numeric,
  commission_payable  numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_partner uuid;
begin
  if p_partner_id is null then
    v_partner := app.current_partner_id();
    if v_partner is null then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  else
    if not app.has_platform_permission('partners', 'view') then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    v_partner := p_partner_id;
  end if;

  return query
  select s.id, s.name, s.slug, s.status::text,
         r.attributed_at, r.attribution_source::text,
         pl.name, sub.status::text, sub.current_period_end,
         (select count(*) from public.payments pm
           where pm.store_id = s.id and pm.kind = 'subscription'
             and pm.status = 'paid'),
         (select max(pm.paid_at) from public.payments pm
           where pm.store_id = s.id and pm.kind = 'subscription'
             and pm.status = 'paid'),
         coalesce((select sum(cl.amount) from public.commission_ledger cl
                    where cl.partner_id = v_partner and cl.store_id = s.id), 0),
         coalesce((select sum(cl.amount) from public.commission_ledger cl
                    where cl.partner_id = v_partner and cl.store_id = s.id
                      and cl.status = 'payable'), 0)
    from public.referrals r
    join public.stores s on s.id = r.store_id
    left join public.subscriptions sub
           on sub.store_id = s.id and sub.status <> 'cancelled'
    left join public.plans pl on pl.id = sub.plan_id
   where r.partner_id = v_partner
   order by r.attributed_at desc
   limit 200;
end;
$$;

revoke execute on function public.partner_referred_stores(uuid) from public, anon;
grant   execute on function public.partner_referred_stores(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- قيود العمولة مفصَّلة — نفس قاعدة التخويل أعلاه.
-- الحالة كما في القاعدة: payable (مستحقة) · paid (مدفوعة) ·
-- reversed (ملغاة بعكس قيد استرداد).
-- ---------------------------------------------------------------------
create or replace function public.partner_commission_rows(
  p_partner_id uuid default null,
  p_limit      integer default 50,
  p_offset     integer default 0
)
returns table (
  commission_id uuid,
  store_name    text,
  plan_name     text,
  entry_kind    text,
  base_amount   numeric,
  rate_applied  numeric,
  amount        numeric,
  status        text,
  paid_at       timestamptz,
  created_at    timestamptz,
  total_count   bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_partner uuid;
  v_limit   integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if p_partner_id is null then
    v_partner := app.current_partner_id();
    if v_partner is null then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  else
    if not app.has_platform_permission('partners', 'view') then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    v_partner := p_partner_id;
  end if;

  return query
  select cl.id, s.name, pl.name, cl.entry_kind::text,
         cl.base_amount, cl.rate_applied, cl.amount, cl.status::text,
         pm.paid_at, cl.created_at, count(*) over ()
    from public.commission_ledger cl
    join public.stores s on s.id = cl.store_id
    left join public.payments pm on pm.id = cl.payment_id
    left join public.subscriptions sub on sub.id = cl.subscription_id
    left join public.plans pl on pl.id = sub.plan_id
   where cl.partner_id = v_partner
   order by cl.created_at desc
   limit v_limit offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.partner_commission_rows(uuid, integer, integer)
  from public, anon;
grant   execute on function public.partner_commission_rows(uuid, integer, integer)
  to authenticated;
