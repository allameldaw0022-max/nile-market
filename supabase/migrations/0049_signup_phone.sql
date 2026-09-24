-- =====================================================================
-- 0049 رقم هاتف المسجِّل في لوحة المستخدمين (إضافية)
--
-- المشكلة: `profiles.phone` موجود منذ 0002 ولا يكتبه أحد — نموذج
-- التسجيل لا يسأل عنه أصلًا. فعمود الهاتف في لوحة المستخدمين كان
-- فارغًا دائمًا، ومن سجّل ولم يُكمل لا سبيل للوصول إليه.
--
-- ما هنا:
--   ١) التسجيل يكتب الرقم في الملف الشخصي.
--   ٢) `platform_users` تعيد أفضل رقم متاح للحساب ومصدره، مع حالة
--      تأكيد البريد — وهي أول ما يُسأل عنه قبل مراسلة من لم يُكمل.
--
-- ★ لا رقم يُخترع: الترتيب يقرأ مصادر قائمة فعلًا، ويقول من أين
-- جاء الرقم. حساب بلا رقم في أي منها يظهر بلا رقم.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ١) الرقم يصل من بيانات التسجيل الوصفية.
--
-- ★ `raw_user_meta_data` يتحكّم بها المستخدم بالكامل (D7)، ولذلك
-- لا يُقرأ منها هنا إلا حقلان لا يمنحان شيئًا: الاسم والهاتف.
-- لا دور ولا صلاحية ولا حالة حساب.
--
-- ★ التوحيد يحدث في التطبيق قبل الإرسال (`normalizePhone`): الرقم
-- الواحد يُكتب بأربع صور، وتخزينه كما كُتب يُفشل رابط واتساب على
-- صورة ويُنجحه على أخرى. وهنا نقبل ما وصل كما هو — الحارس الوحيد
-- ألّا يكون فارغًا.
-- ---------------------------------------------------------------------
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone, email_verified_at)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    new.email_confirmed_at
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- ٢) أفضل رقم متاح للحساب.
--
-- الترتيب من الأوثق إلى الأبعد:
--   profile  — كتبه صاحبه عند التسجيل.
--   store    — رقم واتساب متجره أو رقم تواصله (يملك متجرًا فأدخله).
--   customer — رقم تركه في طلب داخل أحد المتاجر.
--
-- ★ دالة مستقلة بـsecurity definer: `customers` و`store_settings`
-- محميّان بـRLS لكل متجر، وموظف المنصة لا يقرؤهما صفًّا صفًّا. هنا
-- يخرج **رقم واحد** للحساب لا صفوف المتاجر ولا بيانات عملائها.
-- ---------------------------------------------------------------------
create or replace function app.best_contact_phone(p_profile_id uuid)
returns table (phone text, source text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.phone, p.source
  from (
    select pr.phone, 'profile'::text as source, 1 as rank
      from public.profiles pr
     where pr.id = p_profile_id and nullif(trim(pr.phone), '') is not null
    union all
    select coalesce(nullif(trim(ss.whatsapp_number), ''), nullif(trim(ss.contact_phone), '')),
           'store'::text, 2
      from public.stores s
      join public.store_settings ss on ss.store_id = s.id
     where s.owner_id = p_profile_id and s.deleted_at is null
       and coalesce(nullif(trim(ss.whatsapp_number), ''),
                    nullif(trim(ss.contact_phone), '')) is not null
    union all
    select nullif(trim(c.phone), ''), 'customer'::text, 3
      from public.customers c
     where c.profile_id = p_profile_id and c.deleted_at is null
       and nullif(trim(c.phone), '') is not null
  ) p
  order by p.rank
  limit 1;
$$;

grant execute on function app.best_contact_phone(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- قائمة المستخدمين: الرقم ومصدره وحالة تأكيد البريد.
-- الشكل تغيّر ⇒ إسقاط وإنشاء، والمنح يُعاد بعده.
--
-- ★ `p_incomplete`: من سجّل ولم يُكمل — بريد غير مؤكَّد أو بلا
-- متجر. الترشيح في القاعدة لا في الصفحة، وإلا اختلّ ترقيم الصفحات.
-- ---------------------------------------------------------------------
drop function if exists public.platform_users(text, text, integer, integer);

create or replace function public.platform_users(
  p_search     text default null,
  p_status     text default null,
  p_limit      integer default 25,
  p_offset     integer default 0,
  p_incomplete boolean default false
)
returns table (
  profile_id       uuid,
  full_name        text,
  email            text,
  phone            text,
  phone_source     text,
  account_status   text,
  is_staff         boolean,
  email_verified_at timestamptz,
  stores_count     bigint,
  created_at       timestamptz,
  last_seen_at     timestamptz,
  partner_id       uuid,
  partner_status   text,
  referral_code    text,
  total_count      bigint
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
    select pr.id, pr.full_name, u.email::text as email,
           pr.account_status, pr.is_platform_staff, pr.email_verified_at,
           pr.created_at, pr.last_seen_at,
           (select count(*) from public.stores st
             where st.owner_id = pr.id and st.deleted_at is null) as stores_count,
           pt.id as partner_id, pt.status as partner_status,
           pt.referral_code,
           ph.phone as best_phone, ph.source as phone_source
      from public.profiles pr
      left join auth.users u on u.id = pr.id
      left join public.partners pt on pt.profile_id = pr.id
      left join lateral app.best_contact_phone(pr.id) ph on true
     where (p_status is null or pr.account_status::text = p_status)
       and (v_term is null
            or pr.full_name ilike '%' || v_term || '%'
            or u.email::text ilike '%' || v_term || '%'
            or pr.phone ilike '%' || v_term || '%'
            or ph.phone ilike '%' || v_term || '%')
  ), scoped as (
    select * from filtered f
     where not coalesce(p_incomplete, false)
        or f.email_verified_at is null
        or f.stores_count = 0
  )
  select s.id, s.full_name, s.email, s.best_phone, s.phone_source,
         s.account_status::text, s.is_platform_staff, s.email_verified_at,
         s.stores_count, s.created_at, s.last_seen_at,
         s.partner_id, s.partner_status::text, s.referral_code,
         count(*) over ()
    from scoped s
   order by s.created_at desc
   limit v_limit offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.platform_users(text, text, integer, integer, boolean)
  from public, anon;
grant execute on function public.platform_users(text, text, integer, integer, boolean)
  to authenticated;
