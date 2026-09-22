-- =====================================================================
-- 0032 كنس الدومينات المنتظرة (إضافية · لا تمسّ ما سبق)
--
-- المشكلة: التحقق من الدومين كان يعمل بضغطة التاجر وحدها، وانتشار
-- الـDNS يستغرق ساعات. تاجر يضيف السجل ثم يغلق اللوحة يبقى دومينه
-- «منتظرًا» إلى الأبد رغم صحّة إعداده.
--
-- ★ الدالة تُرجع الدومينات المستحقّة للفحص فقط، بتباعد متزايد: كل
-- ربع ساعة في الساعة الأولى، ثم كل ساعة، ثم كل ست ساعات. الفحص بلا
-- تباعد يستنزف حصة الـDNS ويُعاقب عليه المزوّد.
--
-- ★ الدومين الذي مضى على إضافته أكثر من أسبوعين لا يُفحص تلقائيًا:
-- إعداد لم يكتمل في أسبوعين لن يكتمل بفحص آلي، والتاجر يعيد المحاولة
-- بيده متى شاء.
-- =====================================================================

create or replace function public.claim_pending_domains(p_limit integer default 20)
returns table (
  domain_id  uuid,
  store_id   uuid,
  hostname   text,
  attempts_age interval
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  return query
  update public.store_domains d
     set last_checked_at = now()
   where d.id in (
     select x.id from public.store_domains x
      where x.kind = 'custom'
        and x.status in ('pending', 'verification_required', 'verifying')
        and x.released_at is null
        and x.created_at > now() - interval '14 days'
        and (
          x.last_checked_at is null
          or (x.created_at > now() - interval '1 hour'
              and x.last_checked_at < now() - interval '15 minutes')
          or (x.created_at > now() - interval '1 day'
              and x.last_checked_at < now() - interval '1 hour')
          or x.last_checked_at < now() - interval '6 hours'
        )
      order by x.last_checked_at nulls first, x.created_at
      limit v_limit
      for update skip locked
   )
  returning d.id, d.store_id, d.hostname, now() - d.created_at;
end;
$$;

revoke execute on function public.claim_pending_domains(integer)
  from public, anon, authenticated;
grant   execute on function public.claim_pending_domains(integer) to service_role;
