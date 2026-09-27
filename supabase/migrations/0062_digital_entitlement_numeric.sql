-- =====================================================================
-- 0062 مفتاح الميزة الرقمية: قراءة ما ضبطه الإداريّ فعلًا
--     (إضافية · لا تمسّ بيانات · لا تُغيّر باقةً ولا سعرًا ولا حدًّا)
--
-- ★★ وجده تدقيق المرحلة الثالثة في **الإنتاج** لا في الشفرة: المفتاح
-- `digital_store.orders` أُدرج في 0058 غير مضبوط (D18: لا فتحة ولا
-- منعٌ افتراضي)، ثم ضبطه الإداريّ من لوحة المنصّة **رقميًّا**:
--     free = 0 · basic = 300 · pro = 500
-- أي أنّه قرأ المفتاح «حدَّ طلبات رقمية»، لا «مسموح/ممنوع».
--
-- و`app.digital_orders_allowed` كانت تقرأ `bool_value` وحده، فتتجاهل
-- الرقم كلّه وتعود إلى `plans.is_free = false`. النتيجة اليوم **مطابقة**
-- للمقصود بالمصادفة (٠ على المجانية ⇒ ممنوع، و٣٠٠/٥٠٠ على المدفوعة ⇒
-- مسموح)، لكنّ العطب حقيقي: لو أراد الإداريّ إيقاف البيع الرقمي على
-- باقة مدفوعة بضبط الحدّ صفرًا، لَما تغيّر شيء — زرٌّ في اللوحة لا يفعل
-- شيئًا، وهذا أسوأ من غيابه.
--
-- ★ الإصلاح: ترتيب قراءةٍ صريح لا أكثر
--     ١) `bool_value` مضبوط ⇒ هو الحكم (تجاوز إداريّ صريح).
--     ٢) وإلا `limit_value` مضبوط ⇒ صفرٌ يمنع، وما فوقه يسمح.
--     ٣) وإلا ⇒ القاعدة القائمة: اشتراك تشغيلي على باقة غير مجانية.
--
-- ★ ولا أثر على أيّ متجر قائم: كل المتاجر الاثني عشر `classic`، والشرط
--   كلّه no-op على `classic` بحكم `store_can_checkout`. وعلى القيم
--   المضبوطة اليوم النتيجة لكل باقة **هي نفسها** قبل وبعد.
--
-- ★★ وما لا تفعله هذه الهجرة عن قصد: لا تفرض الرقم **حدًّا شهريًّا**.
--   فرضُ حدٍّ جديد يمنع طلبات تاجرٍ يدفع قرارٌ تجاريّ لا قرار تدقيق،
--   وحدّ الطلبات العام (`orders.monthly_max`) يسري أصلًا على الطلب
--   الرقمي لأنّه يمرّ بـ`create_order` نفسها. والمسألة مرفوعة في
--   التقرير لقرار صاحب المنصّة.
-- =====================================================================

create or replace function app.digital_orders_allowed(p_store_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  v_paid boolean;
begin
  select exists (
    select 1
    from public.subscriptions sub
    join public.plans p on p.id = sub.plan_id
    where sub.store_id = p_store_id
      and sub.status <> 'cancelled'
      and app.subscription_is_operational(sub.status)
      and p.is_free = false
  ) into v_paid;

  select * into r from app.entitlement_limit(p_store_id, 'digital_store.orders');

  if found and r.configured then
    -- ١) حكمٌ منطقيّ صريح يتقدّم على كل شيء
    if r.bool_value is not null then
      return r.bool_value;
    end if;
    -- ٢) حدٌّ رقميّ مضبوط: صفرٌ يعني «لا طلبات رقمية على هذه الباقة»
    if r.limit_value is not null then
      return r.limit_value > 0;
    end if;
  end if;

  -- ٣) غير مضبوط ⇒ لا فتحة ولا منعٌ مخترع: القاعدة التجارية القائمة
  return v_paid;
end;
$$;
grant execute on function app.digital_orders_allowed(uuid) to anon, authenticated;
