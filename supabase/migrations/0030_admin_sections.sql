-- =====================================================================
-- 0030 بقيّة أقسام لوحة الإدارة (إضافية · لا تمسّ ما سبق)
--
-- الأقسام التالية كانت تحتاج قراءات تتجاوز ما تسمح به RLS لصفٍّ واحد:
-- اسم صاحب التذكرة، بريد المستخدم في `auth.users`، اسم المنفِّذ في سجل
-- التدقيق، وعدّادات صندوق البريد المغلق على service_role. توسيع RLS
-- لكل ذلك كان سيفتح جداول كاملة لموظف لا يحتاجها، فالمسار هنا دوال
-- `security definer` **ضيّقة**: كل واحدة تفحص صلاحية قسمها أولًا
-- وتُرجع الأعمدة اللازمة لا الصف كاملًا.
-- =====================================================================

-- =====================================================================
-- المدفوعات
-- =====================================================================
create or replace function public.payments_page(
  p_status text default null,
  p_kind   text default null,
  p_search text default null,
  p_limit  integer default 25,
  p_offset integer default 0
)
returns table (
  payment_id   uuid,
  kind         text,
  method       text,
  status       text,
  amount       numeric,
  reference    text,
  store_id     uuid,
  store_name   text,
  order_number text,
  paid_at      timestamptz,
  created_at   timestamptz,
  total_count  bigint
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
  if not app.has_platform_permission('payments', 'view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  with filtered as (
    select pay.*, s.name as store_name, o.order_number
      from public.payments pay
      left join public.stores s on s.id = pay.store_id
      left join public.orders o on o.id = pay.order_id
     where (p_status is null or pay.status::text = p_status)
       and (p_kind   is null or pay.kind::text   = p_kind)
       and (v_term is null
            or pay.reference ilike '%' || v_term || '%'
            or s.name        ilike '%' || v_term || '%'
            or o.order_number ilike '%' || v_term || '%')
  )
  select f.id, f.kind::text, f.method::text, f.status::text, f.amount,
         f.reference, f.store_id, f.store_name, f.order_number,
         f.paid_at, f.created_at,
         count(*) over ()
    from filtered f
   order by f.created_at desc
   limit v_limit offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.payments_page(text, text, text, integer, integer)
  from public, anon;
grant execute on function public.payments_page(text, text, text, integer, integer)
  to authenticated;

-- =====================================================================
-- المستخدمون
--
-- البريد يعيش في `auth.users` ولا تصله PostgREST. الموظف يحتاجه ليتعرّف
-- على الحساب، فتُرجعه هذه الدالة وحدها — لا كلمة المرور ولا الجلسات.
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
    select pr.id, pr.full_name, u.email, pr.phone,
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
-- إيقاف حساب مستخدم / إعادة تفعيله.
--
-- ★ `app.protect_profile_columns` يردّ `account_status` صامتًا لمن لا
-- يملك `users:manage`. الفحص هنا يجعل الرفض صريحًا بدل «نجاح» كاذب
-- لا يغيّر شيئًا.
-- ---------------------------------------------------------------------
create or replace function public.set_account_status(
  p_profile_id uuid,
  p_status     public.account_status,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_old public.account_status;
begin
  if not app.has_platform_permission('users', 'manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_profile_id = (select auth.uid()) then
    raise exception 'SELF_MODIFY: لا تغيّر حالة حسابك' using errcode = '42501';
  end if;

  select account_status into v_old from public.profiles where id = p_profile_id;
  if not found then
    raise exception 'NOT_FOUND: الحساب غير موجود' using errcode = 'P0002';
  end if;
  if p_status <> 'active' and coalesce(trim(p_reason), '') = '' then
    raise exception 'REASON_REQUIRED: سبب تغيير الحالة إلزامي' using errcode = 'P0001';
  end if;
  if v_old = p_status then return; end if;

  -- مالك منصة نشط لا يُوقَف من هنا: حسابه يُدار في قسم الموظفين وحده،
  -- وإيقافه هنا كان سيلتفّ على حارس الحدّ الأدنى للإداريين (D29).
  if exists (select 1 from public.admin_members m
              where m.profile_id = p_profile_id and m.status = 'active')
     and p_status <> 'active' then
    raise exception 'ADMIN_ACCOUNT: أوقف الموظف من قسم الموظفين أولًا'
      using errcode = 'P0001';
  end if;

  update public.profiles set account_status = p_status where id = p_profile_id;

  perform app.audit('user.status', 'profile', p_profile_id, null,
    jsonb_build_object('status', v_old),
    jsonb_build_object('status', p_status, 'reason', nullif(trim(p_reason), '')));
end;
$$;

revoke execute on function public.set_account_status(uuid, public.account_status, text)
  from public, anon;
grant execute on function public.set_account_status(uuid, public.account_status, text)
  to authenticated;

-- =====================================================================
-- سجل التدقيق
--
-- RLS تسمح بقراءة الصفوف، لكن اسم المنفِّذ في `profiles` محجوب عمّن لا
-- يملك `users:view`. السجل بلا اسم لا يُراجَع، فالاسم يأتي من هنا.
-- =====================================================================
create or replace function public.audit_log_page(
  p_action   text default null,
  p_resource text default null,
  p_actor    uuid default null,
  p_limit    integer default 50,
  p_offset   integer default 0
)
returns table (
  log_id        uuid,
  created_at    timestamptz,
  actor_id      uuid,
  actor_name    text,
  actor_kind    text,
  action        text,
  resource_type text,
  resource_id   uuid,
  store_id      uuid,
  store_name    text,
  before        jsonb,
  after         jsonb,
  total_count   bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_term  text    := nullif(trim(coalesce(p_action, '')), '');
begin
  if not app.has_platform_permission('audit_logs', 'view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  with filtered as (
    select l.*, pr.full_name as actor_name, s.name as store_name
      from public.audit_logs l
      left join public.profiles pr on pr.id = l.actor_id
      left join public.stores   s  on s.id  = l.store_id
     where (v_term is null or l.action ilike v_term || '%')
       and (p_resource is null or l.resource_type = p_resource)
       and (p_actor is null or l.actor_id = p_actor)
  )
  select f.id, f.created_at, f.actor_id, f.actor_name, f.actor_kind::text,
         f.action, f.resource_type, f.resource_id, f.store_id, f.store_name,
         f.before, f.after, count(*) over ()
    from filtered f
   order by f.created_at desc
   limit v_limit offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.audit_log_page(text, text, uuid, integer, integer)
  from public, anon;
grant execute on function public.audit_log_page(text, text, uuid, integer, integer)
  to authenticated;

-- =====================================================================
-- صحة النظام
--
-- `email_outbox` و`job_queue` مغلقان على service_role — وهذا صحيح: لا
-- يقرأ موظف عناوين البريد صفًّا صفًّا. لكن **العدّ** إشارة تشغيلية لا
-- بيانات شخصية، فتُرجع الدالة أرقامًا مجمّعة فقط.
-- =====================================================================
create or replace function public.system_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v jsonb;
begin
  if not app.has_platform_permission('system_health', 'view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'email', jsonb_build_object(
      'queued',  (select count(*) from public.email_outbox where status = 'queued'),
      'sending', (select count(*) from public.email_outbox where status = 'sending'),
      'failed',  (select count(*) from public.email_outbox where status = 'failed'),
      'sent_24h',(select count(*) from public.email_outbox
                   where status = 'sent' and sent_at >= now() - interval '24 hours'),
      'oldest_queued_at', (select min(created_at) from public.email_outbox
                            where status = 'queued'),
      'last_error', (select last_error from public.email_outbox
                      where status = 'failed' order by created_at desc limit 1)),
    'jobs', jsonb_build_object(
      'pending', (select count(*) from public.job_queue where status = 'queued'),
      'failed',  (select count(*) from public.job_queue where status = 'failed'),
      'stuck',   (select count(*) from public.job_queue
                   where status = 'running' and locked_at is not null
                     and locked_at < now() - interval '1 hour')),
    'subscriptions', jsonb_build_object(
      'grace',   (select count(*) from public.subscriptions where status = 'grace'),
      'expiring',(select count(*) from public.subscriptions where status = 'expiring'),
      'stale_sweep', (select count(*) from public.subscriptions
                       where status in ('active', 'trialing')
                         and current_period_end < now())),
    'domains', jsonb_build_object(
      'pending', (select count(*) from public.store_domains
                   where kind = 'custom'
                     and status in ('pending', 'verification_required', 'verifying'))),
    'storage_mb', (select round(coalesce(sum(size_bytes), 0) / 1048576.0, 1)
                     from public.media_files where status = 'ready'),
    'maintenance_mode', (select maintenance_mode from public.platform_settings
                          where id),
    'checks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'component', c.component, 'status', c.status,
               'latency_ms', c.latency_ms, 'detail', c.detail,
               'checked_at', c.checked_at) order by c.checked_at desc)
        from (select distinct on (component) *
                from public.system_health_checks
               order by component, checked_at desc) c
    ), '[]'::jsonb),
    'generated_at', now()
  ) into v;

  return v;
end;
$$;

revoke execute on function public.system_health() from public, anon;
grant   execute on function public.system_health() to authenticated;

-- =====================================================================
-- التقارير
-- =====================================================================
create or replace function public.platform_reports(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 365);
  v_from date := (current_date - (v_days - 1));
  v jsonb;
begin
  if not app.has_platform_permission('reports', 'view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'days', v_days,
    'from', v_from,
    'revenue_series', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.day, 'amount', d.amount)
                       order by d.day)
        from (select date_trunc('day', p.paid_at)::date as day,
                     sum(p.amount) as amount
                from public.payments p
               where p.kind = 'subscription' and p.status = 'paid'
                 and p.paid_at >= v_from
               group by 1) d
    ), '[]'::jsonb),
    'stores_series', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.day, 'count', d.n) order by d.day)
        from (select created_at::date as day, count(*) as n
                from public.stores
               where created_at >= v_from and deleted_at is null
               group by 1) d
    ), '[]'::jsonb),
    'orders_series', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.day, 'count', d.n,
                                          'amount', d.amount) order by d.day)
        from (select created_at::date as day, count(*) as n, sum(total) as amount
                from public.orders
               where created_at >= v_from
               group by 1) d
    ), '[]'::jsonb),
    'by_plan', coalesce((
      select jsonb_agg(jsonb_build_object('plan', x.name, 'count', x.n,
                                          'amount', x.amount) order by x.n desc)
        from (select pl.name, count(*) as n, coalesce(sum(sr.net_amount), 0) as amount
                from public.subscription_requests sr
                join public.plans pl on pl.id = sr.plan_id
               where sr.status = 'approved' and sr.created_at >= v_from
               group by pl.name) x
    ), '[]'::jsonb),
    'commissions', jsonb_build_object(
      'accrued', (select coalesce(sum(amount), 0) from public.commission_ledger
                   where created_at >= v_from),
      'payable', (select coalesce(sum(payable), 0) from public.partner_balances),
      'paid_period', (select coalesce(sum(amount), 0) from public.partner_payouts
                       where status = 'paid' and paid_at >= v_from)),
    'totals', jsonb_build_object(
      'revenue', (select coalesce(sum(amount), 0) from public.payments
                   where kind = 'subscription' and status = 'paid'
                     and paid_at >= v_from),
      'stores',  (select count(*) from public.stores
                   where created_at >= v_from and deleted_at is null),
      'orders',  (select count(*) from public.orders where created_at >= v_from),
      'gmv',     (select coalesce(sum(total), 0) from public.orders
                   where created_at >= v_from and status <> 'cancelled')),
    'top_stores', coalesce((
      select jsonb_agg(jsonb_build_object('store', x.name, 'orders', x.n,
                                          'amount', x.amount) order by x.amount desc)
        from (select s.name, count(o.id) as n, coalesce(sum(o.total), 0) as amount
                from public.orders o
                join public.stores s on s.id = o.store_id
               where o.created_at >= v_from and o.status <> 'cancelled'
               group by s.name
               order by 3 desc
               limit 10) x
    ), '[]'::jsonb)
  ) into v;

  return v;
end;
$$;

revoke execute on function public.platform_reports(integer) from public, anon;
grant   execute on function public.platform_reports(integer) to authenticated;

-- =====================================================================
-- الشركاء
-- =====================================================================
create or replace function public.partner_admin_list(
  p_status text default null,
  p_search text default null,
  p_limit  integer default 25,
  p_offset integer default 0
)
returns table (
  partner_id      uuid,
  name            text,
  email           text,
  phone           text,
  status          text,
  referral_code   text,
  commission_rate numeric,
  is_linked       boolean,
  referrals_count bigint,
  stores_active   bigint,
  payable         numeric,
  paid            numeric,
  created_at      timestamptz,
  total_count     bigint
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
  if not app.has_platform_permission('partners', 'view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  with filtered as (
    select pt.*, b.payable, b.paid,
           (select count(*) from public.referrals r where r.partner_id = pt.id)
             as referrals_count,
           (select count(*) from public.referrals r
              join public.stores s on s.id = r.store_id
             where r.partner_id = pt.id and s.status = 'active') as stores_active
      from public.partners pt
      left join public.partner_balances b on b.partner_id = pt.id
     where (p_status is null or pt.status::text = p_status)
       and (v_term is null
            or pt.name  ilike '%' || v_term || '%'
            or pt.email ilike '%' || v_term || '%'
            or pt.referral_code ilike '%' || v_term || '%')
  )
  select f.id, f.name, f.email, f.phone, f.status::text, f.referral_code,
         f.commission_rate, f.profile_id is not null,
         f.referrals_count, f.stores_active,
         coalesce(f.payable, 0), coalesce(f.paid, 0),
         f.created_at, count(*) over ()
    from filtered f
   order by f.created_at desc
   limit v_limit offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.partner_admin_list(text, text, integer, integer)
  from public, anon;
grant execute on function public.partner_admin_list(text, text, integer, integer)
  to authenticated;

-- ---------------------------------------------------------------------
-- دعوة شريك.
--
-- ★ التوكن يُخزَّن مجزّأً ويعود خامًا مرّة واحدة — نسخة القاعدة لا
-- تُستخدم للدخول، ومن يقرأ الجدول لاحقًا لا يملك رابطًا صالحًا.
-- ★ نسبة العمولة لا تُمرَّر هنا: `app.protect_partner_rate` يحصر
-- تعديلها في `commissions:manage`، والدعوة تأخذ النسبة الافتراضية من
-- إعدادات المنصة.
-- ---------------------------------------------------------------------
create or replace function public.invite_partner(
  p_name  text,
  p_email text,
  p_phone text default null
)
returns table (partner_id uuid, referral_code text, token text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_token text;
  v_code  text;
  v_id    uuid;
  v_rate  numeric;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_try   integer := 0;
begin
  if not app.has_platform_permission('partners', 'edit') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'VALIDATION: اسم الشريك مطلوب' using errcode = 'P0001';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'VALIDATION: بريد غير صالح' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.partners where lower(email) = v_email) then
    raise exception 'DUPLICATE: هذا البريد مدعوّ مسبقًا' using errcode = 'P0001';
  end if;

  select default_partner_rate into v_rate from public.platform_settings where id;

  -- رمز الإحالة قصير ويُقرأ في رابط: نولّده ونتحقق من تفرّده بدل
  -- الاعتماد على الحظ.
  loop
    v_try := v_try + 1;
    v_code := upper(substr(app.random_token(5), 1, 8));
    exit when not exists (select 1 from public.partners where referral_code = v_code);
    if v_try > 8 then
      raise exception 'INTERNAL: تعذّر توليد رمز إحالة' using errcode = 'P0001';
    end if;
  end loop;

  v_token := app.random_token(32);

  insert into public.partners
    (name, email, phone, status, referral_code, commission_rate,
     invite_token_hash, invited_at, created_by)
  values (trim(p_name), v_email, nullif(trim(coalesce(p_phone, '')), ''),
          'invited', v_code, coalesce(v_rate, 50),
          app.hash_token(v_token), now(), (select auth.uid()))
  returning id into v_id;

  perform app.audit('partner.invited', 'partner', v_id, null, null,
    jsonb_build_object('email', v_email, 'code', v_code));

  return query select v_id, v_code, v_token;
end;
$$;

revoke execute on function public.invite_partner(text, text, text) from public, anon;
grant   execute on function public.invite_partner(text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- قبول دعوة الشراكة.
--
-- رسالة فشل واحدة لكل الأسباب: توكن خاطئ، أو مستهلَك، أو لشريك موقوف.
-- التمييز بينها يحوّل الرابط إلى أداة استكشاف.
-- ---------------------------------------------------------------------
create or replace function public.accept_partner_invitation(p_token text)
returns table (partner_id uuid, name text, referral_code text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := (select auth.uid());
  p public.partners%rowtype;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  select * into p from public.partners
   where invite_token_hash = app.hash_token(coalesce(p_token, ''))
     and status = 'invited'
   for update;

  if not found or p.profile_id is not null then
    raise exception 'INVALID_INVITE: الدعوة غير صالحة أو استُخدمت'
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.partners where profile_id = v_user) then
    raise exception 'INVALID_INVITE: الدعوة غير صالحة أو استُخدمت'
      using errcode = 'P0001';
  end if;

  update public.partners
     set profile_id = v_user, status = 'active', invite_token_hash = null
   where id = p.id;

  perform app.audit('partner.joined', 'partner', p.id);

  return query select p.id, p.name, p.referral_code;
end;
$$;

revoke execute on function public.accept_partner_invitation(text) from public, anon;
grant   execute on function public.accept_partner_invitation(text) to authenticated;

-- ---------------------------------------------------------------------
-- إيقاف شريك / إعادة تفعيله.
--
-- ★ الإحالات والعمولات المقيَّدة لا تُمسّ: العمل الماضي مستحَق حتى لو
-- توقّفت الشراكة (`app.protect_referral` يرفض الحذف أصلًا).
-- ---------------------------------------------------------------------
create or replace function public.set_partner_status(
  p_partner_id uuid,
  p_status     public.partner_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare p public.partners%rowtype;
begin
  if not app.has_platform_permission('partners', 'edit') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_status not in ('active', 'suspended') then
    raise exception 'VALIDATION: حالة غير مسموحة' using errcode = 'P0001';
  end if;

  select * into p from public.partners where id = p_partner_id;
  if not found then
    raise exception 'NOT_FOUND: الشريك غير موجود' using errcode = 'P0002';
  end if;
  if p.status = 'invited' then
    raise exception 'VALIDATION: الدعوة لم تُقبل بعد' using errcode = 'P0001';
  end if;
  if p.status = p_status then return; end if;

  update public.partners set status = p_status where id = p_partner_id;

  perform app.audit('partner.status', 'partner', p_partner_id, null,
    jsonb_build_object('status', p.status),
    jsonb_build_object('status', p_status));
end;
$$;

revoke execute on function public.set_partner_status(uuid, public.partner_status)
  from public, anon;
grant execute on function public.set_partner_status(uuid, public.partner_status)
  to authenticated;

-- ---------------------------------------------------------------------
-- نسبة عمولة شريك — `commissions:manage` وحدها (حارس 0010).
-- ---------------------------------------------------------------------
create or replace function public.set_partner_rate(
  p_partner_id uuid,
  p_rate       numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_old numeric;
begin
  if not app.has_platform_permission('commissions', 'manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_rate is null or p_rate < 0 or p_rate > 100 then
    raise exception 'VALIDATION: النسبة بين 0 و100' using errcode = 'P0001';
  end if;

  select commission_rate into v_old from public.partners where id = p_partner_id;
  if not found then
    raise exception 'NOT_FOUND: الشريك غير موجود' using errcode = 'P0002';
  end if;

  update public.partners set commission_rate = p_rate where id = p_partner_id;

  -- العمولات المقيَّدة سابقًا تحتفظ بـ`rate_applied` وقتها: النسبة
  -- الجديدة تسري على ما يأتي لا على ما مضى.
  perform app.audit('partner.rate', 'partner', p_partner_id, null,
    jsonb_build_object('rate', v_old), jsonb_build_object('rate', p_rate));
end;
$$;

revoke execute on function public.set_partner_rate(uuid, numeric) from public, anon;
grant   execute on function public.set_partner_rate(uuid, numeric) to authenticated;

-- =====================================================================
-- مكتب الدعم (جانب الموظف)
--
-- RLS تسمح لموظف `support:view` بقراءة التذاكر والرسائل، لكن اسم صاحب
-- التذكرة في `profiles` محجوب عنه ما لم يملك `users:view`. تذكرة بلا
-- اسم لا تُعالَج، فالاسم يأتي من هنا — وحده، بلا هاتف ولا بريد.
-- =====================================================================
create or replace function public.support_queue(
  p_status text default null,
  p_mine   boolean default false,
  p_search text default null,
  p_limit  integer default 25,
  p_offset integer default 0
)
returns table (
  ticket_id       uuid,
  ticket_number   text,
  subject         text,
  category        text,
  status          text,
  priority        text,
  requester_name  text,
  store_name      text,
  assigned_to     uuid,
  assigned_name   text,
  last_message_at timestamptz,
  created_at      timestamptz,
  total_count     bigint
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
  v_me    uuid    := app.current_admin_member_id();
begin
  if not app.has_platform_permission('support', 'view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  with filtered as (
    select t.*, pr.full_name as requester_name, s.name as store_name,
           am.display_name as assigned_name
      from public.support_tickets t
      left join public.profiles pr on pr.id = t.requester_id
      left join public.stores   s  on s.id  = t.store_id
      left join public.admin_members am on am.id = t.assigned_to
     where (p_status is null
            or (p_status = 'open' and t.status not in ('resolved', 'closed'))
            or t.status::text = p_status)
       and (not coalesce(p_mine, false) or t.assigned_to = v_me)
       and (v_term is null
            or t.ticket_number ilike '%' || v_term || '%'
            or t.subject       ilike '%' || v_term || '%'
            or pr.full_name    ilike '%' || v_term || '%')
  )
  select f.id, f.ticket_number, f.subject, f.category::text, f.status::text,
         f.priority::text, f.requester_name, f.store_name,
         f.assigned_to, f.assigned_name, f.last_message_at, f.created_at,
         count(*) over ()
    from filtered f
   order by (f.status not in ('resolved', 'closed')) desc,
            case f.priority when 'urgent' then 0 when 'high' then 1
                            when 'normal' then 2 else 3 end,
            f.last_message_at desc
   limit v_limit offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.support_queue(text, boolean, text, integer, integer)
  from public, anon;
grant execute on function public.support_queue(text, boolean, text, integer, integer)
  to authenticated;

-- ---------------------------------------------------------------------
-- تذكرة واحدة للموظف: الرسائل + الملاحظات الداخلية + سجل الأحداث.
--
-- ★ الملاحظات الداخلية لا تُخلط بالرسائل في مصفوفة واحدة: خلطها يجعل
-- تسريبها للعميل خطأ عرض واحد. تبقى في مفتاح منفصل لا يصل صفحة العميل
-- أصلًا.
-- ---------------------------------------------------------------------
create or replace function public.support_ticket_admin(p_ticket_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.support_tickets%rowtype;
  v jsonb;
begin
  if not app.has_platform_permission('support', 'view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into t from public.support_tickets where id = p_ticket_id;
  if not found then
    raise exception 'NOT_FOUND: التذكرة غير موجودة' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'id', t.id,
    'ticket_number', t.ticket_number,
    'subject', t.subject,
    'category', t.category,
    'status', t.status,
    'priority', t.priority,
    'created_at', t.created_at,
    'last_message_at', t.last_message_at,
    'first_response_at', t.first_response_at,
    'reopened_count', t.reopened_count,
    'assigned_to', t.assigned_to,
    'requester_name', (select full_name from public.profiles
                        where id = t.requester_id),
    'store_id', t.store_id,
    'store_name', (select name from public.stores where id = t.store_id),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'author_kind', m.author_kind, 'body', m.body,
               'author_name', (select full_name from public.profiles
                                where id = m.author_id),
               'created_at', m.created_at) order by m.created_at)
        from public.support_messages m where m.ticket_id = t.id
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', n.id, 'body', n.body, 'created_at', n.created_at,
               'author_name', (select display_name from public.admin_members
                                where id = n.author_id)) order by n.created_at)
        from public.support_internal_notes n where n.ticket_id = t.id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'event', e.event, 'from_value', e.from_value,
               'to_value', e.to_value, 'created_at', e.created_at,
               'actor_name', (select full_name from public.profiles
                               where id = e.actor_id)) order by e.created_at desc)
        from public.support_events e where e.ticket_id = t.id
    ), '[]'::jsonb)
  ) into v;

  return v;
end;
$$;

revoke execute on function public.support_ticket_admin(uuid) from public, anon;
grant   execute on function public.support_ticket_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- تغيير حالة التذكرة من فريق الدعم.
--
-- الانتقالات المسموحة تعرّفها `app.can_transition_ticket` (0012) —
-- هذه الدالة تسألها ولا تعيد كتابتها.
-- ---------------------------------------------------------------------
create or replace function public.set_ticket_status(
  p_ticket_id uuid,
  p_status    public.ticket_status,
  p_priority  public.ticket_priority default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare t public.support_tickets%rowtype;
begin
  if not app.has_platform_permission('support', 'edit') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into t from public.support_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'NOT_FOUND: التذكرة غير موجودة' using errcode = 'P0002';
  end if;

  if p_status is not null and p_status <> t.status then
    if not app.can_transition_ticket(t.status, p_status) then
      raise exception 'INVALID_TRANSITION: انتقال غير مسموح من % إلى %',
        t.status, p_status using errcode = 'P0001';
    end if;

    update public.support_tickets
       set status      = p_status,
           resolved_at = case when p_status = 'resolved' then now()
                              else resolved_at end,
           closed_at   = case when p_status = 'closed' then now()
                              else closed_at end
     where id = p_ticket_id;

    if p_status in ('resolved', 'closed') then
      perform app.notify(t.requester_id, 'support.status',
        case p_status when 'resolved' then 'تم حل تذكرتك ' || t.ticket_number
                      else 'أُغلقت تذكرتك ' || t.ticket_number end,
        null, '/support/' || t.id::text, t.store_id,
        'ticket.' || p_status::text || ':' || t.id::text);
    end if;
  end if;

  if p_priority is not null and p_priority <> t.priority then
    update public.support_tickets set priority = p_priority where id = p_ticket_id;
  end if;
end;
$$;

revoke execute on function public.set_ticket_status(
  uuid, public.ticket_status, public.ticket_priority) from public, anon;
grant execute on function public.set_ticket_status(
  uuid, public.ticket_status, public.ticket_priority) to authenticated;

-- ---------------------------------------------------------------------
-- إسناد التذكرة إلى موظف (أو رفع الإسناد بتمرير null).
-- ---------------------------------------------------------------------
create or replace function public.assign_ticket(
  p_ticket_id uuid,
  p_member_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.support_tickets%rowtype;
  m public.admin_members%rowtype;
begin
  if not app.has_platform_permission('support', 'edit') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into t from public.support_tickets where id = p_ticket_id;
  if not found then
    raise exception 'NOT_FOUND: التذكرة غير موجودة' using errcode = 'P0002';
  end if;

  if p_member_id is not null then
    select * into m from public.admin_members where id = p_member_id;
    if not found or m.status <> 'active' then
      raise exception 'VALIDATION: الموظف غير نشط' using errcode = 'P0001';
    end if;
  end if;

  update public.support_tickets set assigned_to = p_member_id
   where id = p_ticket_id;

  insert into public.support_events (ticket_id, actor_id, event, from_value, to_value)
  values (p_ticket_id, (select auth.uid()), 'assigned',
          t.assigned_to::text, p_member_id::text);
end;
$$;

revoke execute on function public.assign_ticket(uuid, uuid) from public, anon;
grant   execute on function public.assign_ticket(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- ملاحظة داخلية — لا تصل صاحب التذكرة أبدًا.
-- ---------------------------------------------------------------------
create or replace function public.add_internal_note(
  p_ticket_id uuid,
  p_body      text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid;
  v_member uuid := app.current_admin_member_id();
begin
  if not app.has_platform_permission('support', 'edit') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  -- الكاتب في هذا الجدول موظف منصة لا مجرد حساب: مفتاحه الأجنبي على
  -- `admin_members`، فالملاحظة تُنسب لصفة الموظف لا لهويته الشخصية.
  if v_member is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'VALIDATION: الملاحظة فارغة' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.support_tickets where id = p_ticket_id) then
    raise exception 'NOT_FOUND: التذكرة غير موجودة' using errcode = 'P0002';
  end if;

  insert into public.support_internal_notes (ticket_id, author_id, body)
  values (p_ticket_id, v_member, trim(p_body))
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.add_internal_note(uuid, text) from public, anon;
grant   execute on function public.add_internal_note(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- قائمة موظفي الدعم للإسناد — الاسم والمعرّف فقط.
-- ---------------------------------------------------------------------
create or replace function public.assignable_admins()
returns table (member_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.display_name
    from public.admin_members m
   where m.status = 'active'
     and app.has_platform_permission('support', 'edit')
   order by m.display_name;
$$;

revoke execute on function public.assignable_admins() from public, anon;
grant   execute on function public.assignable_admins() to authenticated;
