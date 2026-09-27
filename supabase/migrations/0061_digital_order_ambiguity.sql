-- =====================================================================
-- 0061 إصلاح: الطلب الرقمي كان يفشل في كل مرة (إضافية · لا تمسّ بيانات)
--
-- ★★★ عطبٌ حقيقي كشفه اختبار المسار الكامل في تدقيق المرحلة الثالثة،
-- ولم تكشفه اختبارات الوحدة لأنّها فحصت **الرفض** (باقة غريبة، حقل
-- ناقص، متجر غير مؤهَّل) ولم يمرّ أيٌّ منها بالمسار الناجح إلى آخره.
--
-- `public.create_digital_order` تُعلن `returns table (order_id uuid, …)`،
-- وأسماء أعمدة الإخراج في PL/pgSQL **متغيّرات**. وفي جسم الدالة:
--
--     if exists (select 1 from public.order_digital_values
--                 where order_id = v_order_id) then
--
-- فـ`order_id` هنا اسمٌ لعمودٍ في الجدول **و**اسمٌ لمتغيّر الإخراج معًا،
-- والسلوك الافتراضي `#variable_conflict error` ⇒ الاستعلام يرفع
-- `42702: column reference "order_id" is ambiguous`. والسطر يُنفَّذ في
-- **كل** نداء ناجح — أي أنّ أيّ طلب رقمي كامل كان يفشل بعد إنشاء
-- الطلب فيُلغى بالكامل (الدالة معاملة واحدة)، فلا طلبٌ ولا بيانات شحن.
--
-- ★ الإصلاح: لقبٌ للجدول (`odv`) فيصير المرجع مؤهَّلًا لا لبس فيه.
--   لا تغيير في التوقيع ولا في المنح ولا في المنطق ولا في أيّ مسار آخر،
--   ولا سطر بيانات يُمسّ — إعادة تعريف جسم الدالة وحده.
--
-- ★ ولماذا لا `#variable_conflict use_column` كما في `claim_guest_order`؟
--   لأنّها تُخفي اللبس بدل إظهاره: أيّ مرجع مستقبلي يقصد متغيّرًا سيُقرأ
--   عمودًا بصمت. التأهيل الصريح يُصلح هذا الموضع ويُبقي الحارس شغّالًا.
-- =====================================================================

create or replace function public.create_digital_order(
  p_store_id        uuid,
  p_product_id      uuid,
  p_variant_id      uuid,
  p_quantity        integer,
  p_contact         jsonb,
  p_payment_method  public.payment_method,
  p_proof_media_id  uuid,
  p_fields          jsonb default '[]'::jsonb,   -- [{label, value}]
  p_idempotency_key text default null,
  p_note            text default null,
  p_reference       text default null,
  p_anon_token      text default null
)
returns table (order_id uuid, order_number text, total numeric, guest_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_number   text;
  v_total    numeric(14,2);
  v_guest    text;
  v_qty      integer := greatest(coalesce(p_quantity, 1), 1);
  v_field    record;
  v_given    jsonb;
  v_value    text;
  v_i        integer := 0;
begin
  if app.store_template(p_store_id) <> 'digital' then
    raise exception 'VALIDATION: هذا المسار للمتجر الرقمي فقط' using errcode = 'P0001';
  end if;

  -- ★ باقةٌ واحدة لا أكثر (§١٦): الطلب الرقمي سطرٌ واحد بحكم التوقيع
  --   نفسه — لا قائمة أسطر تُمرَّر، فلا سبيل لدسّ باقةٍ ثانية عبر REST.
  if p_variant_id is not null and not exists (
    select 1 from public.product_variants v
    where v.id = p_variant_id and v.product_id = p_product_id
      and v.store_id = p_store_id and v.is_active and v.deleted_at is null
  ) then
    raise exception 'VARIANT_UNAVAILABLE: الباقة غير متاحة' using errcode = 'P0002';
  end if;

  -- الطلب نفسه بالمسار القائم (وفيه فحص المتجر والبوّابة والمال)
  select c.order_id, c.order_number, c.total, c.guest_token
    into v_order_id, v_number, v_total, v_guest
    from public.create_order_with_proof(
      p_store_id,
      jsonb_build_array(jsonb_build_object(
        'product_id', p_product_id,
        'variant_id', p_variant_id,
        'quantity',   v_qty)),
      null,                      -- لا منطقة توصيل: منتج رقمي
      p_contact,
      '{}'::jsonb,               -- لا عنوان
      p_payment_method,
      p_proof_media_id,
      null,                      -- لا كوبون في المسار الرقمي
      p_idempotency_key,
      p_note,
      p_reference,
      p_anon_token
    ) c;

  -- إعادة إرسال بنفس المفتاح ⇒ الطلب نفسه؛ ولا تُضاعف اللقطة
  -- ★ `odv.` ضرورية: `order_id` اسم عمود الإخراج أيضًا (انظر الرأس).
  if exists (select 1 from public.order_digital_values odv
              where odv.order_id = v_order_id) then
    return query select v_order_id, v_number, v_total, v_guest;
    return;
  end if;

  -- ★ كل حقل فعّال إلزامي، ويُقرأ تعريفه من القاعدة لا من العميل:
  --   العميل يرسل قيمًا، والقاعدة تقرّر أيّ الحقول مطلوبة وبأيّ ترتيب.
  for v_field in
    select f.id, f.label, f.sort_order
      from public.product_digital_fields f
     where f.product_id = p_product_id and f.store_id = p_store_id
       and f.is_active and f.deleted_at is null
     order by f.sort_order, f.created_at
  loop
    v_given := null;
    select e into v_given
      from jsonb_array_elements(coalesce(p_fields, '[]'::jsonb)) e
     where lower(trim(e ->> 'label')) = lower(trim(v_field.label))
     limit 1;

    v_value := trim(coalesce(v_given ->> 'value', ''));
    if v_value = '' then
      raise exception 'FIELD_REQUIRED: «%» مطلوب', v_field.label using errcode = 'P0001';
    end if;
    if length(v_value) > 120 then
      raise exception 'VALIDATION: «%» أطول من المسموح', v_field.label using errcode = 'P0001';
    end if;

    insert into public.order_digital_values
      (order_id, store_id, field_label, value, sort_order)
    values (v_order_id, p_store_id, v_field.label, v_value, v_i);
    v_i := v_i + 1;
  end loop;

  return query select v_order_id, v_number, v_total, v_guest;
end;
$$;

revoke execute on function public.create_digital_order(
  uuid, uuid, uuid, integer, jsonb, public.payment_method, uuid, jsonb,
  text, text, text, text) from public;
grant execute on function public.create_digital_order(
  uuid, uuid, uuid, integer, jsonb, public.payment_method, uuid, jsonb,
  text, text, text, text) to anon, authenticated;
