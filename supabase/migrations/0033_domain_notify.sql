-- =====================================================================
-- 0033 تنبيه تفعيل الدومين (إضافية · لا تمسّ ما سبق)
--
-- `verify_domain` تُنادى في مسارين: ضغطة التاجر وهو ينظر إلى النتيجة،
-- والكنس الخلفي بعد ساعات. التنبيه داخلها كان سيُزعج الأول بما يراه،
-- وغيابه يترك الثاني بلا خبر. فصلناه في دالة يناديها الكنس وحده.
-- =====================================================================

create or replace function public.notify_domain_verified(p_domain_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.store_domains%rowtype;
  s public.stores%rowtype;
begin
  select * into d from public.store_domains where id = p_domain_id;
  if not found or d.status <> 'active' then
    return false;
  end if;

  select * into s from public.stores where id = d.store_id;
  if not found then return false; end if;

  -- مفتاح إزالة التكرار يمنع تنبيهًا ثانيًا لو أُعيد الفحص
  perform app.notify(s.owner_id, 'domain.verified',
    'تم تفعيل دومينك ' || d.hostname,
    'صار متجرك متاحًا على هذا الدومين.',
    '/dashboard/settings/domain', d.store_id,
    'domain.verified:' || d.id::text);

  return true;
end;
$$;

revoke execute on function public.notify_domain_verified(uuid)
  from public, anon, authenticated;
grant   execute on function public.notify_domain_verified(uuid) to service_role;
