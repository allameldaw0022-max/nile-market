-- ═══════════════════════════════════════════════════════════════════
-- كود الخصم: مسار كتابةٍ واحد في القاعدة — وحدٌّ يُفرَض لا يُستأذَن.
-- ═══════════════════════════════════════════════════════════════════
--
-- ★★★ العطل الذي يصلحه هذا الملف: **لم يُنشأ كود خصم واحد في المنصّة
-- منذ إطلاقها**. الواجهة كانت تنادي `assert_within_limit` كدالّة
-- عامّة، وهي تعيش في سكيمة `app` غير المكشوفة عبر PostgREST — فيردّ
-- PostgREST «لا دالّة بهذا الاسم» قبل أن يلمس الطلبُ القاعدة، وتترجمه
-- `fromPostgres` إلى «حدث خطأ غير متوقع». والفحص يجري عند إنشاء كود
-- **نشط** وهو افتراض النموذج ⇒ كل محاولة إنشاء تفشل، وبلا سطرٍ واحد
-- في سجلّ القاعدة لأن الطلب لم يصلها.
--
-- ★★ ولماذا لا نكتفي بتمرير الدالّة إلى `public`: لأن الحدّ وقتها يبقى
-- **سياجًا في الواجهة لا جدارًا في القاعدة**. سياسة `coupons_manage`
-- تسمح لأي عضوٍ بصلاحية `coupons:manage` أن يُدرج صفًّا مباشرةً عبر
-- PostgREST بلا أي فحص حدّ. فحدّ الباقة على الكوبونات كان **غير مفروض
-- إطلاقًا**، وتمريرُ الدالّة كان ليُبقي الثقب ويُخفيه. لذلك: الكتابة
-- تمرّ بدالّة واحدة، ومنحةُ الإدراج المباشر تُسحب.
--
-- ★ والتفعيل لاحقًا بابٌ خلفيّ للحدّ نفسه: عشرة أكوادٍ معطّلة تُفعَّل
-- واحدًا واحدًا تتجاوز أي فحصٍ يقع عند الإنشاء وحده. فكل انتقالٍ من
-- «معطَّل» إلى «نشط» يفحص الحدّ أيضًا — في `save_coupon` وفي
-- `set_coupon_active` معًا.
--
-- ★ لا عمود يُحذف، ولا صفّ يُمَسّ، ولا حدّ باقةٍ يُرفع أو يُخفَّض.
--   `deleteCoupon` يبقى كما هو (حذف ناعم عبر UPDATE، لا INSERT).
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════ ١) تطبيع الكود والتحقّق منه ═══════════════

/**
 * الكود المقبول: حروف لاتينية وأرقام وشرطات، من ٣ إلى ٣٢ خانة.
 *
 * ★ لماذا لاتينيّ فقط والمنصّة عربية: الكود يُملى هاتفيًّا ويُكتب في
 *   حقل `dir="ltr"`، والعربية فيها متشابهاتٌ بصريًّا (ا/أ · ه/ة) تجعل
 *   «الكود لا يعمل» شكوى دائمة. القيد قرارٌ قائم في الواجهة منذ
 *   البداية — ننقله إلى القاعدة لا نخترعه.
 */
create or replace function app.normalize_coupon_code(p_code text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare v text := upper(trim(coalesce(p_code, '')));
begin
  if v !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$' then
    raise exception 'VALIDATION: الكود: حروف لاتينية وأرقام وشرطات، من 3 إلى 32 خانة'
      using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- ═══════════════ ٢) مسار الكتابة الوحيد ═══════════════

create or replace function public.save_coupon(
  p_store_id                 uuid,
  p_code                     text,
  p_type                     public.coupon_type,
  p_value                    numeric,
  p_coupon_id                uuid        default null,
  p_min_order_amount         numeric     default null,
  p_max_discount_amount      numeric     default null,
  p_starts_at                timestamptz default null,
  p_ends_at                  timestamptz default null,
  p_usage_limit_total        integer     default null,
  p_usage_limit_per_customer integer     default null,
  p_is_active                boolean     default true
)
returns table (coupon_id uuid, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid := p_coupon_id;
  v_code   text := app.normalize_coupon_code(p_code);
  v_old    public.coupons%rowtype;
  v_value  numeric := app.money(p_value);
  v_min    numeric := case when p_min_order_amount is null then null
                           else app.money(p_min_order_amount) end;
  -- سقف الخصم لا معنى له مع خصم ثابت: قيمةٌ تُحفظ ولا تُقرأ تكذب على
  -- التاجر حين يعود للتعديل فيراها مضبوطة وهي مُهمَلة.
  v_max    numeric := case when p_type = 'percentage' and p_max_discount_amount is not null
                           then app.money(p_max_discount_amount) else null end;
  v_active boolean := coalesce(p_is_active, true);
begin
  if not app.has_store_permission(p_store_id, 'coupons:manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_value is null or v_value <= 0 then
    raise exception 'VALIDATION: قيمة الخصم يجب أن تكون أكبر من صفر'
      using errcode = 'P0001';
  end if;
  if p_type = 'percentage' and v_value > 100 then
    raise exception 'VALIDATION: نسبة الخصم لا تتجاوز 100%%' using errcode = 'P0001';
  end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'VALIDATION: تاريخ الانتهاء يجب أن يكون بعد البداية'
      using errcode = 'P0001';
  end if;
  if v_min is not null and v_min < 0 then
    raise exception 'VALIDATION: الحد الأدنى للطلب لا يكون سالبًا' using errcode = 'P0001';
  end if;
  if p_usage_limit_total is not null and p_usage_limit_total <= 0 then
    raise exception 'VALIDATION: حد الاستخدام الكلي يجب أن يكون أكبر من صفر'
      using errcode = 'P0001';
  end if;
  if p_usage_limit_per_customer is not null and p_usage_limit_per_customer <= 0 then
    raise exception 'VALIDATION: حد الاستخدام لكل عميل يجب أن يكون أكبر من صفر'
      using errcode = 'P0001';
  end if;

  if v_id is not null then
    select * into v_old from public.coupons
     where id = v_id and store_id = p_store_id and deleted_at is null;
    if v_old.id is null then
      raise exception 'NOT_FOUND: كود الخصم غير موجود' using errcode = 'P0002';
    end if;
  end if;

  -- ★★ الحدّ يُفحص على كل ما **يزيد** عدد الأكواد النشطة: إنشاءٌ نشط،
  --    أو إحياءُ كودٍ كان معطّلًا. وتعديلُ كودٍ نشط يبقى نشطًا لا يزيد
  --    العدد، ففحصه يمنع التاجر من تصحيح أكواده عند بلوغ الحد.
  if v_active and (v_id is null or not v_old.is_active) then
    perform app.assert_within_limit(p_store_id, 'coupons.max_active');
  end if;

  if v_id is null then
    insert into public.coupons (
      store_id, code, type, value, min_order_amount, max_discount_amount,
      starts_at, ends_at, usage_limit_total, usage_limit_per_customer, is_active
    ) values (
      p_store_id, v_code, p_type, v_value, v_min, v_max,
      p_starts_at, p_ends_at, p_usage_limit_total, p_usage_limit_per_customer, v_active
    )
    returning id into v_id;
  else
    update public.coupons set
      code                     = v_code,
      type                     = p_type,
      value                    = v_value,
      min_order_amount         = v_min,
      max_discount_amount      = v_max,
      starts_at                = p_starts_at,
      ends_at                  = p_ends_at,
      usage_limit_total        = p_usage_limit_total,
      usage_limit_per_customer = p_usage_limit_per_customer,
      is_active                = v_active
    where id = v_id;
  end if;

  return query select v_id, v_code;
exception
  -- الفهرس الفريد `(store_id, lower(code))` رسالته تقنية؛ التاجر يحتاج
  -- أن يعرف أن الكود مستخدم عنده لا أن قيدًا انتُهك.
  when unique_violation then
    raise exception 'VALIDATION: هذا الكود مستخدم في متجرك' using errcode = 'P0001';
end;
$$;

-- ═══════════════ ٣) التفعيل والتعطيل ═══════════════

create or replace function public.set_coupon_active(
  p_store_id  uuid,
  p_coupon_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_old public.coupons%rowtype;
begin
  if not app.has_store_permission(p_store_id, 'coupons:manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_old from public.coupons
   where id = p_coupon_id and store_id = p_store_id and deleted_at is null;
  if v_old.id is null then
    raise exception 'NOT_FOUND: كود الخصم غير موجود' using errcode = 'P0002';
  end if;

  if p_is_active and not v_old.is_active then
    perform app.assert_within_limit(p_store_id, 'coupons.max_active');
  end if;

  update public.coupons set is_active = p_is_active where id = p_coupon_id;
end;
$$;

-- ═══════════════ ٤) المنح: الكتابة بالدالّة وحدها ═══════════════

revoke execute on function public.save_coupon(
  uuid, text, public.coupon_type, numeric, uuid, numeric, numeric,
  timestamptz, timestamptz, integer, integer, boolean) from public, anon;
grant  execute on function public.save_coupon(
  uuid, text, public.coupon_type, numeric, uuid, numeric, numeric,
  timestamptz, timestamptz, integer, integer, boolean) to authenticated;

revoke execute on function public.set_coupon_active(uuid, uuid, boolean)
  from public, anon;
grant  execute on function public.set_coupon_active(uuid, uuid, boolean)
  to authenticated;

-- ★★★ الجدار: بلا هذا السحب يبقى الحدّ اختياريًّا — أي عميلٍ بتوكن
--     التاجر يُدرج صفًّا في `coupons` مباشرةً فيتجاوز الدالّة والحدّ
--     معًا. و`update` تبقى ممنوحة: الحذف الناعم وتصحيح الصفوف يمرّان
--     بها، وRLS تحصرهما في متجر العضو.
revoke insert on public.coupons from anon, authenticated;

comment on function public.save_coupon(
  uuid, text, public.coupon_type, numeric, uuid, numeric, numeric,
  timestamptz, timestamptz, integer, integer, boolean) is
  'مسار الكتابة الوحيد لأكواد الخصم: صلاحية + تحقّق + حدّ الباقة في معاملة واحدة. '
  'منحة INSERT على coupons مسحوبة عمدًا — لا تُعِدها.';
