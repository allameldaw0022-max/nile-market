-- =====================================================================
-- 0021 إدارة الدومين (إضافية · لا تمسّ ما سبق)
--
-- ★ قرار أمني: `verify_domain` **لا تُمنح للعميل**.
--
-- التحقق من ملكية دومين يعتمد على سجل TXT في الـDNS، وقراءة الـDNS
-- لا تتم داخل PostgreSQL. لو منحنا الدالة لدور `authenticated` لصار
-- بإمكان أي تاجر أن ينادي `verify_domain(id, array['التوكن'])`
-- ويُثبت ملكية دومين لا يملكه — لأن «سجلات TXT» ستكون مجرد نص يرسله
-- هو. لذلك:
--   * الدالة ممنوحة لـservice_role فقط.
--   * قراءة الـDNS تتم في وظيفة خادمية (src/lib/jobs/verify-domain.ts)
--     تستخدم node:dns ثم تنادي الدالة بالنتيجة الحقيقية.
--   * الـServer Action يفحص صلاحية التاجر قبل تشغيل الوظيفة.
-- =====================================================================

create or replace function public.verify_domain(
  p_domain_id  uuid,
  p_txt_records text[]
)
returns table (verified boolean, status public.domain_status, reason text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  d public.store_domains%rowtype;
  v_expected text;
  v_found boolean := false;
  v_record text;
begin
  select * into d from public.store_domains where id = p_domain_id for update;
  if not found then
    raise exception 'NOT_FOUND: الدومين غير موجود' using errcode = 'P0002';
  end if;

  if d.kind <> 'custom' then
    raise exception 'VALIDATION: النطاق الفرعي لا يحتاج تحققًا' using errcode = 'P0001';
  end if;

  if d.status = 'active' then
    return query select true, d.status, null::text;
    return;
  end if;

  v_expected := 'nile-market-verification=' || coalesce(d.verification_token, '');

  foreach v_record in array coalesce(p_txt_records, array[]::text[]) loop
    -- المقارنة بعد التنقية: بعض مزوّدي الـDNS يغلّفون القيمة باقتباس
    if trim(both '"' from trim(v_record)) = v_expected then
      v_found := true;
      exit;
    end if;
  end loop;

  if not v_found then
    update public.store_domains
       set last_checked_at = now(),
           failure_reason  = 'لم نجد سجل TXT المطلوب'
     where id = p_domain_id;
    return query select false, d.status,
      'لم نجد سجل TXT المطلوب — قد يحتاج الانتشار وقتًا يصل إلى 24 ساعة'::text;
    return;
  end if;

  update public.store_domains
     set status          = 'active',
         verified_at     = now(),
         last_checked_at = now(),
         failure_reason  = null
   where id = p_domain_id;

  return query select true, 'active'::public.domain_status, null::text;
end;
$$;

revoke execute on function public.verify_domain(uuid, text[]) from public, anon, authenticated;
grant   execute on function public.verify_domain(uuid, text[]) to service_role;

-- ---------------------------------------------------------------------
-- تعيين الدومين الأساسي.
-- الأساسي واحد لكل متجر، ويجب أن يكون متحققًا — وإلا صار canonical
-- يشير إلى دومين لا يعمل، وهو أسوأ من عدم تعيينه (§10.7).
-- ---------------------------------------------------------------------
create or replace function public.set_primary_domain(p_domain_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare d public.store_domains%rowtype;
begin
  select * into d from public.store_domains where id = p_domain_id;
  if not found then
    raise exception 'NOT_FOUND: الدومين غير موجود' using errcode = 'P0002';
  end if;
  if not app.has_store_permission(d.store_id, 'domain:manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if d.status <> 'active' then
    raise exception 'VALIDATION: لا يصلح دومين غير متحقق أن يكون الأساسي'
      using errcode = 'P0001';
  end if;

  update public.store_domains
     set is_primary = (id = p_domain_id),
         -- ما لم يعد أساسيًا يحوّل إلى الأساسي بـ301 (D33 · §10.5)
         redirect_to_primary = (id <> p_domain_id)
   where store_id = d.store_id;
end;
$$;

revoke execute on function public.set_primary_domain(uuid) from public, anon;
grant   execute on function public.set_primary_domain(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- حذف دومين مخصص.
-- النطاق الفرعي على نايل ماركت لا يُحذف: هو عنوان المتجر الأصلي،
-- وحذفه يترك المتجر بلا عنوان يعمل.
-- ---------------------------------------------------------------------
create or replace function public.remove_custom_domain(p_domain_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare d public.store_domains%rowtype;
begin
  select * into d from public.store_domains where id = p_domain_id;
  if not found then
    raise exception 'NOT_FOUND: الدومين غير موجود' using errcode = 'P0002';
  end if;
  if not app.has_store_permission(d.store_id, 'domain:manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if d.kind <> 'custom' then
    raise exception 'VALIDATION: لا يمكن حذف نطاق نايل ماركت الفرعي'
      using errcode = 'P0001';
  end if;

  delete from public.store_domains where id = p_domain_id;

  -- المتجر لا يبقى بلا أساسي: النطاق الفرعي يعود أساسيًا
  if d.is_primary then
    update public.store_domains
       set is_primary = true, redirect_to_primary = false
     where store_id = d.store_id and kind = 'subdomain';
  end if;
end;
$$;

revoke execute on function public.remove_custom_domain(uuid) from public, anon;
grant   execute on function public.remove_custom_domain(uuid) to authenticated;
