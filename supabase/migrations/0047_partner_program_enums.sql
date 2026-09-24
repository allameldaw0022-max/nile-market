-- =====================================================================
-- 0047 حالتان جديدتان لبرنامج الشركاء (إضافيتان · لا تمسّان ما سبق)
--
--   · commission_status.reserved — عمولة محجوزة لطلب صرف قائم: لا
--     تُصرف مرتين ولا تُحتسب متاحةً مرة أخرى.
--   · payout_status.cancelled   — الشريك يسحب طلبه قبل مراجعته.
--
-- ★ وحدهما في هذه الترحيلة: قيمة enum جديدة لا تُستعمل في نفس
-- المعاملة التي أضافتها، فتُفصل عمّا يستعملها (0048).
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'commission_status' and e.enumlabel = 'reserved'
  ) then
    alter type public.commission_status add value 'reserved';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'payout_status' and e.enumlabel = 'cancelled'
  ) then
    alter type public.payout_status add value 'cancelled';
  end if;
end $$;
