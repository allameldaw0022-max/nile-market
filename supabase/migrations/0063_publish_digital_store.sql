-- =====================================================================
-- 0063 نشر المتجر الرقمي: لا منطقة توصيل لما لا يُوصَّل
--     (إضافية · لا تمسّ بيانات · لا تغيّر المتجر العادي حرفًا)
--
-- ★★★ عطبٌ حقيقي كشفه استعمالٌ فعليّ: تاجرٌ بدّل متجره إلى القالب
-- الرقمي وزرع المحتوى الابتدائي، ثم لم يظهر القالب في متجره. والسبب
-- ليس التبديل ولا التخزين — التبديل نجح (سطر تدقيق `store.template_changed`
-- والعمود `digital` والمحتوى مزروع) — بل أنّ **المتجر لم يُنشر**،
-- و`publish_store` يشترط:
--
--     منطقة توصيل واحدة على الأقل
--
-- والمتجر الرقمي لا يوصّل شيئًا: `create_digital_order` تمرّر منطقة
-- `null` وعنوانًا فارغًا بحكم تصميمها. فالشرط **مستحيل الاستيفاء**
-- إلا باختراع منطقة وهمية — أي أنّ المتجر الرقمي كان غير قابل للنشر
-- أصلًا، وتخطيط المتجر يردّ «هذا المتجر لم يُنشر بعد» قبل أن يصل إلى
-- تفريع القالب، فيبدو للتاجر أنّ القالب «لم يُطبَّق».
--
-- ★ الإصلاح أضيق ما يمكن: شرط التوصيل يُفحص على القالب العادي وحده.
--   والشروط الأربعة الأخرى تبقى كما هي للقالبين معًا (شعار · واتساب ·
--   منتج · طريقة دفع) — فلا يُنشر متجر ناقص، ولا يُخفَّف شرطٌ لأحد.
--
-- ★ وأثره على المتجر العادي **صفر**: `app.store_template` تعيد
--   `classic` لكل المتاجر القائمة (اثنا عشر متجرًا، فُحصت)، فالمسار
--   الذي يمرّ به المتجر العادي هو نفسه سطرًا بسطر.
-- =====================================================================

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
  -- ★ التوصيل شرطٌ للمتجر العادي وحده: الرقمي يُسلّم في الطلب نفسه
  --   (`create_digital_order` بلا منطقة وبلا عنوان)، فاشتراط منطقة
  --   عليه شرطٌ لا يستوفيه إلا بمنطقة وهمية.
  if app.store_template(p_store_id) <> 'digital'
     and not exists (select 1 from public.delivery_zones
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
