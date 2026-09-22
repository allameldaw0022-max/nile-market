-- =====================================================================
-- 0024 بيانات تحويل المنصة (إضافية · لا تمسّ ما سبق)
--
-- التاجر يدفع اشتراكه بتحويل بنكي يدوي (D16)، فيحتاج حساب المنصة.
-- لكن `platform_settings` لا يقرؤه إلا موظفو المنصة — وهو صواب: الصف
-- يحوي إعدادات فصل المهام ومدد الاحتفاظ وبوابة الإطلاق التجاري.
--
-- الحل: أعمدة جديدة للبيانات المعلنة، ودالة تُخرجها وحدها لمن يملك
-- `subscription:manage` في متجر ما. لا قراءة للصف كله، ولا كشف
-- لبقية الإعدادات.
-- =====================================================================

alter table public.platform_settings
  add column if not exists bank_accounts jsonb not null default '[]'::jsonb,
  add column if not exists bankak_number text,
  add column if not exists payment_instructions text;

create or replace function public.platform_payment_info()
returns table (
  bank_accounts jsonb,
  bankak_number text,
  payment_instructions text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- البوابة: تاجر يدير اشتراك متجر قائم. لا يراها زائر ولا مستخدم
  -- بلا متجر.
  if not exists (
    select 1 from public.store_members m
    join public.profiles p on p.id = m.profile_id
    where m.profile_id = (select auth.uid())
      and m.status = 'active'
      and m.deleted_at is null
      and p.account_status = 'active'
      and (m.role in ('owner', 'manager')
           or 'subscription:manage' = any(m.permissions))
  ) and not app.is_platform_staff() then
    return;
  end if;

  return query
  select s.bank_accounts, s.bankak_number, s.payment_instructions
    from public.platform_settings s
   limit 1;
end;
$$;

revoke execute on function public.platform_payment_info() from public, anon;
grant   execute on function public.platform_payment_info() to authenticated;
